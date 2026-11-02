import "fake-indexeddb/auto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "./core";
import { DEFAULT_SETTINGS } from "./planner";

let store: typeof import("./db");
const item = (extra: Partial<Item> = {}): Item => ({
  id: "chore", name: "Sweep", kind: "chore", intervalDays: 2, dayScope: "any", active: true,
  created: "2026-11-02T10:00:00.000Z", ...extra,
});
const stock = { id: "rice", name: "Rice", category: "Pantry", quantity: 2, unit: "kg", minQuantity: 1, targetQuantity: 5, onList: false };
const meal = { id: "meal", date: "2026-11-02", slot: "dinner", name: "Rice", ingredients: ["Rice"] };
const contact = { id: "person", name: "Plumber", category: "Maintenance", phone: "1234567890", note: "Call first" };
const backup = (items: unknown[] = [item()]) => ({ app: "houseos", version: 2, exportedAt: "2026-11-02T12:00:00Z", items, events: [] });

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  store = await import("./db");
});

describe("household backups", () => {
  it("round-trips tasks, history, inventory, meals, contacts and settings", async () => {
    await store.putItem(item());
    await store.complete(item(), new Date("2026-11-02T14:00:00Z"));
    await store.setMeta("inventory", [stock]);
    await store.setMeta("meals", [meal]);
    await store.setMeta("contacts", [contact]);
    await store.setMeta("householdSettings", { ...DEFAULT_SETTINGS, homeName: "My apartment" });
    await store.setMeta("lastBackup", "private bookkeeping");
    const saved = await store.exportBackup();
    expect(saved.version).toBe(2);
    expect(saved.metadata).toEqual({ inventory: [stock], meals: [meal], contacts: [contact], householdSettings: { ...DEFAULT_SETTINGS, homeName: "My apartment" } });
    expect(JSON.stringify(saved)).not.toContain("private bookkeeping");
    await store.setMeta("inventory", []);
    await store.removeItem("chore");
    const restored = await store.importBackup(JSON.parse(JSON.stringify(saved)));
    expect(restored).toEqual({ items: 1, events: 1, skipped: 0 });
    expect(await store.getMeta("inventory")).toEqual([stock]);
    expect((await store.allItems())[0].lastDone).toBe("2026-11-02T14:00:00.000Z");
    expect((await store.allEvents())[0].itemId).toBe("chore");
  });

  it("restores a v1 backup without deleting data from the new modules", async () => {
    await store.setMeta("inventory", [stock]);
    await store.setMeta("meals", [meal]);
    await store.importBackup({ ...backup(), version: 1 });
    expect(await store.getMeta("inventory")).toEqual([stock]);
    expect(await store.getMeta("meals")).toEqual([meal]);
    expect(await store.allItems()).toEqual([item()]);
  });

  it("skips malformed, duplicate and orphaned records with an accurate count", async () => {
    const event = { id: "event", itemId: "chore", doneAt: "2026-11-02T14:00:00Z" };
    const result = await store.importBackup({
      ...backup([item(), item(), { ...item(), id: "broken", group: {} }]),
      events: [event, { ...event }, { ...event, id: "orphan", itemId: "missing" }],
      metadata: { inventory: [stock, { ...stock }, { ...stock, id: "broken-stock", quantity: -1 }] },
    });
    expect(result).toEqual({ items: 1, events: 1, skipped: 6 });
    expect(await store.getMeta("inventory")).toEqual([stock]);
  });

  it("rejects future versions and fully corrupted modules before changing live records", async () => {
    await store.putItem(item({ name: "Keep me" }));
    await store.setMeta("inventory", [stock]);
    await expect(store.importBackup({ ...backup(), version: 99 })).rejects.toThrow("version");
    await expect(store.importBackup(backup([{ ...item(), timeAnchor: "broken" }]))).rejects.toThrow("no usable");
    await expect(store.importBackup({ ...backup(), metadata: { inventory: [{ quantity: -1 }] } })).rejects.toThrow("no usable");
    await expect(store.importBackup({ ...backup(), metadata: { householdSettings: { ...DEFAULT_SETTINGS, sleepTime: 10 } } })).rejects.toThrow("settings");
    expect((await store.allItems())[0].name).toBe("Keep me");
    expect(await store.getMeta("inventory")).toEqual([stock]);
  });

  it("rolls back every store when an import encounters a write failure", async () => {
    await store.putItem(item({ name: "Original" }));
    await store.setMeta("inventory", [stock]);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "meta" && key === "inventory") throw new DOMException("Simulated storage failure", "DataCloneError");
      return put.call(this, value, key);
    });
    await expect(store.importBackup({ ...backup([item({ name: "Replacement" })]), metadata: { inventory: [] } })).rejects.toThrow("Simulated storage failure");
    expect((await store.allItems())[0].name).toBe("Original");
    expect(await store.getMeta("inventory")).toEqual([stock]);
  });

  it("exports a coherent snapshot while a completion updates task and history together", async () => {
    await store.putItem(item());
    const pendingSnapshot = store.exportBackup();
    const pendingCompletion = store.complete(item(), new Date("2026-11-02T14:00:00Z"));
    const saved = await pendingSnapshot;
    await pendingCompletion;
    const latestEvent = saved.events.sort((a, b) => Date.parse(a.doneAt) - Date.parse(b.doneAt)).at(-1);
    // The file may contain the old or new state, but it must never mix them.
    expect(saved.items[0].lastDone).toBe(latestEvent?.doneAt);
  });
});

