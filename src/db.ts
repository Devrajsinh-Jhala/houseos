import { openDB, type IDBPDatabase } from "idb";
import { uid, type DoneEvent, type Item } from "./core";
import { validStockItem, type StockItem } from "./inventory";
import { validMeal, type MealPlan } from "./meals";
import { validHomeContact, type HomeContact } from "./homeGuide";
import { DEFAULT_SETTINGS, type HouseholdSettings } from "./planner";
import { validEvent, validItem, validSettings } from "./validation";

const NAME = "houseos";
const VERSION = 1;
const BACKUP_VERSION = 2;

let dbp: Promise<IDBPDatabase> | null = null;

async function rollback(tx: { abort: () => void; done: Promise<unknown> }, error: unknown): Promise<never> {
  // Synchronous failures (for example a value that cannot be cloned) do not
  // automatically abort IndexedDB. Explicitly abort before earlier writes commit.
  try { tx.abort(); } catch { /* A failed request may already have aborted it. */ }
  await tx.done.catch(() => {});
  throw error;
}

function db() {
  if (!dbp) {
    dbp = openDB(NAME, VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("items")) {
          d.createObjectStore("items", { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("events")) {
          const s = d.createObjectStore("events", { keyPath: "id" });
          s.createIndex("byItem", "itemId");
        }
        if (!d.objectStoreNames.contains("meta")) {
          d.createObjectStore("meta");
        }
      },
    });
  }
  return dbp;
}

export async function allItems(): Promise<Item[]> {
  return (await db()).getAll("items");
}

export async function putItem(item: Item): Promise<void> {
  await (await db()).put("items", item);
}

export async function removeItem(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  await tx.objectStore("items").delete(id);
  // Orphaned events would otherwise sit in the log forever and inflate backups.
  const keys = await tx.objectStore("events").index("byItem").getAllKeys(id);
  for (const k of keys) await tx.objectStore("events").delete(k);
  await tx.done;
}

export async function allEvents(): Promise<DoneEvent[]> {
  return (await db()).getAll("events");
}

/** The completion log for one item — the raw material for interval learning. */
export async function eventsForItem(itemId: string): Promise<DoneEvent[]> {
  return (await db()).getAllFromIndex("events", "byItem", itemId);
}

/** Mark done now. Returns the updated item so callers can patch state. */
export async function complete(item: Item, when: Date = new Date()): Promise<Item> {
  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  try {
    const current: Item = await tx.objectStore("items").get(item.id) ?? item;
    const updated = { ...current, lastDone: when.toISOString() };
    delete updated.snoozedUntil;
    await tx.objectStore("items").put(updated);
    await tx
      .objectStore("events")
      .put({ id: uid(), itemId: item.id, doneAt: updated.lastDone } as DoneEvent);
    await tx.done;
    return updated;
  } catch (error) { return rollback(tx, error); }
}

/**
 * Bulk "I already have these" for first-run setup. Writes real completion
 * events: today genuinely is the last time you know the shelf was full, and
 * it gives the interval learning its first data point.
 */
export async function completeMany(items: Item[], when: Date = new Date()): Promise<Item[]> {
  const stamp = when.toISOString();
  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  try {
    const updated: Item[] = [];
    const unique = new Map(items.map((item) => [item.id, item]));
    for (const item of unique.values()) {
      const current: Item = await tx.objectStore("items").get(item.id) ?? item;
      const next = { ...current, lastDone: stamp };
      delete next.snoozedUntil;
      await tx.objectStore("items").put(next);
      await tx.objectStore("events").put({ id: uid(), itemId: item.id, doneAt: stamp } as DoneEvent);
      updated.push(next);
    }
    await tx.done;
    return updated;
  } catch (error) { return rollback(tx, error); }
}

/** Undo the most recent completion of an item. */
export async function uncomplete(item: Item): Promise<Item> {
  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  try {
    const current: Item = await tx.objectStore("items").get(item.id) ?? item;
    const events: DoneEvent[] = await tx.objectStore("events").index("byItem").getAll(item.id);
    events.sort((a, b) => Date.parse(a.doneAt) - Date.parse(b.doneAt));
    const last = events.pop();
    if (last) await tx.objectStore("events").delete(last.id);
    // Earlier recurring completions remain useful history after conversion,
    // but they must not make a one-off task stay completed after undo.
    const prev = current.scheduleMode === "once" ? undefined : events.at(-1)?.doneAt;
    const updated = { ...current, lastDone: prev };
    await tx.objectStore("items").put(updated);
    await tx.done;
    return updated;
  } catch (error) { return rollback(tx, error); }
}

