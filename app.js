/* Revision Radar — state, storage, rendering. The scheduler lives in plan.js. */
'use strict';

const STORE_KEY = 'revision-radar-v1';

const state = {
  examDate: null,
  chapters: [],            // {id, name, subject, weight, confidence}
  plan: null,              // {days:[{date, blocks:[{chapterId, kind}]}], cuts, panic}
  ticks: {},               // "<date>_<chapterId>_<kind>": true
  lostDays: [],            // dates marked as slipped
  view: 'setup',
  lastDiff: null,          // {droppedCount, movedCount} from the last re-plan
};

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    examDate: state.examDate, chapters: state.chapters, plan: state.plan,
    ticks: state.ticks, lostDays: state.lostDays,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, {
      examDate: s.examDate ?? null,
      chapters: Array.isArray(s.chapters) ? s.chapters : [],
      plan: s.plan ?? null,
      ticks: s.ticks ?? {},
      lostDays: s.lostDays ?? [],
    });
  } catch {
    // corrupt storage: start clean, user sees the Setup empty state
  }
}

/* ---------- days-left math (shared with the meter) ---------- */
function bookableDays() {
  if (!state.examDate) return 0;
  const t = todayISO();
  const span = RR.daysBetween(t, state.examDate);
  if (span <= 0) return 0;
  const lost = new Set(state.lostDays);
  let n = 0;
  for (let i = 0; i < span; i++) {
    const d = RR.addDaysISO(t, i);
    if (d !== state.examDate && d !== RR.addDaysISO(state.examDate, -1) && !lost.has(d)) n++;
  }
  return n;
}
const daysNeeded = () => RR.slotsNeeded(state.chapters);
const isPanic = () => state.chapters.length > 0 && daysNeeded() > bookableDays();

/* ---------- rendering ---------- */
function render() {
  renderTabs();
  renderCountdown();
  if (state.view === 'setup') renderSetup();
  if (state.view === 'plan') renderPlan();
  if (state.view === 'today') renderToday();
}

function show(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  render();
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === state.view);
  });
  $('#tabPlan').disabled = !state.plan;
  $('#tabToday').disabled = !state.plan;
}

function renderCountdown() {
  const el = $('#countdown');
  if (!state.examDate) { el.textContent = 'no exam set'; el.classList.remove('calm'); return; }
  const d = RR.daysBetween(todayISO(), state.examDate);
  el.classList.remove('calm');
  if (d > 1) { el.textContent = `T-${d} days`; }
  else if (d === 1) { el.textContent = 'T-1 day'; }
  else if (d === 0) { el.textContent = "it's exam day"; el.classList.remove('calm'); return; }
  else { el.textContent = 'exam over'; el.classList.add('calm'); return; }
  el.classList.toggle('calm', !isPanic());
}

function renderSetup() {
  $('#examDate').value = state.examDate || '';
  const list = $('#chList');
  list.innerHTML = '';
  state.chapters.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'ch-row';
    row.innerHTML = `
      <div><div class="ch-name"></div><div class="ch-sub"></div></div>
      <select data-act="weight">
        <option value="heavy">Heavy weight</option><option value="normal">Normal</option><option value="light">Light</option>
      </select>
      <select data-act="conf">
        <option value="weak">Weak</option><option value="okay">Okay</option><option value="strong">Strong</option>
      </select>
      <button class="rm" title="Remove">✕</button>`;
    row.querySelector('.ch-name').textContent = c.name;
    row.querySelector('.ch-sub').textContent = c.subject || '';
    row.querySelector('[data-act="weight"]').value = c.weight;
    row.querySelector('[data-act="conf"]').value = c.confidence;
    row.querySelector('[data-act="weight"]').onchange = (e) => {
      c.weight = e.target.value; save(); render();
    };
    row.querySelector('[data-act="conf"]').onchange = (e) => {
      c.confidence = e.target.value; save(); render();
    };
    row.querySelector('.rm').onclick = () => {
      state.chapters = state.chapters.filter((x) => x.id !== c.id); save(); render();
    };
    list.appendChild(row);
  });
  $('#chEmpty').classList.toggle('hidden', state.chapters.length > 0);

  const needed = daysNeeded(), left = bookableDays();
  const meter = $('#meter');
  meter.textContent = `${needed} / ${left}`;
  meter.classList.toggle('hot', needed > left);

  const ok = !!state.examDate && state.chapters.length > 0 && RR.daysBetween(todayISO(), state.examDate) > 0;
  $('#buildBtn').disabled = !ok;
  $('#buildHint').textContent = ok
    ? isPanic() ? 'Tight window: revision passes will be cut to fit.' : 'Ready — the plan builds backwards from the exam.'
    : 'Set an exam date and add at least one chapter.';
}

