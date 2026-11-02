import { useEffect, useRef, useState } from "react";
import { houseDay, uid } from "../core";
import { copyPreviousMealWeek, mealIngredients, MEAL_SLOTS, shiftMealDate, type MealPlan, type MealSlot } from "../meals";
import "../meals.css";

interface Props {
  meals: MealPlan[];
  now: Date;
  onChange: (next: MealPlan[]) => Promise<void> | void;
  onAddToShopping: (names: string[]) => Promise<void> | void;
  toast: (message: string) => void;
}

function monday(day: string) {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return shiftMealDate(day, -(weekday === 0 ? 6 : weekday - 1));
}

const slotNames: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

export function Meals({ meals, now, onChange, onAddToShopping, toast }: Props) {
  const today = houseDay(now);
  const [weekStart, setWeekStart] = useState(() => monday(today));
  const [draft, setDraft] = useState<MealPlan | null>(null);
  const [ingredientText, setIngredientText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef(() => {});
  closeRef.current = () => { if (!pending) { setDraft(null); setError(""); } };

  useEffect(() => {
    if (!draft) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      if (!controls?.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [draft?.id]);

  const days = Array.from({ length: 7 }, (_, i) => shiftMealDate(weekStart, i));
  const weekMeals = meals.filter((meal) => meal.date >= weekStart && meal.date <= days[6]);
  const ingredients = mealIngredients(weekMeals);

  const commit = async (next: MealPlan[], message: string) => {
    setPending(true);
    setError("");
    try {
      await onChange(next);
      setDraft(null);
      toast(message);
    } catch {
      setError("Your changes could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const open = (date: string, slot: MealSlot) => {
    const existing = meals.find((meal) => meal.date === date && meal.slot === slot);
    setDraft(existing ? { ...existing, ingredients: [...existing.ingredients] } : { id: uid(), date, slot, name: "", ingredients: [] });
    setIngredientText(existing?.ingredients.join("\n") ?? "");
    setError("");
  };

  const shop = async () => {
    if (!ingredients.length) return;
    setPending(true);
    setError("");
    try {
      await onAddToShopping(ingredients);
      toast("Ingredients added to your shopping list");
    } catch {
      setError("Ingredients could not be added. Please try again.");
    } finally { setPending(false); }
  };

  return (
    <div className="meals-view">
      <div className="meals-intro">
        <div><p className="meals-eyebrow">One less daily decision</p><h2>What’s cooking?</h2><p>Plan a few meals. Shop once. Make room for leftovers.</p></div>
        <button className="btn" onClick={() => open(today >= weekStart && today <= shiftMealDate(weekStart, 6) ? today : weekStart, "dinner")} disabled={pending}>+ Plan a meal</button>
      </div>

      <div className="meals-toolbar">
        <div className="meals-week-control">
          <button className="btn ghost small" aria-label="Previous meal week" onClick={() => setWeekStart(shiftMealDate(weekStart, -7))}>←</button>
          <strong>{new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {new Date(`${days[6]}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
          <button className="btn ghost small" aria-label="Next meal week" onClick={() => setWeekStart(shiftMealDate(weekStart, 7))}>→</button>
          <button className="chip" onClick={() => setWeekStart(monday(today))}>This week</button>
        </div>
        <button className="btn ghost small" disabled={pending} onClick={() => {
          const next = copyPreviousMealWeek(meals, weekStart, uid);
          if (next.length === meals.length) { toast("No meals to copy into empty slots from last week"); return; }
          void commit(next, `${next.length - meals.length} meals copied into empty slots`);
        }}>Copy last week</button>
      </div>

      <div className="meals-overview">
        <span><strong>{weekMeals.length}</strong> of 21 meals planned</span>
        <span>Empty slots are yours to leave open.</span>
      </div>
      {error && !draft && <p className="meals-error" role="alert">{error}</p>}

      <div className="meals-grid">
        {days.map((day) => (
          <section className={`meal-day${day === today ? " meal-day-today" : ""}`} key={day}>
            <div className="meal-day-head"><h3>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}</h3><span>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}{day === today ? " · Today" : ""}</span></div>
            {MEAL_SLOTS.map((slot) => {
              const meal = weekMeals.find((entry) => entry.date === day && entry.slot === slot);
              return <button className={`meal-slot${meal ? " meal-slot-filled" : ""}`} key={slot} disabled={pending} onClick={() => open(day, slot)} aria-label={`${meal ? "Edit" : "Plan"} ${slot} for ${day}${meal ? `: ${meal.name}` : ""}`}>
                <span className="meal-slot-label">{slotNames[slot]}</span>
                <span className="meal-slot-name">{meal?.name ?? "+ Add a meal"}</span>
                {meal?.note && <span className="meal-slot-note">{meal.note}</span>}
                {meal && meal.ingredients.length > 0 && <span className="meal-slot-count">{meal.ingredients.length} ingredient{meal.ingredients.length === 1 ? "" : "s"}</span>}
              </button>;
            })}
          </section>
        ))}
      </div>

      <section className="meal-shopping">
        <div><p className="meals-eyebrow">From the plan to the pantry</p><h3>Your week’s ingredients</h3><p>{ingredients.length ? `${ingredients.length} ingredients across your planned meals. Check what you already have before buying.` : "Add ingredients to a meal and build your shopping list here."}</p></div>
        {ingredients.length > 0 && <><div className="meal-ingredient-tags">{ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div><button className="btn" onClick={() => void shop()} disabled={pending}>{pending ? "Adding…" : "Add ingredients to shopping"}</button></>}
      </section>

      {draft && <div className="sheet" onClick={() => closeRef.current()}><form ref={dialogRef} tabIndex={-1} className="panel meal-editor" role="dialog" aria-modal="true" aria-labelledby="meal-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim() || pending) return;
        const updated = { ...draft, name: draft.name.trim(), ingredients: mealIngredients([{ ...draft, ingredients: ingredientText.split(/[\n,]/) }]), note: draft.note?.trim() || undefined };
        void commit([...meals.filter((meal) => meal.id !== draft.id && !(meal.date === draft.date && meal.slot === draft.slot)), updated], "Meal plan saved");
      }}>
        <div className="meal-editor-head"><h3 id="meal-dialog-title">{meals.some((meal) => meal.id === draft.id) ? "Edit meal" : "Plan a meal"}</h3><button type="button" className="btn ghost small" aria-label="Close meal editor" disabled={pending} onClick={() => closeRef.current()}>×</button></div>
        <div className="two"><div className="field"><label htmlFor="meal-date">Date</label><input id="meal-date" type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></div><div className="field"><label htmlFor="meal-slot">Meal</label><select id="meal-slot" value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: event.target.value as MealSlot })}>{MEAL_SLOTS.map((slot) => <option key={slot} value={slot}>{slotNames[slot]}</option>)}</select></div></div>
        <div className="field"><label htmlFor="meal-name">What are you making?</label><input id="meal-name" ref={nameRef} required maxLength={160} value={draft.name} placeholder="Dal, rice and a quick salad" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
        <div className="field"><label htmlFor="meal-ingredients">Ingredients to check</label><textarea id="meal-ingredients" value={ingredientText} placeholder={"Rice\nToor dal\nTomatoes"} onChange={(event) => setIngredientText(event.target.value)} /><p className="hint">One ingredient per line, or separate with commas. Add quantities in Inventory.</p></div>
        <div className="field"><label htmlFor="meal-note">Prep note (optional)</label><textarea id="meal-note" value={draft.note ?? ""} placeholder="Soak the dal before leaving for work" onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></div>
        {meals.some((meal) => meal.id !== draft.id && meal.date === draft.date && meal.slot === draft.slot) && <p className="hint">This will replace the meal already planned for that slot.</p>}
        {error && <p className="meals-error" role="alert">{error}</p>}
        <div className="btn-row"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save meal"}</button><button className="btn ghost" type="button" disabled={pending} onClick={() => closeRef.current()}>Cancel</button></div>
        {meals.some((meal) => meal.id === draft.id) && <button className="btn danger small" type="button" disabled={pending} onClick={() => void commit(meals.filter((meal) => meal.id !== draft.id), "Meal removed")}>Remove meal</button>}
      </form></div>}
    </div>
  );
}
