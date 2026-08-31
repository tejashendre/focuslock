'use strict';

/* =====================================================================
 * FocusLock — Autonomous 25/5 Focus Sandbox  ·  MV3 service worker
 * ---------------------------------------------------------------------
 *          +--------------------- auto-loop --------------------+
 *          v                                                    |
 *  IDLE -> FOCUS (25m, fullscreen, one tab) -> BREAK (5m, free) -+
 *            |  ^                                  |  ^
 *            v  | resume                           v  | resume
 *           HOLD +                                HOLD +
 *
 * FOCUS/BREAK loop forever until TASK FINISHED. HOLD parks the whole
 * thing indefinitely — nothing ticks, nothing locks — until RESUME.
 *
 * HARD RULE: this service worker is killed by Chrome after ~30s idle.
 * Therefore NOTHING lives in module-scope variables. Every listener
 * re-reads the truth from chrome.storage.local on each invocation.
 * ===================================================================== */

/* ---------- Tunables (the only knobs you should ever touch) ---------- */
const FOCUS_MINUTES = 25;   // classic Pomodoro sprint — do not stretch it
const BREAK_MINUTES = 5;    // classic short break
const TICK_MINUTES  = 0.5;  // badge repaint + fullscreen re-assert cadence
                            // (0.5 is Chrome's minimum alarm period)
const AWAY_SECONDS  = 120;  // no keyboard/mouse for this long at break-end
                            // => auto-HOLD instead of re-locking an empty desk
const LOG_LIMIT     = 200;  // sessions kept in the log

// Window state to return to when focus ends. 'maximized' keeps the window
// usable; switch to 'normal' if you prefer a small restored window.
const EXIT_WINDOW_STATE = 'maximized';

const FOCUS_MS = FOCUS_MINUTES * 60000;
const BREAK_MS = BREAK_MINUTES * 60000;

/* ---------------------------- Constants ------------------------------ */
const ALARM_FOCUS = 'focusSprint';
const ALARM_BREAK = 'breakSprint';
const ALARM_TICK  = 'badgeTick';

const IDLE  = 'IDLE';
const FOCUS = 'FOCUS';
const BREAK = 'BREAK';
const HOLD  = 'HOLD';

// Shape of the live session. Passing this to storage.get() also supplies
// the defaults, so a fresh install reads clean values.
const DEFAULT_STATE = {
  phase: IDLE,            // 'IDLE' | 'FOCUS' | 'BREAK' | 'HOLD'
  lockedTabId: null,      // the ONE tab you are allowed to be on
  lockedWindowId: null,   // the window that gets forced fullscreen
  endTime: 0,             // epoch ms when the current phase ends (0 in HOLD)
  sprintCount: 0,         // FULL 25m sprints completed this session
  taskLabel: '',          // the single task you committed to
  sessionStartedAt: 0,    // epoch ms the session began (0 = no session)
  phaseStartedAt: 0,      // epoch ms the current phase began
  focusMsAccrued: 0,      // banked focus time from all COMPLETED phases
  heldFrom: null,         // which phase HOLD interrupted
  heldRemainingMs: 0      // ms left in that phase when it was held
};

// Preferences survive endSession(); session state does not.
const DEFAULT_PREFS = { overlaySide: 'right' };
const DEFAULT_LOG   = { sessionLog: [] };

/* Pages Chrome forbids extensions from touching. Locking onto one of these
 * would fullscreen you with no timer card and no DONE button — a trap with
 * only Alt+F4 as the way out. Refuse the lock instead of warning about it. */
const UNLOCKABLE = /^(chrome|edge|about|devtools|chrome-extension|chrome-search|chrome-untrusted|view-source):|^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;

/* ------------------------------ Helpers ------------------------------ */

const getState   = () => chrome.storage.local.get(DEFAULT_STATE);
const patchState = (patch) => chrome.storage.local.set(patch);
const getPrefs   = () => chrome.storage.local.get(DEFAULT_PREFS);

/** Run a chrome.* call that may legitimately fail (tab/window already gone). */
async function safe(fn) {
  try { return await fn(); } catch (_) { return null; }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: title,
    message: message,
    priority: 2
  });
}

/** Force the locked window into hardware fullscreen and focus it. */
async function lockWindow(windowId) {
  if (windowId == null) return;
  await safe(() => chrome.windows.update(windowId, { state: 'fullscreen', focused: true }));
}

