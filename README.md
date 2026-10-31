# Shift Sheet

A very small volunteer shift sign-up. An admin defines one or more ranges and a shift length, shares one link, and people pick their own slots. No accounts for anyone. The working name is a placeholder: change `APP_NAME` in `wrangler.toml`.

Stack: one Cloudflare Worker (TypeScript, no framework), D1 (SQLite) for storage, Resend for email, a cron trigger for reminders.

## How it works

**Admin** (`/`)
1. Name the sheet, set the timezone, add an optional note.
2. Add ranges: first day, last day, days of the week, daily from/to time, shift length. A "to" time at or before "from" means overnight.
3. A live preview shows how many slots the ranges make. Create the sheet.
4. You get a public share link (`/s/<id>`) and a private admin link (`/a/<token>`).

**Volunteer** (`/s/<id>`)
1. See upcoming slots grouped by day. Taken slots show the first name used.
2. Tap Take it, enter a name, optionally an email and a reminder (2 hours or 1 day before).
3. Cancel from the banner, from the sheet on the same device, or from the link in the confirmation email (`/c/<token>`).

**Admin view** (`/a/<token>`): see every slot with name, email and reminder choice, clear a sign-up, copy the share link, delete the sheet.

## Run locally

```bash
npm install
npm run db:local     # creates the tables in a local D1
npm run dev          # http://localhost:8787
```

Email is skipped locally unless you create a `.dev.vars` file containing `RESEND_API_KEY=...`.

## Deploy

Workers Builds runs `npx wrangler deploy`. The Worker name in `wrangler.toml` is `shifty`, matching the connected Cloudflare project.

That deploy creates the D1 database named `shifty`. `database_id` is left unset on purpose: the all-zero placeholder makes the deploy fail because no such database exists. Later deploys reuse the database by name. The Worker creates the tables on the first request.

Then edit `wrangler.toml` and deploy again:

- `APP_NAME`: shown in the page header.
- `BASE_URL`: the public origin, for example `https://shifty.<account>.workers.dev`. Reminder emails use it for cancel links. Leave empty until you have a domain.
- `MAIL_FROM`: a sender on a domain you verified in Resend.

Email (optional but needed for confirmations and reminders):

```bash
npx wrangler secret put RESEND_API_KEY
```

To deploy from your own machine: `npx wrangler login`, then `npm run deploy`.

Add a custom domain in the Cloudflare dashboard (Workers & Pages, your worker, Settings, Domains & Routes), put it in `BASE_URL`, and deploy again.

## Design notes

- **No double-booking.** `claims.slot_id` is `UNIQUE`. Two people tapping the same slot at once: one insert wins, the other gets a 409 and a "someone just took that shift" message.
- **Times** are stored as UTC seconds. Slots are generated from the sheet's timezone, including daylight saving changes and overnight windows. Every viewer sees times in the sheet's timezone, and the page says which one.
- **Limits:** 10 ranges per sheet, 62 days per range, 1,500 slots per sheet.
- **Privacy.** Volunteers see first names on taken slots, never emails. Only the admin link shows emails. Page data is inserted with `textContent`, so a name can't inject HTML.
- **Admin link is the only credential.** Anyone who has it can manage the sheet. There is no recovery if it is lost.
- **Reminders.** The cron runs every 15 minutes, sends anything due, and only marks it sent after Resend accepts it, so a failed send retries on the next sweep. If someone signs up inside their reminder window, the reminder goes out on the next sweep.
- **Spam.** There is a honeypot field and input validation. There is no rate limiting. Add a Cloudflare rate limiting rule on `/api/*` before sharing widely.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/preview` | Slot count and first slot for a set of ranges |
| POST | `/api/sheets` | Create a sheet, returns share and admin URLs |
| GET | `/api/s/:id` | Public sheet and upcoming slots |
| POST | `/api/s/:id/claim` | Take a slot (`slotId`, `name`, `email?`, `remind`) |
| GET | `/api/c/:token` | Details for a sign-up |
| POST | `/api/c/:token/cancel` | Cancel a sign-up |
| GET | `/api/a/:token` | Admin view with all sign-ups |
| POST | `/api/a/:token/clear` | Clear one sign-up (`slotId`) |
| POST | `/api/a/:token/delete` | Delete the sheet |

The iMessage app can be another client of this same API.

## Not built yet

- SMS reminders (Twilio needs A2P 10DLC registration first).
- iMessage extension.
- Editing a sheet's ranges after creation.
- A "my shifts" view across devices.
- `.ics` download.

## What was tested

Run locally with `wrangler dev` and a local D1: slot generation across the November 2026 daylight saving change, overnight windows, the full create, claim, cancel and admin flow, a 409 on double-claiming, input validation, the honeypot, and that the reminder sweep selects the right claim and leaves it unsent when delivery fails. The pages were smoke-tested in jsdom. Real email delivery through Resend and the Cloudflare deploy itself have not been tested.
