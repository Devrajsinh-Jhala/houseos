import { dueLabel, fmtClock, isSnoozed, needsSetup, pressure, urgency, type Item } from "../core";

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
  const showPressure = !timeline && item.kind !== "routine" && !unset;
  const fill = Math.min(pressure(item, now), 1.4) / 1.4;

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
        aria-label={done ? `Undo ${item.name}` : `Mark ${item.name} done`}
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
        {item.note && <div className="meta">{item.note}</div>}
        {showPressure && (
          <div className={`pressure ${u}`}>
            <i style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
        )}
      </button>

      {!timeline && (
        <span className={`when ${u}`}>
          {snoozed && (
            <span className="snoozed" aria-label="snoozed">
              ⏾{" "}
            </span>
          )}
          {dueLabel(item, now)}
        </span>
      )}
    </div>
  );
}
