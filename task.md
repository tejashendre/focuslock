# Project Task Board

> Maintained by autonomous agents across all sessions.
> Every agent must read this file before taking action, and check off items upon completion.

## Project Scope
- Objective: Import and standardize FocusLock demo video and poster in repo under `media/`, update README with video demonstration following `dictate-local` inspiration, and commit/push to GitHub.
- Architecture / Stack: Chrome Extension (Manifest V3, Vanilla JS, HTML/CSS) + GitHub repo documentation & media assets.

## Active Execution Plan
- [x] Slice 1: Setup `media/` directory and transfer/rename demo video (`media/focuslock-demo.mp4`) and poster (`media/focuslock-demo-poster.png`).
- [x] Slice 2: Update `README.md` with demo video embed, playback fallbacks, duration, and audio description modeled after `dictate-local`.
- [x] Slice 3: Update `ARCHITECTURE.md`, `LEARNINGS.md`, and record slice checkpoints in `AUDIT_LOG.md`.
- [x] Slice 4: Stage, verify git diff, commit, and push updates to `origin/main`.
- [x] Slice 5: Fix README video not playing on GitHub. GitHub strips raw `<video>` tags. Interim GIF fix was superseded by Slice 6 and the GIF was moved out of the repo (not deleted).
- [/] Slice 6: Replace the README embed with a bare GitHub `user-attachments` URL for `media/focuslock-demo.mp4` (same method as `dictate-local`). URL `https://github.com/user-attachments/assets/8529740e-5e28-417f-8079-7621848b961e`, created via the editor upload on github.com (draft discarded, nothing committed there).

## Blockers & Open Items
- None currently.
