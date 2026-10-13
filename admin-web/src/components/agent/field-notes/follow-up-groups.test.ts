/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldNote } from "../field-notes-data";
import {
  calendarDaysBetween,
  filterNotes,
  followUpGroupOf,
  groupNotesByFollowUp,
  toCalendarDay,
} from "./follow-up-groups.ts";

// Reference "today": Sat 11 Oct 2026, mid-morning local time.
const TODAY = new Date(2026, 9, 11, 10, 30);
/** Local date-time `days` from TODAY, as the ISO string the notes store holds. */
const at = (days: number, hour = 10, minute = 0) =>
  new Date(2026, 9, 11 + days, hour, minute).toISOString();

let seq = 0;
const note = (overrides: Partial<FieldNote> = {}): FieldNote => ({
  id: `n-${++seq}`,
  clientName: "Client",
  contactName: "",
  phone: "",
  coverage: "Health",
  category: "health",
  loggedAt: at(-1),
  note: "memo",
  tag: "Sticky Note #1",
  status: "IN_PROGRESS",
  followUpAt: null,
  followUpLabel: "Call",
  ...overrides,
});

describe("calendar-day comparison", () => {
  it("compares calendar days, not 24-hour windows", () => {
    const lateTonight = new Date(2026, 9, 11, 23, 59);
    assert.equal(calendarDaysBetween(at(1, 0, 1), lateTonight), 1);
    const justAfterMidnight = new Date(2026, 9, 11, 0, 0, 1);
    assert.equal(calendarDaysBetween(at(0, 23, 59), justAfterMidnight), 0);
    assert.equal(calendarDaysBetween(at(-1, 23, 59), justAfterMidnight), -1);
  });

  it("reads YYYY-MM-DD as that local calendar day", () => {
    assert.deepEqual(toCalendarDay("2026-10-11"), { year: 2026, month: 9, day: 11 });
    assert.equal(followUpGroupOf("2026-10-11", TODAY), "today");
    assert.equal(followUpGroupOf("2026-10-14", TODAY), "next3");
  });

  it("crosses month and year ends", () => {
    assert.equal(calendarDaysBetween("2027-01-01", new Date(2026, 11, 31, 22)), 1);
    assert.equal(calendarDaysBetween("2026-11-01", new Date(2026, 9, 31, 8)), 1);
  });

  it("returns null for missing or invalid values", () => {
    for (const value of [null, undefined, "", "not a date", "2026-02-31", "2026-13-01"])
      assert.equal(toCalendarDay(value), null, String(value));
  });
});

describe("followUpGroupOf", () => {
  const cases: [number, string][] = [
    [-30, "overdue"],
    [-1, "overdue"],
    [0, "today"],
    [1, "next3"],
    [3, "next3"],
    [4, "next5"],
    [5, "next5"],
    [6, "upcoming"],
    [120, "upcoming"],
  ];
  for (const [days, group] of cases)
    it(`${days} day(s) from today → ${group}`, () =>
      assert.equal(followUpGroupOf(at(days), TODAY), group));

  it("keeps earlier today and late today in Today", () => {
    assert.equal(followUpGroupOf(at(0, 0, 0), TODAY), "today");
    assert.equal(followUpGroupOf(at(0, 23, 59), TODAY), "today");
  });

  it("puts missing and invalid dates in No Follow-Up Date", () => {
    assert.equal(followUpGroupOf(null, TODAY), "none");
    assert.equal(followUpGroupOf("garbage", TODAY), "none");
  });
});

