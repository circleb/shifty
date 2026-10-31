import { HttpError, json, htmlResponse, randomId, readJson, str, nowSec } from "./util";
import { parseRanges, parseTz, generateSlots } from "./slots";
import { sendEmail, confirmationEmail, reminderEmail } from "./mail";
import { createPage, volunteerPage, adminPage, cancelPage } from "./pages";
import { ensureSchema } from "./schema";

export interface Env {
  DB: D1Database;
  APP_NAME: string;
  BASE_URL: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMIND_CHOICES = [0, 120, 1440];

interface SheetRow {
  id: string;
  title: string;
  note: string;
  tz: string;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      await ensureSchema(env.DB);
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong. Try again in a moment." }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(ensureSchema(env.DB).then(() => sendReminders(env)));
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = env.BASE_URL || url.origin;
  let m: RegExpMatchArray | null;

  if (req.method === "GET") {
    if (path === "/") return htmlResponse(createPage(env.APP_NAME));
    if (/^\/s\/[a-z0-9]+$/.test(path)) return htmlResponse(volunteerPage(env.APP_NAME));
    if (/^\/a\/[a-z0-9]+$/.test(path)) return htmlResponse(adminPage(env.APP_NAME));
    if (/^\/c\/[a-z0-9]+$/.test(path)) return htmlResponse(cancelPage(env.APP_NAME));
    if ((m = path.match(/^\/api\/s\/([a-z0-9]+)$/))) return publicSheet(env, m[1]);
    if ((m = path.match(/^\/api\/a\/([a-z0-9]+)$/))) return adminSheet(env, m[1], origin);
    if ((m = path.match(/^\/api\/c\/([a-z0-9]+)$/))) return claimInfo(env, m[1]);
  }

  if (req.method === "POST") {
    if (path === "/api/preview") return preview(req);
    if (path === "/api/sheets") return createSheet(req, env, origin);
    if ((m = path.match(/^\/api\/s\/([a-z0-9]+)\/claim$/))) return claimSlot(req, env, ctx, m[1], origin);
    if ((m = path.match(/^\/api\/c\/([a-z0-9]+)\/cancel$/))) return cancelClaim(env, m[1]);
    if ((m = path.match(/^\/api\/a\/([a-z0-9]+)\/clear$/))) return clearClaim(req, env, m[1]);
    if ((m = path.match(/^\/api\/a\/([a-z0-9]+)\/delete$/))) return deleteSheet(env, m[1]);
  }

  if (path.startsWith("/api/")) throw new HttpError(404, "Not found.");
  return new Response("Not found", { status: 404 });
}

// ---------- creating a sheet ----------

async function preview(req: Request): Promise<Response> {
  const body = await readJson(req);
  const tz = parseTz(body.tz);
  const slots = generateSlots(parseRanges(body.ranges), tz);
  return json({
    count: slots.length,
    first: slots[0] ?? null,
    last: slots[slots.length - 1] ?? null,
  });
}

async function createSheet(req: Request, env: Env, origin: string): Promise<Response> {
  const body = await readJson(req);
  const title = str(body.title, 80);
  if (!title) throw new HttpError(400, "Give the sheet a name.");
  const note = str(body.note, 500);
  const tz = parseTz(body.tz);
  const ranges = parseRanges(body.ranges);
  const slots = generateSlots(ranges, tz);
  if (slots.length === 0) throw new HttpError(400, "Those ranges don't produce any slots.");

  const id = randomId(8);
  const adminToken = randomId(24);
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO sheets (id, admin_token, title, note, tz, ranges_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      id,
      adminToken,
      title,
      note,
      tz,
      JSON.stringify(ranges),
      nowSec(),
    ),
  ];
  // D1 allows 100 bound parameters per statement; 4 per row, so 20 rows per insert.
  for (let i = 0; i < slots.length; i += 20) {
    const chunk = slots.slice(i, i + 20);
    const sql = "INSERT INTO slots (id, sheet_id, starts_at, ends_at) VALUES " + chunk.map(() => "(?, ?, ?, ?)").join(", ");
    stmts.push(env.DB.prepare(sql).bind(...chunk.flatMap((s) => [randomId(10), id, s.start, s.end])));
  }
  await env.DB.batch(stmts);

