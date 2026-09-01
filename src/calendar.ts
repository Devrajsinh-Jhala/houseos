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

import { clampMonthDay, type Item } from "./core";

const BYDAY = {
  weekday: "MO,TU,WE,TH,FR",
  weekend: "SA,SU",
} as const;

/** Fixed dates have no time of day, so they get a civilised one. */
const FIXED_HOUR = 9;

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
    .replace(/\r?\n/g, "\\n");
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

function firstFixed(item: Item, from: Date): Date {
  const y = from.getFullYear();
  const mo = from.getMonth();
  const day = clampMonthDay(item.monthDay, y, mo);
  const thisMonth = new Date(y, mo, day, FIXED_HOUR, 0);
  if (thisMonth.getTime() >= from.getTime()) return thisMonth;
  const next = new Date(y, mo + 1, 1, FIXED_HOUR, 0);
  next.setDate(clampMonthDay(item.monthDay, next.getFullYear(), next.getMonth()));
  return next;
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

function vevent(item: Item, start: Date, rrule: string, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${item.id}@houseos`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${floating(start)}`,
    "DURATION:PT15M",
    `RRULE:${rrule}`,
    `SUMMARY:${esc(item.name)}`,
  ];
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

export function buildCalendar(items: Item[], now: Date = new Date()): CalendarExport {
  const stamp = utcStamp(now);
  const body: string[] = [];
  let count = 0;

  for (const item of items) {
    if (!item.active) continue;

    if (item.kind === "routine" && item.timeAnchor) {
      const rule =
        item.dayScope === "any"
          ? "FREQ=DAILY"
          : `FREQ=WEEKLY;BYDAY=${BYDAY[item.dayScope]}`;
      body.push(...vevent(item, firstRoutine(item, now), rule, stamp));
      count++;
    } else if (item.kind === "fixed") {
      const md = clampMonthDay(item.monthDay, 2001, 0); // a 31-day month: no clamping
      body.push(...vevent(item, firstFixed(item, now), monthlyRule(md), stamp));
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
