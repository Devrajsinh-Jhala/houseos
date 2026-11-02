import { useEffect, useRef, useState, type FormEvent } from "react";
import { toISODate, uid } from "../core";
import { adjustStock, expiringStock, expiryDays, expiryStatus, lowStock, purchaseStock, shoppingItems, validStockItem, type StockItem } from "../inventory";
import "../inventory.css";

interface Props {
  stock: StockItem[];
  now: Date;
  onChange: (next: StockItem[]) => Promise<void> | void;
  toast: (message: string) => void;
  initialView?: "stock" | "shopping";
}

const CATEGORIES = ["Pantry", "Fridge", "Produce", "Cleaning", "Bathroom", "Personal", "Utilities", "Other"];
const STARTERS = [
  { name: "Rice", category: "Pantry", unit: "kg", minQuantity: 1, targetQuantity: 5 },
  { name: "Milk", category: "Fridge", unit: "L", minQuantity: 0.5, targetQuantity: 2 },
  { name: "Laundry detergent", category: "Cleaning", unit: "packs", minQuantity: 0, targetQuantity: 1 },
];

function fresh(): StockItem {
  return { id: uid(), name: "", category: "Pantry", quantity: 0, unit: "packs", minQuantity: 0, targetQuantity: 1, onList: false };
}

function BasketIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 9 3-6m11 6-3-6M3 9h18l-2 11H5L3 9ZM9 13v3m6-3v3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Inventory({ stock, now, onChange, toast, initialView = "stock" }: Props) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<"all" | "low" | "expiry">("all");
  const [draft, setDraft] = useState<StockItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const today = toISODate(now);
  const low = stock.filter(lowStock);
  const expiring = stock.filter((item) => expiringStock(item, today));
  const list = shoppingItems(stock);
  const categories = [...new Set([...CATEGORIES, ...stock.map((item) => item.category)])].sort();

  useEffect(() => { setView(initialView); }, [initialView]);

  useEffect(() => {
    if (!draft) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) setDraft(null);
      if (event.key !== "Tab") return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [draft?.id]);

  const edit = (item: StockItem) => { setError(""); setConfirmDelete(false); setDraft({ ...item }); };

  async function commit(next: StockItem[], message: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try { await onChange(next); toast(message); return true; }
    catch { setError("Couldn't save your changes. Please try again."); toast("Couldn't save. Please try again."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function update(item: StockItem, message: string) {
    await commit(stock.map((current) => current.id === item.id ? item : current), message);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const item = { ...draft, name: draft.name.trim(), category: draft.category.trim() || "Other", unit: draft.unit.trim() };
    if (!validStockItem(item)) { setError("Add a name and unit, and make the restock target higher than the low-stock threshold."); return; }
    const existing = stock.some((current) => current.id === item.id);
    const next = existing ? stock.map((current) => current.id === item.id ? item : current) : [...stock, item];
    if (await commit(next, existing ? "Inventory updated" : "Added to your inventory")) setDraft(null);
  }

  const visible = (view === "shopping" ? list : stock).filter((item) =>
    `${item.name} ${item.category} ${item.note ?? ""}`.toLowerCase().includes(query.toLowerCase()) &&
    (category === "all" || item.category === category) &&
    (view === "shopping" || filter === "all" || (filter === "low" ? lowStock(item) : expiringStock(item, today)))
  ).sort((a, b) => Number(lowStock(b)) - Number(lowStock(a)) || a.name.localeCompare(b.name));

  const setField = <K extends keyof StockItem>(key: K, value: StockItem[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);

  return <div className="inventory-view">
    <div className="stock-summary">
      <button className="stock-stat" onClick={() => { setView("stock"); setFilter("all"); }}><span>ON YOUR SHELVES</span><strong>{stock.length}<small> items</small></strong></button>
      <button className="stock-stat" onClick={() => { setView("stock"); setFilter("low"); }}><span>RUNNING LOW</span><strong className={low.length ? "stock-amber" : ""}>{low.length}<small> to check</small></strong></button>
      <button className="stock-stat" onClick={() => { setView("stock"); setFilter("expiry"); }}><span>USE SOON</span><strong className={expiring.length ? "stock-amber" : ""}>{expiring.length}<small> items</small></strong></button>
    </div>

    <div className="stock-toolbar">
      <div className="stock-segment" aria-label="Inventory view">
        <button aria-pressed={view === "stock"} onClick={() => setView("stock")}>My inventory</button>
        <button aria-pressed={view === "shopping"} onClick={() => setView("shopping")}><BasketIcon />Shopping list <span>{list.length}</span></button>
      </div>
      <button className="btn" onClick={() => edit({ ...fresh(), onList: view === "shopping" })}>+ {view === "shopping" ? "Add to list" : "Add item"}</button>
    </div>

    <div className="stock-filters">
      <label className="stock-search"><span className="sr-only">Search inventory</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find something in your home…" /></label>
      <label><span className="sr-only">Category</span><select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>
    </div>

    {view === "stock" && stock.length > 0 && <div className="stock-filter-chips">
      {([['all', 'Everything'], ['low', 'Running low'], ['expiry', 'Use soon']] as const).map(([value, label]) => <button key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>}

    {low.some((item) => !item.onList) && <div className="stock-low-banner"><div><strong>{low.filter((item) => !item.onList).length} low-stock {low.filter((item) => !item.onList).length === 1 ? "item" : "items"}</strong><p>Add what you need before your next shop.</p></div><button disabled={busy} className="btn ghost small" onClick={() => void commit(stock.map((item) => lowStock(item) ? { ...item, onList: true } : item), "Low-stock items added to your list")}>Add to shopping list</button></div>}

    {view === "shopping" && list.length > 0 && <p className="stock-explainer">Mark a purchase as bought to fill that item to its restock target. Update the new expiry date in its details.</p>}

    <div className="stock-grid">
      {visible.map((item) => {
        const expires = expiryStatus(item, today);
        const soon = expiringStock(item, today);
        const expired = (expiryDays(item, today) ?? 1) < 0 && item.quantity > 0;
        return <article className={`stock-card${lowStock(item) ? " is-low" : ""}`} key={item.id}>
          <div className="stock-card-top"><span className="stock-category">{item.category}</span><button className="stock-edit" aria-label={`Edit ${item.name}`} onClick={() => edit(item)}>Edit ↗</button></div>
          <h3>{item.name}</h3>
          <div className="stock-quantity"><strong>{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong><span>{item.unit}</span><span className={`stock-badge${lowStock(item) ? " warning" : ""}`}>{item.quantity === 0 ? "Out of stock" : lowStock(item) ? "Running low" : "In stock"}</span></div>
          <div className="stock-level" role="img" aria-label={`${item.quantity} of ${item.targetQuantity} ${item.unit} target`}><i style={{ width: `${Math.min(100, item.quantity / item.targetQuantity * 100)}%` }} /></div>
          <p className="stock-target">Low at {item.minQuantity} · Restock to {item.targetQuantity} {item.unit}</p>
          {expires && <p className={`stock-expiry${soon ? " soon" : ""}${expired ? " expired" : ""}`}>{soon ? "◷ " : ""}{expires}</p>}
          {item.note && <p className="stock-item-note">{item.note}</p>}
          <div className="stock-card-actions">
            {view === "shopping" ? <><button className="btn small" disabled={busy} onClick={() => void update(purchaseStock(item), `${item.name} restocked to ${Math.max(item.quantity, item.targetQuantity)} ${item.unit}`)}>✓ Bought</button><button className="stock-text-button" disabled={busy} onClick={() => void update({ ...item, onList: false }, "Removed from shopping list")}>Remove</button></> : <>
              <div className="stock-stepper"><button disabled={busy || item.quantity === 0} aria-label={`Use 1 ${item.unit} of ${item.name}`} onClick={() => void update(adjustStock(item, -1), `${item.name} quantity updated`)}>−</button><span>Quantity</span><button disabled={busy} aria-label={`Add 1 ${item.unit} of ${item.name}`} onClick={() => void update(adjustStock(item, 1), `${item.name} quantity updated`)}>+</button></div>
              <button className={`stock-list-button${item.onList ? " queued" : ""}`} disabled={busy} onClick={() => void update({ ...item, onList: !item.onList }, item.onList ? "Removed from shopping list" : "Added to shopping list")} aria-label={`${item.onList ? "Remove" : "Add"} ${item.name} ${item.onList ? "from" : "to"} shopping list`}><BasketIcon />{item.onList ? "On list ✓" : "Add to list"}</button>
            </>}
          </div>
        </article>;
      })}
    </div>

    {!visible.length && <div className="stock-empty"><div className="stock-empty-icon"><BasketIcon /></div><h3>{stock.length === 0 ? "A place for everything you have." : view === "shopping" && !list.length ? "Your shopping list is clear." : "Nothing here right now."}</h3><p>{stock.length === 0 ? "Start with a few essentials. Track what’s left, what’s running low, and what needs using soon." : query || category !== "all" ? "Try another search or category." : view === "shopping" ? "Add an item or send low-stock essentials to your list." : "Your inventory is looking good. Choose Everything to see your shelves."}</p>
      {stock.length === 0 && <><button className="btn" onClick={() => edit({ ...fresh(), onList: view === "shopping" })}>+ Add your first item</button><div className="stock-starters"><span>Or start with</span>{STARTERS.map((item) => <button className="chip" key={item.name} onClick={() => edit({ ...fresh(), ...item, onList: view === "shopping" })}>{item.name} +</button>)}</div></>}
    </div>}

    {draft && <div className="sheet stock-sheet" onClick={() => { if (!busy) setDraft(null); }}><form ref={panelRef} className="panel" role="dialog" aria-modal="true" aria-labelledby="stock-form-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
      <div className="stock-form-heading"><div><span className="stock-category">KNOW YOUR SHELVES</span><h3 id="stock-form-title">{stock.some((item) => item.id === draft.id) ? "Edit inventory item" : "Add an inventory item"}</h3></div><button type="button" className="stock-close" aria-label="Close inventory form" disabled={busy} onClick={() => setDraft(null)}>×</button></div>
      <div className="field"><label htmlFor="stock-name">Item name</label><input id="stock-name" required maxLength={120} value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="e.g. Basmati rice" /></div>
      <div className="two"><div className="field"><label htmlFor="stock-category">Category</label><input id="stock-category" list="stock-category-options" value={draft.category} onChange={(event) => setField("category", event.target.value)} /><datalist id="stock-category-options">{categories.map((name) => <option key={name} value={name} />)}</datalist></div><div className="field"><label htmlFor="stock-unit">Unit</label><input id="stock-unit" required list="stock-unit-options" value={draft.unit} onChange={(event) => setField("unit", event.target.value)} placeholder="kg, L, pieces, packs" /><datalist id="stock-unit-options">{["kg", "g", "L", "ml", "pieces", "packs", "bottles", "rolls"].map((unit) => <option key={unit} value={unit} />)}</datalist></div></div>
      <div className="field"><label htmlFor="stock-quantity">How much do you have now?</label><input id="stock-quantity" type="number" min="0" step="any" required value={draft.quantity} onChange={(event) => setField("quantity", Number(event.target.value))} /></div>
      <div className="two"><div className="field"><label htmlFor="stock-min">Warn when at or below</label><input id="stock-min" type="number" min="0" step="any" required value={draft.minQuantity} onChange={(event) => setField("minQuantity", Number(event.target.value))} /></div><div className="field"><label htmlFor="stock-target">Restock target</label><input id="stock-target" type="number" min="0.001" step="any" required value={draft.targetQuantity} onChange={(event) => setField("targetQuantity", Number(event.target.value))} /></div></div>
      <p className="hint">For example: warn at 1 kg and refill to 5 kg. Shopping purchases use your restock target.</p>
      <div className="field"><label htmlFor="stock-expiry">Expiry date · optional</label><input id="stock-expiry" type="date" value={draft.expiryDate ?? ""} onChange={(event) => setField("expiryDate", event.target.value || undefined)} /></div>
      <div className="field"><label htmlFor="stock-note">Note · optional</label><textarea id="stock-note" value={draft.note ?? ""} onChange={(event) => setField("note", event.target.value)} placeholder="Brand, storage location, size…" /></div>
      <label className="stock-check"><input type="checkbox" checked={draft.onList} onChange={(event) => setField("onList", event.target.checked)} /><span>Add to my shopping list</span></label>
      {error && <p className="stock-error" role="alert">{error}</p>}
      <div className="btn-row"><button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save item"}</button><button className="btn ghost" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
      {stock.some((item) => item.id === draft.id) && <button className="stock-delete" type="button" disabled={busy} onClick={() => { if (!confirmDelete) setConfirmDelete(true); else void commit(stock.filter((item) => item.id !== draft.id), "Inventory item deleted").then((saved) => { if (saved) setDraft(null); }); }}>{confirmDelete ? "Confirm delete item" : "Delete this item"}</button>}
    </form></div>}
  </div>;
}
