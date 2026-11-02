import {
  anchorMinutes, clampMonthDay, DAY_MS, daysUntilDue, dueDate, houseDay,
  isWeekend, needsSetup, scopeMatches, toISODate, type Item,
} from "./core";

export interface HouseholdSettings {
  homeName: string;
  arrivalTime: string;
  weekendArrivalTime: string;
  sleepTime: string;
  dailyBudgetMinutes: number;
}

export const DEFAULT_SETTINGS: HouseholdSettings = {
  homeName: "My home", arrivalTime: "19:00", weekendArrivalTime: "10:00",
  sleepTime: "23:00", dailyBudgetMinutes: 90,
};

export interface PlannedTask {
  item: Item;
  time: string;
  duration: number;
  done: boolean;
  overdue: boolean;
}

export function shiftDay(day: string, days: number): string {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function dayGap(a: string, b: string): number {
  return Math.round((new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / DAY_MS);
}

export function arrivalFor(settings: HouseholdSettings, day: string): string {
  return isWeekend(day) ? settings.weekendArrivalTime : settings.arrivalTime;
}

export function resolveTime(item: Item, settings: HouseholdSettings, day = houseDay()): string {
  if (item.scheduleAnchor === "arrival") {
    const [h, m] = arrivalFor(settings, day).split(":").map(Number);
    const total = ((h * 60 + m + (item.arrivalOffset ?? 0)) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return item.timeAnchor || (item.kind === "fixed" ? "09:00" : arrivalFor(settings, day));
}

/** Whether the schedule has an occurrence on a house day. No completion is implied. */
export function isScheduledFor(item: Item, day: string): boolean {
  if (!item.active || (item.snoozedUntil && day < item.snoozedUntil)) return false;
  if (item.scheduleMode === "once") {
    const date = item.snoozedUntil && item.scheduledDate && item.snoozedUntil > item.scheduledDate ? item.snoozedUntil : item.scheduledDate;
    return date === day;
  }
  if (item.scheduleMode === "weekly") {
    if (item.scheduledDate && day < item.scheduledDate) return false;
    if (item.snoozedUntil === day && toISODate(dueDate(item, new Date(day + "T12:00:00"))) === day) return true;
    return !!item.scheduledDays?.includes(new Date(day + "T12:00:00").getDay());
  }
  if (item.kind === "fixed") {
    const d = new Date(day + "T12:00:00");
    return d.getDate() === clampMonthDay(item.monthDay, d.getFullYear(), d.getMonth());
  }
  if (item.kind === "routine" && !item.scheduleMode) return scopeMatches(item, day);
  if (needsSetup(item)) return false;
  const completedDay = item.lastDone ? houseDay(new Date(item.lastDone)) : undefined;
  if (completedDay === day) return true;
  const first = completedDay
    ? shiftDay(completedDay, Math.max(1, item.intervalDays))
    : item.scheduledDate ?? houseDay(new Date(item.created));
  const effective = item.snoozedUntil && item.snoozedUntil > first ? item.snoozedUntil : first;
  const gap = dayGap(day, effective);
  return gap >= 0 && gap % Math.max(1, item.intervalDays) === 0;
}

/** Future days are a forecast based on the latest completion, not an automatic reschedule. */
export function planForDay(
  items: Item[], day: string, settings: HouseholdSettings, now: Date = new Date(),
): PlannedTask[] {
  const today = houseDay(now);
  return items.filter((item) => {
    if (!item.active || item.kind === "restock") return false;
    if (item.lastDone && houseDay(new Date(item.lastDone)) === day) return true;
    if (item.scheduleMode === "once" && item.lastDone && houseDay(new Date(item.lastDone)) !== day) return false;
    if (item.kind === "fixed" && item.lastDone) {
      const paid = new Date(item.lastDone);
      const planned = new Date(day + "T12:00:00");
      if (paid.getFullYear() === planned.getFullYear() && paid.getMonth() === planned.getMonth()) return false;
    }
    if (isScheduledFor(item, day)) return true;
    // A missed chore remains visible today until it is completed or snoozed.
    if (day !== today || (item.kind === "routine" && !item.scheduleMode) || needsSetup(item)) return false;
    if (item.scheduleMode === "once" && item.lastDone) return false;
    return daysUntilDue(item, now) <= 0;
  }).map((item) => {
    const done = !!item.lastDone && houseDay(new Date(item.lastDone)) === day;
    return {
      item, time: resolveTime(item, settings, day), duration: item.durationMinutes ?? (item.kind === "fixed" ? 5 : 15),
      done, overdue: !done && toISODate(dueDate(item, now)) < day && day === today && (item.kind !== "routine" || !!item.scheduleMode),
    };
  }).sort((a, b) => anchorMinutes(a.time) - anchorMinutes(b.time) ||
    ({high: 0, normal: 1, low: 2}[a.item.priority ?? "normal"] - {high: 0, normal: 1, low: 2}[b.item.priority ?? "normal"]));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(item: Item): string {
  if (item.scheduleMode === "once") return item.scheduledDate ? `Once · ${new Date(item.scheduledDate + "T12:00:00").toLocaleDateString(undefined, {day: "numeric", month: "short"})}` : "Once";
  if (item.scheduleMode === "weekly") return (item.scheduledDays ?? []).map((d) => DAY_NAMES[d]).join(", ") || "Choose days";
  if (item.kind === "fixed") return `Monthly · day ${item.monthDay ?? 1}`;
  if (item.kind === "routine" && !item.scheduleMode) return item.dayScope === "any" ? "Every day" : item.dayScope === "weekday" ? "Weekdays" : "Weekends";
  return item.intervalDays === 1 ? "Every day" : `Every ${item.intervalDays} days`;
}

export interface PlanLoad {
  minutes: number;
  remainingMinutes: number;
  overBudget: number;
  conflicts: Set<string>;
  afterBedtime: number;
}

export function planLoad(tasks: PlannedTask[], settings: HouseholdSettings): PlanLoad {
  const pending = tasks.filter((t) => !t.done);
  const minutes = tasks.reduce((n, t) => n + t.duration, 0);
  const remainingMinutes = pending.reduce((n, t) => n + t.duration, 0);
  const conflicts = new Set<string>();
  for (let a = 0; a < pending.length; a++) {
    for (let b = a + 1; b < pending.length; b++) {
      const left = anchorMinutes(pending[a].time);
      const right = anchorMinutes(pending[b].time);
      if (left < right + pending[b].duration && right < left + pending[a].duration) {
        conflicts.add(pending[a].item.id); conflicts.add(pending[b].item.id);
      }
    }
  }
  return {minutes, remainingMinutes, overBudget: Math.max(0, remainingMinutes - settings.dailyBudgetMinutes), conflicts,
    afterBedtime: pending.filter((t) => anchorMinutes(t.time) + t.duration > anchorMinutes(settings.sleepTime)).length};
}