/** Give the window back to the user (break / hold / session end). */
async function releaseWindow(windowId) {
  if (windowId == null) return;
  await safe(() => chrome.windows.update(windowId, { state: EXIT_WINDOW_STATE }));
}

/**
 * Bank the focus time spent since phaseStartedAt.
 * Called on every exit from FOCUS, so hold/resume/partial sprints all
 * account correctly without any special-casing.
 */
function bankFocus(s) {
  if (s.phase !== FOCUS || !s.phaseStartedAt) return s.focusMsAccrued;
  return s.focusMsAccrued + Math.max(0, Date.now() - s.phaseStartedAt);
}

/**
 * Badge = at-a-glance proof the container is still holding.
 *   FOCUS -> red,   minutes remaining
 *   BREAK -> green, minutes remaining
 *   HOLD  -> amber, "HLD"
 *   IDLE  -> cleared
 */
async function paintBadge(state) {
  const s = state || await getState();

  if (s.phase === IDLE) {
    await safe(() => chrome.action.setBadgeText({ text: '' }));
    return;
  }

  const color = s.phase === FOCUS ? '#dc2626'
              : s.phase === BREAK ? '#16a34a'
              : '#d97706';
  const text  = s.phase === HOLD
              ? 'HLD'
              : String(Math.max(0, Math.ceil((s.endTime - Date.now()) / 60000)));

  await safe(() => chrome.action.setBadgeBackgroundColor({ color: color }));
  if (chrome.action.setBadgeTextColor) {
    await safe(() => chrome.action.setBadgeTextColor({ color: '#ffffff' }));
  }
  await safe(() => chrome.action.setBadgeText({ text: text }));
}

/** Re-assert fullscreen if the user escaped it with F11 / Esc. */
async function reassertFullscreen(state) {
  if (state.lockedWindowId == null) return;
  const win = await safe(() => chrome.windows.get(state.lockedWindowId));
  if (win && win.state !== 'fullscreen') await lockWindow(state.lockedWindowId);
}

/* ------------------------- In-page timer overlay ---------------------- *
 * The side panel is hidden by Chrome in fullscreen, so the countdown and
 * the DONE/HOLD buttons have to live inside the locked page itself.
 * ---------------------------------------------------------------------- */

async function showOverlay(state) {
  if (state.lockedTabId == null) return;
  // Injecting twice is harmless: overlay.js no-ops if already installed.
  await safe(() => chrome.scripting.executeScript({
    target: { tabId: state.lockedTabId },
    files: ['overlay.js']
  }));
  await pushOverlay(state);
}

async function pushOverlay(state) {
  if (state.lockedTabId == null) return;
  const prefs = await getPrefs();
  await safe(() => chrome.tabs.sendMessage(state.lockedTabId, {
    type: 'FOCUSLOCK_SYNC',
    phase: state.phase,
    endTime: state.endTime,
    taskLabel: state.taskLabel,
    sprintCount: state.sprintCount,
    side: prefs.overlaySide
  }));
}

async function hideOverlay(state) {
  if (!state || state.lockedTabId == null) return;
  await safe(() => chrome.tabs.sendMessage(state.lockedTabId, { type: 'FOCUSLOCK_REMOVE' }));
}

/* ------------------------------ Session log --------------------------- */

async function appendLog(s, focusMs, outcome) {
  const store = await chrome.storage.local.get(DEFAULT_LOG);
  const log = store.sessionLog || [];
  log.unshift({
    task: s.taskLabel || 'Unnamed task',
    startedAt: s.sessionStartedAt,
    endedAt: Date.now(),
    sprints: s.sprintCount,
    focusMs: Math.round(focusMs),
    outcome: outcome            // 'FINISHED' | 'CANCELLED' | 'ABANDONED'
  });
  await chrome.storage.local.set({ sessionLog: log.slice(0, LOG_LIMIT) });
}

/* --------------------------- FSM transitions -------------------------- */

/** Fresh session: lock onto this tab and start sprint 1. */
async function startSession(opts) {
  await chrome.alarms.clearAll();
  const now = Date.now();

  const next = {
    phase: FOCUS,
    lockedTabId: opts.tabId,
    lockedWindowId: opts.windowId,
    endTime: now + FOCUS_MS,
    sprintCount: 0,
    taskLabel: String(opts.taskLabel || '').slice(0, 80),
    sessionStartedAt: now,
    phaseStartedAt: now,
    focusMsAccrued: 0,
    heldFrom: null,
    heldRemainingMs: 0
  };
  await patchState(next);

  chrome.alarms.create(ALARM_FOCUS, { when: next.endTime });
  chrome.alarms.create(ALARM_TICK,  { periodInMinutes: TICK_MINUTES });

  await safe(() => chrome.tabs.update(next.lockedTabId, { active: true }));
  await lockWindow(next.lockedWindowId);
  await paintBadge(next);
  await showOverlay(next);
}

