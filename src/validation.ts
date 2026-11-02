import type { DoneEvent, Item } from "./core";
import type { HouseholdSettings } from "./planner";

function record(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function nonempty(raw: unknown): raw is string {
  return typeof raw === "string" && raw.trim().length > 0;
}

function integer(raw: unknown, min: number, max: number): raw is number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max;
}

export function validDate(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(raw.slice(0, 4)) &&
    date.getMonth() + 1 === Number(raw.slice(5, 7)) && date.getDate() === Number(raw.slice(8, 10));
}

export function validClock(raw: unknown): raw is string {
  return typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

export function validTimestamp(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(raw)) return false;
  return validDate(raw.slice(0, 10)) && Number.isFinite(Date.parse(raw));
}

export function validSettings(raw: unknown): raw is HouseholdSettings {
  return record(raw) && nonempty(raw.homeName) && validClock(raw.arrivalTime) &&
    validClock(raw.weekendArrivalTime) && validClock(raw.sleepTime) &&
    integer(raw.dailyBudgetMinutes, 1, 1440);
}

/** Validate every field used in due-date, timetable, and calendar calculations. */
export function validItem(raw: unknown): raw is Item {
  if (!record(raw) || !nonempty(raw.id) || !nonempty(raw.name)) return false;
  if (!["routine", "chore", "restock", "fixed"].includes(raw.kind as string) ||
    !["any", "weekday", "weekend"].includes(raw.dayScope as string) ||
    typeof raw.active !== "boolean" || !validTimestamp(raw.created) ||
    !integer(raw.intervalDays, raw.kind === "fixed" ? 0 : 1, 3650)) return false;

  if (raw.timeAnchor !== undefined && !validClock(raw.timeAnchor)) return false;
  if (raw.group !== undefined && typeof raw.group !== "string") return false;
  if (raw.note !== undefined && typeof raw.note !== "string") return false;
  if (raw.monthDay !== undefined && !integer(raw.monthDay, 1, 31)) return false;
  if (raw.lastDone !== undefined && !validTimestamp(raw.lastDone)) return false;
  if (raw.snoozedUntil !== undefined && !validDate(raw.snoozedUntil)) return false;

  if (raw.scheduleMode !== undefined && !["interval", "weekly", "once"].includes(raw.scheduleMode as string)) return false;
  if (raw.scheduleAnchor !== undefined && !["clock", "arrival"].includes(raw.scheduleAnchor as string)) return false;
  if (raw.scheduledDate !== undefined && !validDate(raw.scheduledDate)) return false;
  if (raw.scheduledDays !== undefined && (!Array.isArray(raw.scheduledDays) ||
    raw.scheduledDays.some((day) => !integer(day, 0, 6)) ||
    new Set(raw.scheduledDays).size !== raw.scheduledDays.length)) return false;
  if (raw.scheduleMode === "weekly" && (!Array.isArray(raw.scheduledDays) || !raw.scheduledDays.length)) return false;
  if (raw.scheduleMode === "once" && !validDate(raw.scheduledDate)) return false;
  if (raw.arrivalOffset !== undefined && !integer(raw.arrivalOffset, -1440, 1440)) return false;
  if (raw.durationMinutes !== undefined && !integer(raw.durationMinutes, 1, 1440)) return false;
  if (raw.priority !== undefined && !["low", "normal", "high"].includes(raw.priority as string)) return false;
  if (raw.amount !== undefined && (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount < 0)) return false;
  return true;
}

export function validEvent(raw: unknown): raw is DoneEvent {
  return record(raw) && nonempty(raw.id) && nonempty(raw.itemId) && validTimestamp(raw.doneAt);
}
