# FocusLock

> **A Chrome extension that makes tab-switching physically impossible for 25 minutes at a time. Not a timer. Not a reminder. A lock.**

FocusLock puts the browser into enforced fullscreen on a single tab for a focus interval. Zero dependencies, zero network calls, zero escape hatches.

**Demo video:** _coming shortly_ | **Repository:** you are here | **Author:** [Tejas Hendre](https://www.tejashendre.com/)

---

## 1. The Business Problem (Why I built this)

I lose hours to context-switching. Not to distraction in the ordinary sense, but to the specific pattern where a task gets hard for two seconds and a new tab appears without a conscious decision having been made.

Every tool I tried treated this as a motivation problem. Pomodoro timers count down politely while you ignore them. Blocklists get disabled in four clicks. Habit trackers reward you for the streak and say nothing about the moment the tab opens.

**The moment the tab opens is the whole problem.** A tool that only notices afterwards has already lost. Remove the option rather than resist it.

---

## 2. System Architecture & Flow

The design decision that matters: **the loop continues by default.** Most Pomodoro tools stop after one interval and require you to restart, which reintroduces the decision point the tool exists to remove.

`mermaid
stateDiagram-v2
    [*] --> IDLE
    
    IDLE --> FOCUS : Start Session
    FOCUS --> BREAK : 25 min timer ends
    BREAK --> FOCUS : 5 min timer ends (Auto-loops)
    FOCUS --> HOLD : User needs a pause
    HOLD --> FOCUS : Resume
    
    FOCUS --> IDLE : Mark Task Done
    BREAK --> IDLE : Mark Task Done
    HOLD --> IDLE : Cancel Session
`

### Technical Workflow
`mermaid
graph LR
    A[Side Panel UI] -->|Commands| B(Background Service Worker)
    B -->|Persists State| C[(chrome.storage.local)]
    B -->|Enforces State| D[Chrome Window API]
    D -->|Locks to| E{Fullscreen Single Tab}
    
    B -->|Injects| F[Content Script]
    F -->|Renders| G[Shadow DOM Overlay HUD]
    
    style B fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#bbf,stroke:#333,stroke-width:2px
`

---

## 3. Core Principles & Execution (How I do my work)

This extension is built around enforcing constraints and robust state management:

- **State Persistence Over Suspension:** Built on Manifest V3, the service worker can be suspended by Chrome at any time. State is never kept in memory globals; it strictly reads and writes to chrome.storage.local.
- **Absolute Isolation:** The in-page HUD uses a closed Shadow DOM so that page styles do not bleed in, and page scripts cannot tamper with the lock overlay.
- **Fail-Safe Restoration:** Handling edge cases where window IDs change, browsers crash, or users try to manually exit fullscreen (the extension aggressively snaps it back).
- **Zero Distraction Footprint:** No network calls, no tracking, no bloat. 100% offline.

---

## 4. Tech Stack

- **Core:** Manifest V3, Vanilla JavaScript, HTML5, CSS
- **APIs:** chrome.windows, chrome.storage.local, chrome.alarms, chrome.sidePanel, chrome.scripting

---

## 5. Usage / Installation

1. Clone or download this repository.
2. Open Chrome and go to chrome://extensions/.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the folder containing this code.
5. Pin the extension and click the icon to open the Side Panel to start your focus session.
