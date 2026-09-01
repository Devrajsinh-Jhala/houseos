// The whole app is one record type with four renderings.

export type Kind = "routine" | "chore" | "restock" | "fixed";
export type DayScope = "any" | "weekday" | "weekend";

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  /** Days between occurrences. Routine is always 1. Ignored for `fixed`. */
  intervalDays: number;
  /** "06:45" — routine only. Orders the day and drives push timing. */
  timeAnchor?: string;
  dayScope: DayScope;
  /** Shopping trip for restock, area for chores. */
  group?: string;
  /** Brand, quantity, the thing you always forget at the shop. */
  note?: string;
  /** Day of month, 1–31 — `fixed` only. Clamped to short months. */
  monthDay?: number;
  /** ISO timestamp of the last completion. */
  lastDone?: string;
  /** YYYY-MM-DD. Pushed out by hand; cleared on the next completion. */
  snoozedUntil?: string;
  active: boolean;
  created: string;
}

export interface DoneEvent {
  id: string;
  itemId: string;
  doneAt: string;
}

/** The house day rolls over at 04:00, not midnight. */
export const DAY_START_HOUR = 4;

export const DAY_MS = 86_400_000;

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** YYYY-MM-DD for the house day containing `now`. */
export function houseDay(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isWeekend(day: string): boolean {
  const wd = new Date(day + "T12:00:00").getDay();
  return wd === 0 || wd === 6;
}

export function scopeMatches(item: Item, day: string): boolean {
  if (item.dayScope === "any") return true;
  return item.dayScope === "weekend" ? isWeekend(day) : !isWeekend(day);
}

/** Minutes past midnight for a "HH:MM" anchor, sorted against the house day. */
export function anchorMinutes(t?: string): number {
  if (!t) return 24 * 60;
  const [h, m] = t.split(":").map(Number);
  const raw = h * 60 + m;
  // Anything before 04:00 belongs to the tail of the same house day.
  return raw < DAY_START_HOUR * 60 ? raw + 24 * 60 : raw;
}

export function doneToday(item: Item, now: Date = new Date()): boolean {
  if (!item.lastDone) return false;
  return houseDay(new Date(item.lastDone)) === houseDay(now);
}

/**
 * A chore or restock that has never been ticked. The seed ships ~60 of these,
 * and they are not overdue — we simply have no idea when you last did them.
 * Treating the two the same turns first launch into a wall of colour.
 */
export function needsSetup(item: Item): boolean {
  if (!item.active) return false;
  if (item.kind !== "chore" && item.kind !== "restock") return false;
  return !item.lastDone;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Day-of-month for `fixed`, pulled back to the last day of a short month. */
function anchoredDay(item: Item, year: number, monthIndex: number): number {
  return Math.min(Math.max(item.monthDay ?? 1, 1), daysInMonth(year, monthIndex));
}

function rawDueDate(item: Item, now: Date): Date {
  if (item.kind === "fixed") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    d.setDate(anchoredDay(item, d.getFullYear(), d.getMonth()));
    if (item.lastDone) {
      const last = new Date(item.lastDone);
      if (last.getFullYear() === d.getFullYear() && last.getMonth() === d.getMonth()) {
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
        next.setDate(anchoredDay(item, next.getFullYear(), next.getMonth()));
        return next;
      }
    }
    return d;
  }
  if (!item.lastDone) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const base = new Date(item.lastDone);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
  d.setDate(d.getDate() + item.intervalDays);
  return d;
}

/** Next date this item is due, as a Date at local noon. Honours a snooze. */
export function dueDate(item: Item, now: Date = new Date()): Date {
  const base = rawDueDate(item, now);
  if (item.snoozedUntil) {
    const until = new Date(item.snoozedUntil + "T12:00:00");
    if (until.getTime() > base.getTime()) return until;
  }
  return base;
}

/** Whole days until due. Negative means overdue. */
export function daysUntilDue(item: Item, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((dueDate(item, now).getTime() - today.getTime()) / DAY_MS);
}

export function isSnoozed(item: Item, now: Date = new Date()): boolean {
  if (!item.snoozedUntil) return false;
  return new Date(item.snoozedUntil + "T12:00:00").getTime() > now.getTime();
}

/**
 * How far through its interval an item is: 0 just done, 1 due now, >1 overdue.
 * This is what the fill bar draws — roughly "how much of the bag is gone".
 */
export function pressure(item: Item, now: Date = new Date()): number {
  if (!item.lastDone) return 0;
  const span = item.kind === "fixed" ? 30 : Math.max(item.intervalDays, 1);
  const elapsed = (now.getTime() - new Date(item.lastDone).getTime()) / DAY_MS;
  return Math.max(0, elapsed / span);
}

export type Urgency = "over" | "soon" | "ok" | "unset";

export function urgency(item: Item, now: Date = new Date()): Urgency {
  if (needsSetup(item)) return "unset";
  const d = daysUntilDue(item, now);
  if (d < 0) return "over";
  if (d <= 1) return "soon";
  return "ok";
}

export function dueLabel(item: Item, now: Date = new Date()): string {
  if (needsSetup(item)) return "not set";
  const d = daysUntilDue(item, now);
  if (d < -1) return `${Math.abs(d)} days late`;
  if (d === -1) return "a day late";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 14) return `in ${d} days`;
  const w = Math.round(d / 7);
  return `in ${w} weeks`;
}

