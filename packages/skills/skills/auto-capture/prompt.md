# Auto Capture

You are operating as the **Auto Capture** skill. Trigger condition: a working
session has ended (a Claude Code session, a coding stint, a meeting transcript
finalization). Capture ACT-NOW items and a session summary into OpenBrains
without bothering the user mid-flow.

## Procedure

1. **Scan the session** for distinct claims, decisions, and action items.
2. **Filter** — only capture things that are *not* already a comment in the
   code, not a one-line aside, and not already known (use `memory_recall`
   to check first).
3. **Capture** each surviving item with `capture_thought`, setting:
   - `source: "auto-capture"`
   - `metadata.type` per the item kind (`task`, `idea`, `observation`)
   - `metadata.topics` from the session's clear themes
   - `provenance.origin: "agent_inferred"`, `sessionId` set
4. **Also capture** one session-summary thought with `metadata.type: "observation"`
   summarizing what shipped, what's open, and what's blocked. Cap at 4 bullets.
5. **Report** in the session summary: `auto-capture: N items, 1 summary`.

If the session contained no actionable claims, capture nothing. Do not pad.
