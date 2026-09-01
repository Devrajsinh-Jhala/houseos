# HouseOS — build notes

## What this is
A private household-operations app for one person living alone in India.
Not a product. One user. No accounts, no login, no server for the core app.

## The one idea
Everything is a recurring item: `{ name, kind, intervalDays, lastDone }`.
- routine  → intervalDays 1, has a timeAnchor ("06:45")
- chore    → intervalDays 3–30
- restock  → intervalDays 1–180, has a shopping group
- fixed    → calendar-anchored (rent on the 5th), ignores intervalDays

One completion action. One due calculation. Four renderings.

## Day boundary
The house day rolls over at 04:00, not midnight. Ticking off "kitchen reset"
at 1 AM should count for the day you're finishing, not the one starting.

## Design tokens
| role        | hex      | note                                  |
|-------------|----------|---------------------------------------|
| paper       | #F4F5F1  | cool green-grey, readable in sunlight |
| ink         | #171C19  |                                       |
| muted       | #6E7873  |                                       |
| primary     | #17564A  | deep teal-green                       |
| soon        | #C08A17  | haldi — due within a day              |
| over        | #99372E  | clay red — overdue                    |
| rule        | #DDE0D9  |                                       |

Type: Bricolage Grotesque for clock numerals + section heads,
Public Sans for everything else. Two families, clearly distinct.

Deliberately avoided: cream + terracotta, near-black + acid accent,
identical rounded cards with soft grey shadows, ALL-CAPS eyebrow labels.
Rows are ruled lists, not cards — this is a ledger, not a dashboard.

## Signature elements
1. Today is a vertical timeline with a live "now" rule that sits between
   the item you just finished and the one coming up.
2. Restock and chore rows carry a pressure fill showing how far through
   the interval they are. Half-full bar = half a bag of atta, roughly.

## Deliberately not built
No quantity inventory, no meal planning, no budget, no chatbot, no guides.
LLM on the phone already answers "how do I pick good bhindi".

## iOS constraints that shaped this
- Scheduled local notifications do not exist in the web Notifications API.
  Apple's answer is Web Push at the moment of the event — which needs a server.
- No Background Sync API. No install prompt event.
- Storage for installed web apps is reasonably durable but not guaranteed,
  so JSON export exists and matters.

## Added in the second pass

### Learning the interval
The seed's numbers are guesses about someone else's house, and the README always
said so — but the app gave you no way to learn your own. It was already writing a
`DoneEvent` on every tick and never reading it back.

`observedInterval` takes the **median** gap between completions, not the mean:
one holiday where the atta lasted three weeks should not move the estimate, and
a mean lets it. Three completions (two gaps) is the floor before we say anything,
and `suggestionFor` stays quiet unless the drift is at least a day *and* 15% of
the current interval — otherwise milk suggests 8 days one week and 6 the next.

Nothing auto-applies. The app proposes, you tap.

### "Not set up yet" is a third state
`!lastDone` used to render as due-today, so first launch was ~60 items all
shouting at once, which reads as broken. Never-ticked chores and restocks are now
their own state: not overdue, excluded from the nav dots, parked in a section at
the foot of the list with a bulk "set all to today".

Items *you* add default to `lastDone: now` — you're adding it because it's in the
house, and asking would be asking a question you just answered.

### Snooze, so the data stays honest
Without it the only way to clear a row you didn't get to was to mark it done,
which lies to the interval learning above. `snoozedUntil` pushes the due date out
and leaves `lastDone` alone. Cleared on the next real completion.

### Dark mode
Every colour was already a token on `:root`, so this is a `prefers-color-scheme`
block that redefines them and nothing else. One new token, `--on-primary`: it
reads on top of the primary fill and has to flip with the scheme, where `--paper`
must not.

An app whose own routine spans 06:45 and 23:15 has no business being light-only.

### Multi-device push
The store was a single Redis key, so the second person to install evicted the
first. Now one hash field per push endpoint, dead subscriptions pruned on 404/410,
and anything that hasn't re-subscribed in 180 days aged out.

### Tests
`core.ts` is pure and holds everything easy to break silently — the 04:00
rollover, anchors wrapping past midnight, month-end clamping for `fixed`, the
median. It now has 26 tests. Rent on the 31st lands on the 28th in February, and
there is a test that says so.

## The backend, and its removal

The first version answered the notification problem the way the platform tells
you to: a Vercel function, a Redis store for the subscriptions, VAPID keys, and
a cron firing a Web Push at the moment of each event. It worked in principle,
and it was the wrong shape for this app.

The cost was not code. It was that "a private tool you install and forget"
became "sign up for two services, generate a key pair, set six environment
variables, and hope the free cron tier holds". Vercel's Hobby plan allows one
cron run per day, so the schedule had to move to GitHub Actions to work at all.
Every one of those is a thing that can break silently in six months, on an app
whose entire promise is that it just sits there and works.

So it is gone. No `api/`, no keys, no accounts, three runtime dependencies, and
`dist/` is the whole deployment.

### What replaced it
Not an imitation of push — there isn't an honest one. The web cannot wake a
closed page on a timer without a push service, and pretending otherwise with
service-worker timeouts would produce reminders that fire sometimes.

Instead, `calendar.ts` writes an RFC 5545 file and hands the schedule to the
calendar app already on the phone, which has a real alerting system, works
offline, and needs no account. Routines become DAILY or WEEKLY;BYDAY rules;
fixed dates become MONTHLY.

Two details worth keeping:
- **Floating times.** `DTSTART:20250310T064500` with no timezone and no Z means
  06:45 wherever you are, which is what a wake-up time means.
- **BYMONTHDAY=31 silently skips February**, because the spec drops dates that
  do not exist. Rent would just not appear that month. Listing 28,29,30,31 with
  `BYSETPOS=-1` picks the last day that exists, reproducing the clamping in
  `clampMonthDay` so the calendar and the Dates screen never disagree.

Chores and restocking are not exported. Their due dates move every time you tick
one, and a repeating event cannot follow that; it would drift and start lying
within a fortnight. The pressure model stays in the app, where it can be right.
