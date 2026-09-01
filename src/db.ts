import { openDB, type IDBPDatabase } from "idb";
import { uid, type DoneEvent, type Item } from "./core";

const NAME = "houseos";
const VERSION = 1;

let dbp: Promise<IDBPDatabase> | null = null;

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
  const updated = { ...item, lastDone: when.toISOString() };
  // Doing the thing ends any snooze on it.
  delete updated.snoozedUntil;
  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  await tx.objectStore("items").put(updated);
  await tx
    .objectStore("events")
    .put({ id: uid(), itemId: item.id, doneAt: updated.lastDone } as DoneEvent);
  await tx.done;
  return updated;
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
  const updated: Item[] = [];
  for (const item of items) {
    const next = { ...item, lastDone: stamp };
    delete next.snoozedUntil;
    await tx.objectStore("items").put(next);
    await tx.objectStore("events").put({ id: uid(), itemId: item.id, doneAt: stamp } as DoneEvent);
    updated.push(next);
  }
  await tx.done;
  return updated;
}

/** Undo the most recent completion of an item. */
export async function uncomplete(item: Item): Promise<Item> {
  const d = await db();
  const events: DoneEvent[] = await d.getAllFromIndex("events", "byItem", item.id);
  events.sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const last = events.pop();
  if (last) await d.delete("events", last.id);
  const prev = events.length ? events[events.length - 1].doneAt : undefined;
  const updated = { ...item, lastDone: prev };
  await d.put("items", updated);
  return updated;
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
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: "houseos",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    items: await allItems(),
    events: await allEvents(),
  };
}

const KINDS = new Set(["routine", "chore", "restock", "fixed"]);
const SCOPES = new Set(["any", "weekday", "weekend"]);

/**
 * A backup file is the one input this app takes from the outside world, and a
 * malformed one used to land straight in IndexedDB and crash the next render
 * with no way back. Anything that isn't a well-formed item is dropped.
 */
function validItem(raw: unknown): raw is Item {
  if (!raw || typeof raw !== "object") return false;
  const i = raw as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    i.id.length > 0 &&
    typeof i.name === "string" &&
    typeof i.kind === "string" &&
    KINDS.has(i.kind) &&
    typeof i.intervalDays === "number" &&
    Number.isFinite(i.intervalDays) &&
    typeof i.dayScope === "string" &&
    SCOPES.has(i.dayScope) &&
    typeof i.active === "boolean"
  );
}

function validEvent(raw: unknown): raw is DoneEvent {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.itemId === "string" &&
    typeof e.doneAt === "string" &&
    !Number.isNaN(Date.parse(e.doneAt))
  );
}

export interface ImportResult {
  items: number;
  events: number;
  /** Records that failed validation and were left out. */
  skipped: number;
}

export async function importBackup(raw: unknown): Promise<ImportResult> {
  const data = raw as Backup;
  if (!data || data.app !== "houseos" || !Array.isArray(data.items)) {
    throw new Error("That file isn't a HouseOS backup.");
  }

  const items = data.items.filter(validItem);
  const rawEvents = Array.isArray(data.events) ? data.events : [];
  const ids = new Set(items.map((i) => i.id));
  // Events pointing at items that didn't survive would skew nothing but bloat
  // every future backup, so they go too.
  const events = rawEvents.filter((e) => validEvent(e) && ids.has(e.itemId));
  const skipped = data.items.length - items.length + (rawEvents.length - events.length);

  if (!items.length) {
    throw new Error("That backup has no usable items in it.");
  }

  const d = await db();
  const tx = d.transaction(["items", "events"], "readwrite");
  await tx.objectStore("items").clear();
  await tx.objectStore("events").clear();
  for (const i of items) await tx.objectStore("items").put(i);
  for (const e of events) await tx.objectStore("events").put(e);
  await tx.done;

  return { items: items.length, events: events.length, skipped };
}

export async function seedIfEmpty(seed: Item[]): Promise<void> {
  const d = await db();
  // Count and seed inside one readwrite transaction. StrictMode mounts the app
  // twice in dev; with a separate read first, both mounts saw an empty store
  // and both seeded, leaving every item in the house duplicated.
  const tx = d.transaction("items", "readwrite");
  if ((await tx.store.count()) === 0) {
    for (const i of seed) await tx.store.put(i);
  }
  await tx.done;
}
