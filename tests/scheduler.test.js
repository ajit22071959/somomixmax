"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Somo = require("../scheduler.js");

function plan(shirts, pants, weeks, daysPerWeek, seed) {
  return Somo.generateSchedule({
    shirts: shirts,
    pants: pants,
    weeks: weeks,
    daysPerWeek: daysPerWeek,
    seed: seed || 0,
  });
}

function assertBalanced(values, label) {
  assert.ok(
    Somo.countsDifferByAtMostOne(values),
    label + " should differ by at most 1, got " + JSON.stringify(values)
  );
}

function assertValidPlan(p, S, P, weeks, daysPerWeek, seed) {
  const D = weeks * daysPerWeek;
  const unique = S * P;
  const ctx = "S=" + S + " P=" + P + " weeks=" + weeks + " dpw=" + daysPerWeek + " seed=" + (seed || 0);

  assert.equal(p.days.length, D, "length " + ctx);
  assert.equal(p.totalDays, D, "totalDays " + ctx);
  assert.equal(p.unique, unique, "unique " + ctx);
  assert.equal(p.repeatDays, Math.max(0, D - unique), "repeatDays " + ctx);
  assert.equal(p.summary, Somo.summarize(unique, D, p.repeatDays), "summary " + ctx);

  for (let i = 0; i < p.days.length; i++) {
    const d = p.days[i];
    assert.ok(d.shirt >= 0 && d.shirt < S, "shirt range " + ctx + " day " + i);
    assert.ok(d.pant >= 0 && d.pant < P, "pant range " + ctx + " day " + i);
  }

  const stats = Somo.analyze(p.days, S, P);
  assert.equal(stats.repeatDays, p.repeatDays, "analyze repeat " + ctx);
  assert.equal(stats.seenCount, Math.min(D, unique), "seen " + ctx);

  // Use every unique pair before repeating any.
  if (D <= unique) {
    assert.equal(stats.firstRepeatIndex, null, "no repeats expected " + ctx);
    assert.equal(stats.seenCount, D, "all unique days " + ctx);
  } else {
    assert.equal(stats.firstRepeatIndex, unique, "first repeat after all unique pairs " + ctx);
  }

  // Stronger prefix property: never start copy k+2 of a pair before every
  // pair has appeared k+1 times (because we emit complete rounds).
  const running = new Map();
  for (let i = 0; i < p.days.length; i++) {
    const key = p.days[i].shirt + ":" + p.days[i].pant;
    running.set(key, (running.get(key) || 0) + 1);
    let min = Infinity;
    let max = 0;
    // Only compare among pairs that have been used, plus zeros for unused
    // during the first round — equivalent: max count over all unique keys
    // seen so far, and unused count as 0 only while i < unique.
    const prefixLen = i + 1;
    const expectedMax = Math.ceil(prefixLen / unique);
    const expectedMinAllowed = Math.floor(prefixLen / unique);
    running.forEach(function (count) {
      if (count > max) max = count;
      if (count < min) min = count;
    });
    if (running.size < unique) min = 0;
    assert.ok(
      max - min <= 1,
      "prefix pair counts at day " + i + " " + ctx + " min=" + min + " max=" + max
    );
    assert.ok(max <= expectedMax, "prefix max " + ctx);
    assert.ok(min >= expectedMinAllowed || prefixLen < unique, "prefix min " + ctx);
  }

  assertBalanced(stats.pairCountValues, "pair counts " + ctx);
  assertBalanced(stats.shirtWear, "shirt wear " + ctx);
  assertBalanced(stats.pantWear, "pant wear " + ctx);
  assert.deepEqual(p.shirtWear, stats.shirtWear);
  assert.deepEqual(p.pantWear, stats.pantWear);

  const shirtSum = stats.shirtWear.reduce((a, b) => a + b, 0);
  const pantSum = stats.pantWear.reduce((a, b) => a + b, 0);
  assert.equal(shirtSum, D, "shirt wear sums to days " + ctx);
  assert.equal(pantSum, D, "pant wear sums to days " + ctx);

  // Consecutive shirt constraint: always avoidable when there are 2+ shirts,
  // because shirt frequencies differ by at most 1 and so max freq <= (D+1)/2.
  if (S >= 2) {
    assert.equal(stats.shirtConsec, 0, "no consecutive shirts " + ctx);
  }

  if (P === 1 && D >= 2) {
    assert.equal(stats.pantConsec, D - 1, "only one pant, all days repeat it " + ctx);
  }
  if (S === 1 && D >= 2) {
    assert.equal(stats.shirtConsec, D - 1, "only one shirt, all days repeat it " + ctx);
  }
}

