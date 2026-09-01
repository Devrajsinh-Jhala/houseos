# HouseOS

Running the house, one tick at a time. A private, local-first PWA for the
domestic admin nobody schedules — the atta, the gas cylinder, the rent, the
bathroom you last cleaned at some point.

No accounts. No sign-up. No server for the core app. Everything lives in
IndexedDB on your own device, and the only backend is an optional push sender
you can skip entirely.

**The idea it's built around:** every reminder app makes you guess how often you
do something, then nags you on your own bad guess forever. HouseOS watches when
you actually tick things off and tells you the real number.

## The model

Everything is one record: `{ name, kind, intervalDays, lastDone }`.

| kind      | interval        | rendered as                          |
|-----------|-----------------|--------------------------------------|
| `routine` | 1 day + a time  | Today, as a timeline with a now rule |
| `chore`   | 2–90 days       | Chores, sorted by how overdue        |
| `restock` | 1–180 days      | Shopping, grouped by trip            |
| `fixed`   | day of month    | Dates                                |

One completion action, one due calculation, four screens. The house day rolls
over at 04:00, so ticking something off at 1 AM counts for the day you're
finishing.

## It learns your intervals

The seed ships with guesses — atta at 30 days, onions at 10, cylinder at 50.
**Every one of those is a guess about someone else's house.**

So the app keeps a completion log and does the arithmetic for you. Once an item
has three ticks behind it, opening it shows what your house actually does:

> You actually do this every **12 days**, going by your last 4 ticks. `[Use 12]`

It's the **median** gap, not the mean — one holiday where the atta lasted three
weeks shouldn't drag the estimate. And it only speaks up when the drift is real,
so a day either way on milk stays quiet.

Nothing changes without you tapping the button. The app makes the suggestion;
you decide if that's your house.

## Two things that keep the data honest

**"Not set up yet."** A freshly seeded item has never been ticked, so the app
genuinely doesn't know when you last did it — that isn't the same as overdue.
Those sit in their own section at the bottom until you say when, with a "set all
to today" if you just want to start the clock. Your main list stays real.

**Snoozing.** Shop was shut, didn't get to it. Marking it done would be a lie
that poisons the learned interval, so instead push it out two days or a week.
`lastDone` is untouched.

## Dark mode

Follows your system by default, with an explicit **System / Light / Dark**
toggle on Manage for when the two disagree. The choice is remembered per device
and applied before first paint, so there's no white flash on the way into dark.

Every colour in the app was already a design token, so the dark palette is a
redefinition of those tokens and nothing else.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # the core logic — day boundary, due dates, the median
```

First launch seeds ~70 items with Indian-context defaults. Correct them on the
Manage screen as you learn yours, or delete the lot and start empty.

## Deploy your own

```bash
npm i -g vercel
vercel
```

Vite builds to `dist/`; `vercel.json` is already set up. It works fine with no
backend at all — you just don't get push.

**On the free tier, the reminder schedule lives in GitHub Actions, not Vercel.**
Vercel's Hobby plan allows one cron run per day, which is useless to an app whose
job is "tell me at 06:45", so `.github/workflows/tick.yml` pings `/api/tick`
every 15 minutes instead. Set a repository variable `TICK_URL` to
`https://your-app.vercel.app/api/tick` and it starts working. On Pro, delete that
workflow and put the cron back in `vercel.json`:

```json
"crons": [{ "path": "/api/tick", "schedule": "*/15 * * * *" }]
```

GitHub's scheduled runs are best-effort and can land a few minutes late, so a
badly delayed run can miss an anchor. It is a free cron, priced accordingly.

## Install on iPhone

Open the deployed URL in **Safari** (not Chrome), tap Share, then Add to Home
Screen, then open it from the icon. This step is not optional if you want
reminders — see below.

## Reminders

There is no scheduled local notification API on the web. Apple's guidance is to
send a Web Push at the moment of the event, which is why timing lives on the
server rather than on the phone.

Three constraints follow from that:

- Push only works for web apps installed to the Home Screen. A Safari tab
  cannot receive push even after you grant permission.
- The permission prompt must be triggered by a tap, so it lives behind the
  button on the Manage screen and never fires on load.
- The server needs its own copy of your routine times, since it can't read
  IndexedDB. Subscribing uploads them — and **editing a routine re-uploads them
  automatically**, so there's nothing to remember.

If you'd rather skip all of this: leave push off and use iOS Alarms for the
wake-up time. The app still works as a pull-based tool you open when you're
home. Nothing else depends on push.

### Setting it up

Generate a key pair:

```bash
npx web-push generate-vapid-keys
```

Then set these in Vercel:

| variable                     | where            |
|------------------------------|------------------|
| `VITE_VAPID_PUBLIC_KEY`      | build + runtime  |
| `VAPID_PUBLIC_KEY`           | runtime          |
| `VAPID_PRIVATE_KEY`          | runtime          |
| `VAPID_SUBJECT`              | `mailto:you@...` |
| `UPSTASH_REDIS_REST_URL`     | runtime          |
| `UPSTASH_REDIS_REST_TOKEN`   | runtime          |

Add a Redis store from the Vercel Marketplace — Vercel KV is deprecated and
existing stores were migrated to Upstash, so new projects go straight there.
Adding the integration sets the two Upstash variables for you.

Redeploy, open the app from the Home Screen icon, and tap **Turn on
reminders** on Manage. Devices are stored one row per push endpoint, so a
deployment can serve a household — or a handful of strangers — without them
treading on each other. Dead subscriptions are pruned on the next cron run.

## Backup

Storage for installed web apps is durable but not guaranteed. Export a JSON
backup from Manage every few weeks; the app tells you how long it's been and
starts nudging after a month. Losing six months of last-bought dates would be
the thing that kills this app, and a file in your cloud drive costs you nothing.

Restores are validated — a malformed file is rejected with a count of what was
skipped rather than being written straight into your database.

## Layout

```
src/
  core.ts        model, due dates, pressure, day boundary, interval
                 learning — no React, fully unit-tested
  core.test.ts   the day boundary, month clamping, the median
  db.ts          IndexedDB, completion log, export/import
  seed.ts        the ~70 starting items
  push.ts        subscription, with the iOS standalone guard
  theme.ts       system/light/dark, applied before first paint
  App.tsx        tabs and state
  components/    Row, ItemSheet, SetupSection
  views/         Today, Shopping, Chores, Dates, Manage
public/
  sw.js          hand-written: offline shell + push handlers
  manifest.webmanifest
api/
  subscribe.ts   stores one device per endpoint + its routine anchors
  tick.ts        cron, sends what's due in the next 15 minutes
.github/
  workflows/tick.yml   the free-tier scheduler
```

`NOTES.md` has the design tokens and the reasoning behind them.

## Deliberately not here

No quantity inventory, no meal planning, no budgets, no chatbot, no how-to
guides. The phone already has an LLM for "how do I pick good bhindi", and every
one of those features is a reason to stop finishing this one.

No accounts and no sync either. The moment there's a server holding your data,
this stops being a thing you can trust without reading the privacy policy.

## Licence

MIT — see [LICENSE](LICENSE).
