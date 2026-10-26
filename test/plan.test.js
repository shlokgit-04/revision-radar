const { buildPlan, diffPlans } = require('../plan.js');
const assert = require('assert');

const ch = (name, weight, confidence) => ({ id: name, name, weight, confidence });

function run() {
  // 1. Basic backwards structure: eve is rest, exam day marked
  const chapters = [ch('A', 'heavy', 'weak'), ch('B', 'normal', 'okay'), ch('C', 'light', 'strong')];
  const plan = buildPlan(chapters, '2026-11-10', '2026-10-27');
  assert.strictEqual(plan.days[plan.days.length - 1].exam, true, 'exam day last');
  assert.strictEqual(plan.days[plan.days.length - 2].date, '2026-11-09', 'eve rest day');
  assert.strictEqual(plan.days[plan.days.length - 2].blocks.length, 0, 'eve has no blocks');
  assert(plan.panic === false, 'comfortable window is not panic');

  // 2. Urgency: weak+heavy placed earlier than strong+light
  const firstA = plan.days.findIndex((d) => d.blocks.some((b) => b.chapterId === 'A'));
  const firstC = plan.days.findIndex((d) => d.blocks.some((b) => b.chapterId === 'C'));
  assert(firstA < firstC, 'weak heavy first');

  // 3. Panic window: more work than days -> panic true and cuts recorded
  const many = Array.from({ length: 12 }, (_, i) => ch(`CH${i}`, 'heavy', 'weak'));
  const tight = buildPlan(many, '2026-10-30', '2026-10-27');
  assert(tight.panic === true, 'tight window panics');
  assert(tight.cuts.length > 0, 'cuts are named');

  // 4. Lost day excluded and re-plan compresses
  const full = buildPlan(chapters, '2026-11-10', '2026-10-27');
  const slipped = buildPlan(chapters, '2026-11-10', '2026-10-27', ['2026-10-28']);
  const lostDay = full.days.find((d) => d.date === '2026-10-28');
  const slippedDay = slipped.days.find((d) => d.date === '2026-10-28');
  assert(!slippedDay, 'lost day removed from plan');
  const diff = diffPlans(full, slipped);
  assert(diff.movedCount > 0, 're-plan moves blocks and the diff sees it');

  // 4b. In a tight window, losing a day really drops passes
  const tightFull = buildPlan(many, '2026-10-30', '2026-10-27');
  const tightSlip = buildPlan(many, '2026-10-30', '2026-10-27', ['2026-10-28']);
  const tightDiff = diffPlans(tightFull, tightSlip);
  assert(tightDiff.droppedCount > 0, 'tight re-plan drops passes and names them');

  // 5. Zero or past exam date -> empty plan, no crash
  assert.deepStrictEqual(buildPlan([], '2026-11-10', '2026-10-27').days.length, 0);
  const past = buildPlan(chapters, '2026-10-01', '2026-10-27');
  assert.strictEqual(past.days.length, 1, 'past exam shows exam-day state only');

  console.log('plan.test.js: all 5 groups passed');
}
run();