/**
 * Enter FOCUS for durationMs. Used by the auto-loop (full 25m) and by
 * RESUME after a mid-sprint hold (whatever was left on the clock).
 */
async function enterFocus(durationMs) {
  const s = await getState();

  if (s.lockedTabId == null || s.lockedWindowId == null) {
    await endSession('ABANDONED', 'Lost the locked tab. Session reset.');
    return;
  }

  // Chrome clamps one-shot alarms to ~30s minimum; stretch a tiny remainder
  // rather than have it fire late and look broken.
  const dur = Math.max(durationMs || FOCUS_MS, 30000);
  const now = Date.now();

  const next = {
    phase: FOCUS,
    endTime: now + dur,
    phaseStartedAt: now,
    heldFrom: null,
    heldRemainingMs: 0
  };
  await patchState(next);

  await chrome.alarms.clear(ALARM_BREAK);
  chrome.alarms.create(ALARM_FOCUS, { when: next.endTime });
  chrome.alarms.create(ALARM_TICK,  { periodInMinutes: TICK_MINUTES });

  const merged = Object.assign({}, s, next);
  await safe(() => chrome.tabs.update(merged.lockedTabId, { active: true }));
  await lockWindow(merged.lockedWindowId);
  await paintBadge(merged);
  await showOverlay(merged);
}

/** 25m elapsed -> 5-minute break, window handed back to the user. */
async function enterBreak() {
  const s = await getState();
  const now = Date.now();

  const next = {
    phase: BREAK,
    endTime: now + BREAK_MS,
    phaseStartedAt: now,
    sprintCount: s.sprintCount + 1,
    focusMsAccrued: bankFocus(s),
    heldFrom: null,
    heldRemainingMs: 0
  };
  await patchState(next);

  await chrome.alarms.clear(ALARM_FOCUS);
  chrome.alarms.create(ALARM_BREAK, { when: next.endTime });
  chrome.alarms.create(ALARM_TICK,  { periodInMinutes: TICK_MINUTES });

  const merged = Object.assign({}, s, next);
  await hideOverlay(merged);
  await releaseWindow(merged.lockedWindowId);
  await paintBadge(merged);

  const label = s.taskLabel ? '"' + s.taskLabel + '"' : 'the task';
  notify(
    'Sprint ' + next.sprintCount + ' complete',
    BREAK_MINUTES + '-minute break. Tabs are free. Done with ' + label +
    '? Hit TASK FINISHED — or HOLD if you are stepping away.'
  );
}

/**
 * Park the session. Nothing ticks, nothing locks, the tab stays claimed.
 * This is the "I'm done for now, pick it up later" switch.
 */
async function enterHold(reason) {
  const s = await getState();
  if (s.phase === IDLE || s.phase === HOLD) return;

  const next = {
    phase: HOLD,
    heldFrom: s.phase,
    heldRemainingMs: s.phase === FOCUS ? Math.max(0, s.endTime - Date.now()) : 0,
    focusMsAccrued: bankFocus(s),
    phaseStartedAt: Date.now(),
    endTime: 0
  };
  await patchState(next);

  // Clear every alarm, tick included — a held session must not wake the
  // worker every 30s for hours. The badge text persists on its own.
  await chrome.alarms.clearAll();

  const merged = Object.assign({}, s, next);
  await hideOverlay(merged);
  await releaseWindow(merged.lockedWindowId);
  await paintBadge(merged);

  if (reason) notify('FocusLock on hold', reason);
}

/** Come back. Mid-sprint holds finish the remainder; break holds start fresh. */
async function resumeFromHold() {
  const s = await getState();
  if (s.phase !== HOLD) return;
  const dur = s.heldFrom === FOCUS ? s.heldRemainingMs : FOCUS_MS;
  await enterFocus(dur);
}

