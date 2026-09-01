import { Row } from "../components/Row";
import { daysUntilDue, type Item } from "../core";

interface Props {
  items: Item[];
  now: Date;
  justDone: Set<string>;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
}

export function Dates({ items, now, justDone, onToggle, onEdit }: Props) {
  const fixed = items.filter((i) => i.active && i.kind === "fixed");
  fixed.sort((a, b) => daysUntilDue(a, now) - daysUntilDue(b, now));

  if (!fixed.length) {
    return <p className="empty">No fixed dates yet. Rent, salary, bills go here.</p>;
  }

  return (
    <>
      <div className="section">
        <h2>This month</h2>
        <span className="count">{fixed.length}</span>
      </div>
      {fixed.map((item) => (
        <Row
          key={item.id}
          item={item}
          done={justDone.has(item.id)}
          onToggle={onToggle}
          onEdit={onEdit}
          now={now}
        />
      ))}
      <p className="note">
        Marking one done rolls it to next month. Amounts stay out of here on
        purpose — this tracks whether you paid, not what you spent.
      </p>
    </>
  );
}