describe("input validation", () => {
  it("accepts default office-week values", () => {
    assert.deepEqual(
      Somo.validateInputs({ shirts: 5, pants: 3, weeks: 3, daysPerWeek: 5 }),
      []
    );
  });

  it("rejects out-of-range and non-integer values", () => {
    const bad = Somo.validateInputs({ shirts: 0, pants: 51, weeks: 0, daysPerWeek: 8 });
    assert.equal(bad.length, 4);
    assert.throws(() => plan(0, 2, 1, 5), /shirts/i);
    assert.throws(() => plan(2, 2, 1, 0), /days/i);
    assert.throws(() => plan(2.5, 2, 1, 5), /shirts/i);
    assert.throws(() => plan(2, 2, 53, 5), /weeks/i);
  });
});

describe("summary copy", () => {
  it("matches the requested no-repeat wording", () => {
    assert.equal(
      Somo.summarize(15, 15, 0),
      "15 unique outfits; your 15 days need no repeats"
    );
    const p = plan(5, 3, 3, 5, 0);
    assert.equal(p.unique, 15);
    assert.equal(p.totalDays, 15);
    assert.equal(p.repeatDays, 0);
    assert.equal(p.summary, "15 unique outfits; your 15 days need no repeats");
  });

  it("reports how many days are repeats", () => {
    assert.equal(
      Somo.summarize(15, 20, 5),
      "15 unique outfits; 5 of your 20 days are repeats of an earlier pair"
    );
    assert.equal(
      Somo.summarize(1, 2, 1),
      "1 unique outfit; 1 of your 2 days is a repeat of an earlier pair"
    );
    const p = plan(5, 3, 4, 5, 0);
    assert.equal(p.repeatDays, 5);
    assert.equal(
      p.summary,
      "15 unique outfits; 5 of your 20 days are repeats of an earlier pair"
    );
  });
});

describe("pair-repeat optimality and balance", () => {
  const cases = [
    [1, 1, 1, 1],
    [1, 1, 3, 5],
    [1, 4, 2, 5],
    [4, 1, 2, 5],
    [1, 2, 1, 1],
    [2, 2, 1, 4],
    [2, 2, 2, 5],
    [2, 3, 1, 5],
    [3, 2, 2, 5],
    [5, 3, 3, 5],
    [5, 3, 4, 5],
    [5, 3, 1, 5],
    [5, 3, 6, 5],
    [3, 3, 1, 7],
    [4, 4, 3, 5],
    [6, 5, 4, 5],
    [7, 2, 3, 6],
    [8, 8, 2, 5],
    [2, 7, 5, 5],
    [10, 1, 2, 7],
    [1, 10, 2, 7],
    [9, 4, 1, 1],
    [3, 5, 8, 5],
    [4, 3, 1, 2],
    [50, 50, 1, 1],
    [2, 2, 52, 7],
  ];

  for (const [S, P, weeks, dpw] of cases) {
    it("schedules " + S + "x" + P + " for " + weeks + "x" + dpw + " days", () => {
      assertValidPlan(plan(S, P, weeks, dpw, 0), S, P, weeks, dpw, 0);
    });
  }

  it("stays valid across many sizes and seeds", () => {
    const sizes = [1, 2, 3, 4, 5, 6, 7];
    const dayCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 20, 21, 30, 35, 40, 50, 60];
    let checked = 0;
    for (const S of sizes) {
      for (const P of sizes) {
        for (const D of dayCounts) {
          // Represent D as weeks * daysPerWeek. Use 1 day/week when needed.
          let weeks = D;
          let dpw = 1;
          if (D % 5 === 0 && D / 5 <= 52) {
            weeks = D / 5;
            dpw = 5;
          } else if (D % 7 === 0 && D / 7 <= 52) {
            weeks = D / 7;
            dpw = 7;
          }
          if (weeks > 52) continue;
          for (const seed of [0, 1, 2, 7, 99]) {
            assertValidPlan(plan(S, P, weeks, dpw, seed), S, P, weeks, dpw, seed);
            checked++;
          }
        }
      }
    }
    assert.ok(checked > 500, "expected a large case grid, got " + checked);
  });
});

