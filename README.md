# somomixmax

A small wardrobe planner that mix-and-matches shirts and pants over a work period, repeating a specific pair as little as possible.

Live site: https://ajit22071959.github.io/somomixmax/

## What it does

Tell it how many shirts and pants you have, how many work weeks you want a plan for, and how long your work week is (default Monday–Friday). You can optionally name each piece.

It then draws up:

1. A timetable of which shirt to wear with which pant on which day
2. How many times each shirt is worn
3. How many times each pant is worn
4. How many days reuse a pair from an earlier day, against the number of unique outfits available (shirts × pants)

The planner uses every unique pairing before repeating any. When the period is longer than the number of unique outfits, repeats are spread evenly, so any two pairs differ by at most one wearing. Shirts and pants are worn as evenly as possible, and the same shirt is not worn on two consecutive plan days if you have more than one shirt (the same idea is applied to pants when it is possible).

**Make plan** gives the default timetable. **Shuffle** offers a different arrangement of the same quality, when more than one exists.

Your last inputs are remembered in this browser only.

## Phase 2

A style rating for combinations is planned for a later phase and is not part of this version.

## Running tests

Node.js 18+ (or 20, 22, 24) is enough. No other packages are required.

```bash
npm test
```

The tests cover pair-repeat optimality, even wear, the consecutive-piece rule, shuffling, names, CSV, and edge cases such as a single shirt.
