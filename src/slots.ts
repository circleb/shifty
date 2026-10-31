import { HttpError } from "./util";
import { isValidTimeZone, zonedToUtc } from "./time";

export interface RangeInput {
  startDate: string; // YYYY-MM-DD, in the sheet's timezone
  endDate: string; // inclusive
  days: number[]; // 0 = Sunday ... 6 = Saturday
  startTime: string; // HH:MM daily window start
  endTime: string; // HH:MM daily window end; at or before startTime means "next day" (overnight)
  shiftMinutes: number;
}

export const MAX_RANGES = 10;
export const MAX_DAYS_PER_RANGE = 62;
export const MAX_SLOTS = 1500;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseDate(s: string): [number, number, number] {
  const m = DATE_RE.exec(s);
  if (!m) throw new HttpError(400, "Pick a start and end date for every range.");
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new HttpError(400, "One of the dates isn't a real date.");
  }
  return [y, mo, d];
}

function parseTime(s: string): [number, number] {
  const m = TIME_RE.exec(s);
  if (!m) throw new HttpError(400, "Set a from and to time for every range.");
  return [+m[1], +m[2]];
}

export function parseTz(v: unknown): string {
  const tz = typeof v === "string" ? v : "";
  if (!tz || !isValidTimeZone(tz)) throw new HttpError(400, "That timezone isn't recognized.");
  return tz;
}

export function parseRanges(raw: unknown): RangeInput[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "Add at least one range.");
  if (raw.length > MAX_RANGES) throw new HttpError(400, `Use ${MAX_RANGES} ranges or fewer.`);
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const startDate = String(o.startDate ?? "");
    const endDate = String(o.endDate ?? "");
    const startTime = String(o.startTime ?? "");
    const endTime = String(o.endTime ?? "");
    const shiftMinutes = Number(o.shiftMinutes);
    const days = Array.isArray(o.days) ? [...new Set(o.days.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];

    const [sy, sm, sd] = parseDate(startDate);
    const [ey, em, ed] = parseDate(endDate);
    const span = (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000;
    if (span < 0) throw new HttpError(400, "A range ends before it starts.");
    if (span > MAX_DAYS_PER_RANGE - 1) throw new HttpError(400, `Keep each range to ${MAX_DAYS_PER_RANGE} days or fewer.`);
    if (days.length === 0) throw new HttpError(400, "Pick at least one day of the week for every range.");

    const [sh, smin] = parseTime(startTime);
    const [eh, emin] = parseTime(endTime);
    if (!Number.isInteger(shiftMinutes) || shiftMinutes < 15 || shiftMinutes > 1440 || shiftMinutes % 15 !== 0) {
      throw new HttpError(400, "Shift length must be a multiple of 15 minutes.");
    }
    const windowMin = windowMinutes(sh * 60 + smin, eh * 60 + emin);
    if (shiftMinutes > windowMin) throw new HttpError(400, "A shift is longer than the time window it has to fit in.");

    return { startDate, endDate, days: days.sort((a, b) => a - b), startTime, endTime, shiftMinutes };
  });
}

function windowMinutes(startMin: number, endMin: number): number {
  return endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
}

export interface GeneratedSlot {
  start: number; // Unix seconds
  end: number;
}

export function generateSlots(ranges: RangeInput[], tz: string): GeneratedSlot[] {
  const seen = new Set<string>();
  const out: GeneratedSlot[] = [];

  for (const r of ranges) {
    const [sy, sm, sd] = parseDate(r.startDate);
    const [ey, em, ed] = parseDate(r.endDate);
    const [sh, smin] = parseTime(r.startTime);
    const [eh, emin] = parseTime(r.endTime);
    const overnight = eh * 60 + emin <= sh * 60 + smin;
    const stepMs = r.shiftMinutes * 60_000;

    for (let t = Date.UTC(sy, sm - 1, sd); t <= Date.UTC(ey, em - 1, ed); t += 86_400_000) {
      const day = new Date(t);
      if (!r.days.includes(day.getUTCDay())) continue;
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth() + 1;
      const d = day.getUTCDate();

      const winStart = zonedToUtc(y, m, d, sh, smin, tz);
      let winEnd: number;
      if (overnight) {
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        winEnd = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), eh, emin, tz);
      } else {
        winEnd = zonedToUtc(y, m, d, eh, emin, tz);
      }

      for (let s = winStart; s + stepMs <= winEnd; s += stepMs) {
        const key = `${s}-${s + stepMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ start: s / 1000, end: (s + stepMs) / 1000 });
        if (out.length > MAX_SLOTS) throw new HttpError(400, `That makes more than ${MAX_SLOTS} slots. Shorten the ranges or use longer shifts.`);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
