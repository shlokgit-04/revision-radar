/* Revision Radar — pure scheduling engine.
 * No DOM, no storage: buildPlan(chapters, examDateISO, todayISO) -> {days, cuts, panic}
 * Deterministic and unit-testable (see test/plan.test.js).
 */
'use strict';

const WEIGHT = { heavy: 3, normal: 2, light: 1 };
const CONF = { weak: 3, okay: 2, strong: 1 };

function scoreChapter(c) {
  return WEIGHT[c.weight] * 2 + CONF[c.confidence];
}

/* Build the urgency order: weakest + heaviest first. */
function orderChapters(chapters) {
  return chapters
    .map((c) => ({ c, score: scoreChapter(c) }))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

/* Days needed estimate: every chapter gets a first pass; heavy/normal chapters
 * also get a revision pass. One heavy-equivalent slot per day. */
function slotsNeeded(chapters) {
  let slots = 0;
  for (const c of chapters) {
    slots += 1; // first pass
    if (c.weight !== 'light') slots += 1; // revision pass
    if (c.weight === 'heavy' && c.confidence === 'weak') slots += 0.5; // extra day share
  }
  return Math.ceil(slots);
}

/**
 * Walk backwards from the exam date.
 * - exam eve is a rest day
 * - the last `revSlots` study days hold revision (second-pass) blocks
 * - remaining days take first passes, urgency order
 * Returns { days, cuts, panic } — cuts is a list of human-readable notes,
 * panic is true when first passes alone no longer fit.
 */
function buildPlan(chapters, examDateISO, todayISO, lostDays = []) {
  const empty = { days: [], cuts: [], panic: false };
  if (!examDateISO || !todayISO || !chapters || chapters.length === 0) return empty;

  const totalSpan = daysBetween(todayISO, examDateISO);
  if (totalSpan <= 0) return { ...empty, days: [{ date: examDateISO, blocks: [], exam: true }] };

  const lost = new Set(lostDays);
  const studyDates = []; // working days between today and exam eve
  for (let i = 0; i < totalSpan; i++) {
    const d = addDays(todayISO, i);
    if (d !== examDateISO && !lost.has(d)) studyDates.push(d);
  }
  // exam eve rest day = last date before exam, if it's still free
  const eve = addDays(examDateISO, -1);
  const hasEve = studyDates.includes(eve);
  const bookable = hasEve ? studyDates.slice(0, -1) : studyDates.slice(); // days we may fill

  const ordered = orderChapters(chapters);

  // Tiered compression: try full plan (first passes + revision passes);
  // if it doesn't fit, drop tiers and record the cuts.
  const tiers = [
    { name: null, rev: 'all' },
    { name: 'revision passes for light chapters skipped', rev: 'heavy-normal' },
    { name: 'all revision passes skipped — first passes only', rev: 'none' },
  ];

  let plan = null;
  let cuts = [];
  for (const tier of tiers) {
    const attempt = attemptPlan(ordered, bookable, tier.rev, examDateISO);
    if (attempt.overflow === 0) {
      plan = attempt;
      break;
    }
    if (attempt.cutNote) cuts = [...cuts, attempt.cutNote];
    plan = attempt; // keep the most compressed attempt as the final plan
  }
  if (plan.overflow > 0) {
    const names = plan.overflowNames || [];
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '');
    cuts = [...cuts, `${plan.overflow} chapter(s) don't fit the days left: ${shown} — re-plan earlier or trim the syllabus`];
  }

  const panic = plan.overflow > 0 || slotsNeeded(chapters) > bookable.length;
  const days = [];
  for (const d of studyDates) {
    days.push({ date: d, blocks: plan.byDate.get(d) || [] });
  }
  days.push({ date: examDateISO, blocks: [], exam: true });
  return { days, cuts, panic };
}

function attemptPlan(ordered, bookable, revMode, examDateISO) {
  const byDate = new Map();
  const put = (date, block) => {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(block);
  };

  // 1) first passes strictly in urgency order, one per day
  const n = Math.min(ordered.length, bookable.length);
  for (let i = 0; i < n; i++) put(bookable[i], { chapterId: ordered[i].id, kind: 'first' });
  let overflow = ordered.length - n;

  // 2) overflow chapters are genuinely cut — they don't fit, and the plan says so
  const overflowNames = ordered.slice(n).map((c) => c.name);
    // 3) revision passes for the most urgent chapters on the days nearest the exam
  if (revMode !== 'none') {
    const pool = ordered
      .filter((c) => (revMode === 'heavy-normal' ? c.weight !== 'light' : true))
      .slice(0, 4);
    const revDays = bookable.slice().reverse().slice(0, pool.length);
    pool.forEach((c, i) => {
      const date = revDays[i] || addDays(examDateISO, -2);
      put(date, { chapterId: c.id, kind: 'revision' });
    });
  }

  const cutNote =
    revMode === 'heavy-normal'
      ? 'revision passes for light chapters skipped to fit'
      : revMode === 'none'
        ? 'all revision passes skipped — first passes only'
        : null;

  return { byDate, overflow, overflowNames, cutNote };
}

/* Re-plan diff: what changed between two plans. Blocks that vanished are
 * dropped (compression); blocks that survive on a different date are moved. */
function diffPlans(oldPlan, newPlan) {
  const key = (b) => `${b.chapterId}_${b.kind}`;
  const oldWhere = new Map();
  for (const d of oldPlan.days) for (const b of d.blocks) oldWhere.set(key(b), d.date);
  const newWhere = new Map();
  for (const d of newPlan.days) for (const b of d.blocks) newWhere.set(key(b), d.date);
  const dropped = [...oldWhere.keys()].filter((k) => !newWhere.has(k));
  const moved = [...newWhere.keys()].filter((k) => oldWhere.has(k) && oldWhere.get(k) !== newWhere.get(k));
  return { droppedCount: dropped.length, droppedKeys: dropped, movedCount: moved.length };
}

/* Shared namespace: app.js reads RR.* in the browser; tests import via module.exports. */
const RR = { scoreChapter, orderChapters, buildPlan, diffPlans, daysBetween, slotsNeeded, addDaysISO: addDays };

if (typeof module !== 'undefined') module.exports = RR;