  return json({ shareUrl: `${origin}/s/${id}`, adminUrl: `${origin}/a/${adminToken}`, slotCount: slots.length }, 201);
}

// ---------- volunteers ----------

async function publicSheet(env: Env, id: string): Promise<Response> {
  const sheet = await env.DB.prepare("SELECT id, title, note, tz FROM sheets WHERE id = ?").bind(id).first<SheetRow>();
  if (!sheet) throw new HttpError(404, "This sheet doesn't exist.");
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.starts_at, s.ends_at, c.name
       FROM slots s LEFT JOIN claims c ON c.slot_id = s.id
      WHERE s.sheet_id = ? AND s.ends_at > ?
      ORDER BY s.starts_at`,
  )
    .bind(id, nowSec())
    .all<{ id: string; starts_at: number; ends_at: number; name: string | null }>();

  return json({
    title: sheet.title,
    note: sheet.note,
    tz: sheet.tz,
    slots: results.map((r) => ({ id: r.id, start: r.starts_at, end: r.ends_at, takenBy: r.name })),
  });
}

async function claimSlot(req: Request, env: Env, ctx: ExecutionContext, sheetId: string, origin: string): Promise<Response> {
  const body = await readJson(req);
  if (str(body.website, 100)) throw new HttpError(400, "Couldn't save that.");

  const name = str(body.name, 60);
  if (!name) throw new HttpError(400, "Enter your name.");
  const email = str(body.email, 120);
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, "That email address doesn't look right.");
  const remind = Number(body.remind ?? 0);
  if (!REMIND_CHOICES.includes(remind)) throw new HttpError(400, "Pick a reminder option from the list.");
  if (remind > 0 && !email) throw new HttpError(400, "Add an email address to get a reminder.");

  const sheet = await env.DB.prepare("SELECT id, title, note, tz FROM sheets WHERE id = ?").bind(sheetId).first<SheetRow>();
  if (!sheet) throw new HttpError(404, "This sheet doesn't exist.");
  const slot = await env.DB.prepare("SELECT id, starts_at, ends_at FROM slots WHERE id = ? AND sheet_id = ?")
    .bind(str(body.slotId, 40), sheetId)
    .first<{ id: string; starts_at: number; ends_at: number }>();
  if (!slot) throw new HttpError(404, "That shift no longer exists.");
  if (slot.ends_at <= nowSec()) throw new HttpError(400, "That shift has already ended.");

  const cancelToken = randomId(20);
  try {
    await env.DB.prepare(
      "INSERT INTO claims (id, slot_id, name, email, remind_before_min, cancel_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(randomId(10), slot.id, name, email || null, remind, cancelToken, nowSec())
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone just took that shift. Pick another one.");
    throw e;
  }

  const emailed = Boolean(email && env.RESEND_API_KEY);
  if (emailed) {
    const mail = confirmationEmail({
      title: sheet.title,
      name,
      start: slot.starts_at,
      end: slot.ends_at,
      tz: sheet.tz,
      cancelUrl: `${origin}/c/${cancelToken}`,
    });
    ctx.waitUntil(sendEmail(env, email, mail.subject, mail.text));
  }

  return json({ cancelToken, emailed, start: slot.starts_at, end: slot.ends_at }, 201);
}

async function claimInfo(env: Env, token: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT c.name, s.starts_at, s.ends_at, sh.title, sh.tz, sh.id AS sheet_id
       FROM claims c JOIN slots s ON s.id = c.slot_id JOIN sheets sh ON sh.id = s.sheet_id
      WHERE c.cancel_token = ?`,
  )
    .bind(token)
    .first<{ name: string; starts_at: number; ends_at: number; title: string; tz: string; sheet_id: string }>();
  if (!row) throw new HttpError(404, "This shift was already cancelled, or the link is wrong.");
  return json({ name: row.name, title: row.title, tz: row.tz, start: row.starts_at, end: row.ends_at, sheetId: row.sheet_id });
}

