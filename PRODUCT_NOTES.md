# HouseOS product notes

HouseOS now supports the daily work of running a home alone while retaining the original local data model and offline deployment.

## From reminders to a household workspace

| Original gap | Implemented behavior |
| --- | --- |
| Today showed only routine reminders. | An overview connects the day plan, progress, chores, shopping, low stock, expiry, upcoming bills, arrival time, and dinner. |
| Chores had an interval but no explicit timetable. | Selected weekdays, every-N-days schedules, one-off dates, clock times, and arrival offsets feed a weekly planner. |
| A schedule did not account for available time. | Duration, priority, overlap checks, a daily home-time budget, and bedtime warnings make the plan reviewable. Conflicts are flagged for the user to resolve. |
| Supplies were only restock countdowns. | Inventory adds actual quantities, units, low-stock thresholds, targets, expiry dates, and an explicit shopping queue. Legacy countdowns remain accessible. |
| Meal decisions were outside the app. | A seven-day meal board supports breakfast, lunch, dinner, prep notes, weekly copying, and ingredient names sent to shopping. |
| Bills tracked dates without amounts or persistent monthly paid rows. | Known amounts produce monthly planned, paid, and remaining totals. Paid state survives navigation and resets by civil month. Missing amounts stay visibly unknown. |
| Useful service details had no home. | A handbook holds trusted contacts, utility/customer information, maintenance details, and home notes. It starts empty. |
| Backups covered only the original task model. | Version 2 includes the new household sections. Version 1 backups remain compatible; validation and transactional writes protect existing data. |
| First-load offline support omitted hashed build assets. | The production build preloads the complete version, uses content-derived cache versions, isolates cache cleanup, and rejects failed installs and bad HTTP assets. |
| The interface was a narrow phone list. | A responsive home workspace supports both a desktop sidebar and mobile navigation, with the existing light/dark preference. |

## Practical defaults

- Existing installations retain their saved records. New schedule fields are optional and old task records preserve their original behavior.
- New installations start with no tasks, routines, bills, inventory, meals, or handbook records. Settings show editable suggestions until the user saves their availability. The Start fresh action clears all household records and settings on the current device and does not reseed them.
- Completing a task records actual work; snoozing does not. An incomplete one-off task remains actionable until completed, snoozed, or changed.
- The household day rolls over at 04:00. Bill payment state follows the civil calendar month.
- Quantity and bill information are entered by the user. The app does not infer ownership, current stock, amounts paid, or trusted contacts.
- Calendar files provide reminders through the user's calendar app. They are snapshots and require refreshing after schedule changes.

## Boundaries and next decisions

This release has no account, backend, analytics, cloud sync, bank connection, purchase ordering, or background push service. It is a personal planning and record-keeping app; it does not pay bills or perform the chores.

Inventory has a single quantity and expiry date per product. It does not track batches, barcodes, receipt imports, consumption forecasts, or automatic recipe deductions. Shopping purchases use a configurable target rather than recording purchase transactions or prices. Meal ingredients are names, not a recipe or nutrition database.

Bills provide known monthly outgoings and payment checklists, not a complete household accounting ledger. Handbook records are text and telephone details rather than document uploads or a password vault. Exports are ordinary local files, not encrypted cloud backups.

Potential later additions should follow actual use: optional cross-device backup/sync, richer purchase and bill history, per-day availability, inventory batches, and a reminder subscription or push service. Each would need a concrete persistence and privacy design; none is represented as already working here.