describe("initialization and completion transactions", () => {
  it("initializes a new device with zero tasks, history, or household records", async () => {
    await Promise.all([store.initializeHome(), store.initializeHome()]);
    expect(await store.allItems()).toEqual([]);
    expect(await store.allEvents()).toEqual([]);
    expect(await store.getMeta("initialized")).toBe(true);
    for (const key of ["inventory", "meals", "contacts", "householdSettings"]) {
      expect(await store.getMeta(key)).toBeUndefined();
    }
  });

  it("preserves existing household records when initializing an upgraded device", async () => {
    await store.putItem(item());
    await store.setMeta("inventory", [stock]);
    await store.setMeta("householdSettings", DEFAULT_SETTINGS);
    await store.initializeHome();
    expect(await store.allItems()).toEqual([item()]);
    expect(await store.getMeta("inventory")).toEqual([stock]);
    expect(await store.getMeta("householdSettings")).toEqual(DEFAULT_SETTINGS);
  });

  it("clears all household data and metadata on reset and stays empty after reload", async () => {
    await store.complete(item(), new Date("2026-11-02T14:00:00Z"));
    await store.setMeta("inventory", [stock]);
    await store.setMeta("meals", [meal]);
    await store.setMeta("contacts", [contact]);
    await store.setMeta("householdSettings", DEFAULT_SETTINGS);
    await store.setMeta("lastBackup", "2026-11-02T12:00:00Z");
    await store.setMeta("otherLocalMetadata", { arbitrary: true });
    await store.resetHome();
    await store.initializeHome();
    vi.resetModules();
    const reloaded = await import("./db");
    await reloaded.initializeHome();
    expect(await reloaded.allItems()).toEqual([]);
    expect(await reloaded.allEvents()).toEqual([]);
    for (const key of ["inventory", "meals", "contacts", "householdSettings", "lastBackup", "otherLocalMetadata"]) {
      expect(await reloaded.getMeta(key)).toBeUndefined();
    }
    expect(await reloaded.getMeta("initialized")).toBe(true);
    // Even the old optional seed helper must not repopulate a reset home.
    await reloaded.seedIfEmpty([item()]);
    expect(await reloaded.allItems()).toEqual([]);
  });

  it("rolls back every record if clearing local metadata fails during reset", async () => {
    const completed = await store.complete(item(), new Date("2026-11-02T14:00:00Z"));
    await store.setMeta("inventory", [stock]);
    await store.setMeta("lastBackup", "2026-11-02T12:00:00Z");
    const clear = IDBObjectStore.prototype.clear;
    vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(function(this: IDBObjectStore) {
      if (this.name === "meta") throw new DOMException("Simulated reset failure", "UnknownError");
      return clear.call(this);
    });
    await expect(store.resetHome()).rejects.toThrow("Simulated reset failure");
    expect(await store.allItems()).toEqual([completed]);
    expect(await store.eventsForItem("chore")).toHaveLength(1);
    expect(await store.getMeta("inventory")).toEqual([stock]);
    expect(await store.getMeta("lastBackup")).toBe("2026-11-02T12:00:00Z");
  });

  it("seeds once under concurrent mounts and preserves an intentionally empty home", async () => {
    await Promise.all([store.seedIfEmpty([item()]), store.seedIfEmpty([item({ id: "duplicate" })])]);
    expect(await store.allItems()).toHaveLength(1);
    await store.removeItem("chore");
    await store.seedIfEmpty([item()]);
    expect(await store.allItems()).toEqual([]);
  });

  it("does not reseed an empty restored backup", async () => {
    await store.importBackup({ ...backup([]), metadata: { inventory: [], meals: [], contacts: [], householdSettings: DEFAULT_SETTINGS } });
    await store.seedIfEmpty([item()]);
    expect(await store.allItems()).toEqual([]);
  });

  it("preserves existing v1 records when first setting the initialization flag", async () => {
    await store.putItem(item({ name: "Existing household" }));
    await store.seedIfEmpty([item({ id: "seed" })]);
    expect(await store.allItems()).toEqual([item({ name: "Existing household" })]);
    expect(await store.getMeta("initialized")).toBe(true);
  });

  it("undoes the latest completion and restores the prior timestamp without overwriting newer edits", async () => {
    const first = await store.complete(item(), new Date("2026-11-01T14:00:00Z"));
    const second = await store.complete(first, new Date("2026-11-02T14:00:00Z"));
    await store.putItem({ ...second, name: "Renamed chore" });
    const undone = await store.uncomplete(second);
    expect(undone.name).toBe("Renamed chore");
    expect(undone.lastDone).toBe(first.lastDone);
    expect(await store.eventsForItem("chore")).toHaveLength(1);
  });

  it("does not leave a task completed if writing its history fails", async () => {
    await store.putItem(item());
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "events") throw new DOMException("No space left", "QuotaExceededError");
      return put.call(this, value, key);
    });
    await expect(store.complete(item())).rejects.toThrow("No space left");
    expect((await store.allItems())[0].lastDone).toBeUndefined();
    expect(await store.allEvents()).toEqual([]);
  });

  it("undoes a one-off completion after conversion from a recurring task while retaining older history", async () => {
    const recurring = await store.complete(item(), new Date("2026-11-01T14:00:00Z"));
    const oneOff: Item = { ...recurring, scheduleMode: "once", scheduledDate: "2026-11-02", lastDone: undefined };
    await store.putItem(oneOff);
    const completed = await store.complete(oneOff, new Date("2026-11-02T14:00:00Z"));
    const undone = await store.uncomplete(completed);
    expect(undone.lastDone).toBeUndefined();
    expect((await store.allItems())[0].lastDone).toBeUndefined();
    expect(await store.eventsForItem("chore")).toEqual([expect.objectContaining({ doneAt: recurring.lastDone })]);
  });

  it("restores a removed history event when undo cannot update the task", async () => {
    const completed = await store.complete(item(), new Date("2026-11-02T14:00:00Z"));
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "items") throw new DOMException("No space left", "QuotaExceededError");
      return put.call(this, value, key);
    });
    await expect(store.uncomplete(completed)).rejects.toThrow("No space left");
    expect((await store.allItems())[0].lastDone).toBe(completed.lastDone);
    expect(await store.eventsForItem("chore")).toHaveLength(1);
  });
});
