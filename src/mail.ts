import { formatRange } from "./time";

export interface MailEnv {
  APP_NAME: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
}

/** Sends through Resend. Does nothing (and returns false) when no API key is configured. */
export async function sendEmail(env: MailEnv, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Resend request failed", e);
    return false;
  }
}

export function confirmationEmail(opts: {
  title: string;
  name: string;
  start: number;
  end: number;
  tz: string;
  cancelUrl: string;
}): { subject: string; text: string } {
  const when = formatRange(opts.start, opts.end, opts.tz);
  return {
    subject: `You're signed up: ${when}`,
    text: [
      `Hi ${opts.name},`,
      "",
      `You're signed up for "${opts.title}":`,
      when,
      "",
      "Can't make it? Cancel here so someone else can take it:",
      opts.cancelUrl,
    ].join("\n"),
  };
}

export function reminderEmail(opts: {
  title: string;
  name: string;
  start: number;
  end: number;
  tz: string;
  cancelUrl: string | null;
}): { subject: string; text: string } {
  const when = formatRange(opts.start, opts.end, opts.tz);
  const lines = [`Hi ${opts.name},`, "", `A reminder about your shift for "${opts.title}":`, when];
  if (opts.cancelUrl) lines.push("", "Need to cancel? Use this link:", opts.cancelUrl);
  return { subject: `Reminder: ${when}`, text: lines.join("\n") };
}
