import { useState } from "react";
import { Row } from "../components/Row";
import { billMonthDay, monthlyBills, money, paidThisMonth } from "../bills";
import type { Item } from "../core";

interface Props {
  items: Item[];
  now: Date;
  justDone: Set<string>;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
}

export function Dates({ items, now, onToggle, onEdit }: Props) {
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");
  const summary = monthlyBills(items, now);
  const fixed = summary.bills.filter((item) => filter === "all" || (filter === "paid" ? paidThisMonth(item, now) : !paidThisMonth(item, now)))
    .sort((a, b) => Number(paidThisMonth(a, now)) - Number(paidThisMonth(b, now)) || billMonthDay(a, now) - billMonthDay(b, now));
  const period = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return <div className="bills-view">
    <div className="house-task-stats bills-stats">
      <div><span>PLANNED THIS MONTH</span><strong>{summary.knownCount ? money(summary.total) : "—"}</strong><small>{summary.bills.length} {summary.bills.length === 1 ? "bill" : "bills"} to track</small></div>
      <div><span>ALREADY PAID</span><strong>{summary.knownCount ? money(summary.paid) : "—"}</strong><small>{summary.paidCount} of {summary.bills.length} paid</small></div>
      <div><span>STILL TO PAY</span><strong>{summary.knownCount ? money(summary.remaining) : "—"}</strong><small>{summary.bills.length - summary.paidCount} outstanding</small></div>
    </div>
    {summary.unknownCount > 0 && <div className="bills-amount-note"><span aria-hidden="true">ⓘ</span><p>Totals include known amounts. Add an amount to {summary.unknownCount === 1 ? "the remaining bill" : `${summary.unknownCount} bills`} to see your full monthly cost.</p></div>}
    <div className="house-task-section-heading"><div><span className="house-task-eyebrow">A LITTLE LESS TO REMEMBER</span><h2>{period}</h2></div><span className="house-task-month-count">{summary.paidCount}/{summary.bills.length} paid</span></div>
    <div className="shop-toggle">{([["all", "All bills"], ["unpaid", "Unpaid"], ["paid", "Paid"]] as const).map(([value, label]) => <button className="chip" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="house-task-group bills-list">{fixed.map((item) => <Row key={item.id} item={item} done={paidThisMonth(item, now)} onToggle={onToggle} onEdit={onEdit} now={now} />)}</div>
    {!fixed.length && <div className="house-task-empty"><span aria-hidden="true">{filter === "unpaid" && summary.bills.length ? "✓" : "◇"}</span><h3>{!summary.bills.length ? "Give every bill a place." : filter === "unpaid" ? "All bills paid this month." : "No bills marked paid yet."}</h3><p>{!summary.bills.length ? "Add rent, electricity, internet, and other monthly payments with their due dates and amounts." : filter === "unpaid" ? "Your next monthly due dates will appear automatically." : "Tick a bill when you pay it. Your progress is saved."}</p></div>}
    {summary.bills.length > 0 && <p className="note">Tick a bill after paying it; tap again to undo. Each month starts with a fresh checklist. Short months use the last valid day.</p>}
  </div>;
}
