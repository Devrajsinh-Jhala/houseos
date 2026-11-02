import { useEffect, useRef, useState } from "react";
import { eventsForItem } from "../db";
import { observedInterval, suggestionFor, toISODate, uid, type DayScope, type DoneEvent, type Item, type Kind } from "../core";
import { DEFAULT_SETTINGS, resolveTime, type HouseholdSettings } from "../planner";

interface Props {
  item: Item | "new" | null;
  groups: string[];
  defaultKind?: Kind;
  defaultDate?: string;
  settings?: HouseholdSettings;
  onSave: (item: Item) => void;
  onDelete: (item: Item) => void;
  onSnooze: (item: Item, until: string) => void;
  onClose: () => void;
}

function blank(kind: Kind = "chore", day = toISODate(new Date())): Item {
  return { id: uid(), name: "", kind, intervalDays: kind === "routine" ? 1 : 7,
    dayScope: "any", group: "", active: true, created: new Date().toISOString(),
    scheduleMode: kind === "fixed" ? undefined : "interval", scheduledDate: day,
    timeAnchor: "19:30", durationMinutes: 15, priority: "normal" };
}

function inDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d);
}

export function ItemSheet({ item, groups, defaultKind, defaultDate, settings = DEFAULT_SETTINGS, onSave, onDelete, onSnooze, onClose }: Props) {
  const [draft, setDraft] = useState<Item>(() => blank(defaultKind, defaultDate));
  const [events, setEvents] = useState<DoneEvent[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isNew = item === "new";
  const closeRef = useRef(onClose); closeRef.current = onClose;

  useEffect(() => {
    if (item === "new") setDraft(blank(defaultKind, defaultDate));
    else if (item) setDraft({ ...item });
  }, [item, defaultKind, defaultDate]);

  useEffect(() => {
    if (!item || item === "new") { setEvents([]); return; }
    let live = true;
    void eventsForItem(item.id).then((e) => { if (live) setEvents(e); });
    return () => { live = false; };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    if (item === "new") nameRef.current?.focus(); else panelRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [item]);

  if (!item) return null;
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const suggestion = isNew ? null : suggestionFor(draft, events);
  const history = isNew ? null : observedInterval(events);
  const weeklyInvalid = draft.scheduleMode === "weekly" && !draft.scheduledDays?.length;

  return <div className="sheet" onClick={onClose}>
    <div className="panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="item-sheet-title" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-heading"><div><p className="eyebrow">MAKE IT YOUR ROUTINE</p><h3 id="item-sheet-title">{isNew ? "Add to your home" : "Edit task"}</h3></div><button type="button" className="icon-button" aria-label="Close task editor" onClick={onClose}>×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); if (draft.name.trim() && !weeklyInvalid) onSave({ ...draft, name: draft.name.trim() }); }}>
        <div className="field"><label htmlFor="f-name">What needs doing?</label><input id="f-name" ref={nameRef} required maxLength={160} value={draft.name} placeholder="e.g. Clean the bathroom" onChange={(e) => set("name", e.target.value)} /></div>
        <div className="two">
          <div className="field"><label htmlFor="f-kind">Type</label><select id="f-kind" value={draft.kind} onChange={(e) => setDraft((d) => ({...d, kind:e.target.value as Kind, intervalDays:e.target.value === "fixed" ? 0 : Math.max(1,d.intervalDays), scheduleMode:e.target.value === "fixed" ? undefined : d.scheduleMode, monthDay:d.monthDay ?? 1}))}><option value="routine">Daily routine</option><option value="chore">Chore / maintenance</option><option value="restock">Shopping reminder</option><option value="fixed">Monthly bill / date</option></select></div>
          <div className="field"><label htmlFor="f-group">Room / category</label><input id="f-group" list="group-list" value={draft.group ?? ""} placeholder="e.g. Kitchen" maxLength={80} onChange={(e) => set("group", e.target.value)} /><datalist id="group-list">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
        </div>
        {draft.kind === "fixed" ? <div className="field"><label htmlFor="f-dom">Day of month</label><input id="f-dom" type="number" min={1} max={31} required value={draft.monthDay ?? 1} onChange={(e) => set("monthDay", Number(e.target.value))} />{(draft.monthDay ?? 1) > 28 && <p className="hint">Uses the last day in shorter months.</p>}</div> : <>
          <div className="field"><label htmlFor="f-repeat">Repeat</label><select id="f-repeat" value={draft.scheduleMode ?? ""} onChange={(e) => setDraft((d) => ({...d, scheduleMode:(e.target.value || undefined) as Item["scheduleMode"], scheduledDays:d.scheduledDays ?? [1,3,5], scheduledDate:d.scheduledDate ?? toISODate(new Date()), lastDone:e.target.value === "once" && d.scheduleMode !== "once" ? undefined : d.lastDone}))}>
            {!draft.scheduleMode && <option value="">{draft.kind === "routine" ? "Daily routine" : "After last completion"}</option>}<option value="interval">Every few days</option><option value="weekly">On specific weekdays</option><option value="once">Just once</option>
          </select></div>
          {draft.scheduleMode === "weekly" && <div className="field"><label>Which days?</label><div className="weekday-picker">{[1,2,3,4,5,6,0].map((day) => <button type="button" key={day} className="chip" aria-pressed={draft.scheduledDays?.includes(day) ?? false} onClick={() => set("scheduledDays", draft.scheduledDays?.includes(day) ? draft.scheduledDays.filter((d) => d !== day) : [...(draft.scheduledDays ?? []), day])}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]}</button>)}</div>{weeklyInvalid && <p className="hint warn">Choose at least one day.</p>}</div>}
          {draft.scheduleMode === "once" && <div className="field"><label htmlFor="f-date">Scheduled date</label><input id="f-date" type="date" required value={draft.scheduledDate ?? ""} onChange={(e) => set("scheduledDate", e.target.value)} /></div>}
          {(draft.scheduleMode === "interval" || (!draft.scheduleMode && draft.kind !== "routine")) && <div className="two"><div className="field"><label htmlFor="f-int">Repeat every (days)</label><input id="f-int" type="number" min={1} max={3650} required value={draft.intervalDays} onChange={(e) => set("intervalDays", Number(e.target.value))} /></div>{draft.scheduleMode && !draft.lastDone && <div className="field"><label htmlFor="f-start">First due date</label><input id="f-start" type="date" required value={draft.scheduledDate ?? ""} onChange={(e) => set("scheduledDate", e.target.value)} /></div>}</div>}
          {!draft.scheduleMode && draft.kind === "routine" && <div className="field"><label htmlFor="f-scope">Which days</label><select id="f-scope" value={draft.dayScope} onChange={(e) => set("dayScope", e.target.value as DayScope)}><option value="any">Every day</option><option value="weekday">Weekdays</option><option value="weekend">Weekends</option></select></div>}
        </>}
        {draft.kind === "fixed" && <div className="field"><label htmlFor="f-amount">Amount (₹)</label><input id="f-amount" type="number" min={0} step={0.01} placeholder="Optional" value={draft.amount ?? ""} onChange={(e) => set("amount", e.target.value === "" ? undefined : Number(e.target.value))} /></div>}
        {draft.kind !== "restock" && <>
          <div className="two"><div className="field"><label htmlFor="f-anchor">Schedule around</label><select id="f-anchor" value={draft.scheduleAnchor ?? "clock"} onChange={(e) => set("scheduleAnchor", e.target.value as Item["scheduleAnchor"])}><option value="clock">A specific time</option><option value="arrival">When I get home</option></select></div>
          {draft.scheduleAnchor === "arrival" ? <div className="field"><label htmlFor="f-offset">Minutes after arriving</label><input id="f-offset" type="number" required min={-720} max={720} step={5} value={draft.arrivalOffset ?? 0} onChange={(e) => set("arrivalOffset", Number(e.target.value))} /></div> : <div className="field"><label htmlFor="f-time">Time</label><input id="f-time" type="time" required value={draft.timeAnchor ?? "19:30"} onChange={(e) => set("timeAnchor", e.target.value)} /></div>}</div>
          {draft.scheduleAnchor === "arrival" && <p className="hint">Currently {resolveTime(draft, settings, draft.scheduledDate)}. Updates when you change your arrival time.</p>}
          <div className="two"><div className="field"><label htmlFor="f-duration">Estimated minutes</label><input id="f-duration" type="number" required min={1} max={720} step={1} value={draft.durationMinutes ?? 15} onChange={(e) => set("durationMinutes", Number(e.target.value))} /></div><div className="field"><label htmlFor="f-priority">Priority</label><select id="f-priority" value={draft.priority ?? "normal"} onChange={(e) => set("priority", e.target.value as Item["priority"])}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div></div>
        </>}
        <div className="field"><label htmlFor="f-note">Notes / checklist</label><textarea id="f-note" maxLength={4000} value={draft.note ?? ""} placeholder="Supplies, steps, or anything you want to remember" onChange={(e) => set("note", e.target.value)} /></div>
        {suggestion && <div className="suggest"><div className="suggest-text">Your last {suggestion.samples + 1} completions suggest every <strong>{suggestion.median} days</strong>.</div><button type="button" className="btn ghost small" onClick={() => set("intervalDays", suggestion.median)}>Use {suggestion.median} days</button></div>}
        {!isNew && <><p className="hint">{draft.lastDone ? `Last completed ${new Date(draft.lastDone).toLocaleDateString(undefined, {day:"numeric",month:"short"})}` : "No completions yet"}{events.length > 0 && ` · ${events.length} logged`}{history && ` · usually every ${history.median} days`}</p><label className="check-label"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> Active in my home</label></>}
        {!isNew && (draft.kind === "chore" || draft.kind === "restock") && <div className="btn-row tight"><button type="button" className="btn ghost small" onClick={() => onSnooze(draft, inDays(2))}>Snooze 2 days</button><button type="button" className="btn ghost small" onClick={() => onSnooze(draft, inDays(7))}>Snooze 1 week</button></div>}
        <div className="btn-row"><button type="submit" className="btn" disabled={weeklyInvalid}>{isNew ? "Add task" : "Save changes"}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
        {!isNew && <button type="button" className="btn danger small" onClick={() => { if (window.confirm(`Delete “${draft.name}” and its completion history?`)) onDelete(draft); }}>Delete task</button>}
      </form>
    </div>
  </div>;
}
