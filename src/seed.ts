import { uid, type DayScope, type Item, type Kind } from "./core";

// Starting point, not gospel. Every interval here is a guess about someone
// else's household — edit them on the Manage screen as you learn your own.

function mk(
  kind: Kind,
  name: string,
  intervalDays: number,
  extra: Partial<Item> = {}
): Item {
  return {
    id: uid(),
    name,
    kind,
    intervalDays,
    dayScope: "any",
    active: true,
    created: new Date().toISOString(),
    ...extra,
  };
}

function routine(time: string, name: string, scope: DayScope, note?: string): Item {
  return mk("routine", name, 1, { timeAnchor: time, dayScope: scope, note });
}

export const SEED: Item[] = [
  // ---- Weekday routine -------------------------------------------------
  routine("06:45", "Wake up", "weekday"),
  routine("07:00", "Breakfast, and pack lunch", "weekday"),
  routine("07:50", "Morning dishes", "weekday"),
  routine("08:10", "Fill water bottles", "weekday"),
  routine("08:30", "Leave for office", "weekday"),
  routine("19:30", "Home — check what's due", "weekday", "Open Shopping and Chores"),
  routine("20:15", "Cook dinner", "weekday"),
  routine("21:15", "Kitchen reset — counter, sink, stove", "weekday"),
  routine("21:30", "Prep for tomorrow", "weekday", "Soak dal, thaw, chop if needed"),
  routine("22:30", "Trash out", "weekday", "Wet and dry, separated"),
  routine("23:15", "Sleep", "weekday"),

  // ---- Weekend routine -------------------------------------------------
  routine("08:30", "Wake up", "weekend"),
  routine("09:15", "Breakfast", "weekend"),
  routine("10:00", "Vegetable run", "weekend"),
  routine("11:30", "Laundry load", "weekend"),
  routine("13:00", "Cook for the day", "weekend"),
  routine("18:00", "Week's shopping list", "weekend", "Check Shopping before ordering"),
  routine("22:00", "Kitchen reset", "weekend"),

  // ---- Chores ----------------------------------------------------------
  mk("chore", "Sweep the floors", 2, { group: "Floors" }),
  mk("chore", "Mop the floors", 3, { group: "Floors" }),
  mk("chore", "Laundry", 4, { group: "Clothes" }),
  mk("chore", "Iron shirts for the week", 7, { group: "Clothes" }),
  mk("chore", "Change bedsheets and pillow covers", 14, { group: "Bedroom" }),
  mk("chore", "Clean the bathroom", 7, { group: "Bathroom" }),
  mk("chore", "Clear out the fridge", 21, { group: "Kitchen", note: "Throw the science experiments" }),
  mk("chore", "Deep clean stove and chimney filter", 21, { group: "Kitchen" }),
  mk("chore", "Descale the kettle", 60, { group: "Kitchen" }),
  mk("chore", "Wash curtains", 90, { group: "Bedroom" }),
  mk("chore", "Water the plants", 3, { group: "Other" }),
  mk("chore", "Wipe down the fan blades", 45, { group: "Other" }),

  // ---- Restock: daily / dairy -----------------------------------------
  mk("restock", "Milk", 1, { group: "Daily", note: "Nandini toned, 500ml" }),
  mk("restock", "Curd", 3, { group: "Daily" }),
  mk("restock", "Bread", 5, { group: "Daily" }),
  mk("restock", "Eggs", 7, { group: "Daily", note: "Half dozen" }),

  // ---- Restock: vegetables --------------------------------------------
  mk("restock", "Tomatoes", 4, { group: "Vegetables", note: "Firm, no soft patches, deep even red" }),
  mk("restock", "Onions", 10, { group: "Vegetables", note: "Dry papery skin, no green shoot, heavy for size" }),
  mk("restock", "Potatoes", 10, { group: "Vegetables", note: "No green tinge, no sprouting eyes" }),
  mk("restock", "Green chilli and ginger", 7, { group: "Vegetables" }),
  mk("restock", "Coriander and curry leaves", 5, { group: "Vegetables", note: "Stems should snap, not bend" }),
  mk("restock", "Whatever's in season", 4, { group: "Vegetables", note: "Cheapest pile is usually the freshest" }),
  mk("restock", "Lemons", 10, { group: "Vegetables" }),

  // ---- Restock: kirana -------------------------------------------------
  mk("restock", "Atta", 30, { group: "Kirana", note: "5kg" }),
  mk("restock", "Rice", 45, { group: "Kirana", note: "5kg sona masoori" }),
  mk("restock", "Toor dal", 40, { group: "Kirana", note: "1kg" }),
  mk("restock", "Moong or masoor dal", 45, { group: "Kirana" }),
  mk("restock", "Cooking oil", 35, { group: "Kirana", note: "1L" }),
  mk("restock", "Sugar", 60, { group: "Kirana" }),
  mk("restock", "Salt", 90, { group: "Kirana" }),
  mk("restock", "Tea or coffee", 30, { group: "Kirana" }),
  mk("restock", "Haldi, mirchi, jeera, dhaniya", 75, { group: "Kirana" }),
  mk("restock", "Mustard seeds and hing", 120, { group: "Kirana" }),
  mk("restock", "Ghee", 60, { group: "Kirana" }),

  // ---- Restock: household ---------------------------------------------
  mk("restock", "Dishwash liquid or bar", 30, { group: "Household" }),
  mk("restock", "Detergent", 40, { group: "Household" }),
  mk("restock", "Phenyl or floor cleaner", 45, { group: "Household" }),
  mk("restock", "Toilet cleaner", 60, { group: "Household" }),
  mk("restock", "Garbage bags", 45, { group: "Household", note: "Both sizes" }),
  mk("restock", "Scrubber and sponge", 30, { group: "Household" }),
  mk("restock", "Handwash refill", 45, { group: "Household" }),
  mk("restock", "Toilet paper or tissues", 30, { group: "Household" }),
  mk("restock", "Mosquito repellent refill", 30, { group: "Household" }),

  // ---- Restock: personal ----------------------------------------------
  mk("restock", "Toothpaste", 45, { group: "Personal" }),
  mk("restock", "Soap or body wash", 30, { group: "Personal" }),
  mk("restock", "Shampoo", 60, { group: "Personal" }),
  mk("restock", "Razor blades", 30, { group: "Personal" }),
  mk("restock", "Deodorant", 45, { group: "Personal" }),

  // ---- Restock: medicine box ------------------------------------------
  mk("restock", "Check the medicine box", 90, {
    group: "Medical",
    note: "Paracetamol, ORS, antacid, band-aids, antiseptic. Bin anything expired.",
  }),

  // ---- Restock: utilities ---------------------------------------------
  mk("restock", "Book gas cylinder", 50, { group: "Utilities", note: "Book before it's empty, delivery takes days" }),
  mk("restock", "RO filter service", 180, { group: "Utilities" }),
  mk("restock", "Pest control", 180, { group: "Utilities" }),

  // ---- Fixed dates -----------------------------------------------------
  mk("fixed", "Rent", 0, { monthDay: 5, group: "Money" }),
  mk("fixed", "Maid salary", 0, { monthDay: 1, group: "Money" }),
  mk("fixed", "Electricity bill", 0, { monthDay: 10, group: "Money" }),
  mk("fixed", "Internet bill", 0, { monthDay: 15, group: "Money" }),
  mk("fixed", "Phone recharge", 0, { monthDay: 22, group: "Money" }),
];
