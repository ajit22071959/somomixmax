/**
 * somomixmax scheduler — pure functions, used by the page and by Node tests.
 *
 * A plan is a sequence of shirt/pant pairs that:
 *  - uses every unique pair before repeating any
 *  - when repeats are needed, keeps any two pairs' counts within 1
 *  - wears each shirt and each pant as evenly as possible
 *  - avoids the same shirt on consecutive days when possible (always, if
 *    there are at least two shirts)
 *  - avoids the same pant on consecutive days when possible
 *
 * seed 0 is the default deterministic plan. Other seeds produce different
 * plans of the same quality, used by the Shuffle button.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Somomixmax = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIMITS = {
    minItems: 1,
    maxItems: 50,
    minWeeks: 1,
    maxWeeks: 52,
    minDaysPerWeek: 1,
    maxDaysPerWeek: 7,
  };

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function identityPerm(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(i);
    return out;
  }

  function shuffledPerm(n, rng) {
    const out = identityPerm(n);
    if (!rng) return out;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function indexRank(perm) {
    const rank = new Array(perm.length);
    for (let i = 0; i < perm.length; i++) rank[perm[i]] = i;
    return rank;
  }

  function isInt(n) {
    return typeof n === "number" && Number.isInteger(n);
  }

  function validateInputs({ shirts, pants, weeks, daysPerWeek }) {
    const errors = [];
    function check(value, min, max, label) {
      if (!isInt(value) || value < min || value > max) {
        errors.push(`${label} must be a whole number from ${min} to ${max}.`);
      }
    }
    check(shirts, LIMITS.minItems, LIMITS.maxItems, "Number of shirts");
    check(pants, LIMITS.minItems, LIMITS.maxItems, "Number of pants");
    check(weeks, LIMITS.minWeeks, LIMITS.maxWeeks, "Number of weeks");
    check(
      daysPerWeek,
      LIMITS.minDaysPerWeek,
      LIMITS.maxDaysPerWeek,
      "Work days per week"
    );
    return errors;
  }

  function defaultShirtName(i) {
    return "Shirt " + (i + 1);
  }

  function defaultPantName(i) {
    return "Pant " + (i + 1);
  }

  function normalizeNames(names, count, fallback) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const raw = names && names[i] != null ? String(names[i]).trim() : "";
      out.push(raw || fallback(i));
    }
    return out;
  }

  /**
   * Pick r edges of K_{S,P} so shirt degrees differ by at most 1 and
   * pant degrees differ by at most 1.
   */
  function selectBalancedPairs(S, P, r, shirtRank, pantRank) {
    const chosen = [];
    const used = new Set();
    const sCount = new Array(S).fill(0);
    const pCount = new Array(P).fill(0);

    for (let n = 0; n < r; n++) {
      let bestS = -1;
      let bestP = -1;
      for (let s = 0; s < S; s++) {
        for (let p = 0; p < P; p++) {
          const key = s + "," + p;
          if (used.has(key)) continue;
          if (bestS < 0) {
            bestS = s;
            bestP = p;
            continue;
          }
          if (cmpPairCandidate(s, p, bestS, bestP, sCount, pCount, shirtRank, pantRank) < 0) {
            bestS = s;
            bestP = p;
          }
        }
      }
      chosen.push([bestS, bestP]);
      used.add(bestS + "," + bestP);
      sCount[bestS]++;
      pCount[bestP]++;
    }

    rebalancePantDegrees(chosen, used, S, P, pCount);
    return chosen;
  }

  function cmpPairCandidate(s, p, s2, p2, sCount, pCount, shirtRank, pantRank) {
    if (sCount[s] !== sCount[s2]) return sCount[s] - sCount[s2];
    if (pCount[p] !== pCount[p2]) return pCount[p] - pCount[p2];
    if (shirtRank[s] !== shirtRank[s2]) return shirtRank[s] - shirtRank[s2];
    return pantRank[p] - pantRank[p2];
  }

  function rebalancePantDegrees(chosen, used, S, P, pCount) {
    function spread() {
      let lo = 0;
      let hi = 0;
      for (let p = 1; p < P; p++) {
        if (pCount[p] < pCount[lo]) lo = p;
        if (pCount[p] > pCount[hi]) hi = p;
      }
      return { lo, hi, gap: pCount[hi] - pCount[lo] };
    }

    let guard = S * P + 4;
    while (guard-- > 0) {
      const { lo, hi, gap } = spread();
      if (gap <= 1) return;

      let swapped = false;
      for (let i = 0; i < chosen.length; i++) {
        const s = chosen[i][0];
        const p = chosen[i][1];
        if (p !== hi) continue;
        const altKey = s + "," + lo;
        if (used.has(altKey)) continue;
        used.delete(s + "," + p);
        used.add(altKey);
        chosen[i][1] = lo;
        pCount[hi]--;
        pCount[lo]++;
        swapped = true;
        break;
      }
      if (swapped) continue;

      // 2-cycle swap: (s1,hi) and (s2,lo) become (s1,lo) and (s2,hi)
      for (let i = 0; i < chosen.length && !swapped; i++) {
        if (chosen[i][1] !== hi) continue;
        const s1 = chosen[i][0];
        if (used.has(s1 + "," + lo)) continue;
        for (let j = 0; j < chosen.length; j++) {
          if (chosen[j][1] !== lo) continue;
          const s2 = chosen[j][0];
          if (used.has(s2 + "," + hi)) continue;
          used.delete(s1 + "," + hi);
          used.delete(s2 + "," + lo);
          used.add(s1 + "," + lo);
          used.add(s2 + "," + hi);
          chosen[i][1] = lo;
          chosen[j][1] = hi;
          // counts of hi and lo stay the same in a 2-cycle... this doesn't help.
          // Revert — a 2-cycle on the same two pants preserves degrees.
          used.delete(s1 + "," + lo);
          used.delete(s2 + "," + hi);
          used.add(s1 + "," + hi);
          used.add(s2 + "," + lo);
          chosen[i][1] = hi;
          chosen[j][1] = lo;
        }
      }

      // If we cannot move an endpoint from hi to lo, stop. On K_{S,P}
      // the greedy choice should already be balanced.
      break;
    }
  }

  function allPairs(S, P, shirtPerm, pantPerm) {
    const pairs = [];
    for (let i = 0; i < S; i++) {
      const s = shirtPerm[i];
      for (let j = 0; j < P; j++) {
        pairs.push([s, pantPerm[j]]);
      }
    }
    return pairs;
  }

  function isCompletePairSet(pairs, S, P) {
    if (pairs.length !== S * P) return false;
    const seen = new Set();
    for (let i = 0; i < pairs.length; i++) {
      seen.add(pairs[i][0] + "," + pairs[i][1]);
    }
    return seen.size === S * P;
  }

  function pathConflicts(seq, prev, S, P) {
    let lastS = prev ? prev.shirt : null;
    let lastP = prev ? prev.pant : null;
    let shirt = 0;
    let pant = 0;
    for (let i = 0; i < seq.length; i++) {
      if (lastS != null && seq[i].shirt === lastS) shirt++;
      if (lastP != null && seq[i].pant === lastP) pant++;
      lastS = seq[i].shirt;
      lastP = seq[i].pant;
    }
    return { shirt: shirt, pant: pant };
  }

  /**
   * When every pair is present, a modular "both coordinates change"
   * sequence exists unless P === 2 and S is even (and the 1-shirt or
   * 1-pant cases, which cannot avoid repeats on the singleton side).
   * Returns null if this construction does not apply.
   */
  function modularCompleteSequence(S, P, shirtPerm, pantPerm, prev) {
    if (S < 2 || P < 2) return null;
    const ds = [];
    for (let d = 1; d < P; d++) {
      if ((d * (S - 1)) % P !== 1) ds.push(d);
    }
    if (!ds.length) return null;

    const period = S * P;
    const builds = [];
    for (let di = 0; di < ds.length; di++) {
      const d = ds[di];
      for (let pOff = 0; pOff < P; pOff++) {
        const seq = [];
        for (let t = 0; t < period; t++) {
          const si = t % S;
          const pi = (Math.floor(t / S) + d * si + pOff) % P;
          seq.push({ shirt: shirtPerm[si], pant: pantPerm[pi] });
        }
        builds.push(seq);
      }
    }

    function score(seq) {
      const c = pathConflicts(seq, prev, S, P);
      // Prefer a rotation that stitches cleanly to the previous day.
      return c.shirt * 1000 + c.pant;
    }

    let best = null;
    let bestScore = Infinity;
    for (let b = 0; b < builds.length; b++) {
      const base = builds[b];
      const variants = [base, base.slice().reverse()];
      for (let v = 0; v < variants.length; v++) {
        const src = variants[v];
        for (let t0 = 0; t0 < period; t0++) {
          const seq = [];
          for (let t = 0; t < period; t++) seq.push(src[(t + t0) % period]);
          const sc = score(seq);
          if (sc < bestScore) {
            bestScore = sc;
            best = seq;
            if (sc === 0) return best;
          }
        }
      }
    }
    return best;
  }

  function countOnward(pairs, used, idx, S, P, allowPantRepeat, lastShirt, lastPant) {
    const s0 = pairs[idx][0];
    const p0 = pairs[idx][1];
    let n = 0;
    for (let i = 0; i < pairs.length; i++) {
      if (i === idx || used[i]) continue;
      const s = pairs[i][0];
      const p = pairs[i][1];
      if (S >= 2 && s === s0) continue;
      if (!allowPantRepeat && P >= 2 && p === p0) continue;
      n++;
    }
    return n;
  }

  function searchSequence(pairs, prev, S, P, shirtRank, pantRank, allowPantRepeat, maxSteps) {
    const n = pairs.length;
    const used = new Array(n).fill(false);
    const path = [];
    let steps = 0;

    function search(lastShirt, lastPant, filled) {
      if (filled === n) return true;
      if (++steps > maxSteps) return false;

      const cands = [];
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const s = pairs[i][0];
        const p = pairs[i][1];
        if (S >= 2 && lastShirt != null && s === lastShirt) continue;
        const pantBad = P >= 2 && lastPant != null && p === lastPant;
        if (pantBad && !allowPantRepeat) continue;
        cands.push(i);
      }
      if (!cands.length) return false;

      cands.sort(function (a, b) {
        const pa = pairs[a];
        const pb = pairs[b];
        const aPantBad = P >= 2 && lastPant != null && pa[1] === lastPant ? 1 : 0;
        const bPantBad = P >= 2 && lastPant != null && pb[1] === lastPant ? 1 : 0;
        if (aPantBad !== bPantBad) return aPantBad - bPantBad;
        const aOn = countOnward(pairs, used, a, S, P, allowPantRepeat, pa[0], pa[1]);
        const bOn = countOnward(pairs, used, b, S, P, allowPantRepeat, pb[0], pb[1]);
        if (aOn !== bOn) return aOn - bOn;
        if (shirtRank[pa[0]] !== shirtRank[pb[0]]) return shirtRank[pa[0]] - shirtRank[pb[0]];
        return pantRank[pa[1]] - pantRank[pb[1]];
      });

      for (let c = 0; c < cands.length; c++) {
        const i = cands[c];
        used[i] = true;
        path.push({ shirt: pairs[i][0], pant: pairs[i][1] });
        if (search(pairs[i][0], pairs[i][1], filled + 1)) return true;
        path.pop();
        used[i] = false;
        if (steps > maxSteps) return false;
      }
      return false;
    }

    if (search(prev ? prev.shirt : null, prev ? prev.pant : null, 0)) {
      return path.slice();
    }
    return null;
  }

  function buildShirtSequence(counts, prevShirt, S, shirtRank) {
    const rem = counts.slice();
    const total = rem.reduce((a, b) => a + b, 0);
    const seq = [];
    let prev = prevShirt;

    for (let t = 0; t < total; t++) {
      let best = -1;
      for (let s = 0; s < S; s++) {
        if (rem[s] <= 0) continue;
        const blocked =
          S >= 2 && prev != null && s === prev && hasOtherRemaining(rem, s);
        if (blocked) continue;
        if (best < 0 || rem[s] > rem[best] || (rem[s] === rem[best] && shirtRank[s] < shirtRank[best])) {
          best = s;
        }
      }
      if (best < 0) {
        // Should only happen if S === 1, or a theoretical leftover.
        for (let s = 0; s < S; s++) {
          if (rem[s] > 0) {
            best = s;
            break;
          }
        }
      }
      seq.push(best);
      rem[best]--;
      prev = best;
    }
    return seq;
  }

  function hasOtherRemaining(rem, except) {
    for (let i = 0; i < rem.length; i++) {
      if (i !== except && rem[i] > 0) return true;
    }
    return false;
  }

  function pantRemainingTotals(bag, S, P) {
    const totals = new Array(P).fill(0);
    for (let s = 0; s < S; s++) {
      const list = bag[s];
      for (let i = 0; i < list.length; i++) totals[list[i]]++;
    }
    return totals;
  }

  function greedySequenceRound(pairs, prev, S, P, shirtRank, pantRank) {
    const shirtCounts = new Array(S).fill(0);
    const bag = Array.from({ length: S }, () => []);
    for (let i = 0; i < pairs.length; i++) {
      const s = pairs[i][0];
      const p = pairs[i][1];
      shirtCounts[s]++;
      bag[s].push(p);
    }

    const shirtSeq = buildShirtSequence(
      shirtCounts,
      prev ? prev.shirt : null,
      S,
      shirtRank
    );

    const result = [];
    let prevPant = prev ? prev.pant : null;

    for (let t = 0; t < shirtSeq.length; t++) {
      const s = shirtSeq[t];
      const avail = bag[s];
      const totals = pantRemainingTotals(bag, S, P);
      let pick = 0;
      for (let i = 0; i < avail.length; i++) {
        const p = avail[i];
        const cur = avail[pick];
        const iRepeat = prevPant != null && p === prevPant;
        const curRepeat = prevPant != null && cur === prevPant;
        const iAvoidable = iRepeat && avail.some(function (x) { return x !== prevPant; });
        const curAvoidable = curRepeat && avail.some(function (x) { return x !== prevPant; });
        if (iAvoidable !== curAvoidable) {
          if (curAvoidable) pick = i;
          continue;
        }
        if (totals[p] !== totals[cur]) {
          if (totals[p] > totals[cur]) pick = i;
          continue;
        }
        if (pantRank[p] < pantRank[cur]) pick = i;
      }
      const p = avail.splice(pick, 1)[0];
      result.push({ shirt: s, pant: p });
      prevPant = p;
    }
    return result;
  }

  function sequenceRound(pairs, prev, S, P, shirtRank, pantRank) {
    if (!pairs.length) return [];

    if (isCompletePairSet(pairs, S, P)) {
      const modular = modularCompleteSequence(S, P, invertRank(shirtRank), invertRank(pantRank), prev);
      if (modular && pathConflicts(modular, prev, S, P).shirt === 0) {
        // Accept even if a pant clash with prev is unavoidable.
        if (pathConflicts(modular, prev, S, P).pant === 0 || P < 2) return modular;
        // Keep it as a strong candidate; search may still beat the boundary.
        const searched = searchSequence(pairs, prev, S, P, shirtRank, pantRank, false, 80000);
        if (searched) return searched;
        return modular;
      }
    }

    const cap = pairs.length <= 24 ? 200000 : pairs.length <= 80 ? 120000 : 40000;
    const perfect = searchSequence(pairs, prev, S, P, shirtRank, pantRank, false, cap);
    if (perfect) return perfect;

    const shirtSafe = searchSequence(pairs, prev, S, P, shirtRank, pantRank, true, cap);
    if (shirtSafe) return shirtSafe;

    return greedySequenceRound(pairs, prev, S, P, shirtRank, pantRank);
  }

  function invertRank(rank) {
    const perm = new Array(rank.length);
    for (let i = 0; i < rank.length; i++) perm[rank[i]] = i;
    return perm;
  }

  function countsDifferByAtMostOne(counts) {
    if (!counts.length) return true;
    let min = counts[0];
    let max = counts[0];
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < min) min = counts[i];
      if (counts[i] > max) max = counts[i];
    }
    return max - min <= 1;
  }

  function analyze(days, S, P) {
    const unique = S * P;
    const totalDays = days.length;
    const pairCounts = new Map();
    const seen = new Set();
    let repeatDays = 0;
    let firstRepeatIndex = null;
    const shirtWear = new Array(S).fill(0);
    const pantWear = new Array(P).fill(0);
    let shirtConsec = 0;
    let pantConsec = 0;
    const pairKeysInOrder = [];

    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const key = d.shirt + ":" + d.pant;
      pairKeysInOrder.push(key);
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      if (seen.has(key)) {
        repeatDays++;
        if (firstRepeatIndex == null) firstRepeatIndex = i;
      } else {
        seen.add(key);
      }
      shirtWear[d.shirt]++;
      pantWear[d.pant]++;
      if (i > 0 && d.shirt === days[i - 1].shirt) shirtConsec++;
      if (i > 0 && d.pant === days[i - 1].pant) pantConsec++;
    }

    const pairCountValues = [];
    pairCounts.forEach(function (v) {
      pairCountValues.push(v);
    });
    // Include unused pairs as zero when D < unique, so "differ by at most 1"
    // still holds against unused outfits (0 or 1).
    while (pairCountValues.length < unique) pairCountValues.push(0);

    return {
      unique: unique,
      totalDays: totalDays,
      repeatDays: repeatDays,
      firstRepeatIndex: firstRepeatIndex,
      seenCount: seen.size,
      shirtWear: shirtWear,
      pantWear: pantWear,
      shirtConsec: shirtConsec,
      pantConsec: pantConsec,
      pairCounts: pairCounts,
      pairCountValues: pairCountValues,
    };
  }

  function summarize(unique, totalDays, repeatDays) {
    const outfitWord = unique === 1 ? "unique outfit" : "unique outfits";
    const dayWord = totalDays === 1 ? "day" : "days";
    if (repeatDays === 0) {
      return unique + " " + outfitWord + "; your " + totalDays + " " + dayWord + " need no repeats";
    }
    const verb = repeatDays === 1 ? "is a repeat" : "are repeats";
    return (
      unique +
      " " +
      outfitWord +
      "; " +
      repeatDays +
      " of your " +
      totalDays +
      " " +
      dayWord +
      " " +
      verb +
      " of an earlier pair"
    );
  }

  function generateSchedule(options) {
    const S = options.shirts;
    const P = options.pants;
    const weeks = options.weeks;
    const daysPerWeek = options.daysPerWeek;
    const seed = options.seed == null ? 0 : options.seed >>> 0;

    const errors = validateInputs({ shirts: S, pants: P, weeks: weeks, daysPerWeek: daysPerWeek });
    if (errors.length) {
      const err = new Error(errors.join(" "));
      err.errors = errors;
      throw err;
    }

    const D = weeks * daysPerWeek;
    const rng = seed === 0 ? null : mulberry32(seed);
    const shirtPerm = shuffledPerm(S, rng);
    const pantPerm = shuffledPerm(P, rng);
    const shirtRank = indexRank(shirtPerm);
    const pantRank = indexRank(pantPerm);

    const unique = S * P;
    const fullRounds = Math.floor(D / unique);
    const extraCount = D % unique;

    const rounds = [];
    const complete = allPairs(S, P, shirtPerm, pantPerm);
    for (let i = 0; i < fullRounds; i++) {
      rounds.push(complete.map(function (pair) { return [pair[0], pair[1]]; }));
    }
    if (extraCount > 0) {
      rounds.push(selectBalancedPairs(S, P, extraCount, shirtRank, pantRank));
    }

    const days = [];
    for (let i = 0; i < rounds.length; i++) {
      const prev = days.length ? days[days.length - 1] : null;
      const ordered = sequenceRound(rounds[i], prev, S, P, shirtRank, pantRank);
      for (let j = 0; j < ordered.length; j++) days.push(ordered[j]);
    }

    const stats = analyze(days, S, P);
    const shirtNames = normalizeNames(options.shirtNames, S, defaultShirtName);
    const pantNames = normalizeNames(options.pantNames, P, defaultPantName);
    const dayNames = DAY_NAMES.slice(0, daysPerWeek);

    return {
      days: days,
      weeks: weeks,
      daysPerWeek: daysPerWeek,
      shirts: S,
      pants: P,
      seed: seed,
      shirtNames: shirtNames,
      pantNames: pantNames,
      dayNames: dayNames,
      unique: stats.unique,
      totalDays: stats.totalDays,
      repeatDays: stats.repeatDays,
      shirtWear: stats.shirtWear,
      pantWear: stats.pantWear,
      shirtConsec: stats.shirtConsec,
      pantConsec: stats.pantConsec,
      summary: summarize(stats.unique, stats.totalDays, stats.repeatDays),
    };
  }

  /**
   * Find a seed that yields a plan different from `currentDays` but of
   * equal quality. Returns the same seed if no alternative is found.
   */
  function findShuffledSeed(options, currentDays, startSeed, attempts) {
    const maxAttempts = attempts || 48;
    const start = startSeed == null || startSeed < 1 ? 1 : startSeed;
    const signature = daySignature(currentDays);
    for (let i = 0; i < maxAttempts; i++) {
      const seed = start + i;
      const plan = generateSchedule(Object.assign({}, options, { seed: seed }));
      if (daySignature(plan.days) !== signature) return seed;
    }
    return start;
  }

  function daySignature(days) {
    let out = "";
    for (let i = 0; i < days.length; i++) {
      if (i) out += ";";
      out += days[i].shirt + "," + days[i].pant;
    }
    return out;
  }

  function timetableRows(plan) {
    const rows = [];
    for (let w = 0; w < plan.weeks; w++) {
      const cells = [];
      for (let d = 0; d < plan.daysPerWeek; d++) {
        const item = plan.days[w * plan.daysPerWeek + d];
        cells.push({
          dayName: plan.dayNames[d],
          shirtIndex: item.shirt,
          pantIndex: item.pant,
          shirtName: plan.shirtNames[item.shirt],
          pantName: plan.pantNames[item.pant],
        });
      }
      rows.push({ week: w + 1, cells: cells });
    }
    return rows;
  }

  function toCsv(plan) {
    const lines = ["Week,Day,Shirt,Pant"];
    const rows = timetableRows(plan);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < row.cells.length; j++) {
        const c = row.cells[j];
        lines.push(
          [row.week, c.dayName, csvEscape(c.shirtName), csvEscape(c.pantName)].join(",")
        );
      }
    }
    return lines.join("\n") + "\n";
  }

  function csvEscape(value) {
    const s = String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toPlainText(plan) {
    const lines = [plan.summary, ""];
    const rows = timetableRows(plan);
    for (let i = 0; i < rows.length; i++) {
      lines.push("Week " + rows[i].week);
      for (let j = 0; j < rows[i].cells.length; j++) {
        const c = rows[i].cells[j];
        lines.push("  " + c.dayName + ": " + c.shirtName + " + " + c.pantName);
      }
      lines.push("");
    }
    lines.push("Shirt wear");
    for (let i = 0; i < plan.shirts; i++) {
      lines.push("  " + plan.shirtNames[i] + ": " + plan.shirtWear[i]);
    }
    lines.push("");
    lines.push("Pant wear");
    for (let i = 0; i < plan.pants; i++) {
      lines.push("  " + plan.pantNames[i] + ": " + plan.pantWear[i]);
    }
    lines.push("");
    lines.push(
      "Repeats: " +
        plan.repeatDays +
        " of " +
        plan.totalDays +
        " days. Unique outfits available: " +
        plan.unique +
        "."
    );
    return lines.join("\n");
  }

  return {
    LIMITS: LIMITS,
    DAY_NAMES: DAY_NAMES,
    validateInputs: validateInputs,
    defaultShirtName: defaultShirtName,
    defaultPantName: defaultPantName,
    normalizeNames: normalizeNames,
    generateSchedule: generateSchedule,
    findShuffledSeed: findShuffledSeed,
    analyze: analyze,
    summarize: summarize,
    countsDifferByAtMostOne: countsDifferByAtMostOne,
    timetableRows: timetableRows,
    toCsv: toCsv,
    toPlainText: toPlainText,
    daySignature: daySignature,
  };
});
