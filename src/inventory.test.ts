import { describe, expect, it } from "vitest";
import { adjustStock, expiringStock, expiryDays, lowStock, purchaseStock, shoppingItems, validateStock, type StockItem } from "./inventory";

const stock = (extra: Partial<StockItem> = {}): StockItem => ({ id: "rice", name: "Rice", category: "Pantry", quantity: 2, unit: "kg", minQuantity: 1, targetQuantity: 5, onList: false, ...extra });

describe("household inventory", () => {
  it("warns at the threshold but does not silently add a purchase", () => {
    const item = stock({ quantity: 1 });
    expect(lowStock(item)).toBe(true);
    expect(shoppingItems([item])).toEqual([]);
    expect(shoppingItems([{ ...item, onList: true }])).toHaveLength(1);
  });

  it("clamps consumption to zero and handles fractional units", () => {
    expect(adjustStock(stock({ quantity: 0.25 }), -1).quantity).toBe(0);
    expect(adjustStock(stock({ quantity: 0.1 }), 0.2).quantity).toBe(0.3);
    expect(adjustStock(stock(), Number.NaN).quantity).toBe(2);
  });

  it("restocks to the target, clears the list and requires a fresh expiry", () => {
    const bought = purchaseStock(stock({ quantity: 0, onList: true, expiryDate: "2026-11-01" }));
    expect(bought.quantity).toBe(5);
    expect(bought.onList).toBe(false);
    expect(bought.expiryDate).toBeUndefined();
    expect(purchaseStock(stock({ quantity: 7 })).quantity).toBe(7);
  });

  it("finds expired and soon expiring goods across month and year boundaries", () => {
    expect(expiryDays(stock({ expiryDate: "2027-01-02" }), "2026-12-30")).toBe(3);
    expect(expiringStock(stock({ expiryDate: "2026-11-01" }), "2026-11-02")).toBe(true);
    expect(expiringStock(stock({ quantity: 0, expiryDate: "2026-11-01" }), "2026-11-02")).toBe(false);
    expect(expiringStock(stock({ expiryDate: "2026-11-06" }), "2026-11-02")).toBe(false);
  });

  it("rejects corrupt backups and duplicate IDs", () => {
    expect(validateStock([stock(), stock(), stock({ id: "bad", quantity: -1 }), stock({ id: "date", expiryDate: "2026-02-31" }), stock({ id: "target", targetQuantity: 1 }), { name: "Milk" }])).toEqual([stock()]);
    expect(validateStock(null)).toEqual([]);
  });
});
