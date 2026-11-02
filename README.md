# HouseOS

Every new device starts empty. Add your own tasks, inventory, meals, and bills; nothing is scheduled or filled in automatically. Each browser stores its own household data locally, with no account or cross-device sync. To remove existing records, use **Settings → Start fresh → Clear all household data**. Clearing data also removes home settings, and the app stays empty after a reload.

**Your home, handled.** HouseOS is a personal home manager for someone running a household on their own: plan the week, keep up with chores, know what is in the cupboard, shop with a list, decide what to cook, and remember the bills.

It is an offline-capable React PWA. Household records are stored in IndexedDB on the device. There is no account, application server, API key, analytics service, or automatic cloud sync.

## What is in the app

| Area | What you can do |
| --- | --- |
| **Overview** | See your daily timeline, progress, chores, shopping count, upcoming bills, low stock, expiring items, and dinner plan. Select another day in the current week to preview it. |
| **My schedule** | Navigate weeks, inspect a day's timetable, and create daily, selected-weekday, every-N-days, or one-off tasks. Set a clock time or an offset from arriving home, duration, room, notes, and priority. |
| **Chores** | Filter by room, search names and notes, see what is due, and review completed tasks. Cleaning, laundry, plant care, and appliance maintenance use the same system. |
| **Inventory** | Track quantities and units, low-stock thresholds, restock targets, categories, optional expiry dates, and notes. Increase or use stock as it changes. |
| **Shopping list** | Queue inventory items individually or add all low-stock items. Mark a purchase as bought to fill it to its target. Existing time-based restock reminders remain available separately. |
| **Meal planner** | Plan breakfast, lunch, and dinner for each day, add prep notes and ingredient names, copy the previous week into empty slots, and send the week's ingredients to shopping. |
| **Bills & dates** | Set monthly due dates and optional INR amounts, mark bills paid, and see known monthly totals, paid amounts, and remaining payments. |
| **Home handbook** | Save trusted repair and utility contacts, customer IDs, appliance and warranty details, and useful notes about the house. Phone numbers can open the device's dialler. |
| **Settings** | Set your home name, weekday and weekend home times, bedtime, and daily home-time budget. Manage all tasks, choose a theme, export or restore backups, and download calendar reminders. |

## Make it your home

1. Open **Settings** and save your daily rhythm. An evening chore set to “after arriving home” follows your arrival time automatically; weekend home time is separate.
2. Add your own routines and chores. Choose the days, durations, rooms, and repeat rules that match the way you live.
3. Add a few items to **Inventory**, entering quantities you really have. Inventory, meals, and handbook records start empty; the app does not invent stock or personal information.
4. Queue what you need, plan a few meals, and put your monthly bills in one place.
5. Export a backup after setup, then return to **Overview** for the daily checklist.

New installations contain no records. An older installation keeps its existing records until you clear them through Settings. Legacy chores and supplies with no known completion date stay in **Not set up yet** until you establish a baseline. Clearing the home or removing every task leaves the app empty after a reload.

## Schedules that fit around your day

Tasks can repeat on selected weekdays, repeat after a chosen number of days, or happen once on a specific date. Completing an interval task starts its next countdown. Completing a one-off task keeps it completed until you undo it. Snoozing postpones a task without adding a false completion to its history.

The planner flags overlapping tasks, pending tasks above your daily time budget, and tasks that run past bedtime. It shows a forecast based on the latest completion dates; it does not silently move tasks to resolve conflicts. Future dates are for planning rather than recording work as already done.

The household day changes at **04:00**, so a task completed at 01:00 belongs to the evening you are finishing. Bills use the **civil calendar month** for their paid state. A due date on the 31st uses the last valid day in a shorter month.

Existing interval learning remains available: after enough completion history, the editor can suggest the median gap between completions. A suggestion only changes the interval when you choose it.

## Inventory, shopping, and meals

Inventory is a manual record of what you have. A product is low when its quantity is at or below the threshold. Low stock is a suggestion; it does not place an order or add a purchase without your action. The **Use soon** filter includes goods with stock remaining whose expiry date is past or within three days.

Adding an item to the shopping list does not alter its quantity. **Bought** fills it to at least its restock target and removes it from the list. A new purchase clears the old expiry date so you can enter the new one in the item details. Use the quantity controls or editor when your actual purchase differs from the target. The app tracks one quantity and one expiry date per product, rather than individual batches.

Meal ingredients are names to check, not automatically calculated recipe quantities. Sending them to shopping queues an existing product with the same name or creates a new item for you to adjust. Planning or cooking a meal does not deduct ingredients from inventory.

## Reminders and calendar export

**Settings → Download calendar file** creates a standard `.ics` file with event alerts for import into your calendar app. HouseOS itself does not deliver notifications while closed.

