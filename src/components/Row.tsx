import { dueLabel, fmtClock, isSnoozed, needsSetup, pressure, urgency, type Item } from "../core";
import { hasAmount, money } from "../bills";
import { scheduleLabel } from "../planner";
import "../tasks.css";

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <polyline points="3.2,8.4 6.4,11.4 12.8,4.6" />
    </svg>
  );
}

interface Props {
  item: Item;
  done: boolean;
  onToggle: (item: Item) => void;
  onEdit?: (item: Item) => void;
  /** Timeline variant used on Today. */
  timeline?: boolean;
  now?: Date;
}

export function Row({ item, done, onToggle, onEdit, timeline, now = new Date() }: Props) {
  const u = urgency(item, now);
  const unset = needsSetup(item);
  const snoozed = isSnoozed(item, now);
  const showPressure = !timeline && (item.kind === "chore" || item.kind === "restock") && item.scheduleMode !== "once" && !unset && !done;
  const fill = Math.min(pressure(item, now), 1.4) / 1.4;
  const scheduled = item.kind === "chore" || item.kind === "routine";
  const status = done ? (item.kind === "fixed" ? "Paid" : "Done") : dueLabel(item, now);

  return (
    <div className={`row${timeline ? " tl-row" : ""}${done ? " done" : ""}`}>
      {timeline && (
        <>
          <span className="clock">{fmtClock(item.timeAnchor)}</span>
          <span className="pip" />
        </>
      )}

      <button
        className="tick"
        aria-label={done ? `Undo ${item.name}` : `Mark ${item.name} ${item.kind === "fixed" ? "paid" : "done"}`}
        aria-pressed={done}
        onClick={() => onToggle(item)}
      >
        <Check />
      </button>

      <button
        className="body"
        onClick={() => (onEdit ? onEdit(item) : onToggle(item))}
        aria-label={onEdit ? `Edit ${item.name}` : item.name}
      >
        <div className="name">{item.name}</div>
        {scheduled && <div className="meta house-row-meta"><span>{scheduleLabel(item)}</span>{item.durationMinutes != null && <span>· {item.durationMinutes} min</span>}{item.priority === "high" && <span className="house-row-priority">High priority</span>}{item.scheduleAnchor === "arrival" && <span>· Around arrival</span>}</div>}
        {item.kind === "fixed" && <div className="meta">{scheduleLabel(item)}{item.group ? ` · ${item.group}` : ""}{!hasAmount(item) ? " · Add amount" : ""}</div>}
        {item.note && <div className="meta">{item.note}</div>}
        {showPressure && (
          <div className={`pressure ${u}`}>
            <i style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
        )}
      </button>

      {!timeline && (
        <span className={`when ${done ? "ok" : u}${item.kind === "fixed" ? " house-row-bill" : ""}`}>
          {item.kind === "fixed" && hasAmount(item) && <strong>{money(item.amount!)}</strong>}
          {snoozed && (
            <span className="snoozed" aria-label="snoozed">
              ⏾{" "}
            </span>
          )}
          <span>{status}</span>
        </span>
      )}
    </div>
  );
}
