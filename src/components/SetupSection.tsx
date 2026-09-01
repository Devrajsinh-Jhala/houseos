import { Row } from "./Row";
import type { Item } from "../core";

interface Props {
  items: Item[];
  /** "already have" for the shop, "just did" for chores. */
  verb: string;
  now: Date;
  justDone: Set<string>;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onMarkAll: (items: Item[]) => void;
}

/**
 * The seed ships ~60 items nobody has ever ticked. They aren't overdue, they're
 * unknown — and dumping them into the main list on first launch makes the app
 * look broken before it has told you anything. They live down here until you
 * say when, and the section disappears for good once it's empty.
 */
export function SetupSection({
  items,
  verb,
  now,
  justDone,
  onToggle,
  onEdit,
  onMarkAll,
}: Props) {
  if (!items.length) return null;

  return (
    <div className="setup">
      <div className="section">
        <h2>Not set up yet</h2>
        <span className="count">{items.length}</span>
      </div>
      <p className="note">
        HouseOS doesn't know when you last did these, so it isn't counting them
        yet. Tick what you {verb}, or set the lot to today and correct them as
        they come up.
      </p>
      <div className="btn-row tight">
        <button className="btn ghost" onClick={() => onMarkAll(items)}>
          Set all {items.length} to today
        </button>
      </div>
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          done={justDone.has(item.id)}
          onToggle={onToggle}
          onEdit={onEdit}
          now={now}
        />
      ))}
    </div>
  );
}
