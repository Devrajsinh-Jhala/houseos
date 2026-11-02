import { describe, expect, it } from "vitest";
import { copyPreviousMealWeek, mealIngredients, validMeal, type MealPlan } from "./meals";
import { phoneLink, validHomeContact } from "./homeGuide";

const meal = (extra: Partial<MealPlan> = {}): MealPlan => ({
  id: "meal-1", date: "2026-10-26", slot: "dinner", name: "Dal and rice", ingredients: ["Rice", "Toor dal"], ...extra,
});

describe("meal planning across weeks", () => {
  it("copies across a month boundary without overwriting occupied slots or sharing ingredient arrays", () => {
    const previous = meal();
    const existing = meal({ id: "existing", date: "2026-11-02", name: "Leftovers" });
    const previousLunch = meal({ id: "old-lunch", slot: "lunch", date: "2026-10-30" });
    const out = copyPreviousMealWeek([previous, existing, previousLunch], "2026-11-02", () => "new-copy");
    expect(out).toHaveLength(4);
    expect(out.find((entry) => entry.date === "2026-11-02")?.name).toBe("Leftovers");
    expect(out.find((entry) => entry.id === "new-copy")).toMatchObject({ date: "2026-11-06", slot: "lunch" });
    out.find((entry) => entry.id === "new-copy")!.ingredients.push("Lemon");
    expect(previousLunch.ingredients).toEqual(["Rice", "Toor dal"]);
  });

  it("only includes the immediately preceding week", () => {
    const out = copyPreviousMealWeek([meal({ date: "2026-10-25" }), meal({ id: "current", date: "2026-11-02" })], "2026-11-02", () => "copy");
    expect(out).toHaveLength(2);
  });

  it("combines ingredients without empty or duplicate shopping entries", () => {
    expect(mealIngredients([meal({ ingredients: [" Rice ", "", "Toor   dal"] }), meal({ ingredients: ["rice", "toor dal", "Lemon"] })])).toEqual(["rice", "toor dal", "Lemon"]);
  });

  it("rejects invalid dates and malformed ingredient lists in backups", () => {
    expect(validMeal(meal())).toBe(true);
    expect(validMeal(meal({ date: "2026-02-30" }))).toBe(false);
    expect(validMeal({ ...meal(), ingredients: [null] })).toBe(false);
    expect(validMeal({ ...meal(), slot: "snack" })).toBe(false);
    expect(validMeal(meal({ name: "  " }))).toBe(false);
  });
});

describe("home handbook", () => {
  it("allows a home note without a phone number and validates record text", () => {
    const note = { id: "record", name: "Water valve", category: "Home records", phone: "", note: "Beside the meter" };
    expect(validHomeContact(note)).toBe(true);
    expect(validHomeContact({ ...note, note: {} })).toBe(false);
  });

  it("creates telephone links only from valid number strings", () => {
    expect(phoneLink("+91 98765-43210")).toBe("tel:+919876543210");
    expect(phoneLink("javascript:alert(1)")).toBe(null);
    expect(phoneLink("")).toBe(null);
  });
});
