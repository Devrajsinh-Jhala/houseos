import { describe, expect, it } from "vitest";
import {
  anchorMinutes,
  daysUntilDue,
  doneToday,
  dueDate,
  dueLabel,
  gapsBetween,
  groupBy,
  houseDay,
  isSnoozed,
  needsAttention,
  needsSetup,
  nowMinutes,
  observedInterval,
  routineFor,
  suggestionFor,
  urgency,
  type DoneEvent,
  type Item,
  type Kind,
} from "./core";

function item(over: Partial<Item> = {}): Item {
  return {
    id: "x",
    name: "Atta",
    kind: "restock" as Kind,
    intervalDays: 30,
    dayScope: "any",
    active: true,
    created: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Local-time date, so tests don't drift with the runner's timezone. */
function at(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}

function events(...isoDates: string[]): DoneEvent[] {
  return isoDates.map((d, i) => ({ id: String(i), itemId: "x", doneAt: d }));
}

describe("the house day rolls over at 04:00", () => {
  it("counts 1 AM as the day that is finishing", () => {
    expect(houseDay(at(2025, 3, 10, 1, 30))).toBe("2025-03-09");
  });

  it("counts 4 AM as the new day", () => {
    expect(houseDay(at(2025, 3, 10, 4, 0))).toBe("2025-03-10");
  });

  it("rolls the month backwards on the first", () => {
    expect(houseDay(at(2025, 3, 1, 2, 0))).toBe("2025-02-28");
  });

  it("treats a 1 AM tick as done for the finishing day", () => {
    const i = item({ kind: "routine", lastDone: at(2025, 3, 10, 1, 0).toISOString() });
    expect(doneToday(i, at(2025, 3, 9, 23, 0))).toBe(true);
    expect(doneToday(i, at(2025, 3, 10, 12, 0))).toBe(false);
  });
});

describe("anchors sort against the house day, not the clock", () => {
  it("puts a post-midnight anchor after the evening ones", () => {
    expect(anchorMinutes("23:15")).toBeLessThan(anchorMinutes("00:30"));
  });

  it("agrees with nowMinutes so the timeline rule lands in the right slot", () => {
    expect(nowMinutes(at(2025, 3, 10, 1, 0))).toBeGreaterThan(anchorMinutes("22:00"));
  });

  it("sorts a routine into clock order across the boundary", () => {
    const list = [
      item({ id: "a", kind: "routine", timeAnchor: "00:30", intervalDays: 1 }),
      item({ id: "b", kind: "routine", timeAnchor: "06:45", intervalDays: 1 }),
      item({ id: "c", kind: "routine", timeAnchor: "22:00", intervalDays: 1 }),
    ];
    expect(routineFor(list, "2025-03-10").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("honours weekday and weekend scopes", () => {
    const weekday = item({ id: "w", kind: "routine", dayScope: "weekday", timeAnchor: "07:00" });
    // 2025-03-10 is a Monday, 2025-03-08 a Saturday.
    expect(routineFor([weekday], "2025-03-10")).toHaveLength(1);
    expect(routineFor([weekday], "2025-03-08")).toHaveLength(0);
  });
});

describe("fixed dates", () => {
  it("clamps the 31st back to the last day of a short month", () => {
    const rent = item({ kind: "fixed", monthDay: 31 });
    expect(dueDate(rent, at(2025, 2, 10)).getDate()).toBe(28);
  });

  it("clamps to 29 in a leap February", () => {
    const rent = item({ kind: "fixed", monthDay: 31 });
    expect(dueDate(rent, at(2024, 2, 10)).getDate()).toBe(29);
  });

  it("rolls to next month once paid, clamping there too", () => {
    const rent = item({
      kind: "fixed",
      monthDay: 31,
      lastDone: at(2025, 1, 31).toISOString(),
    });
    const next = dueDate(rent, at(2025, 1, 31));
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it("stays on this month when the last payment was an earlier month", () => {
    const rent = item({
      kind: "fixed",
      monthDay: 5,
      lastDone: at(2025, 2, 5).toISOString(),
    });
    expect(dueDate(rent, at(2025, 3, 1)).getMonth()).toBe(2);
  });
});

describe("due dates and labels", () => {
  it("counts a full interval from the last completion", () => {
    const i = item({ intervalDays: 10, lastDone: at(2025, 3, 1).toISOString() });
    expect(daysUntilDue(i, at(2025, 3, 5))).toBe(6);
    expect(dueLabel(i, at(2025, 3, 5))).toBe("in 6 days");
  });

  it("goes negative when overdue", () => {
    const i = item({ intervalDays: 10, lastDone: at(2025, 3, 1).toISOString() });
    expect(daysUntilDue(i, at(2025, 3, 15))).toBe(-4);
    expect(dueLabel(i, at(2025, 3, 15))).toBe("4 days late");
    expect(urgency(i, at(2025, 3, 15))).toBe("over");
  });

  it("reads a never-ticked item as unset, not overdue", () => {
    const i = item();
    expect(needsSetup(i)).toBe(true);
    expect(urgency(i)).toBe("unset");
    expect(dueLabel(i)).toBe("not set");
    // The whole point: the seed must not light up the nav on first launch.
    expect(needsAttention(i)).toBe(false);
  });

  it("does not call fixed dates unset — they are calendar-anchored", () => {
    expect(needsSetup(item({ kind: "fixed", monthDay: 5 }))).toBe(false);
  });
});

describe("snoozing", () => {
  const base = item({ intervalDays: 5, lastDone: at(2025, 3, 1).toISOString() });

  it("pushes the due date out without touching lastDone", () => {
    const s = { ...base, snoozedUntil: "2025-03-12" };
    expect(daysUntilDue(base, at(2025, 3, 8))).toBe(-2);
    expect(daysUntilDue(s, at(2025, 3, 8))).toBe(4);
    expect(s.lastDone).toBe(base.lastDone);
  });

  it("expires on its own", () => {
    const s = { ...base, snoozedUntil: "2025-03-05" };
    expect(isSnoozed(s, at(2025, 3, 4))).toBe(true);
    expect(isSnoozed(s, at(2025, 3, 6))).toBe(false);
  });

  it("never pulls a due date earlier than it already was", () => {
    const far = item({ intervalDays: 60, lastDone: at(2025, 3, 1).toISOString() });
    const s = { ...far, snoozedUntil: "2025-03-03" };
    expect(daysUntilDue(s, at(2025, 3, 2))).toBe(daysUntilDue(far, at(2025, 3, 2)));
  });
});

describe("learning the real interval", () => {
  it("needs three completions before it says anything", () => {
    expect(observedInterval(events("2025-03-01T10:00:00Z"))).toBeNull();
    expect(observedInterval(events("2025-03-01T10:00:00Z", "2025-03-11T10:00:00Z"))).toBeNull();
  });

  it("takes the median gap", () => {
    const obs = observedInterval(
      events(
        "2025-01-01T10:00:00Z",
        "2025-01-11T10:00:00Z", // 10
        "2025-01-23T10:00:00Z", // 12
        "2025-02-03T10:00:00Z" //  11
      )
    );
    expect(obs).toEqual({ median: 11, samples: 3 });
  });

  it("is not dragged by one long holiday, where a mean would be", () => {
    const obs = observedInterval(
      events(
        "2025-01-01T10:00:00Z",
        "2025-01-08T10:00:00Z", //  7
        "2025-01-15T10:00:00Z", //  7
        "2025-03-01T10:00:00Z" //  45
      )
    );
    expect(obs?.median).toBe(7);
  });

  it("ignores double-taps inside the same day", () => {
    const gaps = gapsBetween(
      events("2025-01-01T10:00:00Z", "2025-01-01T10:00:30Z", "2025-01-11T10:00:00Z")
    );
    expect(gaps).toHaveLength(1);
    expect(Math.round(gaps[0])).toBe(10);
  });

  it("suggests a change only when the drift is real", () => {
    const log = events(
      "2025-01-01T10:00:00Z",
      "2025-01-13T10:00:00Z",
      "2025-01-25T10:00:00Z",
      "2025-02-06T10:00:00Z"
    );
    // Stored 30, actually every 12 — worth saying.
    expect(suggestionFor(item({ intervalDays: 30 }), log)?.median).toBe(12);
    // Stored 12, actually 12 — nothing to say.
    expect(suggestionFor(item({ intervalDays: 12 }), log)).toBeNull();
    // Stored 11 vs 12 is under the noise floor on a short cycle.
    expect(suggestionFor(item({ intervalDays: 11 }), log)).toBeNull();
  });

  it("stays quiet for routines and fixed dates", () => {
    const log = events("2025-01-01T10:00:00Z", "2025-01-13T10:00:00Z", "2025-01-25T10:00:00Z");
    expect(suggestionFor(item({ kind: "routine", intervalDays: 1 }), log)).toBeNull();
    expect(suggestionFor(item({ kind: "fixed", monthDay: 5 }), log)).toBeNull();
  });
});

describe("grouping", () => {
  it("keeps first-seen order so shopping trips stay in trip order", () => {
    const list = [
      item({ id: "1", group: "Vegetables" }),
      item({ id: "2", group: "Kirana" }),
      item({ id: "3", group: "Vegetables" }),
      item({ id: "4" }),
    ];
    expect(groupBy(list).map(([g, l]) => [g, l.length])).toEqual([
      ["Vegetables", 2],
      ["Kirana", 1],
      ["Other", 1],
    ]);
  });
});
