'use strict';

/* =====================================================================
 * FocusLock side panel — a thin controller.
 * It owns NO state: it reads chrome.storage.local, sends intents to the
 * service worker, and re-renders. The countdown is derived from endTime,
 * so it stays correct even though the worker sleeps between alarms.
 * ===================================================================== */

const el = (id) => document.getElementById(id);

const ui = {
  phase:   el('phase'),
  timer:   el('timer'),
  meta:    el('meta'),

  idle:    el('idleView'),
  running: el('runningView'),
  hold:    el('holdView'),

  input:   el('taskInput'),
  lock:    el('lockBtn'),
  done:    el('doneBtn'),
  done2:   el('doneBtn2'),
  holdBtn: el('holdBtn'),
  resume:  el('resumeBtn'),
  cancel:  el('cancelBtn'),
  cancel2: el('cancelBtn2'),

  sideL:   el('sideLeft'),
  sideR:   el('sideRight'),

  today:   el('today'),
  logList: el('logList'),
  clear:   el('clearLog')
};

const DEFAULTS = {
  phase: 'IDLE',
  lockedTabId: null,
  lockedWindowId: null,
  endTime: 0,
  sprintCount: 0,
  taskLabel: '',
  sessionStartedAt: 0,
  phaseStartedAt: 0,
  focusMsAccrued: 0,
  heldFrom: null,
  heldRemainingMs: 0,
  overlaySide: 'right'
};

let snapshot = Object.assign({}, DEFAULTS);
let ticker = null;

/* ---------------------------- Formatting ----------------------------- */

function mmss(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return m + ':' + s;
}

/** "1h 40m" / "25m" / "40s" — readable at a glance, no false precision. */
function duration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return Math.max(0, Math.round(ms / 1000)) + 's';
  if (mins < 60) return mins + 'm';
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
}

function dayStamp(ms) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? 'Today ' + time
                 : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ------------------------------ Render ------------------------------- */

function show(view) {
  ui.idle.classList.toggle('hidden', view !== 'idle');
  ui.running.classList.toggle('hidden', view !== 'running');
  ui.hold.classList.toggle('hidden', view !== 'hold');
}

function render(state) {
  const s = Object.assign({}, DEFAULTS, state || {});
  const task = '<span class="task-name">' + esc(s.taskLabel || 'Unnamed task') + '</span>';

  if (s.phase === 'FOCUS') {
    ui.phase.textContent = '\u{1F534} Locked in — focus';
    ui.phase.className = 'phase focus';
    ui.timer.textContent = mmss(s.endTime - Date.now());
    ui.timer.className = 'timer';
    ui.meta.innerHTML = task + '<br>Sprint ' + (s.sprintCount + 1) +
      ' &middot; one tab &middot; fullscreen enforced';
    show('running');

  } else if (s.phase === 'BREAK') {
    ui.phase.textContent = '\u{1F7E2} Break — tabs unlocked';
    ui.phase.className = 'phase break';
    ui.timer.textContent = mmss(s.endTime - Date.now());
    ui.timer.className = 'timer';
    ui.meta.innerHTML = task + '<br>' + s.sprintCount + ' sprint' +
      (s.sprintCount === 1 ? '' : 's') + ' done &middot; auto re-locks at 00:00';
    show('running');

  } else if (s.phase === 'HOLD') {
    const left = s.heldFrom === 'FOCUS' && s.heldRemainingMs > 0
      ? mmss(s.heldRemainingMs) + ' left on the sprint'
      : 'next sprint starts fresh';
    ui.phase.textContent = '\u{1F7E1} On hold';
    ui.phase.className = 'phase hold';
    ui.timer.textContent = '||';
    ui.timer.className = 'timer flat';
    ui.meta.innerHTML = task + '<br>' + s.sprintCount + ' sprint' +
      (s.sprintCount === 1 ? '' : 's') + ' banked &middot; ' + left;
    show('hold');

  } else {
    ui.phase.textContent = '\u{26AA} Idle';
    ui.phase.className = 'phase';
    ui.timer.textContent = '--:--';
    ui.timer.className = 'timer flat';
    ui.meta.textContent = 'Nothing locked. Pick one tab and commit.';
    show('idle');
  }

  ui.sideL.classList.toggle('on', s.overlaySide === 'left');
  ui.sideR.classList.toggle('on', s.overlaySide !== 'left');
}

