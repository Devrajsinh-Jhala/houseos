import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendar";
import type { Item } from "./core";

function item(over: Partial<Item> = {}): Item {
  return {
    id: "abc",
    name: "Wake up",
    kind: "routine",
    intervalDays: 1,
    timeAnchor: "06:45",
    dayScope: "any",
    active: true,
    created: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

/** 2025-03-10 is a Monday. */
const MONDAY = new Date(2025, 2, 10, 8, 0);

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("calendar export", () => {
  it("wraps events in a valid calendar envelope", () => {
    const { ics, count } = buildCalendar([item()], MONDAY);
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("VERSION:2.0");
    expect(l).toContain("END:VCALENDAR");
    expect(count).toBe(1);
    // CRLF is required by the spec, and some calendar apps do enforce it.
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("writes a floating local time, so 06:45 stays 06:45 anywhere", () => {
    const { ics } = buildCalendar([item()], MONDAY);
    // No trailing Z, no TZID.
    expect(lines(ics)).toContain("DTSTART:20250310T064500");
  });

  it("repeats an every-day routine daily", () => {
    const { ics } = buildCalendar([item({ dayScope: "any" })], MONDAY);
    expect(lines(ics)).toContain("RRULE:FREQ=DAILY");
  });

  it("repeats a weekday routine on weekdays only", () => {
    const { ics } = buildCalendar([item({ dayScope: "weekday" })], MONDAY);
    expect(lines(ics)).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  });

  it("starts a weekend routine on the weekend, not on the export day", () => {
    const { ics } = buildCalendar([item({ dayScope: "weekend" })], MONDAY);
    // Monday the 10th is not in the rule; the first hit is Saturday the 15th.
    expect(lines(ics)).toContain("DTSTART:20250315T064500");
    expect(lines(ics)).toContain("RRULE:FREQ=WEEKLY;BYDAY=SA,SU");
  });

  it("carries an alarm at the moment of the event", () => {
    const l = lines(buildCalendar([item()], MONDAY).ics);
    expect(l).toContain("BEGIN:VALARM");
    expect(l).toContain("TRIGGER:PT0S");
  });

  describe("fixed dates", () => {
    const rent = (monthDay: number) =>
      item({ id: "rent", name: "Rent", kind: "fixed", monthDay, timeAnchor: undefined });

    it("repeats monthly on a safe day", () => {
      const { ics } = buildCalendar([rent(5)], MONDAY);
      expect(lines(ics)).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=5");
    });

    it("rolls to next month when this month's day has passed", () => {
      const { ics } = buildCalendar([rent(5)], MONDAY);
      expect(lines(ics)).toContain("DTSTART:20250405T090000");
    });

    it("keeps this month's date when it is still ahead", () => {
      const { ics } = buildCalendar([rent(20)], MONDAY);
      expect(lines(ics)).toContain("DTSTART:20250320T090000");
    });

    it("uses a set-position rule for the 31st, which February does not have", () => {
      const { ics } = buildCalendar([rent(31)], MONDAY);
      // A plain BYMONTHDAY=31 would silently skip February. This picks the last
      // day that exists, matching how the Dates screen clamps.
      expect(lines(ics)).toContain(
        "RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1"
      );
    });

    it("does the same for the 30th without ever landing on the 31st", () => {
      const { ics } = buildCalendar([rent(30)], MONDAY);
      expect(lines(ics)).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1");
    });
  });

  describe("what is left out", () => {
    it("skips chores and restock, whose dates move as you tick them", () => {
      const { count } = buildCalendar(
        [
          item({ id: "a", kind: "chore", name: "Mop", timeAnchor: undefined }),
          item({ id: "b", kind: "restock", name: "Atta", timeAnchor: undefined }),
        ],
        MONDAY
      );
      expect(count).toBe(0);
    });

    it("skips inactive items", () => {
      expect(buildCalendar([item({ active: false })], MONDAY).count).toBe(0);
    });
  });

  describe("escaping and folding", () => {
    it("escapes the characters that are structural in the format", () => {
      const { ics } = buildCalendar(
        [item({ name: "Buy milk, dal; and rice" })],
        MONDAY
      );
      expect(ics).toContain("SUMMARY:Buy milk\\, dal\\; and rice");
    });

    it("escapes newlines in a note rather than breaking the entry", () => {
      const { ics } = buildCalendar([item({ note: "one\ntwo" })], MONDAY);
      expect(ics).toContain("DESCRIPTION:one\\ntwo");
      expect(lines(ics)).not.toContain("two");
    });

    it("folds long lines and continues them with a space", () => {
      const { ics } = buildCalendar([item({ name: "x".repeat(200) })], MONDAY);
      for (const line of lines(ics)) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      expect(ics).toContain("\r\n ");
    });

    it("does not split a multi-byte character down the middle", () => {
      const { ics } = buildCalendar([item({ name: "आटा ".repeat(40) })], MONDAY);
      // A bad fold would leave a replacement character behind.
      expect(ics).not.toContain("�");
    });
  });
});
