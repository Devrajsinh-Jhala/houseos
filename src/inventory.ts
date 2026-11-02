export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  targetQuantity: number;
  expiryDate?: string;
  note?: string;
  onList: boolean;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

export function validStockItem(raw: unknown): raw is StockItem {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as Record<string, unknown>;
  return typeof item.id === "string" && !!item.id.trim() &&
    typeof item.name === "string" && !!item.name.trim() &&
    typeof item.category === "string" && typeof item.unit === "string" && !!item.unit.trim() &&
    typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0 &&
    typeof item.minQuantity === "number" && Number.isFinite(item.minQuantity) && item.minQuantity >= 0 &&
    typeof item.targetQuantity === "number" && Number.isFinite(item.targetQuantity) && item.targetQuantity > item.minQuantity &&
    typeof item.onList === "boolean" &&
    (item.expiryDate === undefined || item.expiryDate === "" || validDate(item.expiryDate)) &&
    (item.note === undefined || typeof item.note === "string");
}

/** Invalid and duplicate records are excluded before a backup reaches the UI. */
export function validateStock(raw: unknown): StockItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter((entry): entry is StockItem => {
    if (!validStockItem(entry) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function lowStock(item: StockItem): boolean {
  return item.quantity <= item.minQuantity;
}

/** Date arithmetic uses calendar dates so daylight saving cannot shift a day. */
export function expiryDays(item: StockItem, today: string): number | null {
  if (!item.expiryDate || !validDate(item.expiryDate) || !validDate(today)) return null;
  const serial = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return Math.round((serial(item.expiryDate) - serial(today)) / 86_400_000);
}

export function expiringStock(item: StockItem, today: string): boolean {
  const days = expiryDays(item, today);
  return item.quantity > 0 && days !== null && days <= 3;
}

export function expiryStatus(item: StockItem, today: string): string | null {
  if (item.quantity <= 0) return null;
  const days = expiryDays(item, today);
  if (days === null) return null;
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 3) return `Expires in ${days} days`;
  return `Expires ${new Date(`${item.expiryDate}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** Only explicitly queued items are purchases; a low threshold is a suggestion. */
export function shoppingItems(stock: StockItem[]): StockItem[] {
  return stock.filter((item) => item.onList);
}

export function stockShoppingCount(stock: StockItem[]): number {
  return shoppingItems(stock).length;
}

export function adjustStock(item: StockItem, delta: number): StockItem {
  if (!Number.isFinite(delta)) return item;
  return { ...item, quantity: Math.max(0, Math.round((item.quantity + delta) * 1000) / 1000) };
}

/** A fresh purchase needs its own expiry date; never carry over an old date. */
export function purchaseStock(item: StockItem): StockItem {
  const updated = { ...item, quantity: Math.max(item.quantity, item.targetQuantity), onList: false };
  delete updated.expiryDate;
  return updated;
}
