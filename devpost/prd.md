doc: prd
status: approved
---

# Revision Radar — Product Requirements

One line: a backwards exam-revision planner for a student staring at a syllabus one to three weeks before an exam.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`.

## The Core Journey
Source: `scope.md > The Core Loop`.
1. First visit: the Setup screen opens with an exam countdown asking for the exam date and the chapter list. Nothing else competes for attention.
2. The student adds chapters one at a time: name, subject tag, weight (heavy / normal / light), confidence (weak / okay / strong). Each lands in a live list; the running count of days needed vs days left ticks up.
3. They press "Build my plan." The Plan screen fills with a day rail counting backwards from the exam date: each day card lists its chapter blocks, weakest + heaviest first, with a revision (second-pass) day booked before the exam and a rest evening on the eve.
4. Day to day they open the app, see the Today view (what's on today's card), study, and tick blocks off. Ticking a block greys it and rolls completion into a progress strip on the Plan screen.
5. When they skip a day or realize a chapter is harder than they thought, they change that chapter's confidence or press "I slipped a day", then Re-plan: the remaining days re-sequence in place. Dropped or compressed passes are called out by name, not silently.

## Screens and Layout
Three surfaces in one page, switched without reload:
- **Setup** — exam date picker at top, chapter add-row beneath, chapter list below that with inline weight/confidence selectors and remove buttons, sticky action bar with the panic meter (days needed vs days left) and the Build button.
- **Plan** — header with countdown and panic meter, then a horizontal-scrolling day rail: one card per day (date, day number, chapter blocks with badges for weight/confidence/first-pass vs revision), plus a progress strip. "Re-plan" and "Back to setup" controls.
- **Today** — today's card pulled out full-width: date, blocks to study with checkboxes, what comes next, and quick links back to the Plan.

## Look and Feel
Exam-week war room: near-black ink background, alarm-orange accent used only for warnings and the countdown, teal for done, off-white type. Big monospace digits for dates and countdown; body text in a plain humanist face. Dense but calm; no pastels, no rounded-card cuteness, no generic purple-gradient AI styling.

## Features and Behavior

### Syllabus setup
- Add a chapter via one row: name (required, non-empty), subject tag (free text, optional), weight, confidence. Enter adds it and clears the row.
- Every chapter row can be edited in place (weight/confidence dropdowns) and removed.
- The panic meter updates live as chapters are added or removed.

### Backwards plan generation
- First study day is computed by walking backwards from the exam date: exam eve is a rest day, the last 2 study days hold revision (second-pass) blocks for the heaviest chapters, remaining days take first passes.
- First-pass ordering: chapters sorted by score (weight and weak confidence both raise urgency), then spread across days, at most one heavy + one light block per day.
- If chapters need more days than remain, the panic meter goes red before generating and the plan drops revision passes first, then second passes of light chapters, and says so.

### Today and check-off
- The Today view shows the current day's blocks (by real date), with checkboxes. Ticking persists immediately.
- Days in the past that still have unticked blocks show as missed on the Plan rail.

### Slip and Re-plan
- "I slipped a day" marks today as lost; Re-plan rebuilds the plan for remaining days only, keeping already-ticked blocks as done history.
- Re-plan compresses by dropping the same tiers as generation (revision passes, then light second passes) and lists exactly what was dropped in a one-line banner.

## States and Boundaries
- **First use** — empty state on Setup: one friendly line, the chapter row ready, countdown prompting for a date.
- **Missing exam date** — Build is disabled with a hint until a date is set.
- **Exam date in the past or today** — inline error on the date field.
- **No chapters** — Build disabled with a hint.
- **Panic (days needed > days left)** — meter red; generation proceeds with visible cuts, never silently.
- **Exam day / post-exam** — countdown hits zero and the app shows a plain "it's exam day" state; the plan rail stays browsable.
- **Persistence** — syllabus, plan, and ticks survive reload via localStorage; nothing is stored remotely.
- **All blocks for today ticked** — Today shows a short done-state line, not an empty screen.

## Product Decisions
- One exam at a time — the kernel is backwards planning for a single deadline; multi-exam is UI plumbing, not proof (source: `scope.md > Explicitly Cut`).
- Check-off only on the Today view — one screen owns the daily habit; the Plan stays a map (builder chose this to keep the rail clean).
- Re-plan is explicit, not automatic — the student decides when the plan is stale, which keeps the moment visible for the demo (builder's choice).
- No deployment dependency — the video and repo are the deliverables; a GitHub Pages link is a bonus, not a requirement.

## What We're Building
Everything in Screens and Layout plus the four behavior areas above, in one page, persisted locally, demonstrable end to end in under a minute.

## Deferred From the POC
- Accounts and cross-device sync — the plan must survive without them to prove the kernel.
- Notifications — out of scope per cut list.
- Multiple exams — cut.
- Attachments and notes per chapter — no scheduling value.

## Possible Later Enhancements
Subject color coding, a shareable plan image, a pomodoro block timer on the Today view, importing a syllabus from pasted text.

## Non-Goals
- Not a calendar: it plans revision days, not appointments.
- Not a content app: no chapter notes, PDFs, or links.
- No backend of any kind.

## Open Questions
None blocking; styling details are owned by the Look and Feel section.
