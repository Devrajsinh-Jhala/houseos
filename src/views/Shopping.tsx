import { useEffect, useState } from "react";
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

export function Shopping({ items, now, justDone, onToggle, onEdit, onMarkAll }: Props) {
  const [mode, setMode] = useState<"due" | "all">("due");
  const [shopping, setShopping] = useState(false);

  // Standing in a shop with a list that keeps dimming is the whole reason this
  // mode exists. Released as soon as you leave it.
  useEffect(() => {
    if (!shopping || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (released) void l.release();
          else lock = l;
        })
        .catch(() => {});
    void acquire();
    // Backgrounding the app drops the lock; taking it back on return is free.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [shopping]);

  const restock = items.filter((i) => i.active && i.kind === "restock");
  const unset = restock.filter((i) => needsSetup(i) && !justDone.has(i.id));
  const tracked = restock.filter((i) => !needsSetup(i));

  const visible = tracked.filter(
    (i) => mode === "all" || daysUntilDue(i, now) <= 1 || justDone.has(i.id)
  );
  visible.sort((a, b) => daysUntilDue(a, now) - daysUntilDue(b, now));

  const groups = groupBy(visible);

  return (
    <div className={shopping ? "shopping" : undefined}>
      <div className="shop-toggle">
        <button
          className="chip"
          aria-pressed={mode === "due"}
          onClick={() => setMode("due")}
        >
          Due now
        </button>
        <button
          className="chip"
          aria-pressed={mode === "all"}
          onClick={() => setMode("all")}
        >
          Everything
        </button>
        <button
          className="chip"
          aria-pressed={shopping}
          onClick={() => setShopping((s) => !s)}
        >
          At the shop
        </button>
      </div>

      {!visible.length && !unset.length && (
        <p className="empty">Nothing to buy. The house is stocked.</p>
      )}

      {groups.map(([group, list]) => (
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
              onEdit={shopping ? undefined : onEdit}
              now={now}
            />
          ))}
        </div>
      ))}

      {shopping && visible.length > 0 && (
        <p className="note">
          Tap to mark bought. Tap again if you put it back. Everything here works
          without signal.
        </p>
      )}

      {!shopping && (
        <SetupSection
          items={unset}
          verb="already have"
          now={now}
          justDone={justDone}
          onToggle={onToggle}
          onEdit={onEdit}
          onMarkAll={onMarkAll}
        />
      )}
    </div>
  );
}