describe("consecutive constraints", () => {
  it("must repeat the only shirt when there is just one", () => {
    const p = plan(1, 5, 2, 5, 0);
    assert.equal(p.shirtConsec, 9);
    assert.equal(p.pantConsec, 0);
  });

  it("must repeat the only pant when there is just one", () => {
    const p = plan(5, 1, 2, 5, 0);
    assert.equal(p.pantConsec, 9);
    assert.equal(p.shirtConsec, 0);
  });

  it("avoids consecutive shirts and pants for typical 3x3 and larger plans", () => {
    for (const seed of [0, 1, 2, 3, 8, 21]) {
      for (const [S, P, weeks, dpw] of [
        [3, 3, 2, 5],
        [4, 3, 3, 5],
        [5, 3, 4, 5],
        [5, 5, 3, 7],
        [6, 4, 5, 5],
      ]) {
        const p = plan(S, P, weeks, dpw, seed);
        assert.equal(p.shirtConsec, 0, "shirts " + S + "x" + P + " seed " + seed);
        assert.equal(p.pantConsec, 0, "pants " + S + "x" + P + " seed " + seed);
      }
    }
  });
});

describe("names, timetable, csv", () => {
  it("fills default names and accepts custom ones", () => {
    const p = plan(2, 2, 1, 5, 0);
    assert.deepEqual(p.shirtNames, ["Shirt 1", "Shirt 2"]);
    assert.deepEqual(p.pantNames, ["Pant 1", "Pant 2"]);
    assert.deepEqual(p.dayNames, ["Mon", "Tue", "Wed", "Thu", "Fri"]);

    const named = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 1,
      daysPerWeek: 5,
      shirtNames: ["  Blue ", ""],
      pantNames: ["Navy", "Khaki"],
    });
    assert.deepEqual(named.shirtNames, ["Blue", "Shirt 2"]);
    assert.deepEqual(named.pantNames, ["Navy", "Khaki"]);
  });

  it("names weekdays Mon–Sun in order, sliced to the work week", () => {
    assert.deepEqual(plan(2, 2, 1, 1, 0).dayNames, ["Mon"]);
    assert.deepEqual(plan(2, 2, 1, 6, 0).dayNames, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    assert.deepEqual(plan(2, 2, 1, 7, 0).dayNames, Somo.DAY_NAMES);
  });

  it("builds week-major timetable rows and a CSV", () => {
    const p = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 1,
      daysPerWeek: 5,
      shirtNames: ["A", "B"],
      pantNames: ["X", "Y"],
    });
    const rows = Somo.timetableRows(p);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].week, 1);
    assert.equal(rows[0].cells.length, 5);
    assert.equal(rows[0].cells[0].dayName, "Mon");
    assert.equal(rows[0].cells[0].combo, "A + X");
    assert.equal(rows[0].cells[0].holiday, false);
    const csv = Somo.toCsv(p);
    assert.match(csv, /^Week,Day,Outfit,Holiday,Locked,Repeat of\n/);
    assert.equal(csv.trim().split("\n").length, 6);
    assert.match(Somo.toCsv(Somo.generateSchedule({
      shirts: 1, pants: 1, weeks: 1, daysPerWeek: 1,
      shirtNames: ['A, "quoted"'],
      pantNames: ["plain"],
    })), /"A, ""quoted"" \+ plain"/);
  });
});

describe("shuffle", () => {
  it("keeps equal quality and usually a different pairing order", () => {
    const options = { shirts: 5, pants: 3, weeks: 4, daysPerWeek: 5 };
    const a = Somo.generateSchedule(Object.assign({ seed: 0 }, options));
    const seed = Somo.findShuffledSeed(options, a.days, 1, 48);
    const b = Somo.generateSchedule(Object.assign({ seed: seed }, options));
    assertValidPlan(a, 5, 3, 4, 5, 0);
    assertValidPlan(b, 5, 3, 4, 5, seed);
    assert.notEqual(Somo.daySignature(a.days), Somo.daySignature(b.days));
    assert.equal(a.repeatDays, b.repeatDays);
  });

  it("has only one possible plan for a single pair", () => {
    const options = { shirts: 1, pants: 1, weeks: 2, daysPerWeek: 5 };
    const a = Somo.generateSchedule(Object.assign({ seed: 0 }, options));
    const seed = Somo.findShuffledSeed(options, a.days, 1, 20);
    const b = Somo.generateSchedule(Object.assign({ seed: seed }, options));
    assert.equal(Somo.daySignature(a.days), Somo.daySignature(b.days));
  });
});

