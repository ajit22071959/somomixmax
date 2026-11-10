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
    const csv = Somo.toCsv(p);
    assert.match(csv, /^Week,Day,Shirt,Pant\n/);
    assert.equal(csv.trim().split("\n").length, 6);
    assert.match(Somo.toCsv(Somo.generateSchedule({
      shirts: 1, pants: 1, weeks: 1, daysPerWeek: 1,
      shirtNames: ['A, "quoted"'],
      pantNames: ["plain"],
    })), /"A, ""quoted"""/);
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
