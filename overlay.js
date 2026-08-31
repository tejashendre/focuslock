'use strict';

/* =====================================================================
 * FocusLock in-page HUD
 * ---------------------------------------------------------------------
 * Chrome hides the side panel (and the whole toolbar) in fullscreen, so
 * the countdown and the escape buttons have to live inside the locked
 * page itself. Injected on demand by background.js.
 *
 * Everything renders inside a closed shadow root so no host page CSS can
 * reach it and it cannot leak styles back into the page.
 * ===================================================================== */

(() => {
  // Injection is idempotent: background.js re-injects on every navigation
  // and every 30s tick, and both land in this same isolated world.
  if (window.__FOCUSLOCK_HUD__) return;
  window.__FOCUSLOCK_HUD__ = true;

  const HOST_ID = 'focuslock-hud-host';

  let state = { phase: 'IDLE', endTime: 0, taskLabel: '', sprintCount: 0, side: 'right' };
  let ticker = null;
  let host = null;
  let root = null;
  let ui = {};

  /* ------------------------------- Build ------------------------------- */

  function build() {
    host = document.getElementById(HOST_ID);
    if (host) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    // `all: initial` first, then our own layout — later longhands win.
    host.style.cssText =
      'all: initial; position: fixed; top: 14px; right: 14px; z-index: 2147483647;';

    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = [
      '<style>',
      '  :host { all: initial; }',
      '  * { box-sizing: border-box; margin: 0; padding: 0; }',
      '  .hud {',
      '    width: 186px;',
      '    padding: 10px 11px 9px;',
      '    background: rgba(7, 11, 20, .93);',
      '    border: 1px solid #24324a;',
      '    border-radius: 11px;',
      '    box-shadow: 0 6px 24px rgba(0, 0, 0, .45);',
      '    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;',
      '    color: #e8eef8;',
      '    opacity: .93;',
      '    transition: opacity .15s;',
      '    user-select: none;',
      '  }',
      '  .hud:hover { opacity: 1; }',
      '  .top { display: flex; align-items: center; justify-content: space-between; }',
      '  .tag {',
      '    font-size: 9px; font-weight: 700; letter-spacing: 1.4px;',
      '    text-transform: uppercase; color: #f87171;',
      '  }',
      '  .flip {',
      '    background: none; border: 0; cursor: pointer; padding: 0 2px;',
      '    color: #4b5c76; font-size: 12px; line-height: 1;',
      '  }',
      '  .flip:hover { color: #94a3b8; }',
      '  .time {',
      '    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;',
      '    font-size: 29px; font-weight: 600; line-height: 1.1;',
      '    letter-spacing: 1px; font-variant-numeric: tabular-nums;',
      '    margin: 1px 0 2px;',
      '  }',
      '  .task {',
      '    font-size: 10.5px; color: #8296b3; line-height: 1.35;',
      '    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '  }',
      '  .row { display: flex; gap: 6px; margin-top: 9px; }',
      '  button.act {',
      '    flex: 1; padding: 7px 4px; border: 0; border-radius: 6px;',
      '    font-family: inherit; font-size: 10px; font-weight: 700;',
      '    letter-spacing: .6px; cursor: pointer; color: #fff;',
      '  }',
      '  .hold { background: #b45309; }',
      '  .hold:hover { background: #92400e; }',
      '  .done { background: #16a34a; }',
      '  .done:hover { background: #15803d; }',
      '</style>',
      '<div class="hud">',
      '  <div class="top">',
      '    <span class="tag" id="tag">Locked in</span>',
      '    <button class="flip" id="flip" title="Move to the other side">&#8646;</button>',
      '  </div>',
      '  <div class="time" id="time">--:--</div>',
      '  <div class="task" id="task"></div>',
      '  <div class="row">',
      '    <button class="act hold" id="hold">HOLD</button>',
      '    <button class="act done" id="done">DONE</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    ui = {
      tag:  root.getElementById('tag'),
      time: root.getElementById('time'),
      task: root.getElementById('task'),
      hold: root.getElementById('hold'),
      done: root.getElementById('done'),
      flip: root.getElementById('flip')
    };

    ui.hold.addEventListener('click', () => send({ type: 'HOLD' }));
    ui.done.addEventListener('click', () => send({ type: 'FINISH' }));
    ui.flip.addEventListener('click', () => {
      const side = state.side === 'right' ? 'left' : 'right';
      state.side = side;
      applySide(side);
      send({ type: 'SET_SIDE', side: side });
    });

    (document.body || document.documentElement).appendChild(host);
  }

  function applySide(side) {
    if (!host) return;
    if (side === 'left') {
      host.style.left = '14px';
      host.style.right = 'auto';
    } else {
      host.style.right = '14px';
      host.style.left = 'auto';
    }
  }

  /* ------------------------------ Render ------------------------------- */

  function mmss(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return m + ':' + s;
  }

  function paint() {
    if (!ui.time) return;
    ui.time.textContent = mmss(state.endTime - Date.now());
    ui.tag.textContent = 'Sprint ' + (state.sprintCount + 1);
    ui.task.textContent = state.taskLabel || 'Unnamed task';
    ui.task.title = state.taskLabel || '';
  }

  function startTicking() {
    if (ticker) clearInterval(ticker);
    // Derived from endTime, so a dozing service worker never desyncs it.
    ticker = setInterval(paint, 1000);
  }

  function teardown() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    const existing = document.getElementById(HOST_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    host = null; root = null; ui = {};
  }

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) { /* worker restarting */ }
  }

  /* ------------------------------- Wiring ------------------------------ */

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;

    if (msg.type === 'FOCUSLOCK_REMOVE') { teardown(); return; }

    if (msg.type === 'FOCUSLOCK_SYNC') {
      // The HUD belongs to FOCUS only. Break, hold and idle all use the
      // side panel, where there is room for the log.
      if (msg.phase !== 'FOCUS') { teardown(); return; }

      state = {
        phase: msg.phase,
        endTime: msg.endTime,
        taskLabel: msg.taskLabel,
        sprintCount: msg.sprintCount,
        side: msg.side || 'right'
      };
      build();
      applySide(state.side);
      paint();
      startTicking();
    }
  });

  // Ask for current state on injection — covers page navigations mid-sprint.
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => {
    if (chrome.runtime.lastError || !s || s.phase !== 'FOCUS') return;
    state = {
      phase: s.phase,
      endTime: s.endTime,
      taskLabel: s.taskLabel,
      sprintCount: s.sprintCount,
      side: s.overlaySide || 'right'
    };
    build();
    applySide(state.side);
    paint();
    startTicking();
  });
})();
