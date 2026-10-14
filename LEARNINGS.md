# LEARNINGS.md - Reflexion Memory & Failure Postmortems

> Persistent episodic memory buffer. Prevents repeating past mistakes and guides all future agent turns.
> Grounded in the Reflexion pattern (Verbal Reinforcement Learning from trial-and-error).

---

## 1. Permanent Negative Constraints (Rules Learned from Failures)

* [RULE-001]: Do NOT use em dashes anywhere in this codebase or outputs (enforce ASCII hyphens `-` or colons `:`).
* [RULE-002]: Do NOT save binary media files without standard file extensions or directly in the project root; place demos in `media/` with descriptive names.
* [RULE-003]: Always use triple backticks for markdown fenced code blocks (e.g. ```` ```mermaid ````), not single backticks which break diagram rendering.
* [RULE-004]: In Manifest V3 service workers, never store state in memory globals across alarms or events; always persist to and read from `chrome.storage.local`.

---

## 2. Failure Postmortem Register (What Failed & Why)

### Postmortem Format
* **Incident ID**: FAIL-001
* **Date**: 2026-10-14
* **Model**: Antigravity (Gemini 3.8 Flash)
* **Symptom / Error**: An untracked 8.5MB binary file named `Focuslock` without an extension sat in the root directory.
* **Root Cause**: An earlier export or copy process placed `focuslock-spatial-test-render.mp4` into the workspace without the `.mp4` extension or target `media/` directory.
* **Resolution**: Created `media/`, moved the binary to `media/focuslock-demo.mp4`, verified the SHA256 against source provenance (`3CD77953...`), copied the poster frame, and updated `README.md`.
* **Actionable Lesson**: Always verify file extensions and target subdirectories before staging media assets.

---

## 3. Architectural Decision Log (Why We Chose X over Y)

* **Decision 001 - Video Embed Strategy**: Used `<video src="media/focuslock-demo.mp4" poster="media/focuslock-demo-poster.png" controls width="100%"><a href="..."><img ...></a></video>` with an inner linked poster image fallback. This guarantees that environments supporting HTML5 video play the demo natively, while markdown engines that strip `<video>` fall back gracefully to a clickable preview image.
