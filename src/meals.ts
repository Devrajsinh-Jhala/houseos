export type MealSlot = "breakfast" | "lunch" | "dinner";

export interface MealPlan {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  ingredients: string[];
  note?: string;
}

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` === value;
}

export function validMeal(raw: unknown): raw is MealPlan {
  if (!raw || typeof raw !== "object") return false;
  const meal = raw as Record<string, unknown>;
  return typeof meal.id === "string" && meal.id.length > 0 &&
    validDate(meal.date) && MEAL_SLOTS.includes(meal.slot as MealSlot) &&
    typeof meal.name === "string" && meal.name.trim().length > 0 &&
    Array.isArray(meal.ingredients) && meal.ingredients.every((ingredient) => typeof ingredient === "string") &&
    (meal.note === undefined || typeof meal.note === "string");
}

/** One shopping entry per ingredient, preserving the user's display spelling. */
export function mealIngredients(meals: MealPlan[]): string[] {
  const ingredients = new Map<string, string>();
  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      const name = ingredient.trim().replace(/\s+/g, " ");
      if (name) ingredients.set(name.toLocaleLowerCase(), name);
    }
  }
  return [...ingredients.values()];
}

export function shiftMealDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

/** Copy only into empty slots; existing meal choices always win. */
export function copyPreviousMealWeek(meals: MealPlan[], weekStart: string, makeId: () => string): MealPlan[] {
  const previousStart = shiftMealDate(weekStart, -7);
  const occupied = new Set(meals.map((meal) => `${meal.date}:${meal.slot}`));
  const additions = meals
    .filter((meal) => meal.date >= previousStart && meal.date < weekStart)
    .map((meal) => ({ ...meal, id: makeId(), date: shiftMealDate(meal.date, 7), ingredients: [...meal.ingredients] }))
    .filter((meal) => !occupied.has(`${meal.date}:${meal.slot}`));
  return [...meals, ...additions];
}
