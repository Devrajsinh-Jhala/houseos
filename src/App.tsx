import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { ItemSheet } from "./components/ItemSheet";
import { Chores } from "./views/Chores";
import { Dates } from "./views/Dates";
import { Manage } from "./views/Manage";
import { Shopping } from "./views/Shopping";
import { Today } from "./views/Today";
import { Planner } from "./views/Planner";
import { Inventory } from "./views/Inventory";
import { Meals } from "./views/Meals";
import { HomeGuide } from "./views/HomeGuide";
import { DEFAULT_SETTINGS, type HouseholdSettings } from "./planner";
import { stockShoppingCount, validStockItem, type StockItem } from "./inventory";
import { validMeal, type MealPlan } from "./meals";
import { validHomeContact, type HomeContact } from "./homeGuide";
import { allItems, complete, completeMany, putItem, removeItem, seedIfEmpty, snooze as snoozeItem, uncomplete, getMeta, setMeta } from "./db";
import { storedTheme, watchSystem } from "./theme";
import { SEED } from "./seed";
import { doneToday, houseDay, needsAttention, uid, type Item, type Kind } from "./core";
import { validSettings } from "./validation";
import { paidThisMonth } from "./bills";
import { useOfflineStatus } from "./offline";

export type Tab = "today" | "planner" | "chores" | "inventory" | "shopping" | "meals" | "dates" | "guide" | "manage";
const TABS: { key: Tab; label: string; description: string }[] = [
  {key:"today",label:"Overview",description:"A little structure. A lighter day."},
  {key:"planner",label:"My schedule",description:"Make room for home, on your own terms."},
  {key:"chores",label:"Chores",description:"Small resets that keep your home running."},
  {key:"inventory",label:"Inventory",description:"Know what you have. Use what you buy."},
  {key:"shopping",label:"Shopping list",description:"Everything you need, in one trip."},
  {key:"meals",label:"Meal planner",description:"One less thing to decide at dinnertime."},
  {key:"dates",label:"Bills & dates",description:"Keep the essentials paid and on time."},
  {key:"guide",label:"Home handbook",description:"The people and details your home depends on."},
  {key:"manage",label:"Settings",description:"Make HouseOS feel like your home."},
];

