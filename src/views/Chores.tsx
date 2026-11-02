import { useState } from "react";
import { Row } from "../components/Row";
import { SetupSection } from "../components/SetupSection";
import { daysUntilDue, doneToday, groupBy, needsSetup, type Item } from "../core";

interface Props {
  items: Item[];
  now: Date;
  justDone: Set<string>;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onMarkAll: (items: Item[]) => void;
}

export function Chores({ items, now, justDone, onToggle, onEdit, onMarkAll }: Props) {
  const [mode, setMode] = useState<"due" | "all" | "completed">("due");
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");

  const chores = items.filter((i) => i.active && i.kind === "chore");
  const completed = (item: Item) => doneToday(item, now) || (item.scheduleMode === "once" && !!item.lastDone);
  const matches = (item: Item) => (room === "all" || (item.group?.trim() || "Other") === room) &&
    `${item.name} ${item.group ?? ""} ${item.note ?? ""}`.toLowerCase().includes(query.toLowerCase());
  const rooms = [...new Set(chores.map((item) => item.group?.trim() || "Other"))].sort();
  const unset = chores.filter((i) => needsSetup(i) && !justDone.has(i.id) && matches(i));
  const tracked = chores.filter((i) => !needsSetup(i));
  const pending = tracked.filter((item) => !completed(item));
  const dueCount = pending.filter((item) => daysUntilDue(item, now) <= 0).length;
  const weekCount = pending.filter((item) => daysUntilDue(item, now) <= 7).length;
  const doneCount = chores.filter((item) => doneToday(item, now)).length;

  const visible = tracked.filter(
    (i) => matches(i) && (mode === "all" || (mode === "completed" ? completed(i) :
      (!completed(i) && daysUntilDue(i, now) <= 0) || doneToday(i, now) || justDone.has(i.id)))
  );
  visible.sort((a, b) => Number(completed(a)) - Number(completed(b)) || daysUntilDue(a, now) - daysUntilDue(b, now));

  return (
    <>
      <div className="house-task-stats">
        <div><span>TO DO NOW</span><strong>{dueCount}<small> chores</small></strong></div>
        <div><span>WITHIN 7 DAYS</span><strong>{weekCount}<small> chores</small></strong></div>
        <div><span>DONE TODAY</span><strong>{doneCount}<small> checked off</small></strong></div>
      </div>
      <div className="house-task-filters"><label className="house-task-search"><span className="sr-only">Search chores</span><input placeholder="Search chores, rooms, or notes…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Room or area" value={room} onChange={(event) => setRoom(event.target.value)}><option value="all">All rooms</option>{rooms.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div className="shop-toggle">
        {([["due", "Due now"], ["all", "All chores"], ["completed", "Completed"]] as const).map(([value, label]) => <button key={value} className="chip" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
      </div>

      {!visible.length && (mode === "completed" || !unset.length) && (
        <div className="house-task-empty"><span aria-hidden="true">✓</span><h3>{query || room !== "all" ? "No matching chores" : mode === "completed" ? "Your finished tasks will be here" : mode === "all" ? "Make a little space for a routine" : "You’re up to date."}</h3><p>{query || room !== "all" ? "Try another search or room." : mode === "completed" ? "Completed one-off tasks stay here. Repeating chores also appear on the day you finish them." : mode === "all" ? "Add cleaning, laundry, plant care, or maintenance to your home." : "Check your weekly plan for what’s coming next."}</p></div>
      )}

      {groupBy(visible).map(([group, list]) => (
        <div key={group} className="house-task-group">
          <div className="section">
            <h2>{group}</h2>
            <span className="count">{list.length}</span>
          </div>
          {list.map((item) => (
            <Row
              key={item.id}
              item={item}
              done={completed(item) || justDone.has(item.id)}
              onToggle={onToggle}
              onEdit={onEdit}
              now={now}
            />
          ))}
        </div>
      ))}

      {mode !== "completed" && <SetupSection
        items={unset}
        verb="did recently"
        now={now}
        justDone={justDone}
        onToggle={onToggle}
        onEdit={onEdit}
        onMarkAll={onMarkAll}
      />}
    </>
  );
}
