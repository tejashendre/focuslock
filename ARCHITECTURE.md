# ARCHITECTURE.md - System North Star & Boundary Contract

> Defines the core architectural boundaries, technology choices, and non-responsibilities for FocusLock.
> Every agent (Codex, Claude Code, Antigravity, ChatGPT) MUST verify alignment with this file before building.

---

## 1. System Intent & Core Mission
* **Project Name**: FocusLock
* **Target Objective**: A Chrome extension (Manifest V3) that enforces single-tab fullscreen focus on a 25/5 loop, making tab-switching physically impossible during focus intervals.
* **End-User / Consumer**: Knowledge workers and developers needing deep work intervals without relying on willpower or bypassable blocklists.

---

## 2. Component Topology
```
[Side Panel UI (panel.js / panel.html)] 
          │  Commands / Status
          ▼
[Background Service Worker (background.js)] ◄──► [chrome.storage.local]
          │
          ├─► [Chrome Windows / Tabs API] (Enforces Fullscreen & Tab Lock)
          │
          └─► [Content Script HUD (overlay.js)] (Isolated Shadow DOM HUD)
```
* **Control Layer**: Side Panel UI (`panel.html`, `panel.js`). Thin view controller that reads state strictly from `chrome.storage.local` and dispatches intents.
* **Orchestration & State Engine**: Background Service Worker (`background.js`). Manifest V3 compliant, survives service worker termination, recovers from alarms, enforces window/tab constraints.
* **Persistence Layer**: `chrome.storage.local`. All session states (`IDLE`, `FOCUS`, `BREAK`, `HOLD`) and history logs survive browser suspensions.
* **Enforcement & UI Guardrails**: Injected Content Script (`overlay.js`). Uses a closed Shadow DOM so host page CSS cannot corrupt the timer HUD, and host scripts cannot tamper with session controls.

---

## 3. Explicit Non-Responsibilities (Out-of-Bounds Guardrails)
To prevent agent drift, token waste, and scope creep, the bot is **EXPLICITLY FORBIDDEN** from:
1. Adding third-party NPM dependencies, frameworks, bundlers, or remote CDNs.
2. Introducing network calls, analytics, remote telemetry, or external API endpoints.
3. Using em dashes (Unicode U+2014, `&mdash;`, or literal characters) in any file, commit message, or comment (enforce ASCII hyphens `-` or colons `:`).
4. Relying on in-memory global variables across service worker sleep cycles.
5. Modifying files outside this project directory.

---

## 4. Technical Stack & Invariants
* **Platform**: Chrome Extension Manifest V3
* **Runtime / Languages**: Vanilla JavaScript (ES2022+), HTML5, CSS3 (zero build step)
* **APIs**: `chrome.windows`, `chrome.tabs`, `chrome.storage.local`, `chrome.alarms`, `chrome.sidePanel`, `chrome.scripting`, `chrome.idle`
* **Media Assets**: `media/focuslock-demo.mp4` (24s H.264/AAC spatial demo) and `media/focuslock-demo-poster.png` (poster frame)
* **Verification Threshold**: Clean syntax validation, zero lint errors, verified offline behavior on unpacked reload.
