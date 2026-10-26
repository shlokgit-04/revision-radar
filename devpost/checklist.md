doc: checklist
status: approved
---

# Build Checklist

Build mode: fast (learner delegated the flow; verification kept, pauses compressed)

## Slices

- [x] **1. You can set the exam date and add a chapter, and it appears in the list**
  Becomes usable: a running page where a chapter typed into the add-row shows up in the list, with the countdown in the header.
  Why now: proves the whole path end to end — state, validation, render, save — so every later slice has somewhere to land.
  PRD ref: `prd.md > The Core Journey` (steps 1-2), `prd.md > Syllabus setup`
  Spec ref: `spec.md > Components > Syllabus setup UI`, `spec.md > File Structure`
  Build: scaffold index.html/styles.css, app.js state + add-row + chapter list + live panic meter.
  Verify (mechanical): page serves with no console errors; a chapter added renders; removal works.
  Learner check: delegated — assistant verified in the browser.
  Commit: `Scaffold: page skeleton with the three screens`, `Theme: exam-week war room look`

- [x] **2. The backwards scheduler turns syllabus + date into a day plan**
  Becomes usable: Build my plan fills the day rail, exam eve rests, revision passes sit near the exam, weak+heavy chapters come first.
  Why now: the kernel appears immediately, not last.
  PRD ref: `prd.md > Backwards plan generation`
  Spec ref: `spec.md > Components > Scheduler`
  Build: plan.js pure scheduler (score, order, backwards walk, tiered compression), Node tests.
  Verify (mechanical): `node test/plan.test.js` — 5 assertion groups pass (ordering, eve rule, panic tiers, re-plan diff, degenerate dates).
  Learner check: delegated — assistant verified the rail against the test fixtures.
  Commit: `Kernel: backwards scheduler with tiered compression + tests`, `Expose the scheduler as the RR namespace for the page`

- [x] **3. Everything survives a reload, and today has checkboxes**
  Becomes usable: chapters, plan and ticks restore from localStorage; the Today view ticks blocks off and persists.
  Why now: persistence is where the data model would first go wrong.
  PRD ref: `prd.md > States and Boundaries (Persistence)`, `prd.md > Today and check-off`
  Spec ref: `spec.md > Data Model`, `spec.md > Components > Day rail and Today view`
  Build: save/load under `revision-radar-v1`, Today view with checkboxes writing back through ticks.
  Verify (mechanical): added a chapter + tick, reloaded the live page, state restored exactly.
  Learner check: delegated — assistant verified.
  Commit: `App: state, localStorage, three screens, re-plan wiring`

- [x] **4. Slip a day and the plan re-cuts, saying what changed**
  Becomes usable: "I slipped a day" removes today and Re-plan rebuilds the rest, with a banner naming dropped passes and moved blocks; missed days grey out.
  Why now: this is the kernel moment — adaptivity, not a static timetable.
  PRD ref: `prd.md > Slip and Re-plan`
  Spec ref: `spec.md > Components > Re-plan diff`
  Build: lostDays set, Re-plan diff banner, missed-day detection, progress strip.
  Verify (mechanical): scheduler tests cover lost-day exclusion and diff counts; live walk-through confirmed the banner text.
  Learner check: delegated — assistant verified.
  Commit: `Ship: README, final polish and the learning wrap-up docs`

- [x] **5. Empty/error states behave**
  Becomes usable: first-use empty state, missing/past exam date errors, Build gating, exam-day state, corrupt-storage fallback.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Important Failure Modes`
  Build: validation paths in app.js, catch on boot, exam-day rendering.
  Verify (mechanical): exercised each state live (no date, past date, no chapters, exam day, cleared storage).
  Learner check: delegated — assistant verified.
  Commit: included in `Ship: README, final polish and the learning wrap-up docs`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 2, the plan rail was reviewed against fixtures before persistence landed
- [x] Final kick-the-tires exploration and feedback completed — full live walk-through on the deployed page (see Final Review)

## Final Review

- [x] Final review complete — feedback resolved and ready to ship

Findings and resolution: live review on GitHub Pages found the day rail crowding on narrow viewports; fixed with the minmax column sizing already in styles.css and verified. One real bug found and fixed during build: the re-plan diff initially reported zero dropped blocks because moving a day does not remove a block; diffPlans now reports moved and dropped separately, and the banner says both.

## Code Tour and App Map

- [x] Learning activity complete — focused alternative (familiar plan-first builder): traced one real uncertainty through the code
- [x] Optional edit and transfer reflection addressed — offered/already covered
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: the practice traced was the re-plan path — state.lostDays in `app.js` → `RR.buildPlan(..., state.lostDays)` in `app.js > #replanBtn.onclick` → `buildPlan()` date walk and tier loop in `plan.js` → `diffPlans()` consumed by the banner in `app.js > renderPlan()`. Verified by test group 4 (`test/plan.test.js`) and the live banner during the walk-through.
Route and stops: focused route, four stops, no guided code tour needed.
Edit outcome: not applicable (no edit attempted; route was verification).
Reflection: recorded in the ignored learner profile.
Activity mode: focused alternative.

## Revisions

- Re-plan diff now reports moved and dropped separately — the first version counted only drops, so a slipped day in a comfortable window looked like "nothing changed" even though every block had moved.
- Overflow chapters are cut, not squeezed — the initial panic path double-booked earliest days to force everything in, which hid the "doesn't fit" signal the panic meter exists to give.
