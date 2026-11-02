import { useState } from "react";
import { Icon } from "../components/Icon";
import { anchorMinutes, daysUntilDue, fmtClock, houseDay, needsSetup, toISODate, type Item } from "../core";
import { arrivalFor, planForDay, type HouseholdSettings } from "../planner";
import { expiringStock, lowStock, shoppingItems, type StockItem } from "../inventory";
import type { MealPlan } from "../meals";
import type { Tab } from "../App";

interface Props {
  items: Item[];
  stock: StockItem[];
  meals: MealPlan[];
  settings: HouseholdSettings;
  isConfigured?: boolean;
  now: Date;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onGoTo: (tab: Tab) => void;
  onAdd: (date?: string) => void;
}

function HomeDrawing() {
  return <svg className="home-drawing" viewBox="0 0 290 190" fill="none" aria-hidden="true">
    <circle cx="162" cy="89" r="82" fill="#c5d7bb" opacity=".5"/><path d="M17 171h256" stroke="#92aa83" strokeWidth="1.5"/>
    <rect x="100" y="79" width="113" height="92" rx="3" fill="#f8f5e9"/><path d="m85 83 70-58 74 58" fill="#72916d" stroke="#52734f" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M107 77v-35h16v21" fill="#f8f5e9"/><rect x="144" y="121" width="26" height="50" rx="2" fill="#b78557"/><circle cx="165" cy="148" r="1.8" fill="#f7e9cb"/>
    <rect x="111" y="97" width="23" height="25" rx="2" fill="#d2dfd1" stroke="#7a9576"/><path d="M123 98v23m-11-12h21" stroke="#7a9576"/>
    <rect x="181" y="97" width="23" height="25" rx="2" fill="#d2dfd1" stroke="#7a9576"/><path d="M192 98v23m-11-12h21" stroke="#7a9576"/>
    <path d="M62 171v-50m-1 31c-30-4-37-28-30-32 21-7 32 9 31 32Zm0-16c-9-25 1-42 14-44 13 20 5 37-14 44Zm1 19c23-1 32-13 28-23-23-4-33 12-28 23Z" fill="#6d8d65"/>
    <path d="M45 171h32l-4-21H49Z" fill="#bd9471"/><path d="M231 171v-30m0 4c-21-3-26-20-20-23 15-4 23 8 20 23Zm1-8c-2-20 8-29 16-27 3 17-3 26-16 27Z" fill="#8ba27b"/>
    <path d="M221 171h22l-3-17h-16Z" fill="#ddc8a4"/><path d="m149 171-8 16h43l-13-16" fill="#e9dfca"/>
    <path d="m225 38 5-7 5 7m-5-7v18" stroke="#9cb08d" strokeWidth="1.5"/><circle cx="72" cy="62" r="4" fill="#ebd999"/>
  </svg>;
}

