import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemSheet } from "./components/ItemSheet";
import { Chores } from "./views/Chores";
import { Dates } from "./views/Dates";
import { Manage } from "./views/Manage";
import { Shopping } from "./views/Shopping";
import { Today } from "./views/Today";
import {
  allItems,
  complete,
  completeMany,
  putItem,
  removeItem,
  seedIfEmpty,
  snooze as snoozeItem,
  uncomplete,
} from "./db";
import { storedTheme, watchSystem } from "./theme";
import { SEED } from "./seed";
import { doneToday, needsAttention, type Item } from "./core";

type Tab = "today" | "shopping" | "chores" | "dates" | "manage";

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "today", label: "Today", glyph: "◷" },
  { key: "shopping", label: "Shopping", glyph: "◫" },
  { key: "chores", label: "Chores", glyph: "◍" },
  { key: "dates", label: "Dates", glyph: "◈" },
  { key: "manage", label: "Manage", glyph: "≡" },
];

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [now, setNow] = useState(() => new Date());
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    await seedIfEmpty(SEED);
    setItems(await allItems());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The CSS follows the system on its own; this is only so the status bar
  // colour keeps up when the phone flips at sunset.
  useEffect(() => watchSystem(storedTheme), []);

  // Keep the now-rule honest without re-rendering constantly.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    const wake = () => setNow(new Date());
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  // One timer, restarted each time — otherwise an earlier toast's timeout
  // clears the message a later one just put up.
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const patch = (updated: Item) =>
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

  const toggle = useCallback(
    async (item: Item) => {
      const isDone = item.kind === "routine" ? doneToday(item, now) : justDone.has(item.id);
      if (isDone) {
        patch(await uncomplete(item));
        setJustDone((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      } else {
        patch(await complete(item));
        if (item.kind !== "routine") setJustDone((s) => new Set(s).add(item.id));
      }
    },
    [now, justDone]
  );

  /** First-run bulk setup: "yes, I have all of these right now." */
  const markAll = useCallback(
    async (batch: Item[]) => {
      if (!batch.length) return;
      const updated = await completeMany(batch);
      const byId = new Map(updated.map((i) => [i.id, i]));
      setItems((prev) => prev.map((i) => byId.get(i.id) ?? i));
      toast(`${updated.length} set to today`);
    },
    [toast]
  );

  const doSnooze = useCallback(
    async (item: Item, until: string) => {
      patch(await snoozeItem(item, until));
      setEditing(null);
      toast("Pushed out");
    },
    [toast]
  );

  // Leaving a tab clears the "just ticked" rows so lists settle.
  const goTo = (next: Tab) => {
    if (next !== tab) setJustDone(new Set());
    setTab(next);
  };

  const groups = useMemo(
    () => [...new Set(items.map((i) => i.group).filter(Boolean) as string[])].sort(),
    [items]
  );

  const attention = useMemo(
    () => ({
      shopping: items.some((i) => i.kind === "restock" && needsAttention(i, now)),
      chores: items.some((i) => i.kind === "chore" && needsAttention(i, now)),
      dates: items.some((i) => i.kind === "fixed" && needsAttention(i, now)),
    }),
    [items, now]
  );

  const saveItem = async (item: Item) => {
    await putItem(item);
    setItems((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.map((i) => (i.id === item.id ? item : i))
        : [...prev, item]
    );
    setEditing(null);
    toast("Saved");
  };

  const deleteItem = async (item: Item) => {
    await removeItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setEditing(null);
    toast("Deleted");
  };

  const heading = TABS.find((t) => t.key === tab)!.label;

  return (
    <div className="app">
      <header className="top">
        <h1>{tab === "today" ? "HouseOS" : heading}</h1>
        <span className="sub">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </header>

      <main className="scroll">
        {tab === "today" && (
          <Today items={items} now={now} onToggle={toggle} onGoTo={goTo} />
        )}
        {tab === "shopping" && (
          <Shopping
            items={items}
            now={now}
            justDone={justDone}
            onToggle={toggle}
            onEdit={setEditing}
            onMarkAll={markAll}
          />
        )}
        {tab === "chores" && (
          <Chores
            items={items}
            now={now}
            justDone={justDone}
            onToggle={toggle}
            onEdit={setEditing}
            onMarkAll={markAll}
          />
        )}
        {tab === "dates" && (
          <Dates
            items={items}
            now={now}
            justDone={justDone}
            onToggle={toggle}
            onEdit={setEditing}
          />
        )}
        {tab === "manage" && (
          <Manage
            items={items}
            onEdit={setEditing}
            onAdd={() => setEditing("new")}
            onReload={load}
            toast={toast}
          />
        )}
      </main>

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => goTo(t.key)}
          >
            <span className="glyph" aria-hidden="true">
              {t.glyph}
            </span>
            {t.label}
            {attention[t.key as keyof typeof attention] && <span className="dot" />}
          </button>
        ))}
      </nav>

      <ItemSheet
        item={editing}
        groups={groups}
        onSave={saveItem}
        onDelete={deleteItem}
        onSnooze={doSnooze}
        onClose={() => setEditing(null)}
      />

      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