- Daily routines and selected weekdays export with matching recurrence rules.
- Arrival-based tasks use the current weekday or weekend home time. Tasks after midnight are placed on the correct civil date.
- Explicit every-N-days tasks export their **next occurrence**; the next date changes when you complete the task in HouseOS.
- Incomplete one-off tasks export once; completed one-off tasks are omitted.
- Monthly bills use a recurrence rule that also handles short months. Monthly tasks with arrival-based or after-midnight times export the next **12 months** as individual events.
- Legacy time-based restock reminders stay in HouseOS and are not exported.

The file is a **snapshot, not a calendar subscription**. Re-export after changing schedules, arrival times, snoozes, or completion dates. Review or replace previously imported HouseOS events in your calendar to avoid keeping obsolete copies. Alert handling depends on the calendar app and its permissions.

## Offline use and installation

Open a production build online and wait until the app reports **Offline ready** before relying on it offline. A preparation or unavailable status is not a promise that offline use will work. The build preloads the HTML, hashed JavaScript and CSS, manifest, and local icons together. An incomplete or failed download does not install a partial new version.

After installation, the cached shell and the device's database allow the app to open and work without a connection. Updates receive a build-specific cache and take effect on a subsequent opening or reload after installation. Failed HTTP responses are not saved as app assets. The service worker is disabled in development so it cannot interfere with Vite updates.

On iPhone, open the deployed URL in Safari and use **Share → Add to Home Screen**. On supported Android browsers, use **Install app** or **Add to Home screen**. Service workers require HTTPS in production; localhost is supported for local testing.

Browser storage and service-worker support are required for offline use. Private browsing, blocked storage, clearing site data, changing the app's origin, or storage eviction can remove or make records inaccessible. Google Fonts may be requested while online; system font fallbacks keep the interface usable offline. Household records are not sent to the font provider.

## Backups and existing data

**Settings → Export a backup** downloads JSON containing tasks, completion history, inventory, meal plans, handbook records, and household rhythm settings. The app reminds you when a backup is due. The downloaded file is not uploaded anywhere automatically; keep a copy somewhere you control.

The current export format is **version 2**. Existing **version 1** backups remain supported:

- A version 2 restore replaces tasks and history, plus the household sections included in that file. An included empty section clears that section.
- A version 1 restore replaces its tasks and history and keeps existing newer household sections that the older file does not contain.
- Restore asks you to confirm the replacement. Export your current data first if you want to keep it.
- Invalid and duplicate records are skipped and counted. Unsupported versions or unusable sections are rejected before the existing database is changed; accepted changes are written together in a database transaction.

Theme choice and the last-backup reminder date are device preferences and are not included in the household backup. There is no live sync between browsers, devices, or installations. Export and restore are the manual way to transfer household records.

## Development

Use Node.js **20.19+ in the 20.x line, or 22.12+**, and npm.

```sh
npm ci
npm run dev
```

Vite serves the development app at the URL printed in the terminal, normally `http://localhost:5173`. To check the app and build the production offline shell:

```sh
npm run typecheck
npm test
node --test scripts/check-precache.mjs
npm run build
npm run preview
```

The build runs TypeScript, Vite, and `scripts/precache.mjs`. That final step reads the actual `dist/` output, generates the complete precache list, and writes a service worker with a digest of the build contents. Its focused checks cover install failure, offline navigation, cache isolation, failed HTTP responses, and storage quota failures.

Production output is the static **`dist/`** directory. Runtime dependencies remain React, React DOM, and `idb`; there is no application backend to configure.

## Deployment

The repository includes `vercel.json` with `npm run build`, the `dist/` output directory, and a no-cache header for `sw.js`. Deploy the repository with that configuration, or serve `dist/` from another HTTPS static host. Do not publish the unprocessed worker from `public/`; use the production build so its asset list and version are generated.

The checked-in configuration serves the app at a domain's root. A subdirectory deployment also needs Vite's `base` and the manifest's `start_url`, `scope`, and icon URLs, plus the HTML's manifest and icon links, to match that path. Service-worker registration and precache resource URLs respect the application base and worker scope.

## Source layout

```text
src/
  App.tsx                 navigation, shared state, persistence actions
  core.ts                 task model, due dates, completion and interval learning
  planner.ts              recurrence, arrival-based times, day plans and load checks
  inventory.ts            stock validation, thresholds, expiry and purchase rules
  meals.ts                meal slots, weekly copying and ingredient lists
  bills.ts                monthly paid state and known-amount totals
  homeGuide.ts            handbook records and telephone-link validation
  db.ts                   IndexedDB transactions and versioned backup/restore
  validation.ts           household data validation
  calendar.ts             calendar export
  components/             shared editor, task rows and icons
  views/                  overview and household modules
public/
  sw.js                   service-worker template
  manifest.webmanifest
scripts/
  precache.mjs            production precache generation
  check-precache.mjs      offline-worker checks
```

`PRODUCT_NOTES.md` records the product changes and remaining boundaries. `NOTES.md` retains the original design background.

## Licence

MIT — see [LICENSE](LICENSE).