describe("limits on a large but legal plan", () => {
  it("schedules 50 shirts, 2 pants, 52 weeks of 7 days", () => {
    const p = plan(50, 2, 52, 7, 0);
    assertValidPlan(p, 50, 2, 52, 7, 0);
    assert.equal(p.totalDays, 364);
  });
});

describe("combo labels and repeat references", () => {
  it("formats outfits as Shirt + Pant, including custom names", () => {
    assert.equal(Somo.comboLabel("Shirt 1", "Pant 2"), "Shirt 1 + Pant 2");
    const named = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 1,
      daysPerWeek: 5,
      shirtNames: ["Blue check", ""],
      pantNames: ["Navy", "Khaki"],
    });
    const combos = named.slots.filter((s) => !s.holiday).map((s) => s.combo);
    for (const combo of combos) {
      assert.match(combo, / \+ /);
      assert.ok(
        combo.startsWith("Blue check + ") || combo.startsWith("Shirt 2 + "),
        combo
      );
    }
  });

  it("points a repeat at the most recent earlier day with the same pair", () => {
    const p = Somo.generateSchedule({ shirts: 5, pants: 3, weeks: 4, daysPerWeek: 5 });
    assert.equal(p.repeatDays, 5);
    assert.equal(p.repeats.length, 5);
    const rows = Somo.timetableRows(p);
    const lastSeen = new Map();
    let checked = 0;
    for (const row of rows) {
      for (const cell of row.cells) {
        const key = cell.shirtIndex + ":" + cell.pantIndex;
        if (lastSeen.has(key)) {
          const expected = lastSeen.get(key);
          assert.equal(cell.repeatOf, expected, cell.combo + " on " + Somo.slotRef(cell.week, cell.dayName));
          assert.equal(cell.repeatLabel, "Repeat of " + expected);
          checked++;
        } else {
          assert.equal(cell.repeatOf, null);
        }
        lastSeen.set(key, Somo.slotRef(cell.week, cell.dayName));
      }
    }
    assert.equal(checked, 5);
    // A third wearing, if any, should cite the second, not the first.
    const p3 = Somo.generateSchedule({ shirts: 1, pants: 1, weeks: 3, daysPerWeek: 1 });
    assert.equal(p3.slots[0].repeatOf, null);
    assert.equal(p3.slots[1].repeatOf, "Week 1 Mon");
    assert.equal(p3.slots[2].repeatOf, "Week 2 Mon");
    assert.equal(Somo.timetableRows(p3)[2].cells[0].repeatLabel, "Repeat of Week 2 Mon");
  });

  it("lists repeats in CSV and plain text", () => {
    const p = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 1,
      daysPerWeek: 5,
      shirtNames: ["A"],
      pantNames: ["X", "Y"],
    });
    const csv = Somo.toCsv(p);
    assert.match(csv, /^Week,Day,Outfit,Holiday,Locked,Repeat of\n/);
    assert.match(csv, /A \+ X,,,Week 1 Mon/);
    const text = Somo.toPlainText(p);
    assert.match(text, /A \+ X — Repeat of Week 1 Mon/);
    assert.match(text, /Repeat list/);
    assert.match(text, /Week 1 Fri: A \+ X — Repeat of Week 1 Mon/);
  });
});