/** Terminal state: log it, clear everything, give the browser back. */
async function endSession(outcome, message) {
  const s = await getState();
  const focusMs = bankFocus(s);
  const hadSession = !!s.sessionStartedAt;

  await chrome.alarms.clearAll();
  await hideOverlay(s);
  await patchState(Object.assign({}, DEFAULT_STATE));
  await safe(() => chrome.action.setBadgeText({ text: '' }));
  await releaseWindow(s.lockedWindowId);

  if (hadSession) await appendLog(s, focusMs, outcome);
  if (message) notify('FocusLock', message);
}

/** Break alarm fired: re-lock — unless you clearly walked away. */
async function onBreakEnded() {
  const away = chrome.idle
    ? await safe(() => chrome.idle.queryState(AWAY_SECONDS))
    : 'active';

  if (away && away !== 'active') {
    await enterHold(
      'Break ended while you were away, so nothing re-locked. ' +
      'Open FocusLock and hit RESUME when you are back.'
    );
    return;
  }

  const s = await getState();
  await enterFocus(FOCUS_MS);
  notify(
    'Break over — locking in',
    'Sprint ' + (s.sprintCount + 1) + ': fullscreen focus re-engaged for ' +
    FOCUS_MINUTES + ' minutes.'
  );
}

/* ------------------------------ Listeners ----------------------------- */

/* Timer engine. Alarms survive service-worker death; setTimeout does not. */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const s = await getState();

  if (alarm.name === ALARM_FOCUS) {
    if (s.phase === FOCUS) await enterBreak();
    return;
  }

  if (alarm.name === ALARM_BREAK) {
    if (s.phase === BREAK) await onBreakEnded();
    return;
  }

  if (alarm.name === ALARM_TICK) {
    // Session ended or was held while the worker slept — stop ticking.
    if (s.phase === IDLE || s.phase === HOLD) {
      await chrome.alarms.clear(ALARM_TICK);
      await paintBadge(s);
      return;
    }
    await paintBadge(s);
    if (s.phase === FOCUS) {
      await reassertFullscreen(s);
      await pushOverlay(s);
    }
  }
});

/* Guardrail 1 — tab switching inside the locked window snaps straight back. */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const s = await getState();
  if (s.phase !== FOCUS || s.lockedTabId == null) return;
  if (activeInfo.windowId !== s.lockedWindowId) return; // other windows: see onFocusChanged
  if (activeInfo.tabId === s.lockedTabId) return;
  await safe(() => chrome.tabs.update(s.lockedTabId, { active: true }));
});

/* Guardrail 2 — any tab spawned during FOCUS dies on arrival. */
chrome.tabs.onCreated.addListener(async (tab) => {
  const s = await getState();
  if (s.phase !== FOCUS) return;
  if (tab.id === s.lockedTabId) return;
  await safe(() => chrome.tabs.remove(tab.id));
  await safe(() => chrome.tabs.update(s.lockedTabId, { active: true }));
  await lockWindow(s.lockedWindowId);
});

/* The locked tab navigated — the overlay died with the old document. */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const s = await getState();
  if (s.phase !== FOCUS || tabId !== s.lockedTabId) return;
  await showOverlay(s);
});

/* Edge case — the locked tab itself gets closed mid-session. */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const s = await getState();
  if (s.phase === IDLE || tabId !== s.lockedTabId) return;

  // The whole window is going away — windows.onRemoved owns that teardown.
  // Without this guard, closing the window briefly "re-locks" onto a sibling
  // tab and fires a pointless notification on the way out.
  if (removeInfo && removeInfo.isWindowClosing) return;

  const tabs = await safe(() => chrome.tabs.query({ windowId: s.lockedWindowId }));
  const fallback = tabs && tabs.find((t) => t.id !== tabId);

  if (!fallback) {
    await endSession('ABANDONED', 'Locked tab closed and nothing left to lock onto. Session ended.');
    return;
  }

  await patchState({ lockedTabId: fallback.id });
  notify('Locked tab closed', 'Re-locked onto the next tab in the same window.');

  if (s.phase === FOCUS) {
    await safe(() => chrome.tabs.update(fallback.id, { active: true }));
    await lockWindow(s.lockedWindowId);
    await showOverlay(Object.assign({}, s, { lockedTabId: fallback.id }));
  }
});

/* Edge case — the whole locked window is closed. */
chrome.windows.onRemoved.addListener(async (windowId) => {
  const s = await getState();
  if (s.phase !== IDLE && windowId === s.lockedWindowId) {
    await endSession('ABANDONED', 'Locked window closed. Session ended.');
  }
});

