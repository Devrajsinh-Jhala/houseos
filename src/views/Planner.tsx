import { useEffect, useState } from "react";
import { fmtClock, houseDay, type Item } from "../core";
import { arrivalFor, planForDay, planLoad, scheduleLabel, shiftDay, type HouseholdSettings } from "../planner";
import "./planner.css";

interface Props {
  items: Item[];
  now: Date;
  settings: HouseholdSettings;
  isConfigured?: boolean;
  onEdit: (item: Item) => void;
  onAdd: (date?: string) => void;
  onToggle: (item: Item) => void;
  onSettingsChange?: (settings: HouseholdSettings) => Promise<void> | void;
}

function minutesLabel(n: number) { return n < 60 ? `${n} min` : `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}`; }

export function Planner({items, now, settings, isConfigured=false, onEdit, onAdd, onToggle, onSettingsChange}: Props) {
  const today = houseDay(now);
  const [selected, setSelected] = useState(today);
  const [week, setWeek] = useState(() => {
    const weekday = new Date(today + "T12:00:00").getDay();
    return shiftDay(today, -(weekday === 0 ? 6 : weekday - 1));
  });
  const [showAvailability, setShowAvailability] = useState(false);
  const [availability, setAvailability] = useState(settings);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  useEffect(() => { setAvailability(settings); }, [settings]);
  const days = Array.from({length: 7}, (_, n) => shiftDay(week, n));
  const tasks = planForDay(items, selected, settings, now);
  const load = planLoad(tasks, settings);
  const selectedDate = new Date(selected + "T12:00:00");
  const changeWeek = (direction: number) => { setWeek(shiftDay(week, direction * 7)); setSelected(shiftDay(selected, direction * 7)); };

  return <div className="planner-page">
    <div className="availability-banner"><span className="availability-icon" aria-hidden="true">⌂</span><div><strong>{isConfigured?`Home at ${fmtClock(arrivalFor(settings, selected))}`:"Set your own daily rhythm"}</strong><span>{isConfigured?`${settings.dailyBudgetMinutes} minutes for your home each day · bedtime ${fmtClock(settings.sleepTime)}`:"Choose your arrival time and availability when you're ready."}</span></div><button className="text-button" aria-expanded={showAvailability} onClick={() => setShowAvailability(!showAvailability)}>{isConfigured?"Edit availability":"Set availability"} <span aria-hidden="true">↗</span></button></div>
    {showAvailability && onSettingsChange && <form className="availability-form panel-card" onSubmit={async (e) => {e.preventDefault(); if(savingAvailability)return;setSavingAvailability(true);setAvailabilityError("");try{await onSettingsChange(availability);setShowAvailability(false);}catch{setAvailabilityError("Your availability couldn't be saved. Please try again.");}finally{setSavingAvailability(false);}}}>
      <h3>Plan around your day</h3><p className="hint">{isConfigured?"Tasks set to “when I get home” move together when your arrival changes.":"These times are starting suggestions. Choose your own arrival, bedtime, and daily home time, then save."}</p>
      <div className="two"><div className="field"><label htmlFor="p-arrival">Weekday arrival</label><input id="p-arrival" type="time" required value={availability.arrivalTime} onChange={(e) => setAvailability({...availability, arrivalTime:e.target.value})} /></div><div className="field"><label htmlFor="p-weekend">Weekend availability starts</label><input id="p-weekend" type="time" required value={availability.weekendArrivalTime} onChange={(e) => setAvailability({...availability, weekendArrivalTime:e.target.value})} /></div></div>
      <div className="two"><div className="field"><label htmlFor="p-bed">Bedtime</label><input id="p-bed" type="time" required value={availability.sleepTime} onChange={(e) => setAvailability({...availability, sleepTime:e.target.value})} /></div><div className="field"><label htmlFor="p-budget">Daily home time (minutes)</label><input id="p-budget" type="number" min={15} max={720} step={5} required value={availability.dailyBudgetMinutes} onChange={(e) => setAvailability({...availability, dailyBudgetMinutes:Number(e.target.value)})} /></div></div>{availabilityError&&<p role="alert" className="planner-warning">{availabilityError}</p>}<button className="btn small" type="submit" disabled={savingAvailability}>{savingAvailability?"Saving…":"Save availability"}</button>
    </form>}
    <div className="planner-week-heading"><div><h3>{new Date(week + "T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h3><span className="hint">Your next seven days, at a glance</span></div><div className="week-controls"><button className="icon-button" aria-label="Previous week" onClick={() => changeWeek(-1)}>‹</button><button className="chip" onClick={() => { const wd = new Date(today + "T12:00:00").getDay(); setWeek(shiftDay(today, -(wd === 0 ? 6 : wd - 1))); setSelected(today); }}>This week</button><button className="icon-button" aria-label="Next week" onClick={() => changeWeek(1)}>›</button><button className="btn small" onClick={()=>onAdd(selected)}>+ Add for this day</button></div></div>
    <div className="week-grid" role="group" aria-label="Choose a day">
      {days.map((day) => {
        const date = new Date(day + "T12:00:00"), dayTasks = planForDay(items, day, settings, now), dayLoad = planLoad(dayTasks, settings);
        return <button key={day} className={`week-day ${selected === day ? "selected" : ""} ${day === today ? "is-today" : ""}`} aria-pressed={selected === day} onClick={() => setSelected(day)}><span className="week-day-name">{date.toLocaleDateString(undefined,{weekday:"short"})}</span><strong>{date.getDate()}</strong><span className="week-day-tasks">{dayTasks.length} <span>{dayTasks.length===1?"task":"tasks"}</span></span>{isConfigured&&<span className={`week-load ${dayLoad.overBudget ? "over" : ""}`}><i style={{width:`${Math.min(100, dayLoad.remainingMinutes / settings.dailyBudgetMinutes * 100)}%`}} /></span>}<span className="week-day-minutes">{minutesLabel(dayLoad.minutes)}</span></button>;
      })}
    </div>
    <div className="planner-detail-grid"><section className="planner-schedule panel-card"><div className="section-heading"><div><p className="eyebrow">{selected === today ? "TODAY’S PLAN" : "DAY PLAN"}</p><h3>{selectedDate.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"short"})}</h3></div><span className="pill">{tasks.filter((t) => t.done).length}/{tasks.length} done</span></div>
      {selected !== today && <p className="hint">A forecast based on your current schedule. Complete tasks from today’s plan.</p>}
      {!tasks.length && <div className="planner-empty"><span aria-hidden="true">☀</span><h3>Nothing scheduled yet</h3><p>Add a task for this day to start your timetable.</p><button className="btn ghost small" onClick={() => onAdd(selected)}>Add a task</button></div>}
      <div className="plan-timeline">{tasks.map((task) => <div key={task.item.id} className={`plan-task ${task.done ? "complete" : ""}`}><span className="plan-time">{fmtClock(task.time)}</span><button className="plan-check" aria-label={`${task.done ? "Undo" : "Complete"} ${task.item.name}`} aria-pressed={task.done} disabled={selected !== today} onClick={() => onToggle(task.item)}>{task.done ? "✓" : ""}</button><button className="plan-task-body" onClick={() => onEdit(task.item)}><span className="plan-task-title">{task.item.name}</span><span className="plan-task-meta">{task.item.group || (task.item.kind === "routine" ? "Routine" : "Home") } · {task.duration} min · {scheduleLabel(task.item)}</span>{task.item.note && <span className="plan-task-note">{task.item.note}</span>}<span className="plan-task-tags">{task.overdue && <span className="task-tag overdue">Carried forward</span>}{task.item.priority === "high" && <span className="task-tag priority">High priority</span>}{load.conflicts.has(task.item.id) && <span className="task-tag overlap">Time overlap</span>}</span></button><button className="task-edit" aria-label={`Edit ${task.item.name}`} onClick={() => onEdit(task.item)}>↗</button></div>)}</div>
    </section><aside className="planner-side"><div className="panel-card"><p className="eyebrow">KEEP IT REALISTIC</p><h3>{minutesLabel(load.remainingMinutes)} left to do</h3>{isConfigured?<><p className="hint">Your daily home budget is {minutesLabel(settings.dailyBudgetMinutes)}.</p><div className={`budget-track ${load.overBudget ? "over" : ""}`}><i style={{width:`${Math.min(100,load.remainingMinutes / settings.dailyBudgetMinutes * 100)}%`}} /></div>{load.overBudget > 0 ? <p className="planner-warning">{minutesLabel(load.overBudget)} over your budget. Move a lower priority task or shorten your plan.</p> : <p className="hint">{minutesLabel(Math.max(0,settings.dailyBudgetMinutes-load.remainingMinutes))} of breathing room.</p>}{load.afterBedtime > 0 && <p className="planner-warning">{load.afterBedtime} {load.afterBedtime === 1 ? "task runs" : "tasks run"} past bedtime.</p>}</>:<><p className="hint">Set a daily time budget to see how your plan fits your day.</p><button className="text-button" onClick={()=>setShowAvailability(true)}>Set availability ↗</button></>}{load.conflicts.size > 0 && <p className="planner-warning">{load.conflicts.size} tasks overlap. Open a task to adjust its time.</p>}</div><div className="planner-note"><span aria-hidden="true">↳</span><h3>Build around your life</h3><p>{isConfigured?`Home at ${fmtClock(arrivalFor(settings, selected))}. Add a task relative to your arrival, and your plan follows you.`:"Choose your arrival time, then schedule tasks around when you get home."}</p><p>Weekly tasks stay on their chosen days. Interval tasks restart their countdown when you finish them.</p></div></aside></div>
  </div>;
}