describe("holidays", () => {
  it("parses in-period marks and ignores the rest", () => {
    const info = Somo.parseHolidays(
      [
        { week: 2, day: 2 },
        { week: 2, day: 2 },
        { week: 9, day: 0 },
        { week: 1, day: 6 },
        { week: 0, day: 0 },
        { foo: 1 },
      ],
      3,
      5
    );
    assert.deepEqual(
      info.applied.map((h) => ({ week: h.week, day: h.day, dayName: h.dayName })),
      [{ week: 2, day: 2, dayName: "Wed" }]
    );
    assert.equal(info.ignored.length, 4);
  });

  it("leaves holiday slots empty and plans only the remaining working days", () => {
    const holidays = [
      { week: 1, day: 2 }, // Wed
      { week: 2, day: 0 }, // Mon
    ];
    const p = Somo.generateSchedule({
      shirts: 5,
      pants: 3,
      weeks: 3,
      daysPerWeek: 5,
      holidays,
    });
    assert.equal(p.periodDays, 15);
    assert.equal(p.holidayCount, 2);
    assert.equal(p.workingDays, 13);
    assert.equal(p.totalDays, 13);
    assert.equal(p.days.length, 13);
    assert.equal(p.repeatDays, 0);
    assert.equal(
      p.summary,
      "15 unique outfits; your 13 working days need no repeats (2 holidays)"
    );
    const wed = p.slots.find((s) => s.week === 1 && s.day === 2);
    const mon2 = p.slots.find((s) => s.week === 2 && s.day === 0);
    assert.equal(wed.holiday, true);
    assert.equal(wed.combo, null);
    assert.equal(wed.shirt, null);
    assert.equal(mon2.holiday, true);
    const work = p.slots.filter((s) => !s.holiday);
    assert.equal(work.length, 13);
    for (const slot of work) {
      assert.equal(typeof slot.shirt, "number");
      assert.match(slot.combo, /Shirt \d+ \+ Pant \d+/);
    }
    assert.ok(Somo.countsDifferByAtMostOne(p.shirtWear));
    assert.ok(Somo.countsDifferByAtMostOne(p.pantWear));
    assert.equal(p.shirtWear.reduce((a, b) => a + b, 0), 13);
    assert.equal(p.shirtConsec, 0);
    const csv = Somo.toCsv(p);
    assert.match(csv, /1,Wed,,Holiday,/);
    assert.match(csv, /2,Mon,,Holiday,/);
    const text = Somo.toPlainText(p);
    assert.match(text, /Wed: Holiday/);
    assert.match(text, /Holidays: 2/);
  });

  it("still avoids the same shirt across a holiday gap when possible", () => {
    const p = Somo.generateSchedule({
      shirts: 5,
      pants: 3,
      weeks: 3,
      daysPerWeek: 5,
      holidays: [{ week: 2, day: 2 }],
    });
    assert.equal(p.shirtConsec, 0);
    // Working-day neighbours on either side of the holiday should also differ.
    const slots = p.slots;
    const hol = slots.findIndex((s) => s.holiday);
    const before = slots[hol - 1];
    const after = slots[hol + 1];
    assert.ok(!before.holiday && !after.holiday);
    assert.notEqual(before.shirt, after.shirt);
  });

  it("treats a full-holiday period as having no outfits", () => {
    const holidays = [];
    for (let w = 1; w <= 2; w++) {
      for (let d = 0; d < 5; d++) holidays.push({ week: w, day: d });
    }
    const p = Somo.generateSchedule({
      shirts: 4,
      pants: 3,
      weeks: 2,
      daysPerWeek: 5,
      holidays,
    });
    assert.equal(p.workingDays, 0);
    assert.equal(p.days.length, 0);
    assert.equal(p.holidayCount, 10);
    assert.ok(p.slots.every((s) => s.holiday && s.combo == null));
    assert.deepEqual(p.shirtWear, [0, 0, 0, 0]);
    assert.equal(
      p.summary,
      "All 10 days are marked as holidays, so there is no outfit plan."
    );
  });

  it("keeps repeat references on working days only, skipping holidays", () => {
    const p = Somo.generateSchedule({
      shirts: 2,
      pants: 1,
      weeks: 2,
      daysPerWeek: 5,
      holidays: [{ week: 1, day: 4 }],
    });
    // 9 working days, 2 unique pairs, so 7 repeats, none on the holiday.
    assert.equal(p.workingDays, 9);
    assert.equal(p.repeatDays, 7);
    assert.equal(p.slots[4].holiday, true);
    assert.equal(p.slots[4].repeatOf, null);
    for (const slot of p.slots) {
      if (slot.holiday) continue;
      if (slot.repeatOf) {
        assert.match(slot.repeatOf, /^Week \d+ (Mon|Tue|Wed|Thu|Fri)$/);
        assert.notEqual(slot.repeatOf, "Week 1 Fri");
      }
    }
    const rows = Somo.timetableRows(p);
    assert.equal(rows[0].cells[4].holiday, true);
    assert.equal(rows[0].cells[4].repeatLabel, null);
  });

  it("uses a one-holiday wording and still shuffles around holidays", () => {
    const options = {
      shirts: 5,
      pants: 3,
      weeks: 3,
      daysPerWeek: 5,
      holidays: [{ week: 1, day: 0 }],
    };
    const a = Somo.generateSchedule(Object.assign({ seed: 0 }, options));
    assert.equal(
      a.summary,
      "15 unique outfits; your 14 working days need no repeats (1 holiday)"
    );
    const seed = Somo.findShuffledSeed(options, a.days, 1, 48);
    const b = Somo.generateSchedule(Object.assign({ seed: seed }, options));
    assert.equal(b.workingDays, 14);
    assert.equal(b.holidayCount, 1);
    assert.notEqual(Somo.daySignature(a.days), Somo.daySignature(b.days));
    assert.equal(b.slots[0].holiday, true);
  });
});

