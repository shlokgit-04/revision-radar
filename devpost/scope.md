doc: scope
status: approved
---

# Revision Radar

A backwards exam-revision planner that turns a syllabus and an exam date into a day-by-day revision plan, and re-cuts the plan when the student slips.

## The Unique Kernel
The plan is generated backwards from the exam date and adapts: slip a day or discover a chapter is weaker than you thought, and one click re-sequences everything that's left instead of leaving you staring at a dead schedule. Weak, heavily weighted chapters float to the front automatically.

## Who It's For
A diploma/polytechnic student (like the builder) one to three weeks out from a unit test or final, staring at six subjects and no idea which chapter to open tonight. Today they either make a hand-written timetable they abandon by day 3, or just start at chapter 1 of whichever subject feels least scary.

## The Core Loop
Open the app -> add chapters with a weight (heavy/normal/light) and a confidence (weak/okay/strong) -> set the exam date -> get the full day-by-day plan -> study today's blocks and tick them off -> when a day gets skipped or a chapter turns out harder than expected, hit Re-plan and the remaining days re-sequence.

## Inspiration & Identity
An exam-week war room, not a cute planner: dark ink background, alarm-orange accents, big monospace day numbers, the countdown always visible. References: flight-departure boards and countdown clocks rather than pastel productivity apps.

## Why This Matters to the Learner
The builder lives this exact problem every term; the app is also a portfolio piece showing plan-first building with the Devpost Learn skill flow.

## What "Working" Looks Like
Add 6-8 chapters across 3 subjects, set an exam date about two weeks out, and see a complete day rail with every chapter placed. Tick today's blocks; skip a whole day, press Re-plan, and watch the remaining days compress and re-sequence with weakest/heaviest chapters still first. The "oh, that's cool" beat: the panic meter (days needed vs days left) flips to red and the plan visibly drops revision passes to fit.

## The POC Boundary
Single-page app, everything local in the browser: syllabus entry, backwards plan generation, today view with check-off, slip/re-plan, panic meter. localStorage persistence. No accounts, no notifications, one exam at a time.

## Later
Multiple exams side by side, sharing a plan, pomodoro timer, subject color themes.

## Explicitly Cut
- Accounts/sync - no backend in a PoC; localStorage is enough to prove the loop.
- Notifications/reminders - a planner that nags needs push infra; out of scope.
- Study-material attachments - proves nothing about the scheduling kernel.
- Multiple exams - one exam proves the backwards-planning kernel; more is UI plumbing.
