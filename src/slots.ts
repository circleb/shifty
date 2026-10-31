import { HttpError } from "./util";
import { isValidTimeZone, zonedToUtc } from "./time";

export interface RangeInput {
  startDate: string; // YYYY-MM-DD, in the sheet's timezone
  startTime: string; // HH:MM, when the first slot starts
  endDate: string; // YYYY-MM-DD, in the sheet's timezone
  endTime: string; // HH:MM, when the range finishes
  shiftMinutes: number;
}

export const MAX_RANGES = 10;
export const MAX_DAYS_PER_RANGE = 62;
export const MAX_SLOTS = 1500;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseDate(s: string): [number, number, number] {
  const m = DATE_RE.exec(s);
  if (!m) throw new HttpError(400, "Pick a start and finish date for every range.");
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new HttpError(400, "One of the dates isn't a real date.");
  }
  return [y, mo, d];
}

function parseTime(s: string): [number, number] {
  const m = TIME_RE.exec(s);
  if (!m) throw new HttpError(400, "Set a start and finish time for every range.");
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

    parseDate(startDate);
    parseDate(endDate);
    parseTime(startTime);
    parseTime(endTime);
    if (!Number.isInteger(shiftMinutes) || shiftMinutes < 15 || shiftMinutes > 1440 || shiftMinutes % 15 !== 0) {
      throw new HttpError(400, "Slot length must be a multiple of 15 minutes.");
    }

    return { startDate, endDate, startTime, endTime, shiftMinutes };
  });
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
    const start = zonedToUtc(sy, sm, sd, sh, smin, tz);
    const end = zonedToUtc(ey, em, ed, eh, emin, tz);
    if (end <= start) throw new HttpError(400, "A range has to finish after it starts.");
    if (end - start > MAX_DAYS_PER_RANGE * 86_400_000) {
      throw new HttpError(400, `Keep each range to ${MAX_DAYS_PER_RANGE} days or fewer.`);
    }

    const stepMs = r.shiftMinutes * 60_000;
    if (stepMs > end - start) throw new HttpError(400, "A slot is longer than the range it has to fit in.");

    for (let s = start; s + stepMs <= end; s += stepMs) {
      const key = `${s}-${s + stepMs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ start: s / 1000, end: (s + stepMs) / 1000 });
      if (out.length > MAX_SLOTS) throw new HttpError(400, `That makes more than ${MAX_SLOTS} slots. Shorten the ranges or use longer slots.`);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
