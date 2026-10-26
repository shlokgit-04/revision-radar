doc: spec
status: approved
---

# Revision Radar — Technical Spec

## How This Works, In Plain Language
One web page that never talks to a server. Everything the student does — chapters, the exam date, the plan, the ticks — is saved in the browser's localStorage, so the same page rebuilt on a reload picks up exactly where they left off. Three plain files hold it together: the page structure (index.html), the look (styles.css), and two scripts — app.js, which owns state, screens, and saving, and plan.js, a pure function that turns (chapters, exam date, remaining days) into the day-by-day schedule. Pure-plan means the scheduler never touches the DOM or storage; that is what makes Re-plan trivial (call the same function with fewer days) and testable (assert on its output directly).

## The Core Journey Through the System
The student adds a chapter on Setup → app.js validates, stores the chapter in state, writes state to localStorage, and re-renders the chapter list and panic meter → on Build, app.js hands (chapters, exam date, today's date) to plan.js, which walks backwards from the exam and returns an array of day objects with block lists → app.js saves that plan and renders the day rail on Plan → on Re-plan or a confidence change, the same function runs with the current remaining days and unticked blocks; a diff between old and new plans produces the "what got dropped" banner → on Today, app.js finds the day card matching today's date and renders its blocks with checkboxes that write straight back to storage.

## Stack
- Vanilla HTML/CSS/JavaScript (ES2020, no framework) — the PoC is one page; a framework would add build steps without adding proof. Chosen by the learner's accepted recommendation for zero-dependency deployability.
- No runtime dependencies; system font stacks (monospace display + humanist body) so the page works offline.
- Test harness: a small Node script (`test/plan.test.js`) running the scheduler's pure functions against fixed fixtures — no test framework dependency.
- Optional deployment: GitHub Pages (static, free).

## Where It Runs and How Someone Tries It
Runs in any modern browser. Open `index.html` directly (double-click) or serve the folder (`python3 -m http.server 8000`) and open http://localhost:8000. No API keys, no build step. For the demo video, serve locally and walk: add chapters, build the plan, tick blocks, slip + re-plan. Submission requires the demo video and public GitHub repository; deployment to GitHub Pages is optional and planned as a bonus.

## Look and Feel
Palette: ink `#0e1116` background, panel `#161b22`, alarm orange `#ff5c33` for countdown/warnings only, teal `#2dd4bf` for done/positive, off-white `#e8e6e1` text. Typography: monospace stack for day numbers and countdown, humanist sans for body. Density: compact rows, generous day-card spacing; copy is direct and slightly dry ("2 days gone", not "Oh no!").

## Components

### State and persistence (app.js)
Single state object (examDate, chapters[], plan, ticks{}, lostDays[], cutLog). Every mutation passes through `setState`, which saves to localStorage and schedules a render. PRD ref: `prd.md > States and Boundaries (Persistence)`.

### Screens and router (app.js)
Three views (setup, plan, today) toggled by a hash-free simple show/hide with a `current` field; nav links in the header. PRD ref: `prd.md > Screens and Layout`.

### Syllabus setup UI (app.js)
Chapter add-row with inline validation (name required, date future), editable chapter rows, live panic meter. PRD ref: `prd.md > Syllabus setup`.

### Scheduler (plan.js)
`scoreChapter`, `buildPlan(chapters, examDate, today)` returning `{days, cuts, panic}`; deterministic, pure. Implements the tiered compression in `prd.md > Backwards plan generation`. PRD ref: `prd.md > Backwards plan generation`.

### Day rail and Today view (app.js)
Renders `plan.days` as cards; missed-day detection; Today pulls the matching card and wires checkboxes to ticks. PRD ref: `prd.md > Today and check-off`.

### Re-plan diff (plan.js + app.js)
Re-running the scheduler over remaining unticked work and diffing block lists produces the dropped/compressed banner. PRD ref: `prd.md > Slip and Re-plan`.

## Data Model
```
state = {
  examDate: "2026-11-08" | null,
  chapters: [{ id, name, subject, weight: heavy|normal|light, confidence: weak|okay|strong }],
  plan: { days: [{ date: "YYYY-MM-DD", blocks: [{ chapterId, kind: first|revision, done }] }], cuts: [string], generatedAt },
  ticks: { "<date>_<chapterId>_<kind>": true },
  lostDays: ["YYYY-MM-DD"]
}
```
Lives in localStorage under key `revision-radar-v1`; written on every mutation, read on boot. Leaving and returning restores the exact screen state.

## File Structure
```
revision-radar/
├── index.html        # page skeleton, three view sections
├── styles.css        # theme, day rail, components
├── plan.js           # pure scheduler + re-plan diff
├── app.js            # state, storage, rendering, wiring
├── test/
│   └── plan.test.js  # node assertions over plan.js
├── devpost/          # learner profile (ignored), scope, prd, spec, checklist, app-map
├── README.md
└── .gitignore
```

## External Services and Dependencies
None. No APIs, no database, no hosting requirement. Optional GitHub Pages for the try-it-out link.

## Important Failure Modes
- **Corrupt/absent localStorage** → boot catches parse errors and starts a fresh state; user sees the Setup empty state, not a broken page.
- **Exam date changed to today/past after planning** → plan shows its exam-day state; Re-plan degrades to a rest-day plan with a notice.
- **Clock changed between sessions** → dates are stored as ISO strings and compared by string; a moved clock only re-marks missed days, never corrupts the plan.

## What Was Simplified and Why
- **Single localStorage key** instead of per-entity storage — one read/write per mutation keeps persistence code honest and small.
- **Deterministic scheduler with no "smart" load balancing** — fixed scoring (weight × confidence) over a simple spread; the kernel is adaptivity, not optimization.
- **Re-plan as full regeneration + diff** instead of incremental patching — simpler, provably correct, and the diff still tells the student what changed.

## Decisions and Open Issues
- Vanilla stack chosen by the learner (accepted recommendation): zero dependencies, deploys anywhere, the tradeoff is no component framework — accepted for a three-screen PoC.
- Learner uncertainty resolved during spec: how "slipping a day" can avoid double-counting missed past days — clarified by keeping ticks keyed by date and treating lost days as a set the scheduler excludes, verified in the scheduler test.
- Open (non-blocking): favicon and social preview image are cosmetic; deferred to build polish.