export default function App() {
  const offlineStatus=useOfflineStatus();
  const [items,setItems]=useState<Item[]>([]);
  const [stock,setStock]=useState<StockItem[]>([]);
  const [meals,setMeals]=useState<MealPlan[]>([]);
  const [contacts,setContacts]=useState<HomeContact[]>([]);
  const [settings,setSettings]=useState<HouseholdSettings>(DEFAULT_SETTINGS);
  const [tab,setTab]=useState<Tab>("today");
  const [now,setNow]=useState(()=>new Date());
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState("");
  const [justDone,setJustDone]=useState<Set<string>>(new Set());
  const [editing,setEditing]=useState<Item|"new"|null>(null);
  const [defaultKind,setDefaultKind]=useState<Kind>("chore");
  const [defaultDate,setDefaultDate]=useState<string>();
  const [toastMsg,setToastMsg]=useState<string|null>(null);
  const [online,setOnline]=useState(navigator.onLine);
  const [shoppingView,setShoppingView]=useState<"list"|"restock">("list");
  const [showMore,setShowMore]=useState(false);
  const busy=useRef(new Set<string>());
  const toastTimer=useRef<ReturnType<typeof setTimeout>>();
  const toast=useCallback((message:string)=>{
    setToastMsg(message);clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToastMsg(null),4200);
  },[]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  const load=useCallback(async()=>{
    try {
      await seedIfEmpty(SEED);
      const [records,savedStock,savedMeals,savedContacts,savedSettings]=await Promise.all([
        allItems(),getMeta<unknown>("inventory"),getMeta<unknown>("meals"),getMeta<unknown>("contacts"),getMeta<unknown>("householdSettings")
      ]);
      setItems(records);setStock(Array.isArray(savedStock)?savedStock.filter(validStockItem):[]);
      setMeals(Array.isArray(savedMeals)?savedMeals.filter(validMeal):[]);
      setContacts(Array.isArray(savedContacts)?savedContacts.filter(validHomeContact):[]);
      setSettings(validSettings(savedSettings)?savedSettings:DEFAULT_SETTINGS);
      setJustDone(new Set());setLoadError("");setReady(true);
    } catch {setLoadError("Your home data couldn't be opened. Please allow browser storage and try again.");}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>watchSystem(storedTheme),[]);
  useEffect(()=>{
    const wake=()=>setNow(new Date());const tick=setInterval(wake,60_000);
    const connectivity=()=>setOnline(navigator.onLine);
    document.addEventListener("visibilitychange",wake);window.addEventListener("online",connectivity);window.addEventListener("offline",connectivity);
    return ()=>{clearInterval(tick);document.removeEventListener("visibilitychange",wake);window.removeEventListener("online",connectivity);window.removeEventListener("offline",connectivity);};
  },[]);
  const today=houseDay(now);
  useEffect(()=>setJustDone(new Set()),[today]);
  const patch=(updated:Item)=>setItems(prev=>prev.map(i=>i.id===updated.id?updated:i));
  const fail=()=>toast("That change couldn't be saved. Please try again.");
  const toggle=async(item:Item)=>{
    if(busy.current.has(item.id))return;busy.current.add(item.id);
    try {
      const isDone=item.kind==="fixed"?paidThisMonth(item,now):doneToday(item,now)||justDone.has(item.id)||(item.scheduleMode==="once"&&!!item.lastDone);
      if(isDone){patch(await uncomplete(item));setJustDone(s=>{const n=new Set(s);n.delete(item.id);return n;});}
      else {patch(await complete(item));setJustDone(s=>new Set(s).add(item.id));}
    }catch{fail();}finally{busy.current.delete(item.id);}
  };
  const markAll=async(batch:Item[])=>{
    try {const updated=await completeMany(batch);const byId=new Map(updated.map(i=>[i.id,i]));setItems(prev=>prev.map(i=>byId.get(i.id)??i));toast(`${updated.length} set to today`);}catch{fail();}
  };
  const saveItem=async(item:Item)=>{
    try {await putItem(item);setItems(prev=>prev.some(i=>i.id===item.id)?prev.map(i=>i.id===item.id?item:i):[...prev,item]);setEditing(null);toast("Task saved");}catch{fail();}
  };
  const deleteItem=async(item:Item)=>{
    try{await removeItem(item.id);setItems(prev=>prev.filter(i=>i.id!==item.id));setEditing(null);toast("Task deleted");}catch{fail();}
  };
  const doSnooze=async(item:Item,until:string)=>{
    try{patch(await snoozeItem(item,until));setEditing(null);toast("Rescheduled");}catch{fail();}
  };
  const saveStock=async(next:StockItem[])=>{await setMeta("inventory",next);setStock(next);};
  const saveMeals=async(next:MealPlan[])=>{await setMeta("meals",next);setMeals(next);};
  const saveContacts=async(next:HomeContact[])=>{await setMeta("contacts",next);setContacts(next);};
  const saveSettings=async(next:HouseholdSettings)=>{await setMeta("householdSettings",next);setSettings(next);};
  const addIngredients=async(names:string[])=>{
    const next=stock.map(i=>({...i}));
    for(const name of names.map(n=>n.trim()).filter(Boolean)){
      const existing=next.find(i=>i.name.toLowerCase()===name.toLowerCase());
      if(existing)existing.onList=true;
      else next.push({id:uid(),name,category:"Groceries",quantity:0,unit:"item",minQuantity:0,targetQuantity:1,onList:true});
    }
    await saveStock(next);
  };
  const addTask=(kind:Kind="chore",date?:string)=>{setDefaultKind(kind);setDefaultDate(date);setEditing("new");};
  const goTo=(next:Tab)=>{setTab(next);setShowMore(false);window.scrollTo({top:0,behavior:"instant"});};
  const groups=useMemo(()=>[...new Set(items.map(i=>i.group).filter(Boolean) as string[])].sort(),[items]);
  const shoppingCount=stockShoppingCount(stock);
  const attention={shopping:shoppingCount,chores:items.filter(i=>i.kind==="chore"&&needsAttention(i,now)).length,dates:items.filter(i=>i.kind==="fixed"&&needsAttention(i,now)).length};
  const current=TABS.find(t=>t.key===tab)!;
  const navItems=TABS.map(entry=><button key={entry.key} className={tab===entry.key?"active":""} aria-current={tab===entry.key?"page":undefined} onClick={()=>goTo(entry.key)}><Icon name={entry.key}/><span>{entry.label}</span>{attention[entry.key as keyof typeof attention]>0&&<span className="nav-count">{attention[entry.key as keyof typeof attention]}</span>}</button>);
  return <div className="app">
    <aside className="sidebar">
      <button className="brand" onClick={()=>goTo("today")} aria-label="HouseOS overview"><span className="brand-mark"><Icon name="home" size={25}/></span><span>house<span className="brand-os">os</span><small>YOUR HOME, HANDLED.</small></span></button>
      <div className="home-selector"><span className="home-avatar"><Icon name="leaf" size={19}/></span><div><strong>{settings.homeName}</strong><small>A space of your own</small></div><span className="home-selector-dot"/></div>
      <p className="nav-label">YOUR EVERYDAY</p><nav className="side-nav" aria-label="Main navigation">{navItems}</nav>
      <div className="sidebar-bottom"><span className="local-dot"/>{online?"Saved on this device":"You're offline"}<small>{offlineStatus==="ready"?"Offline files ready":offlineStatus==="preparing"?"Preparing offline files…":offlineStatus==="development"?"Development preview":"Offline access unavailable here"}</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><Icon name="home" size={16}/><span>{settings.homeName}</span><span>/</span><strong>{current.label}</strong></div><div className="topbar-right"><span className="today-label">{now.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})}</span><span className="owner-avatar" title="Your personal home">{settings.homeName.trim().charAt(0).toUpperCase()||"H"}</span></div></header>
      <main className={`scroll view-${tab}`} id="main-content">
        <div className="page-heading"><div><p className="eyebrow">{tab==="today"?"MAKE YOURSELF AT HOME":"A PLACE FOR EVERYTHING"}</p><h1>{tab==="today"?"A home that runs with you.":current.label}</h1><p className="page-description">{current.description}</p></div>{(tab==="today"||tab==="chores"||tab==="dates")&&<button className="btn add-task" onClick={()=>addTask(tab==="dates"?"fixed":"chore")}><Icon name="plus" size={18}/>Add task</button>}</div>
        {loadError?<div role="alert" className="empty">{loadError}<div className="btn-row"><button className="btn" onClick={()=>void load()}>Try again</button></div></div>:!ready?<p className="empty" role="status">Getting your home ready…</p>:<>
          {tab==="today"&&<Today items={items} stock={stock} meals={meals} settings={settings} now={now} onToggle={toggle} onEdit={setEditing} onGoTo={goTo} onAdd={()=>addTask()}/>}
          {tab==="planner"&&<Planner items={items} now={now} settings={settings} onEdit={setEditing} onAdd={date=>addTask("chore",date)} onToggle={toggle} onSettingsChange={saveSettings}/>}
          {tab==="chores"&&<Chores items={items} now={now} justDone={justDone} onToggle={toggle} onEdit={setEditing} onMarkAll={markAll}/>}
          {tab==="inventory"&&<Inventory stock={stock} now={now} onChange={saveStock} toast={toast} initialView="stock"/>}
          {tab==="shopping"&&<><div className="shop-toggle shopping-source"><button className="chip" aria-pressed={shoppingView==="list"} onClick={()=>setShoppingView("list")}>Shopping list{shoppingCount>0?` · ${shoppingCount}`:""}</button><button className="chip" aria-pressed={shoppingView==="restock"} onClick={()=>setShoppingView("restock")}>Restock reminders</button></div>{shoppingView==="list"?<Inventory stock={stock} now={now} onChange={saveStock} toast={toast} initialView="shopping"/>:<><p className="note">These reminders track how often you buy something. Use Inventory to track quantities and your shopping list.</p><Shopping items={items} now={now} justDone={justDone} onToggle={toggle} onEdit={setEditing} onMarkAll={markAll}/></>}</>}
          {tab==="meals"&&<Meals meals={meals} now={now} onChange={saveMeals} onAddToShopping={addIngredients} toast={toast}/>}
          {tab==="dates"&&<Dates items={items} now={now} justDone={justDone} onToggle={toggle} onEdit={setEditing}/>}
          {tab==="guide"&&<HomeGuide contacts={contacts} onChange={saveContacts} toast={toast}/>}
          {tab==="manage"&&<Manage items={items} settings={settings} onSettingsChange={saveSettings} onEdit={setEditing} onAdd={()=>addTask()} onReload={load} toast={toast}/>}
        </>}
        <footer className="page-footer"><Icon name="leaf" size={14}/><span>A little each day goes a long way.</span><span>HouseOS · Your home, handled</span></footer>
      </main>
    </div>
    {showMore&&<div className="mobile-menu-scrim" onClick={()=>setShowMore(false)}><nav className="mobile-more-menu" aria-label="More home tools" onClick={e=>e.stopPropagation()}><div><strong>More for your home</strong><button aria-label="Close more tools" onClick={()=>setShowMore(false)}>×</button></div>{navItems.slice(5)}</nav></div>}
    <nav className="mobile-nav" aria-label="Main navigation">{navItems.slice(0,5)}<button className={TABS.findIndex(t=>t.key===tab)>=5?"active":""} aria-expanded={showMore} onClick={()=>setShowMore(s=>!s)}><Icon name="more"/><span>More</span></button></nav>
    <ItemSheet item={editing} groups={groups} defaultKind={defaultKind} defaultDate={defaultDate} settings={settings} onSave={saveItem} onDelete={deleteItem} onSnooze={doSnooze} onClose={()=>setEditing(null)}/>
    {toastMsg&&<div className="toast" role="status" aria-live="polite">{toastMsg}</div>}
  </div>;
}