describe("groupNotesByFollowUp", () => {
  const notes = [
    note({ clientName: "Upcoming", followUpAt: at(10) }),
    note({ clientName: "Old overdue", followUpAt: at(-9) }),
    note({ clientName: "Recent overdue", followUpAt: at(-1) }),
    note({ clientName: "Today", followUpAt: at(0, 15) }),
    note({ clientName: "Zeta", followUpAt: at(2, 9) }),
    note({ clientName: "alpha", followUpAt: at(2, 9) }),
    note({ clientName: "Tomorrow", followUpAt: at(1) }),
    note({ clientName: "Day five", followUpAt: at(5) }),
    note({ clientName: "No date", followUpAt: null }),
    note({ clientName: "Broken date", followUpAt: "not-a-date" }),
  ];
  const groups = groupNotesByFollowUp(notes, TODAY);
  const names = (key: string) =>
    groups.find((group) => group.key === key)!.notes.map((item) => item.clientName);

  it("returns all six groups in display order", () =>
    assert.deepEqual(
      groups.map((group) => group.key),
      ["overdue", "today", "next3", "next5", "upcoming", "none"],
    ));

  it("places every note in exactly one group", () => {
    const ids = groups.flatMap((group) => group.notes.map((item) => item.id));
    assert.equal(ids.length, notes.length);
    assert.equal(new Set(ids).size, notes.length);
  });

  it("sorts oldest overdue first", () =>
    assert.deepEqual(names("overdue"), ["Old overdue", "Recent overdue"]));

  it("sorts earliest first, ties by client name (case-insensitive)", () =>
    assert.deepEqual(names("next3"), ["Tomorrow", "alpha", "Zeta"]));

  it("fills Today, Next 5 Days, Upcoming and No Follow-Up Date", () => {
    assert.deepEqual(names("today"), ["Today"]);
    assert.deepEqual(names("next5"), ["Day five"]);
    assert.deepEqual(names("upcoming"), ["Upcoming"]);
    assert.deepEqual(names("none"), ["Broken date", "No date"]);
  });

  it("describes the date range of each group", () => {
    const description = (key: string) => groups.find((group) => group.key === key)!.description;
    assert.equal(description("next3"), "12 Oct – 14 Oct");
    assert.equal(description("next5"), "15 Oct – 16 Oct");
    assert.equal(description("upcoming"), "From 17 Oct");
  });

  it("moves a note to its new group when the follow-up date changes", () => {
    const item = note({ followUpAt: at(10) });
    assert.equal(groupNotesByFollowUp([item], TODAY)[4]!.notes.length, 1);
    const rescheduled = { ...item, followUpAt: at(0, 17) };
    const regrouped = groupNotesByFollowUp([rescheduled], TODAY);
    assert.deepEqual(regrouped[1]!.notes, [rescheduled]);
    assert.equal(regrouped[4]!.notes.length, 0);
  });

  it("moves notes along as the reference day advances", () => {
    const item = note({ followUpAt: at(1) });
    assert.equal(followUpGroupOf(item.followUpAt, TODAY), "next3");
    assert.equal(followUpGroupOf(item.followUpAt, new Date(2026, 9, 12, 0, 0, 1)), "today");
    assert.equal(followUpGroupOf(item.followUpAt, new Date(2026, 9, 13, 8)), "overdue");
  });
});

describe("filterNotes + grouping", () => {
  const notes = [
    note({ clientName: "ABC Logistics", note: "fleet renewal", followUpAt: at(1) }),
    note({ clientName: "Apex Dental", status: "COMPLETED", followUpAt: at(30) }),
    note({ clientName: "Harbor Bistro", status: "POSTPONED", followUpAt: at(-2) }),
    note({ clientName: "Beacon", coverage: "Group Health #HL-7", followUpAt: null }),
  ];
  const all = { query: "", status: "all" as const, dueSoonOnly: false };
  const counts = (list: FieldNote[]) =>
    Object.fromEntries(groupNotesByFollowUp(list, TODAY).map((g) => [g.key, g.notes.length]));

  it("searches client name, memo text and policy tags", () => {
    assert.deepEqual(
      filterNotes(notes, { ...all, query: "abc" }, TODAY).map((n) => n.clientName),
      ["ABC Logistics"],
    );
    assert.equal(filterNotes(notes, { ...all, query: "RENEWAL" }, TODAY).length, 1);
    assert.equal(filterNotes(notes, { ...all, query: "hl-7" }, TODAY)[0]!.clientName, "Beacon");
  });

  it("applies the status filter before grouping, so counts follow the filter", () => {
    const overdue = filterNotes(notes, { ...all, status: "overdue" }, TODAY);
    assert.deepEqual(counts(overdue), {
      overdue: 1,
      today: 0,
      next3: 0,
      next5: 0,
      upcoming: 0,
      none: 0,
    });
  });

  it("restores every record once filters are cleared", () => {
    assert.equal(filterNotes(notes, { ...all, query: "zzz" }, TODAY).length, 0);
    assert.equal(filterNotes(notes, all, TODAY).length, notes.length);
  });

  it("limits to open follow-ups due within 48h", () =>
    assert.deepEqual(
      filterNotes(notes, { ...all, dueSoonOnly: true }, TODAY).map((n) => n.clientName),
      ["ABC Logistics", "Harbor Bistro"],
    ));
});
