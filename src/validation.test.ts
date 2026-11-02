import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./planner";
import { validClock, validDate, validEvent, validItem, validSettings, validTimestamp } from "./validation";

const item = {
  id: "chore", name: "Sweep", kind: "chore", intervalDays: 2, dayScope: "any",
  active: true, created: "2026-11-02T10:00:00.000Z",
};

describe("backup validation", () => {
  it("preserves old item records and validates new schedule fields", () => {
    expect(validItem(item)).toBe(true);
    expect(validItem({ ...item, scheduleMode: "weekly", scheduledDays: [1, 3], durationMinutes: 20, scheduleAnchor: "arrival", arrivalOffset: 30 })).toBe(true);
    expect(validItem({ ...item, scheduleMode: "once", scheduledDate: "2026-11-03" })).toBe(true);
    expect(validItem({ ...item, kind: "fixed", intervalDays: 0, monthDay: 31, amount: 2500 })).toBe(true);
  });

  it.each([
    { group: {} }, { note: [] }, { timeAnchor: "25:01" }, { intervalDays: -1 },
    { intervalDays: Infinity }, { intervalDays: 2.5 }, { lastDone: "bad date" },
    { snoozedUntil: "2026-02-30" }, { created: undefined }, { amount: -10 },
    { scheduleMode: "weekly", scheduledDays: [] }, { scheduledDays: [7] },
    { scheduledDays: [1, 1] }, { scheduledDays: "Monday" },
    { scheduleMode: "once" }, { scheduleMode: "yearly" },
    { arrivalOffset: NaN }, { arrivalOffset: 15.5 }, { durationMinutes: 0 },
    { priority: "urgent" }, { scheduleAnchor: "unknown" },
  ])("rejects unsafe item fields %j", (fields) => {
    expect(validItem({ ...item, ...fields })).toBe(false);
  });

  it("validates actual calendar days, clocks, and ISO timestamps", () => {
    expect(validDate("2028-02-29")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2026-04-31")).toBe(false);
    expect(validClock("00:00")).toBe(true);
    expect(validClock("23:59")).toBe(true);
    expect(validClock("24:00")).toBe(false);
    expect(validTimestamp("2026-11-02T20:15:00+05:30")).toBe(true);
    expect(validTimestamp("2026-02-30T10:00:00Z")).toBe(false);
    expect(validTimestamp("2026-11-02")).toBe(false);
  });

  it("rejects broken home settings and completion events", () => {
    expect(validSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(validSettings({ ...DEFAULT_SETTINGS, dailyBudgetMinutes: 0 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, arrivalTime: null })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, homeName: "  " })).toBe(false);
    expect(validEvent({ id: "event", itemId: "chore", doneAt: "2026-11-02T14:00:00Z" })).toBe(true);
    expect(validEvent({ id: "event", itemId: "chore", doneAt: "yesterday" })).toBe(false);
  });
});