/** Push an item out to a given day without pretending it was done. */
export async function snooze(item: Item, until: string): Promise<Item> {
  const updated = { ...item, snoozedUntil: until };
  await (await db()).put("items", updated);
  return updated;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

export interface Backup {
  app: "houseos";
  version: number;
  exportedAt: string;
  items: Item[];
  events: DoneEvent[];
  metadata?: BackupMetadata;
}

export interface BackupMetadata {
  inventory?: StockItem[];
  meals?: MealPlan[];
  contacts?: HomeContact[];
  householdSettings?: HouseholdSettings;
}

export async function exportBackup(): Promise<Backup> {
  const d = await db();
  const tx = d.transaction(["items", "events", "meta"], "readonly");
  const [items, events, inventory, meals, contacts, settings] = await Promise.all([
    tx.objectStore("items").getAll(), tx.objectStore("events").getAll(),
    tx.objectStore("meta").get("inventory"), tx.objectStore("meta").get("meals"),
    tx.objectStore("meta").get("contacts"), tx.objectStore("meta").get("householdSettings"),
  ]);
  await tx.done;
  return {
    app: "houseos", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), items, events,
    metadata: { inventory: inventory ?? [], meals: meals ?? [], contacts: contacts ?? [], householdSettings: settings ?? { ...DEFAULT_SETTINGS } },
  };
}

export interface ImportResult {
  items: number;
  events: number;
  /** Records that failed validation and were left out. */
  skipped: number;
}

export async function importBackup(raw: unknown): Promise<ImportResult> {
  const data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || data.app !== "houseos" || !Array.isArray(data.items)) {
    throw new Error("That file isn't a HouseOS backup.");
  }
  if (data.version !== 1 && data.version !== BACKUP_VERSION) {
    throw new Error("This backup version isn't supported. Update HouseOS before restoring it.");
  }
  if (!Array.isArray(data.events)) throw new Error("This backup has an invalid completion history.");

  let skipped = 0;
  function validated<T extends { id: string }>(input: unknown[], check: (value: unknown) => value is T, label: string, identity?: (value: T) => string): T[] {
    const ids = new Set<string>();
    const identities = new Set<string>();
    const result = input.filter((value): value is T => {
      if (!check(value) || ids.has(value.id) || (identity && identities.has(identity(value)))) { skipped++; return false; }
      ids.add(value.id);
      if (identity) identities.add(identity(value));
      return true;
    });
    if (input.length && !result.length) throw new Error(`This backup has no usable ${label}. Your current data has not been changed.`);
    return result;
  }

  const items = validated(data.items, validItem, "household tasks");
  const rawEvents = data.events;
  const ids = new Set(items.map((i) => i.id));
  const seenEvents = new Set<string>();
  const events = rawEvents.filter((event): event is DoneEvent => {
    if (!validEvent(event) || !ids.has(event.itemId) || seenEvents.has(event.id)) { skipped++; return false; }
    seenEvents.add(event.id);
    return true;
  });
  const metadata: BackupMetadata = {};
  if (data.metadata !== undefined) {
    if (!data.metadata || typeof data.metadata !== "object" || Array.isArray(data.metadata)) throw new Error("This backup has invalid household data.");
    const meta = data.metadata as Record<string, unknown>;
    for (const key of ["inventory", "meals", "contacts"] as const) {
      if (meta[key] !== undefined && !Array.isArray(meta[key])) throw new Error(`This backup has invalid ${key}.`);
    }
    if (Array.isArray(meta.inventory)) metadata.inventory = validated(meta.inventory, validStockItem, "inventory records");
    if (Array.isArray(meta.meals)) metadata.meals = validated(meta.meals, validMeal, "meal plans", (meal) => `${meal.date}:${meal.slot}`);
    if (Array.isArray(meta.contacts)) metadata.contacts = validated(meta.contacts, validHomeContact, "home records");
    if (meta.householdSettings !== undefined) {
      if (!validSettings(meta.householdSettings)) throw new Error("This backup has invalid home settings.");
      metadata.householdSettings = meta.householdSettings;
    }
  }

  const d = await db();
  const tx = d.transaction(["items", "events", "meta"], "readwrite");
  try {
    await tx.objectStore("items").clear();
    await tx.objectStore("events").clear();
    for (const i of items) await tx.objectStore("items").put(i);
    for (const e of events) await tx.objectStore("events").put(e);
    for (const [key, value] of Object.entries(metadata)) await tx.objectStore("meta").put(value, key);
    await tx.objectStore("meta").put(true, "initialized");
    await tx.done;

    return { items: items.length, events: events.length, skipped };
  } catch (error) { return rollback(tx, error); }
}

export async function seedIfEmpty(seed: Item[]): Promise<void> {
  const d = await db();
  // Count and seed inside one readwrite transaction. StrictMode mounts the app
  // twice in dev; with a separate read first, both mounts saw an empty store
  // and both seeded, leaving every item in the house duplicated.
  const tx = d.transaction(["items", "meta"], "readwrite");
  if (!(await tx.objectStore("meta").get("initialized"))) {
    if ((await tx.objectStore("items").count()) === 0) {
      for (const i of seed) await tx.objectStore("items").put(i);
    }
    await tx.objectStore("meta").put(true, "initialized");
  }
  await tx.done;
}