function chapterById(id) { return state.chapters.find((c) => c.id === id); }
const tickKey = (date, b) => `${date}_${b.chapterId}_${b.kind}`;

function renderPlan() {
  const plan = state.plan;
  if (!plan) return;
  const d = state.examDate ? RR.daysBetween(todayISO(), state.examDate) : null;
  $('#examLine').textContent = d === null ? 'Exam date not set'
    : d > 0 ? `Exam in ${d} day${d === 1 ? '' : 's'}` : d === 0 ? "It's exam day" : 'Exam over';
  $('#meter2').textContent = `${daysNeeded()}/${bookableDays()}`;
  $('#panicFlag').classList.toggle('hidden', !plan.panic);

  const banner = $('#cutBanner');
  const lines = [];
  if (state.lastDiff) {
    if (state.lastDiff.droppedCount) lines.push(`${state.lastDiff.droppedCount} pass(es) dropped`);
    if (state.lastDiff.movedCount) lines.push(`${state.lastDiff.movedCount} block(s) moved`);
  }
  (plan.cuts || []).forEach((c) => lines.push(c));
  banner.textContent = lines.length ? 'Plan re-cut: ' + lines.join(' · ') : '';
  banner.classList.toggle('hidden', !lines.length);

  // progress strip
  let total = 0, done = 0;
  plan.days.forEach((day) => day.blocks.forEach((b) => {
    total++;
    if (state.ticks[tickKey(day.date, b)]) done++;
  }));
  $('#progress').style.width = total ? `${Math.round((done / total) * 100)}%` : '0';

  const rail = $('#dayRail');
  rail.innerHTML = '';
  const t = todayISO();
  plan.days.forEach((day) => {
    const card = document.createElement('div');
    card.className = 'day-card';
    const missed = day.date < t && day.blocks.some((b) => !state.ticks[tickKey(day.date, b)]);
    if (day.exam) card.classList.add('exam');
    else if (day.date === t) card.classList.add('today');
    if (missed) card.classList.add('missed');
    const head = day.exam
      ? `<div class="day-num">EXAM</div><div class="day-date">${fmtDate(day.date)}</div><div class="day-tag">go get it</div>`
      : `<div class="day-num">${new Date(day.date + 'T00:00:00').getDate()}</div>
         <div class="day-date">${fmtDate(day.date)}</div>
         <div class="day-tag">${day.date === t ? 'today' : missed ? '<span class="missed-flag">missed</span>' : day.blocks.length + ' block(s)'}</div>`;
    card.innerHTML = head;
    (day.blocks || []).forEach((b) => {
      const c = chapterById(b.chapterId);
      if (!c) return;
      const isDone = !!state.ticks[tickKey(day.date, b)];
      const el = document.createElement('div');
      el.className = 'block' + (b.kind === 'revision' ? ' rev' : '') + (isDone ? ' done' : '');
      el.innerHTML = `${c.name}<span class="b-kind">${b.kind === 'revision' ? 'revision pass' : 'first pass'} · ${c.confidence} · ${c.weight}</span>`;
      card.appendChild(el);
    });
    rail.appendChild(card);
  });
}

