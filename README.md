# HouseOS

Running the house, one tick at a time. A small offline PWA for the domestic
admin nobody schedules — the atta, the gas cylinder, the rent, the bathroom you
last cleaned at some point.

**No server. No accounts. No API keys. Nothing to configure.** It is a static
page and an IndexedDB database on your own phone. Open it, add it to your Home
Screen, use it. Nothing is ever sent anywhere, because there is nowhere to send
it to.

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
to today" if you just want to start the clock.

**Snoozing.** Shop was shut, didn't get to it. Marking it done would be a lie
that poisons the learned interval, so instead push it out two days or a week.
`lastDone` is untouched.

## Reminders, without a server

The web cannot wake a closed app at a given time on its own. Every route to that
runs through a push service, which means a server, a key pair and an account —
and having none of those is the point of this app.

So HouseOS doesn't imitate an alarm clock badly. It hands your routine and fixed
dates to the calendar app already on your phone, which does alerts properly,
natively and offline. **Manage → Download calendar file** gives you a standard
`.ics`; open it and your phone offers to add the events, with an alert on each.

- Daily, weekday-only and weekend-only routines become the matching repeat rule.
- Fixed dates repeat monthly. Rent on the 31st lands on the 28th in February,
  the same way the Dates screen clamps it.
- Chores and restocking are deliberately left out. Their due dates move every
  time you tick one off, and a repeating calendar event cannot follow that — it
  would drift away from the truth within a fortnight.

The file is a copy, not a link, so re-export after you change your routine times.

## Dark mode

Follows your system by default, with an explicit **System / Light / Dark** toggle
on Manage for when the two disagree. The choice is remembered per device and
applied before first paint, so there's no white flash on the way into dark.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # the core logic and the calendar format
```

Three runtime dependencies: `react`, `react-dom` and `idb`. None of them phone
home or want a key.

First launch seeds ~70 items with Indian-context defaults. Correct them on the
Manage screen as you learn yours, or delete the lot and start empty.

## Deploy it

`npm run build` produces a `dist/` folder of static files. That is the whole
deployment — put it anywhere:

```bash
npx vercel          # or netlify, or Cloudflare Pages, or any static host
```

For GitHub Pages, set `base: "/houseos/"` in `vite.config.ts` first, so the
asset paths match the subdirectory.

There is nothing to configure afterwards. No environment variables, no database,
no cron, no dashboard.

## Install on your phone

Open the URL in **Safari** on iPhone or Chrome on Android, then Share → Add to
Home Screen. It opens full-screen from the icon and works with no signal —
useful in a shop basement, which is exactly where you need the list.

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
  calendar.ts    the .ics builder — no dependencies, just string work
  db.ts          IndexedDB, completion log, export/import
  theme.ts       system/light/dark, applied before first paint
  seed.ts        the ~70 starting items
  App.tsx        tabs and state
  components/    Row, ItemSheet, SetupSection
  views/         Today, Shopping, Chores, Dates, Manage
public/
  sw.js          hand-written: the offline shell, and nothing else
  manifest.webmanifest
```

`NOTES.md` has the design tokens and the reasoning behind them.

## Deliberately not here

No quantity inventory, no meal planning, no budgets, no chatbot, no how-to
guides. The phone already has an LLM for "how do I pick good bhindi", and every
one of those features is a reason to stop finishing this one.

No accounts, no sync, no server. The moment there is a backend holding your
data, this stops being a thing you can trust without reading a privacy policy —
and it stops being a thing you can deploy in one command and then forget about.

## Licence

MIT — see [LICENSE](LICENSE).