/* Repaint only the clock every second; full state comes from storage. */
function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    if (snapshot.phase !== 'FOCUS' && snapshot.phase !== 'BREAK') return;
    ui.timer.textContent = mmss(snapshot.endTime - Date.now());
  }, 1000);
}

/* ---------------------------- Session log ---------------------------- */

function renderLog(log) {
  const entries = log || [];

  // Today's totals — the number that actually tells you how the day went.
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const todays = entries.filter((e) => e.endedAt >= midnight.getTime());
  const sprints = todays.reduce((n, e) => n + (e.sprints || 0), 0);
  const focusMs = todays.reduce((n, e) => n + (e.focusMs || 0), 0);

  ui.today.innerHTML = todays.length
    ? '<b>' + sprints + '</b> sprint' + (sprints === 1 ? '' : 's') +
      ' &middot; <b>' + duration(focusMs) + '</b> focused today'
    : 'No sprints logged today.';

  if (!entries.length) {
    ui.logList.innerHTML = '<p class="empty">Nothing logged yet.</p>';
    return;
  }

  ui.logList.innerHTML = entries.slice(0, 40).map((e) => {
    const outcome = ['FINISHED', 'CANCELLED', 'ABANDONED'].includes(e.outcome)
      ? e.outcome : 'ABANDONED';
    return '<div class="entry">' +
      '<div class="t">' + esc(e.task || 'Unnamed task') + '</div>' +
      '<div class="d">' +
        '<span class="chip ' + outcome + '">' + outcome + '</span> ' +
        (e.sprints || 0) + ' sprint' + (e.sprints === 1 ? '' : 's') +
        ' &middot; ' + duration(e.focusMs || 0) +
        ' &middot; ' + dayStamp(e.endedAt) +
      '</div>' +
    '</div>';
  }).join('');
}

async function refreshLog() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_LOG' });
  renderLog(res && res.sessionLog);
}

/* --------------------------- Wiring / boot --------------------------- */

async function refresh() {
  snapshot = await chrome.storage.local.get(DEFAULTS);
  render(snapshot);
}

document.addEventListener('DOMContentLoaded', async () => {
  await refresh();
  await refreshLog();
  startTicker();

  if (snapshot.phase === 'IDLE') {
    const found = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = found && found[0];
    if (tab && tab.title) ui.input.placeholder = tab.title.slice(0, 60);
    ui.input.focus();
  }
});

// The worker flips phases on alarms; mirror that instantly.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  await refresh();
  if (changes.sessionLog) renderLog(changes.sessionLog.newValue);
});

/* 1. Lock in — start the first 25m sprint on the active tab. */
ui.lock.addEventListener('click', async () => {
  const found = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = found && found[0];
  if (!tab) { ui.meta.textContent = 'Could not find an active tab.'; return; }

  const res = await chrome.runtime.sendMessage({
    type: 'START',
    tabId: tab.id,
    windowId: tab.windowId,
    taskLabel: (ui.input.value.trim() || tab.title || '').slice(0, 80)
  });

  if (res && res.ok) { ui.input.value = ''; await refresh(); }
  else ui.meta.textContent = (res && res.error) || 'Failed to lock.';
});

/* 2. Hold / resume — park the session without losing it. */
ui.holdBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'HOLD' });
  await refresh();
});

ui.resume.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'RESUME' });
  await refresh();
});

/* 3. Task finished — the clean exit. Logged as FINISHED. */
async function finish() {
  await chrome.runtime.sendMessage({ type: 'FINISH' });
  await refresh();
  await refreshLog();
}
ui.done.addEventListener('click', finish);
ui.done2.addEventListener('click', finish);

/* 4. Cancel — same teardown, logged as CANCELLED. */
async function cancel() {
  await chrome.runtime.sendMessage({ type: 'CANCEL' });
  await refresh();
  await refreshLog();
}
ui.cancel.addEventListener('click', cancel);
ui.cancel2.addEventListener('click', cancel);

/* 5. Which side the in-page timer sits on. */
ui.sideL.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_SIDE', side: 'left' });
  await refresh();
});
ui.sideR.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_SIDE', side: 'right' });
  await refresh();
});

ui.clear.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_LOG' });
  await refreshLog();
});