export function Today({items, stock, meals, settings, isConfigured = false, now, onToggle, onEdit, onGoTo, onAdd}: Props) {
  const today = houseDay(now);
  const [selected, setSelected] = useState<string | null>(null);
  const weekStart = new Date(today + "T12:00:00");
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const week = Array.from({length: 7}, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return toISODate(date);
  });
  const day = selected && week.includes(selected) ? selected : today;
  const plan = planForDay(items, day, settings, now);
  const todayPlan = day === today ? plan : planForDay(items, today, settings, now);
  const done = plan.filter(task => task.done).length;
  const doneToday = todayPlan.filter(task => task.done).length;
  const pendingToday = todayPlan.filter(task => !task.done);
  const choresToday = pendingToday.filter(task => task.item.kind === "chore");
  const choreMinutes = choresToday.reduce((sum, task) => sum + task.duration, 0);
  const low = stock.filter(lowStock);
  const expiry = stock.filter(item => expiringStock(item, toISODate(now)));
  const expiryIds = new Set(expiry.map(item => item.id));
  const lowAttention = low.filter(item => !expiryIds.has(item.id));
  const shop = shoppingItems(stock);
  const trackedBills = items.filter(item => item.active && item.kind === "fixed");
  const bills = trackedBills.filter(item => daysUntilDue(item, now) <= 7)
    .sort((a, b) => daysUntilDue(a, now) - daysUntilDue(b, now));
  const overdueBills = bills.filter(item => daysUntilDue(item, now) < 0).length;
  const setupChores = items.filter(item => item.kind === "chore" && needsSetup(item)).length;
  const setupRestock = items.filter(item => item.kind === "restock" && needsSetup(item)).length;
  const hasTasks = items.some(item => item.active && item.kind !== "restock");
  const emptyHome = !items.length && !stock.length && !meals.length;
  const attentionCount = lowAttention.length + expiry.length + bills.length;
  const dinner = meals.find(meal => meal.date === day && meal.slot === "dinner");
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Welcome home";
  const selectedDayName = new Date(day + "T12:00:00").toLocaleDateString(undefined, {weekday: "long"});
  const groups = [
    {name: "Morning", range: "A fresh start", tasks: plan.filter(task => anchorMinutes(task.time) < 720)},
    {name: "Afternoon", range: "Keep things moving", tasks: plan.filter(task => anchorMinutes(task.time) >= 720 && anchorMinutes(task.time) < 1080)},
    {name: "Evening", range: "Settle in & reset", tasks: plan.filter(task => anchorMinutes(task.time) >= 1080)},
  ].filter(group => group.tasks.length);

  const welcome = <section className={`welcome-card${emptyHome ? " welcome-empty" : ""}`}>
      <div className="welcome-content">
        <span className="welcome-tag"><span/>{emptyHome ? "START WITH WHAT MATTERS" : "YOUR DAY AT A GLANCE"}</span>
        <h2>{emptyHome ? "Your home starts here." : `${greeting}.`}</h2>
        <p>{emptyHome
          ? "Add your first task, choose when it repeats, and build a schedule that fits your day."
          : pendingToday.length
            ? `${pendingToday.length} ${pendingToday.length === 1 ? "task" : "tasks"} on today's plan${choreMinutes ? ` · ${choreMinutes} min of chores` : ""}.`
            : todayPlan.length ? "You've finished today's scheduled tasks." : "No tasks scheduled for today. Add one or plan your week."}</p>
        {emptyHome
          ? <button className="btn" onClick={() => onAdd(today)}><Icon name="plus" size={17}/>Add your first task</button>
          : <button className="text-link" onClick={() => onGoTo("planner")}>View my schedule <Icon name="arrow" size={17}/></button>}
      </div>
      <HomeDrawing/>
    </section>;

  const metrics = <div className="metric-grid">
      <button className="metric-card" onClick={() => onGoTo("planner")}><span className="metric-icon sage"><Icon name="today"/></span><span className="metric-body"><span>Today's progress</span><strong>{doneToday}<small> / {todayPlan.length}</small></strong><span className="mini-progress"><i style={{width: `${todayPlan.length ? doneToday / todayPlan.length * 100 : 0}%`}}/></span>{!todayPlan.length && <em>No tasks scheduled</em>}</span></button>
      <button className="metric-card" onClick={() => onGoTo("chores")}><span className="metric-icon peach"><Icon name="chores"/></span><span className="metric-body"><span>Chores today</span><strong>{choresToday.length}<small> {choresToday.length === 1 ? "task" : "tasks"}</small></strong><em>{choreMinutes ? `About ${choreMinutes} minutes` : "No chores scheduled"}</em></span></button>
      <button className="metric-card" onClick={() => onGoTo("shopping")}><span className="metric-icon butter"><Icon name="shopping"/></span><span className="metric-body"><span>Shopping list</span><strong>{shop.length}<small> {shop.length === 1 ? "item" : "items"}</small></strong><em>{low.length ? `${low.length} running low` : stock.length ? "No items on your list" : "Add items as you need them"}</em></span></button>
      <button className="metric-card" onClick={() => onGoTo("dates")}><span className="metric-icon lilac"><Icon name="dates"/></span><span className="metric-body"><span>Bills due soon</span><strong>{bills.length}<small> {bills.length === 1 ? "bill" : "bills"}</small></strong><em>{overdueBills ? `${overdueBills} overdue` : bills[0]?.name ?? (trackedBills.length ? "None due in the next 7 days" : "Add your bills to track them")}</em></span></button>
    </div>;

  return <>
    {emptyHome ? <>{metrics}{welcome}</> : <>{welcome}{metrics}</>}
    <div className="dashboard-columns">
      <section className="card day-card">
        <div className="card-heading"><div><h2>Your daily rhythm</h2><p>{hasTasks ? "Choose a day to see your plan." : "Your timetable fills up as you add tasks."}</p></div><button className="text-link" onClick={() => onGoTo("planner")}>Full schedule <Icon name="arrow" size={16}/></button></div>
        <div className="week-strip">{week.map(date => <button key={date} className={date === day ? "selected" : ""} aria-pressed={date === day} onClick={() => setSelected(date)}><span>{new Date(date + "T12:00:00").toLocaleDateString(undefined, {weekday: "short"})}</span><strong>{Number(date.slice(-2))}</strong><i className={date === today ? "today-dot" : ""}/></button>)}</div>
        <div className="day-heading"><strong>{day === today ? "Today" : selectedDayName}<span> · {new Date(day + "T12:00:00").toLocaleDateString(undefined, {day: "numeric", month: "long"})}</span></strong><span>{done} of {plan.length} done</span></div>
        {day !== today && !!plan.length && <p className="note day-preview-note">This is a preview. Complete tasks from today's plan.</p>}
        {!plan.length && <div className="empty dashboard-empty"><Icon name="today" size={30}/><h3>{hasTasks ? "Nothing scheduled for this day." : "Your first task goes here."}</h3><p>{hasTasks ? "Add a task for this date or choose another day." : "Start with something you want to remember, like laundry or taking out the bins."}</p><button className="btn ghost small" onClick={() => onAdd(day)}>{hasTasks ? "Add a task for this day" : "Add your first task"}</button></div>}
        {groups.map(group => <div className="rhythm-group" key={group.name}><div className="rhythm-label"><span className="rhythm-symbol">{group.name === "Morning" ? "☀" : group.name === "Evening" ? "☾" : "◒"}</span><strong>{group.name}</strong><span>{group.range}</span></div>{group.tasks.map(task => <div className={`daily-task ${task.done ? "is-done" : ""}`} key={task.item.id}>
          <span className="task-time">{fmtClock(task.time)}</span>
          <button className="task-check" aria-label={`${task.done ? "Undo" : "Complete"} ${task.item.name}`} aria-pressed={task.done} disabled={day !== today} onClick={() => onToggle(task.item)}>{task.done && <Icon name="check" size={14}/>}</button>
          <button className="task-description" onClick={() => onEdit(task.item)}><strong>{task.item.name}</strong><span>{task.item.group || (task.item.kind === "routine" ? "Daily routine" : task.item.kind === "fixed" ? "Bills & dates" : "Home care")} · {task.duration} min{task.item.scheduleAnchor === "arrival" ? " · Around your arrival" : ""}</span></button>
          {task.overdue && !task.done ? <span className="task-badge overdue">Overdue</span> : task.item.priority === "high" ? <span className="task-badge">Priority</span> : null}
        </div>)}</div>)}
        {!!plan.length && <button className="add-inline" onClick={() => onAdd(day)}><Icon name="plus" size={16}/>Add a task</button>}
      </section>

      <aside className="dashboard-rail">
        <section className="card home-routine-card"><span className="eyebrow">BUILT AROUND YOUR DAY</span><div className="arrival-heading"><span className="metric-icon sage"><Icon name="home"/></span><div><h3>{isConfigured ? "Your home time" : "Set your daily rhythm"}</h3><p>{isConfigured ? `${day === today ? "Home" : selectedDayName} at ${fmtClock(arrivalFor(settings, day))}` : "Choose your arrival time"}</p></div></div><p>{isConfigured ? "Change your arrival time once, and tasks scheduled around it move with you." : "Choose when you get home and how much time you want to spend on home tasks."}</p><button className="text-link" onClick={() => onGoTo("manage")}>{isConfigured ? "Adjust my daily rhythm" : "Set my daily rhythm"}<Icon name="arrow" size={16}/></button></section>

        <section className="card attention-card"><div className="card-heading"><h2>Needs attention</h2><span className="pill">{attentionCount}</span></div>
          {expiry.slice(0, 2).map(item => <button className="attention-item" key={`expiry-${item.id}`} onClick={() => onGoTo("inventory")}><span className="attention-dot amber"/><span><strong>{item.name}</strong><small>Check its expiry date</small></span><Icon name="arrow" size={15}/></button>)}
          {lowAttention.slice(0, 2).map(item => <button className="attention-item" key={`stock-${item.id}`} onClick={() => onGoTo("inventory")}><span className="attention-dot amber"/><span><strong>{item.name} is running low</strong><small>{item.quantity} {item.unit} left</small></span><Icon name="arrow" size={15}/></button>)}
          {bills.slice(0, 2).map(item => <button className="attention-item" key={item.id} onClick={() => onGoTo("dates")}><span className="attention-dot"/><span><strong>{item.name}</strong><small>{daysUntilDue(item, now) < 0 ? "Payment overdue" : daysUntilDue(item, now) === 0 ? "Due today" : `Due in ${daysUntilDue(item, now)} ${daysUntilDue(item, now) === 1 ? "day" : "days"}`}</small></span><Icon name="arrow" size={15}/></button>)}
          {!attentionCount && <p className="note">{stock.length || trackedBills.length ? "No stock or bill alerts in the items you're tracking." : "Stock alerts and upcoming bills will appear here once you add them."}</p>}
          {!stock.length && <button className="attention-item" onClick={() => onGoTo("inventory")}><span className="attention-dot"/><span><strong>Add what is on your shelves</strong><small>Track quantities and expiry dates</small></span><Icon name="arrow" size={15}/></button>}
        </section>

        <section className="meal-preview"><span className="eyebrow">{day === today ? "ON THE MENU" : `${selectedDayName.toUpperCase()}'S MENU`}</span><span className="meal-illustration"><Icon name="meals" size={29}/></span><h3>{dinner?.name ?? "Plan your next dinner"}</h3><p>{dinner ? "Your dinner plan for this day." : "Add a meal and put its ingredients on your shopping list."}</p><button className="text-link" onClick={() => onGoTo("meals")}>{dinner ? "See meal plan" : "Open meal planner"}<Icon name="arrow" size={16}/></button></section>
        {setupChores + setupRestock > 0 && <button className="setup-nudge" onClick={() => onGoTo(setupChores ? "chores" : "shopping")}><Icon name="manage" size={18}/><span><strong>Set up your existing reminders</strong><small>Confirm which {setupChores ? "chores you've done recently" : "supplies you already have"}.</small></span><Icon name="arrow" size={16}/></button>}
      </aside>
    </div>
  </>;
}
