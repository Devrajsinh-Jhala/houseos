import { useState } from "react";
import { Row } from "../components/Row";
import { SetupSection } from "../components/SetupSection";
import { daysUntilDue, groupBy, needsSetup, type Item } from "../core";

interface Props {
  items: Item[];
  now: Date;
  justDone: Set<string>;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onMarkAll: (items: Item[]) => void;
}

export function Chores({ items, now, justDone, onToggle, onEdit, onMarkAll }: Props) {
  const [mode, setMode] = useState<"due" | "all">("due");

  const chores = items.filter((i) => i.active && i.kind === "chore");
  const unset = chores.filter((i) => needsSetup(i) && !justDone.has(i.id));
  const tracked = chores.filter((i) => !needsSetup(i));

  const visible = tracked.filter(
    (i) => mode === "all" || daysUntilDue(i, now) <= 1 || justDone.has(i.id)
  );
  visible.sort((a, b) => daysUntilDue(a, now) - daysUntilDue(b, now));

  return (
    <>
      <div className="shop-toggle">
        <button className="chip" aria-pressed={mode === "due"} onClick={() => setMode("due")}>
          Due now
        </button>
        <button className="chip" aria-pressed={mode === "all"} onClick={() => setMode("all")}>
          Everything
        </button>
      </div>

      {!visible.length && !unset.length && (
        <p className="empty">Nothing due. The place is clean.</p>
      )}

      {groupBy(visible).map(([group, list]) => (
        <div key={group}>
          <div className="section">
            <h2>{group}</h2>
            <span className="count">{list.length}</span>
          </div>
          {list.map((item) => (
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
      ))}

      <SetupSection
        items={unset}
        verb="did recently"
        now={now}
        justDone={justDone}
        onToggle={onToggle}
        onEdit={onEdit}
        onMarkAll={onMarkAll}
      />
    </>
  );
}
