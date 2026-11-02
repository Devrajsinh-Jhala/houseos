import { clampMonthDay, type Item } from "./core";

/** Bills use the civil month, independently of the household's 04:00 day. */
export function paidThisMonth(item: Item, now: Date = new Date()): boolean {
  if (!item.lastDone) return false;
  const paid = new Date(item.lastDone);
  return paid.getFullYear() === now.getFullYear() && paid.getMonth() === now.getMonth();
}

export function billMonthDay(item: Item, now: Date = new Date()): number {
  return clampMonthDay(item.monthDay, now.getFullYear(), now.getMonth());
}

export function hasAmount(item: Item): boolean {
  return typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount >= 0;
}

export function money(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function monthlyBills(items: Item[], now: Date = new Date()) {
  const bills = items.filter((item) => item.active && item.kind === "fixed");
  const known = bills.filter(hasAmount);
  const sum = (batch: Item[]) => batch.reduce((total, item) => total + Math.round((item.amount ?? 0) * 100), 0) / 100;
  const total = sum(known);
  const paid = sum(known.filter((item) => paidThisMonth(item, now)));
  return {
    bills, total, paid, remaining: Math.round((total - paid) * 100) / 100,
    unknownCount: bills.length - known.length, knownCount: known.length,
    paidCount: bills.filter((item) => paidThisMonth(item, now)).length,
  };
}
