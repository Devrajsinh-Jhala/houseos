// Reminders, without a server.
//
// The web has no way to wake a closed app at a given time on its own. Every
// route to that runs through a push service, which means a server, keys and an
// account — all of which this app deliberately does not have.
//
// So instead of imitating an alarm clock badly, hand the schedule to the one on
// the phone already. This builds an RFC 5545 calendar file out of your routine
// and fixed dates; the phone's calendar app takes it from there and does the
// alerting natively, offline, with no account and nothing phoning home.
//
// Chores and restocking are deliberately left out. Their due dates move every
// time you tick one off, and a recurring calendar event cannot follow that —
// it would drift away from the truth within a fortnight and quietly lie to you.

import { clampMonthDay, dueDate, houseDay, toISODate, type Item } from "./core";
import { DEFAULT_SETTINGS, resolveTime, shiftDay, type HouseholdSettings } from "./planner";

const BYDAY = {
  weekday: "MO,TU,WE,TH,FR",
  weekend: "SA,SU",
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local "floating" time: no timezone, so 06:45 stays 06:45 wherever you are. */
function floating(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Backslash, semicolon, comma and newline are structural in this format. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n?|\n/g, "\\n");
}

/**
 * Content lines are limited to 75 octets, continued with a leading space.
 * Measured in bytes, not characters — a name with an accent in it would
 * otherwise fold in the wrong place and corrupt the entry.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // subsequent lines carry a leading space
  }
  return out.join("\r\n ");
}

/** First occurrence on or after `from` that the rule will actually land on. */
function firstRoutine(item: Item, from: Date): Date {
  const [h, m] = (item.timeAnchor ?? "07:00").split(":").map(Number);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
  if (item.dayScope === "any") return d;
  const wantWeekend = item.dayScope === "weekend";
  // At most six hops; a week always contains both kinds of day.
  while (wantWeekend !== (d.getDay() === 0 || d.getDay() === 6)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function onHouseDay(item: Item, day: string, settings: HouseholdSettings): Date {
  const [h, m] = resolveTime(item, settings, day).split(":").map(Number);
  const d = new Date(day + "T12:00:00");
  if (h < 4) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Return the house date, so a post-midnight payment stays in its bill month. */
function firstFixedDay(item: Item, from: Date, settings: HouseholdSettings): string {
  const due = dueDate(item, from);
  const day = toISODate(due);
  if (onHouseDay(item, day, settings).getTime() >= from.getTime()) return day;
  const next = new Date(due.getFullYear(), due.getMonth() + 1, 1, 12);
  next.setDate(clampMonthDay(item.monthDay, next.getFullYear(), next.getMonth()));
  return toISODate(next);
}

/**
 * A plain BYMONTHDAY=31 simply skips February — the spec drops dates that don't
 * exist. Listing the days from 28 up and taking the last one that does exist
 * reproduces the app's own clamping, so the calendar and the Dates screen agree.
 */
function monthlyRule(monthDay: number): string {
  if (monthDay <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${monthDay}`;
  const days: number[] = [];
  for (let d = 28; d <= monthDay; d++) days.push(d);
  return `FREQ=MONTHLY;BYMONTHDAY=${days.join(",")};BYSETPOS=-1`;
}

function vevent(item: Item, start: Date, rrule: string | undefined, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${esc(item.id)}@houseos`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${floating(start)}`,
    `DURATION:PT${item.durationMinutes ?? 15}M`,
    `SUMMARY:${esc(item.name)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  if (item.note) lines.push(`DESCRIPTION:${esc(item.note)}`);
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(item.name)}`,
    "TRIGGER:PT0S",
    "END:VALARM",
    "END:VEVENT"
  );
  return lines;
}

export interface CalendarExport {
  ics: string;
  /** How many events went in, for the confirmation message. */
  count: number;
}

export function buildCalendar(items: Item[], now: Date = new Date(), settings: HouseholdSettings = DEFAULT_SETTINGS): CalendarExport {
  const stamp = utcStamp(now);
  const body: string[] = [];
  let count = 0;
  const dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const addWeekly = (item: Item, days: number[]) => {
    // Arrival time can differ on weekends, so each distinct clock time gets
    // its own series. An after-midnight task belongs to the next civil date.
    const groups = new Map<string, number[]>();
    for (const day of [...days].sort((a,b)=>(a+6)%7-(b+6)%7)) {
      const representative = shiftDay("2025-03-09", day);
      const time = resolveTime(item, settings, representative);
      groups.set(time, [...(groups.get(time) ?? []), day]);
    }
    let earliest = houseDay(now);
    if (item.scheduledDate && item.scheduledDate > earliest) earliest = item.scheduledDate;
    if (item.snoozedUntil && item.snoozedUntil > earliest) earliest = item.snoozedUntil;
    if (item.lastDone && houseDay(new Date(item.lastDone)) >= earliest) earliest = shiftDay(houseDay(new Date(item.lastDone)), 1);
    if (item.scheduleMode === "weekly" && item.snoozedUntil && item.snoozedUntil >= houseDay(now) &&
      !days.includes(new Date(item.snoozedUntil + "T12:00:00").getDay()) &&
      toISODate(dueDate(item, now)) === item.snoozedUntil) {
      body.push(...vevent({...item,id:`${item.id}-snooze`}, onHouseDay(item,item.snoozedUntil,settings),undefined,stamp)); count++;
    }
    for (const [time, weekdays] of groups) {
      let day = earliest;
      while (!weekdays.includes(new Date(day + "T12:00:00").getDay())) day = shiftDay(day, 1);
      const offset = Number(time.slice(0, 2)) < 4 ? 1 : 0;
      const ruleDays = weekdays.map((d) => dayCodes[(d + offset) % 7]).join(",");
      body.push(...vevent({...item, id: `${item.id}-${weekdays.join("")}`}, onHouseDay(item, day, settings), `FREQ=WEEKLY;BYDAY=${ruleDays}`, stamp));
      count++;
    }
  };

  for (const item of items) {
    if (!item.active) continue;

    if (item.scheduleMode === "once") {
      if (!item.lastDone && item.scheduledDate) {
        const day = item.snoozedUntil && item.snoozedUntil > item.scheduledDate ? item.snoozedUntil : item.scheduledDate;
        body.push(...vevent(item, onHouseDay(item, day, settings), undefined, stamp)); count++;
      }
      continue;
    }
    if (item.scheduleMode === "weekly") {
      if (item.scheduledDays?.length) addWeekly(item, item.scheduledDays);
      continue;
    }
    if (item.scheduleMode === "interval") {
      // Countdown dates restart when a task is completed in HouseOS. Export
      // the next occurrence as a snapshot rather than a drifting repeat rule.
      body.push(...vevent(item, onHouseDay(item, toISODate(dueDate(item, now)), settings), undefined, stamp)); count++;
      continue;
    }
    if (item.kind === "routine" && (item.scheduleAnchor === "arrival" || (item.timeAnchor && Number(item.timeAnchor.slice(0,2)) < 4))) {
      addWeekly(item, item.dayScope === "weekday" ? [1,2,3,4,5] : item.dayScope === "weekend" ? [6,0] : [1,2,3,4,5,6,0]);
      continue;
    }

    if (item.kind === "routine" && item.timeAnchor) {
      const rule =
        item.dayScope === "any"
          ? "FREQ=DAILY"
          : `FREQ=WEEKLY;BYDAY=${BYDAY[item.dayScope]}`;
      body.push(...vevent(item, firstRoutine(item, now), rule, stamp));
      count++;
    } else if (item.kind === "fixed" && (item.scheduleAnchor === "arrival" || Number((item.timeAnchor ?? "09:00").slice(0,2)) < 4)) {
      const first = new Date(firstFixedDay(item, now, settings) + "T12:00:00");
      for (let n = 0; n < 12; n++) {
        const date = new Date(first.getFullYear(), first.getMonth() + n, 1, 12);
        date.setDate(clampMonthDay(item.monthDay, date.getFullYear(), date.getMonth()));
        const day = toISODate(date);
        body.push(...vevent({...item,id:`${item.id}-${day}`}, onHouseDay(item,day,settings), undefined, stamp)); count++;
      }
    } else if (item.kind === "fixed") {
      const md = clampMonthDay(item.monthDay, 2001, 0); // a 31-day month: no clamping
      body.push(...vevent(item, onHouseDay(item, firstFixedDay(item,now,settings),settings), monthlyRule(md), stamp));
      count++;
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HouseOS//Routine//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:HouseOS",
    ...body,
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");

  return { ics: ics + "\r\n", count };
}
