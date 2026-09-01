import { Fragment } from "react";
import { Row } from "../components/Row";
import {
  anchorMinutes,
  doneToday,
  houseDay,
  needsAttention,
  nowMinutes,
  routineFor,
  type Item,
} from "../core";

interface Props {
  items: Item[];
  now: Date;
  onToggle: (item: Item) => void;
  onGoTo: (tab: "shopping" | "chores") => void;
}

export function Today({ items, now, onToggle, onGoTo }: Props) {
  const day = houseDay(now);
  const routine = routineFor(items, day);
  const mins = nowMinutes(now);
  const pending = items.filter((i) => needsAttention(i, now));
  const shopCount = pending.filter((i) => i.kind === "restock").length;
  const choreCount = pending.filter((i) => i.kind === "chore").length;

  // The rule sits just above the first item still ahead of us. Once the last
  // anchor has passed it belongs at the foot of the list, not nowhere.
  const aheadAt = routine.findIndex((i) => anchorMinutes(i.timeAnchor) > mins);
  const ruleAt = aheadAt === -1 ? routine.length : aheadAt;

  const nowRule = (
    <div className="now-rule">
      <span>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
    </div>
  );

  if (!routine.length) {
    return (
      <p className="empty">
        No routine set for today yet. Add a few items on Manage — start with the
        ones you actually forget.
      </p>
    );
  }

  return (
    <>
      {(shopCount > 0 || choreCount > 0) && (
        <div className="btn-row">
          {shopCount > 0 && (
            <button className="btn ghost" onClick={() => onGoTo("shopping")}>
              {shopCount} to buy
            </button>
          )}
          {choreCount > 0 && (
            <button className="btn ghost" onClick={() => onGoTo("chores")}>
              {choreCount} to clean
            </button>
          )}
        </div>
      )}

      <div className="section">
        <h2>{new Date(day + "T12:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        })}</h2>
        <span className="count">
          {routine.filter((i) => doneToday(i, now)).length} of {routine.length}
        </span>
      </div>

      <div className="timeline">
        {routine.map((item, idx) => (
          <Fragment key={item.id}>
            {idx === ruleAt && nowRule}
            <Row
              item={item}
              done={doneToday(item, now)}
              onToggle={onToggle}
              timeline
              now={now}
            />
          </Fragment>
        ))}
        {ruleAt === routine.length && nowRule}
      </div>
    </>
  );
}