describe("locks and day shuffle", () => {
  it("ignores locks that are invalid, on holidays, or out of the wardrobe", () => {
    const info = Somo.parseLocks(
      [
        { week: 1, day: 0, shirt: 0, pant: 0 },
        { week: 1, day: 0, shirt: 1, pant: 1 }, // duplicate slot
        { week: 1, day: 2, shirt: 0, pant: 0 }, // Wednesday holiday
        { week: 9, day: 0, shirt: 0, pant: 0 },
        { week: 2, day: 0, shirt: 9, pant: 0 },
        { week: 2, day: 1, shirt: 0, pant: 9 },
        { foo: 1 },
      ],
      3,
      5,
      2,
      2,
      new Set(["1:2"])
    );
    assert.deepEqual(
      info.applied.map((l) => ({ week: l.week, day: l.day, shirt: l.shirt, pant: l.pant })),
      [{ week: 1, day: 0, shirt: 0, pant: 0 }]
    );
    assert.equal(info.ignored.length, 5);
  });

  it("keeps a locked pair in place and fills the rest evenly", () => {
    const p = Somo.generateSchedule({
      shirts: 5,
      pants: 3,
      weeks: 3,
      daysPerWeek: 5,
      locks: [{ week: 1, day: 0, shirt: 4, pant: 2 }],
    });
    assert.equal(p.lockCount, 1);
    assert.equal(p.slots[0].locked, true);
    assert.equal(p.slots[0].shirt, 4);
    assert.equal(p.slots[0].pant, 2);
    assert.equal(p.slots[0].combo, "Shirt 5 + Pant 3");
    assert.equal(p.workingDays, 15);
    assert.equal(p.repeatDays, 0);
    assert.ok(Somo.countsDifferByAtMostOne(p.shirtWear));
    assert.ok(Somo.countsDifferByAtMostOne(p.pantWear));
    const stats = Somo.analyze(p.days, 5, 3);
    assert.ok(Somo.countsDifferByAtMostOne(stats.pairCountValues));
    assert.equal(p.shirtConsec, 0);
    assert.equal(p.slots[1].locked, false);
    const csv = Somo.toCsv(p);
    assert.match(csv, /^Week,Day,Outfit,Holiday,Locked,Repeat of\n/);
    assert.match(csv, /1,Mon,Shirt 5 \+ Pant 3,,Locked,/);
    assert.match(Somo.toPlainText(p), /Shirt 5 \+ Pant 3 \(locked\)/);
    assert.match(Somo.toPlainText(p), /Locked days: 1/);
  });

  it("avoids a locked shirt on the following working day when possible", () => {
    const p = Somo.generateSchedule({
      shirts: 5,
      pants: 3,
      weeks: 2,
      daysPerWeek: 5,
      locks: [{ week: 1, day: 0, shirt: 0, pant: 0 }],
    });
    assert.notEqual(p.slots[1].shirt, 0);
    assert.equal(p.shirtConsec, 0);
  });

  it("drops a lock when that day is marked as a holiday", () => {
    const p = Somo.generateSchedule({
      shirts: 4,
      pants: 3,
      weeks: 2,
      daysPerWeek: 5,
      holidays: [{ week: 1, day: 0 }],
      locks: [{ week: 1, day: 0, shirt: 0, pant: 0 }],
    });
    assert.equal(p.slots[0].holiday, true);
    assert.equal(p.slots[0].locked, false);
    assert.equal(p.slots[0].shirt, null);
    assert.equal(p.lockCount, 0);
    assert.equal(p.ignoredLocks.length, 1);
    assert.equal(p.workingDays, 9);
  });

  it("still schedules when every working day is locked", () => {
    const locks = [];
    let shirt = 0;
    for (let w = 1; w <= 1; w++) {
      for (let d = 0; d < 5; d++) {
        locks.push({ week: w, day: d, shirt: shirt, pant: 0 });
        shirt = 1 - shirt;
      }
    }
    const p = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 1,
      daysPerWeek: 5,
      locks,
    });
    assert.equal(p.lockCount, 5);
    assert.equal(p.workingDays, 5);
    assert.ok(p.slots.every((s) => s.locked && s.shirt === locks[s.day].shirt));
  });

  it("cycles a day to a different pair and plan-level shuffle keeps locks", () => {
    const baseOptions = { shirts: 5, pants: 3, weeks: 3, daysPerWeek: 5 };
    const original = Somo.generateSchedule(baseOptions);
    const current = original.slots[0];
    const next = Somo.cycleDayPair(baseOptions, 1, 0, current.shirt, current.pant);
    assert.equal(next.changed, true);
    assert.ok(next.shirt !== current.shirt || next.pant !== current.pant);

    const second = Somo.cycleDayPair(baseOptions, 1, 0, next.shirt, next.pant);
    assert.equal(second.changed, true);
    assert.ok(second.shirt !== next.shirt || second.pant !== next.pant);

    const seen = new Set();
    let shirt = current.shirt;
    let pant = current.pant;
    for (let i = 0; i < 15; i++) {
      const step = Somo.cycleDayPair(baseOptions, 1, 0, shirt, pant);
      const key = step.shirt + ":" + step.pant;
      seen.add(key);
      shirt = step.shirt;
      pant = step.pant;
    }
    assert.equal(seen.size, 15, "a full cycle visits every unique pair");
    assert.equal(shirt, current.shirt);
    assert.equal(pant, current.pant);

    const lockedPlan = Somo.generateSchedule(
      Object.assign({}, baseOptions, {
        locks: [{ week: 1, day: 0, shirt: next.shirt, pant: next.pant }],
      })
    );
    assert.equal(lockedPlan.slots[0].shirt, next.shirt);
    assert.equal(lockedPlan.slots[0].pant, next.pant);

    const seed = Somo.findShuffledSeed(
      Object.assign({}, baseOptions, {
        locks: [{ week: 1, day: 0, shirt: next.shirt, pant: next.pant }],
      }),
      lockedPlan.days,
      1,
      48
    );
    const shuffled = Somo.generateSchedule(
      Object.assign({}, baseOptions, {
        seed: seed,
        locks: [{ week: 1, day: 0, shirt: next.shirt, pant: next.pant }],
      })
    );
    assert.equal(shuffled.slots[0].shirt, next.shirt);
    assert.equal(shuffled.slots[0].pant, next.pant);
    assert.equal(shuffled.slots[0].locked, true);
    assert.notEqual(Somo.daySignature(lockedPlan.days), Somo.daySignature(shuffled.days));
    assert.equal(shuffled.shirtConsec, 0);
  });

  it("cannot change the only possible pair", () => {
    const options = { shirts: 1, pants: 1, weeks: 1, daysPerWeek: 5 };
    const step = Somo.cycleDayPair(options, 1, 0, 0, 0);
    assert.equal(step.changed, false);
    assert.equal(step.shirt, 0);
    assert.equal(step.pant, 0);
    const off = Somo.cycleDayPair(options, 1, 6, 0, 0);
    assert.equal(off.changed, false);
    assert.equal(off.reason, "not-working");
  });

  it("keeps repeat references accurate when some days are locked", () => {
    const p = Somo.generateSchedule({
      shirts: 2,
      pants: 2,
      weeks: 2,
      daysPerWeek: 5,
      locks: [{ week: 2, day: 0, shirt: 0, pant: 0 }],
    });
    const mon2 = p.slots.find((s) => s.week === 2 && s.day === 0);
    assert.equal(mon2.locked, true);
    assert.equal(mon2.shirt, 0);
    assert.equal(mon2.pant, 0);
    if (mon2.repeatOf) {
      assert.match(mon2.repeatOf, /^Week 1 /);
      assert.equal(mon2.repeatLabel || Somo.repeatLabel(mon2.repeatOf), "Repeat of " + mon2.repeatOf);
    }
    let recent = null;
    for (const slot of p.slots) {
      if (slot.holiday) continue;
      if (slot.shirt === 0 && slot.pant === 0) {
        if (slot === mon2) {
          assert.equal(mon2.repeatOf, recent ? Somo.slotRef(recent.week, recent.dayName) : null);
        }
        recent = slot;
      }
    }
    const rows = Somo.timetableRows(p);
    assert.equal(rows[1].cells[0].locked, true);
  });
});
