import { describe, expect, it } from "vitest";
import { daysUntilDue, dueLabel, needsAttention, needsSetup, type Item } from "./core";
import { DEFAULT_SETTINGS, isScheduledFor, planForDay, planLoad, resolveTime } from "./planner";

const now = new Date(2026, 10, 2, 20); // Monday
function item(extra: Partial<Item> = {}): Item {
  return {id:"chore", name:"Laundry", kind:"chore", intervalDays:7, dayScope:"any", active:true,
    created:new Date(2026,10,2,12).toISOString(), ...extra};
}

describe("custom schedules", () => {
  it("keeps custom weekday chores on their chosen days", () => {
    const task = item({scheduleMode:"weekly", scheduledDays:[2,6]});
    expect(isScheduledFor(task,"2026-11-02")).toBe(false);
    expect(isScheduledFor(task,"2026-11-03")).toBe(true);
    expect(isScheduledFor(task,"2026-11-07")).toBe(true);
    expect(needsSetup(task)).toBe(false);
    expect(daysUntilDue(task, now)).toBe(1);
  });
  it("does not backdate a new weekly schedule to an old interval completion", () => {
    const task = item({scheduleMode:"weekly",scheduledDays:[2],scheduledDate:"2026-11-02",lastDone:new Date(2026,9,1,12).toISOString()});
    expect(daysUntilDue(task,now)).toBe(1);
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)).toHaveLength(0);
  });
  it("starts countdowns from the completion's house day, including after midnight", () => {
    const task = item({scheduleMode:"interval",intervalDays:3,lastDone:new Date(2026,10,3,1).toISOString()});
    expect(daysUntilDue(task,now)).toBe(3);
    expect(isScheduledFor(task,"2026-11-05")).toBe(true);
    expect(isScheduledFor(task,"2026-11-06")).toBe(false);
    expect(isScheduledFor(task,"2026-11-08")).toBe(true);
  });
  it("keeps a completed one-off off future plans and attention badges", () => {
    const task = item({scheduleMode:"once",scheduledDate:"2026-11-02",lastDone:now.toISOString()});
    expect(needsAttention(task,now)).toBe(false);
    expect(dueLabel(task,now)).toBe("completed");
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)[0].done).toBe(true);
    expect(planForDay([task],"2026-11-03",DEFAULT_SETTINGS,now)).toHaveLength(0);
  });
  it("shows an unfinished one-off carried forward today", () => {
    const task = item({scheduleMode:"once",scheduledDate:"2026-10-31"});
    const plan = planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now);
    expect(plan).toHaveLength(1);
    expect(plan[0].overdue).toBe(true);
  });
  it("moves a snoozed one-off to its new date, without making it done", () => {
    const task = item({scheduleMode:"once",scheduledDate:"2026-11-02",snoozedUntil:"2026-11-05"});
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)).toHaveLength(0);
    expect(planForDay([task],"2026-11-05",DEFAULT_SETTINGS,now)).toHaveLength(1);
    expect(task.lastDone).toBeUndefined();
  });
  it("keeps due labels on the same house day after midnight", () => {
    const task = item({scheduleMode:"once",scheduledDate:"2026-11-02"});
    expect(daysUntilDue(task,new Date(2026,10,3,1))).toBe(0);
  });
  it("retains an overdue one-off even when its type is routine", () => {
    const task = item({kind:"routine",scheduleMode:"once",scheduledDate:"2026-11-01"});
    const plan = planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now);
    expect(plan).toHaveLength(1);
    expect(plan[0].overdue).toBe(true);
  });
  it("never brings a weekly task forward when a snooze ends before its next due date", () => {
    const task = item({scheduleMode:"weekly",scheduledDays:[6],lastDone:now.toISOString(),snoozedUntil:"2026-11-04"});
    expect(isScheduledFor(task,"2026-11-04")).toBe(false);
    expect(isScheduledFor(task,"2026-11-07")).toBe(true);
  });
  it("retains legacy unscheduled records without manufacturing a backlog", () => {
    const task = item();
    expect(needsSetup(task)).toBe(true);
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)).toHaveLength(0);
  });
  it("carries missed weekly chores into today and forecasts later weekday occurrences", () => {
    const task = item({created:new Date(2026,9,29,12).toISOString(),scheduleMode:"weekly",scheduledDays:[6]});
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)[0].overdue).toBe(true);
    expect(planForDay([task],"2026-11-07",DEFAULT_SETTINGS,now)).toHaveLength(1);
  });
  it("does not treat future weekly occurrences as already completed", () => {
    const task = item({scheduleMode:"weekly",scheduledDays:[1,3],lastDone:now.toISOString()});
    expect(planForDay([task],"2026-11-02",DEFAULT_SETTINGS,now)[0].done).toBe(true);
    expect(planForDay([task],"2026-11-04",DEFAULT_SETTINGS,now)[0].done).toBe(false);
  });
  it("does not forecast a paid bill again in the same month", () => {
    const task = item({kind:"fixed",monthDay:5,lastDone:now.toISOString()});
    expect(planForDay([task],"2026-11-05",DEFAULT_SETTINGS,now)).toHaveLength(0);
    expect(planForDay([task],"2026-12-05",DEFAULT_SETTINGS,now)).toHaveLength(1);
  });
  it("uses the civil month for bill payment on the first before the house day changes", () => {
    const afterMidnight = new Date(2026,10,1,1);
    const paidBill = item({kind:"fixed",monthDay:5,lastDone:afterMidnight.toISOString()});
    expect(daysUntilDue(paidBill,afterMidnight)).toBe(34);
    expect(planForDay([paidBill],"2026-11-05",DEFAULT_SETTINGS,afterMidnight)).toHaveLength(0);
    expect(daysUntilDue(item({kind:"fixed",monthDay:1}),afterMidnight)).toBe(0);
  });
});

