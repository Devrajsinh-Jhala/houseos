import { useEffect, useRef, useState } from "react";
import { eventsForItem } from "../db";
import {
  observedInterval,
  suggestionFor,
  toISODate,
  uid,
  type DayScope,
  type DoneEvent,
  type Item,
  type Kind,
} from "../core";

interface Props {
  item: Item | "new" | null;
  groups: string[];
  onSave: (item: Item) => void;
  onDelete: (item: Item) => void;
  onSnooze: (item: Item, until: string) => void;
  onClose: () => void;
}

function blank(): Item {
  return {
    id: uid(),
    name: "",
    kind: "restock",
    intervalDays: 7,
    dayScope: "any",
    group: "",
    active: true,
    created: new Date().toISOString(),
    // You are adding this because it's in the house now. Without this the item
    // is born "not set" and immediately asks you a question you just answered.
    lastDone: new Date().toISOString(),
  };
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function ItemSheet({ item, groups, onSave, onDelete, onSnooze, onClose }: Props) {
  const [draft, setDraft] = useState<Item>(blank);
  const [events, setEvents] = useState<DoneEvent[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = item === "new";

  useEffect(() => {
    if (item === "new") setDraft(blank());
    else if (item) setDraft({ ...item });
  }, [item]);

  // The completion log is the raw material for the suggestion below.
  useEffect(() => {
    if (!item || item === "new") {
      setEvents([]);
      return;
    }
    let live = true;
    void eventsForItem(item.id).then((e) => {
      if (live) setEvents(e);
    });
    return () => {
      live = false;
    };
  }, [item]);

  // Held in a ref so the effect below depends only on which item is open.
  // onClose is a fresh closure on every App render, and with it in the deps the
  // focus call re-ran on the minute tick and yanked the caret out of whichever
  // field you were typing in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Only for a new item: on an existing one this pops the phone keyboard over
    // the thing you opened the sheet to read.
    if (item === "new") nameRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [item]);

  if (!item) return null;

  const set = <K extends keyof Item>(k: K, v: Item[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim() });
  };

  const suggestion = isNew ? null : suggestionFor(draft, events);
  const history = isNew ? null : observedInterval(events);
  const canSnooze = !isNew && (draft.kind === "chore" || draft.kind === "restock");

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Add an item" : `Edit ${draft.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{isNew ? "Add an item" : draft.name || "Edit item"}</h3>

        <div className="field">
          <label htmlFor="f-name">Name</label>
          <input
            id="f-name"
            ref={nameRef}
            value={draft.name}
            placeholder="Atta"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="f-kind">Kind</label>
            <select
              id="f-kind"
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as Kind)}
            >
              <option value="routine">Routine</option>
              <option value="chore">Chore</option>
              <option value="restock">Restock</option>
              <option value="fixed">Fixed date</option>
            </select>
          </div>

          {draft.kind === "fixed" ? (
            <div className="field">
              <label htmlFor="f-dom">Day of month</label>
              <input
                id="f-dom"
                type="number"
                min={1}
                max={31}
                value={draft.monthDay ?? 1}
                onChange={(e) =>
                  set("monthDay", Math.min(31, Math.max(1, Number(e.target.value))))
                }
              />
            </div>
          ) : draft.kind === "routine" ? (
            <div className="field">
              <label htmlFor="f-time">Time</label>
              <input
                id="f-time"
                type="time"
                value={draft.timeAnchor ?? "07:00"}
                onChange={(e) => set("timeAnchor", e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="f-int">Every N days</label>
              <input
                id="f-int"
                type="number"
                min={1}
                max={365}
                value={draft.intervalDays}
                onChange={(e) => set("intervalDays", Math.max(1, Number(e.target.value)))}
              />
            </div>
          )}
        </div>

        {draft.kind === "fixed" && (draft.monthDay ?? 1) > 28 && (
          <p className="hint">
            Short months pull this back to the last day — the 31st is the 28th in
            February.
          </p>
        )}

        {suggestion && (
          <div className="suggest">
            <div className="suggest-text">
              You actually do this every <strong>{suggestion.median} days</strong>, going
              by your last {suggestion.samples + 1} ticks.
            </div>
            <button
              className="btn ghost small"
              onClick={() => set("intervalDays", suggestion.median)}
            >
              Use {suggestion.median}
            </button>
          </div>
        )}

        {draft.kind === "routine" && (
          <div className="field">
            <label htmlFor="f-scope">Which days</label>
            <select
              id="f-scope"
              value={draft.dayScope}
              onChange={(e) => set("dayScope", e.target.value as DayScope)}
            >
              <option value="any">Every day</option>
              <option value="weekday">Weekdays</option>
              <option value="weekend">Weekends</option>
            </select>
          </div>
        )}

        {draft.kind !== "routine" && (
          <div className="field">
            <label htmlFor="f-group">Group</label>
            <input
              id="f-group"
              list="group-list"
              value={draft.group ?? ""}
              placeholder="Vegetables"
              onChange={(e) => set("group", e.target.value)}
            />
            <datalist id="group-list">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        )}

        <div className="field">
          <label htmlFor="f-note">Note</label>
          <textarea
            id="f-note"
            value={draft.note ?? ""}
            placeholder="Brand, size, what to look for"
            onChange={(e) => set("note", e.target.value)}
          />
        </div>

        {!isNew && (
          <p className="hint">
            {draft.lastDone
              ? `Last done ${new Date(draft.lastDone).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}`
              : "Never ticked off"}
            {events.length > 0 && ` · ${events.length} times logged`}
            {history && ` · usually every ${history.median} days`}
          </p>
        )}

        {canSnooze && (
          <>
            <div className="field-label">Not right now</div>
            <div className="btn-row tight">
              <button className="btn ghost" onClick={() => onSnooze(draft, inDays(2))}>
                In two days
              </button>
              <button className="btn ghost" onClick={() => onSnooze(draft, inDays(7))}>
                Next week
              </button>
            </div>
            <p className="hint">
              Pushes it out without recording it as done, so it doesn't poison the
              interval above.
            </p>
          </>
        )}

        <div className="btn-row">
          <button className="btn" onClick={save}>
            {isNew ? "Add item" : "Save changes"}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>

        {!isNew && (
          <div className="btn-row">
            <button className="btn danger" onClick={() => onDelete(draft)}>
              Delete this item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