async function cancelClaim(env: Env, token: string): Promise<Response> {
  const res = await env.DB.prepare("DELETE FROM claims WHERE cancel_token = ?").bind(token).run();
  if (!res.meta.changes) throw new HttpError(404, "This shift was already cancelled, or the link is wrong.");
  return json({ ok: true });
}

// ---------- admin ----------

async function adminSheet(env: Env, token: string, origin: string): Promise<Response> {
  const sheet = await env.DB.prepare("SELECT id, title, note, tz FROM sheets WHERE admin_token = ?").bind(token).first<SheetRow>();
  if (!sheet) throw new HttpError(404, "This admin link isn't valid.");
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.starts_at, s.ends_at, c.name, c.email, c.remind_before_min
       FROM slots s LEFT JOIN claims c ON c.slot_id = s.id
      WHERE s.sheet_id = ?
      ORDER BY s.starts_at`,
  )
    .bind(sheet.id)
    .all<{ id: string; starts_at: number; ends_at: number; name: string | null; email: string | null; remind_before_min: number | null }>();

  return json({
    title: sheet.title,
    note: sheet.note,
    tz: sheet.tz,
    now: nowSec(),
    shareUrl: `${origin}/s/${sheet.id}`,
    slots: results.map((r) => ({
      id: r.id,
      start: r.starts_at,
      end: r.ends_at,
      name: r.name,
      email: r.email,
      remind: r.remind_before_min ?? 0,
    })),
  });
}

async function adminSheetId(env: Env, token: string): Promise<string> {
  const row = await env.DB.prepare("SELECT id FROM sheets WHERE admin_token = ?").bind(token).first<{ id: string }>();
  if (!row) throw new HttpError(404, "This admin link isn't valid.");
  return row.id;
}

async function clearClaim(req: Request, env: Env, token: string): Promise<Response> {
  const sheetId = await adminSheetId(env, token);
  const body = await readJson(req);
  await env.DB.prepare("DELETE FROM claims WHERE slot_id = ? AND slot_id IN (SELECT id FROM slots WHERE sheet_id = ?)")
    .bind(str(body.slotId, 40), sheetId)
    .run();
  return json({ ok: true });
}

async function deleteSheet(env: Env, token: string): Promise<Response> {
  const sheetId = await adminSheetId(env, token);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM claims WHERE slot_id IN (SELECT id FROM slots WHERE sheet_id = ?)").bind(sheetId),
    env.DB.prepare("DELETE FROM slots WHERE sheet_id = ?").bind(sheetId),
    env.DB.prepare("DELETE FROM sheets WHERE id = ?").bind(sheetId),
  ]);
  return json({ ok: true });
}

// ---------- reminders (cron) ----------

async function sendReminders(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const now = nowSec();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.email, c.cancel_token, s.starts_at, s.ends_at, sh.title, sh.tz
       FROM claims c JOIN slots s ON s.id = c.slot_id JOIN sheets sh ON sh.id = s.sheet_id
      WHERE c.email IS NOT NULL AND c.remind_before_min > 0 AND c.reminded_at IS NULL
        AND s.starts_at > ? AND s.starts_at - c.remind_before_min * 60 <= ?
      LIMIT 200`,
  )
    .bind(now, now)
    .all<{ id: string; name: string; email: string; cancel_token: string; starts_at: number; ends_at: number; title: string; tz: string }>();

  for (const r of results) {
    const mail = reminderEmail({
      title: r.title,
      name: r.name,
      start: r.starts_at,
      end: r.ends_at,
      tz: r.tz,
      cancelUrl: env.BASE_URL ? `${env.BASE_URL}/c/${r.cancel_token}` : null,
    });
    const ok = await sendEmail(env, r.email, mail.subject, mail.text);
    if (ok) await env.DB.prepare("UPDATE claims SET reminded_at = ? WHERE id = ?").bind(nowSec(), r.id).run();
  }
}
