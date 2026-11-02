import { describe, expect, it } from "vitest";
import { billMonthDay, monthlyBills, paidThisMonth } from "./bills";
import type { Item } from "./core";

const bill = (extra: Partial<Item> = {}): Item => ({ id: "rent", name: "Rent", kind: "fixed", intervalDays: 0, dayScope: "any", monthDay: 5, active: true, created: "2026-01-01T12:00:00", ...extra });
const november = new Date(2026, 10, 2, 12);

describe("monthly household bills", () => {
  it("keeps paid state through navigation and rejects previous months and years", () => {
    expect(paidThisMonth(bill({ lastDone: new Date(2026, 10, 1, 1).toISOString() }), november)).toBe(true);
    expect(paidThisMonth(bill({ lastDone: new Date(2026, 9, 31, 23).toISOString() }), november)).toBe(false);
    expect(paidThisMonth(bill({ lastDone: new Date(2025, 10, 2).toISOString() }), november)).toBe(false);
  });

  it("separates known money from missing amounts and ignores inactive records", () => {
    const summary = monthlyBills([
      bill({ amount: 18000, lastDone: new Date(2026, 10, 1).toISOString() }),
      bill({ id: "power", amount: 1250.35 }), bill({ id: "internet" }),
      bill({ id: "inactive", amount: 1000, active: false }),
    ], november);
    expect(summary.total).toBe(19250.35);
    expect(summary.paid).toBe(18000);
    expect(summary.remaining).toBe(1250.35);
    expect(summary.unknownCount).toBe(1);
    expect(summary.paidCount).toBe(1);
  });

  it("clamps monthly bill dates in short months", () => {
    expect(billMonthDay(bill({ monthDay: 31 }), new Date(2026, 1, 10))).toBe(28);
    expect(billMonthDay(bill({ monthDay: 31 }), new Date(2028, 1, 10))).toBe(29);
  });
});