describe("realistic daily plans", () => {
  it("moves arrival-relative chores and uses a separate weekend arrival", () => {
    const task = item({scheduleAnchor:"arrival",arrivalOffset:30});
    expect(resolveTime(task,DEFAULT_SETTINGS,"2026-11-02")).toBe("19:30");
    expect(resolveTime(task,{...DEFAULT_SETTINGS,arrivalTime:"20:15"},"2026-11-02")).toBe("20:45");
    expect(resolveTime(task,DEFAULT_SETTINGS,"2026-11-07")).toBe("10:30");
  });
  it("wraps arrival offsets across midnight", () => {
    expect(resolveTime(item({scheduleAnchor:"arrival",arrivalOffset:90}), {...DEFAULT_SETTINGS,arrivalTime:"23:00"},"2026-11-02")).toBe("00:30");
  });
  it("detects overlapping tasks, over-capacity, and bedtime spillover", () => {
    const a = item({id:"a",scheduleMode:"once",scheduledDate:"2026-11-02",timeAnchor:"22:30",durationMinutes:60});
    const b = item({id:"b",scheduleMode:"once",scheduledDate:"2026-11-02",timeAnchor:"22:45",durationMinutes:45});
    const result = planLoad(planForDay([a,b],"2026-11-02",DEFAULT_SETTINGS,now),DEFAULT_SETTINGS);
    expect(result.overBudget).toBe(15);
    expect([...result.conflicts]).toEqual(["a","b"]);
    expect(result.afterBedtime).toBe(2);
  });
  it("excludes completed tasks from remaining time and overlap warnings", () => {
    const a = item({id:"a",scheduleMode:"once",scheduledDate:"2026-11-02",timeAnchor:"19:00",durationMinutes:60,lastDone:now.toISOString()});
    const b = item({id:"b",scheduleMode:"once",scheduledDate:"2026-11-02",timeAnchor:"19:15",durationMinutes:30});
    const result = planLoad(planForDay([a,b],"2026-11-02",DEFAULT_SETTINGS,now),DEFAULT_SETTINGS);
    expect(result.remainingMinutes).toBe(30);
    expect(result.conflicts.size).toBe(0);
  });
});
