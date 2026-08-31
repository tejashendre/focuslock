# FocusLock

**A Chrome extension that makes tab-switching physically impossible for 25 minutes at a time.**

Not a timer. Not a reminder. A lock.

---

## The problem

I lose hours to context-switching. Not to distraction in the ordinary sense, but to the specific pattern where a task gets hard for two seconds and a new tab appears without a conscious decision having been made.

Every tool I tried treated this as a motivation problem. Pomodoro timers count down politely while you ignore them. Blocklists get disabled in four clicks. Habit trackers reward you for the streak and say nothing about the moment the tab opens.

**The moment the tab opens is the whole problem.** A tool that only notices afterwards has already lost.

## The approach

Remove the option rather than resist it.

FocusLock puts the browser into **enforced fullscreen on a single tab** for a focus interval. The other tabs are still there, and reaching them takes deliberate effort instead of reflex. When the interval ends, the lock releases for a short break, then re-engages, and it keeps looping until the task is marked finished.

The design decision that matters: **the loop continues by default.** Most Pomodoro tools stop after one interval and require you to restart, which reintroduces the decision point the tool exists to remove.

## How it works

```
IDLE ──▶ FOCUS (25 min, fullscreen, single tab)
           │
           ▼
        BREAK (5 min, free)
           │
           └──▶ back to FOCUS, until you mark the task done
```

**Built on:**

| | |
|---|---|
| Manifest V3 | Service worker, no persistent background page |
| `chrome.windows.update` | Fullscreen enforcement |
| `chrome.alarms` | Interval timing that survives worker suspension |
| `chrome.storage` | State persistence across restarts |
| `chrome.sidePanel` | Controls without stealing the tab |

**Zero dependencies. No build step. No network calls. No telemetry.** It is four files and an icon set.

## Install

1. Clone or download this repository.
2. Chrome, `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked**, select the folder.
4. Pin it, click it, set your task, start.

## Result

I built this on 30 August 2026 and used it the same week to finish three DataCamp courses inside a 38-hour expiring free-access window: *Data Strategy*, *Data Science for Business*, and *Implementing AI Solutions in Business*.

**That is one user over one week, and I am the user.** It is not a controlled trial and I am not going to present it as one. What I can say precisely is that the specific failure mode it was built to remove — opening a new tab without deciding to — stopped happening while it was running.

## What it does not do

- **It does not block sites.** Plenty of tools do that; this targets the switch, not the destination.
- **It does not track you.** Nothing leaves the browser. There is no account and no server.
- **It cannot stop you leaving.** You can exit fullscreen. The point is that you have to mean it.
- **It has not been tested by anyone but me.** Issues and pull requests welcome.

## Why it exists

I have a documented tendency toward tab-hopping under cognitive load, and I would rather engineer a constraint than rely on discipline that has already been shown not to hold.

That is also roughly how I approach process problems generally: find where the failure actually occurs, remove the option at that exact point, and measure whether the behaviour changed.

## Licence

MIT.