/** Drives the nav dots. Never-ticked items are not nagging material. */
export function needsAttention(item: Item, now: Date = new Date()): boolean {
  if (!item.active) return false;
  if (item.kind === "routine") return false;
  if (needsSetup(item)) return false;
  return daysUntilDue(item, now) <= 1;
}

/** Items for a given day's routine, in clock order. */
export function routineFor(items: Item[], day: string): Item[] {
  return items
    .filter((i) => i.active && i.kind === "routine" && scopeMatches(i, day))
    .sort((a, b) => anchorMinutes(a.timeAnchor) - anchorMinutes(b.timeAnchor));
}

/** Groups preserved in first-seen order, so shopping trips stay in trip order. */
export function groupBy(items: Item[]): [string, Item[]][] {
  const map = new Map<string, Item[]>();
  for (const i of items) {
    const k = i.group?.trim() || "Other";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(i);
  }
  return [...map.entries()];
}

export function nowMinutes(now: Date = new Date()): number {
  const raw = now.getHours() * 60 + now.getMinutes();
  return raw < DAY_START_HOUR * 60 ? raw + 24 * 60 : raw;
}

export function fmtClock(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Learning the real intervals
//
// Every seeded interval is a guess about someone else's house. The completion
// log knows better: the gaps between your own ticks are the truth. This is
// what turns the seed into your house over a couple of months.
// ---------------------------------------------------------------------------

/** Gaps in days between consecutive completions, oldest first. */
export function gapsBetween(events: DoneEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g =
      (new Date(sorted[i].doneAt).getTime() - new Date(sorted[i - 1].doneAt).getTime()) / DAY_MS;
    // Under half a day is a double-tap or an undo-redo, not a real cycle.
    if (g >= 0.5) gaps.push(g);
  }
  return gaps;
}

export interface Observed {
  /** Median gap, in whole days. */
  median: number;
  /** How many gaps went into it. */
  samples: number;
}

/**
 * The median is deliberate: one holiday where the atta lasted three weeks
 * should not drag the estimate, and a mean would let it.
 * Two gaps (three completions) is the floor before we say anything at all.
 */
export function observedInterval(events: DoneEvent[]): Observed | null {
  const gaps = gapsBetween(events);
  if (gaps.length < 2) return null;
  const s = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { median: Math.max(1, Math.round(median)), samples: gaps.length };
}

/** Only worth surfacing if it would actually change the number. */
export function suggestionFor(item: Item, events: DoneEvent[]): Observed | null {
  if (item.kind === "routine" || item.kind === "fixed") return null;
  const obs = observedInterval(events);
  if (!obs) return null;
  const drift = Math.abs(obs.median - item.intervalDays);
  if (drift < 1) return null;
  // Ignore noise on short cycles; a day either way on milk is not a signal.
  if (drift / Math.max(item.intervalDays, 1) < 0.15) return null;
  return obs;
}