function renderToday() {
  const card = $('#todayCard');
  if (!state.plan || !state.examDate) { card.innerHTML = '<p>No plan yet.</p>'; return; }
  const t = todayISO();
  const day = state.plan.days.find((x) => x.date === t);
  const d = RR.daysBetween(t, state.examDate);
  let html = `<h2>${d === 0 ? "Exam day" : `Today · T-${d}`}</h2><div class="today-date">${fmtDate(t)}</div>`;
  if (!day) {
    html += `<p class="next-up">Nothing scheduled today. ${d < 0 ? 'Hope it went well.' : 'Re-plan if the syllabus changed.'}</p>`;
  } else if (day.exam) {
    html += `<p class="done-line">It's exam day. No blocks, just you and the paper.</p>`;
  } else {
    const blocks = day.blocks;
    if (!blocks.length) {
      html += `<p class="next-up">Rest day — the eve before the exam is yours.</p>`;
    } else {
      blocks.forEach((b) => {
        const c = chapterById(b.chapterId);
        if (!c) return;
        const key = tickKey(t, b);
        const isDone = !!state.ticks[key];
        html += `<div class="todo${isDone ? ' done' : ''}">
          <input type="checkbox" data-key="${key}" ${isDone ? 'checked' : ''}>
          <label>${c.name}</label><span class="t-kind">${b.kind}</span></div>`;
      });
      const next = state.plan.days.find((x) => x.date > t && (x.blocks || []).length);
      const nc = next ? chapterById(next.blocks[0].chapterId) : null;
      html += `<p class="next-up">${nc ? `Up next: ${nc.name} on ${fmtDate(next.date)}.` : 'That was the last block — plan complete.'}</p>`;
    }
  }
  card.innerHTML = html;
  card.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.onchange = () => {
      if (box.checked) state.ticks[box.dataset.key] = true;
      else delete state.ticks[box.dataset.key];
      save();
      box.closest('.todo').classList.toggle('done', box.checked);
      renderCountdown();
    };
  });
}

/* ---------- actions ---------- */
function wire() {
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => show(t.dataset.view));
  document.querySelectorAll('[data-goto]').forEach((a) => a.onclick = (e) => { e.preventDefault(); show(a.dataset.goto); });

  $('#examDate').onchange = (e) => {
    const v = e.target.value;
    if (v && RR.daysBetween(todayISO(), v) <= 0) {
      $('#dateErr').textContent = 'Pick a date after today.';
      state.examDate = null;
    } else {
      $('#dateErr').textContent = '';
      state.examDate = v || null;
    }
    save(); render();
  };

  const addChapter = () => {
    const name = $('#chName').value.trim();
    if (!name) { $('#chErr').textContent = 'Give the chapter a name.'; return; }
    $('#chErr').textContent = '';
    state.chapters.push({
      id: uid(), name,
      subject: $('#chSubject').value.trim(),
      weight: $('#chWeight').value,
      confidence: $('#chConf').value,
    });
    $('#chName').value = ''; $('#chSubject').value = '';
    save(); render(); $('#chName').focus();
  };
  $('#addBtn').onclick = addChapter;
  $('#chName').onkeydown = (e) => { if (e.key === 'Enter') addChapter(); };

  $('#buildBtn').onclick = () => {
    const { days, cuts, panic } = RR.buildPlan(state.chapters, state.examDate, todayISO(), state.lostDays);
    state.plan = { days, cuts, panic, generatedAt: new Date().toISOString() };
    state.lastDiff = null;
    save(); show('plan');
  };

  $('#replanBtn').onclick = () => {
    if (!state.plan) return;
    const old = state.plan;
    const { days, cuts, panic } = RR.buildPlan(state.chapters, state.examDate, todayISO(), state.lostDays);
    state.plan = { days, cuts, panic, generatedAt: new Date().toISOString() };
    state.lastDiff = RR.diffPlans(old, state.plan);
    save(); render();
  };

  $('#slipBtn').onclick = () => {
    const t = todayISO();
    if (!state.lostDays.includes(t)) state.lostDays.push(t);
    $('#replanBtn').click();
  };

  $('#backBtn').onclick = () => show('setup');
}

load();
wire();
render();
show(state.plan ? 'plan' : 'setup');