/* Guardrail 3 — hopping to a DIFFERENT Chrome window pulls you back. */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return; // Chrome lost OS focus; leave it alone
  const s = await getState();
  if (s.phase !== FOCUS || s.lockedWindowId == null) return;
  if (windowId === s.lockedWindowId) return;
  await lockWindow(s.lockedWindowId);
});

/* Guardrail 4 — instant re-fullscreen if the window is un-fullscreened.
   onBoundsChanged is Chrome 86+; guarded so older builds still load. */
if (chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener(async (win) => {
    const s = await getState();
    if (s.phase !== FOCUS || win.id !== s.lockedWindowId) return;
    if (win.state === 'fullscreen') return;
    await lockWindow(s.lockedWindowId);
  });
}

/* Clicking the toolbar icon opens the side panel (no popup). */
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

/* Tab and window IDs do not survive a browser restart — fail open, not shut.
   The dead session is still logged, so the record stays honest. */
chrome.runtime.onStartup.addListener(async () => {
  const s = await getState();
  if (s.phase === IDLE) return;
  await chrome.alarms.clearAll();
  if (s.sessionStartedAt) await appendLog(s, bankFocus(s), 'ABANDONED');
  await patchState(Object.assign({}, DEFAULT_STATE));
  await safe(() => chrome.action.setBadgeText({ text: '' }));
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clearAll();
  await patchState(Object.assign({}, DEFAULT_STATE));
  await safe(() => chrome.action.setBadgeText({ text: '' }));
});

/* --------------------- Panel / overlay <-> worker API ------------------ */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {

        case 'GET_STATE': {
          const s = await getState();
          const p = await getPrefs();
          sendResponse(Object.assign({}, s, p));
          return;
        }

        case 'GET_LOG': {
          const store = await chrome.storage.local.get(DEFAULT_LOG);
          sendResponse({ ok: true, sessionLog: store.sessionLog || [] });
          return;
        }

        case 'CLEAR_LOG':
          await chrome.storage.local.set({ sessionLog: [] });
          sendResponse({ ok: true });
          return;

        case 'START': {
          let tabId = msg.tabId;
          let windowId = msg.windowId;

          // Fallback if the caller could not resolve the tab itself.
          if (tabId == null || windowId == null) {
            const found = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            const tab = found && found[0];
            if (!tab) { sendResponse({ ok: false, error: 'No active tab to lock onto.' }); return; }
            tabId = tab.id;
            windowId = tab.windowId;
          }

          // Refuse to lock onto a page the timer card cannot reach.
          const target = await safe(() => chrome.tabs.get(tabId));
          const url = (target && target.url) || '';

          if (UNLOCKABLE.test(url)) {
            sendResponse({
              ok: false,
              error: 'Cannot lock onto a Chrome system page — the timer card and ' +
                     'DONE button cannot be shown there. Switch to the tab with your ' +
                     'actual work and try again.'
            });
            return;
          }

          if (url.startsWith('file://') && chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
            const allowed = await safe(() => chrome.extension.isAllowedFileSchemeAccess());
            if (!allowed) {
              sendResponse({
                ok: false,
                error: 'Local file pages need "Allow access to file URLs" enabled on ' +
                       'the FocusLock details page, otherwise the timer card cannot appear.'
              });
              return;
            }
          }

          await startSession({ tabId: tabId, windowId: windowId, taskLabel: msg.taskLabel });
          sendResponse({ ok: true, state: await getState() });
          return;
        }

        case 'HOLD':
          await enterHold('Session parked. Your tab is still claimed — hit RESUME when you are ready.');
          sendResponse({ ok: true });
          return;

        case 'RESUME':
          await resumeFromHold();
          sendResponse({ ok: true });
          return;

        case 'FINISH': {
          const s = await getState();
          const n = s.sprintCount;
          await endSession(
            'FINISHED',
            'Task finished after ' + n + ' sprint' + (n === 1 ? '' : 's') + '. Browser unlocked.'
          );
          sendResponse({ ok: true });
          return;
        }

        case 'CANCEL':
          await endSession('CANCELLED', 'Session cancelled. Browser unlocked.');
          sendResponse({ ok: true });
          return;

        case 'SET_SIDE': {
          const side = msg.side === 'left' ? 'left' : 'right';
          await chrome.storage.local.set({ overlaySide: side });
          await pushOverlay(await getState());
          sendResponse({ ok: true, side: side });
          return;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown message type.' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // keep the message channel open for the async reply
});
