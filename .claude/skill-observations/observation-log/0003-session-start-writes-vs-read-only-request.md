---
id: 3
title: "Session-start writes conflict with a user turn that forbids modifying files"
status: open
type: open-source
skill: ["task-observer:task-observer"]
proposes_skill: []
target_file: []
siblings_checked: "none — task-observer belongs to no family in this workspace (no skill-families.md present; assumed)"
area: "Session Start Protocol, step 1 (workspace creation) and step 2 (checkpoints.log append)"
date: 2026-10-05
session_context: "Phase 4 diagnosis turn in an e-commerce repo: the user's first message said 'NO MODIFIQUES NINGÚN ARCHIVO TODAVÍA' (diagnosis only)"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---

**Issue:** The Session Start Protocol mandates writes before any task work: running the idempotent workspace-creation command and appending a line to `checkpoints.log` inside the scan snippet. The user's first turn explicitly forbade modifying any file (read-only diagnosis). The agent had to choose ad hoc between the skill's mandatory write and the user's instruction; it ran only the read-only probe and frontmatter read, skipped the append, and noted the skip. The skill gives no guidance for this case, and the workspace lives inside the repository, so the append would also have shown up as a dirty working tree in a turn promised to be change-free.

**Suggested improvement:** In Session Start step 1/2, add a "read-only turn" rule: when the user's instruction forbids file modifications, run only the read-only parts (probe, frontmatter scan without the `checkpoints.log` append), hold pending observations in the session, and flush them at the first turn where writes are allowed. Consider splitting the scan snippet so the append is a separate command that can be omitted without editing the snippet.

**Principle:** A skill's mandatory bookkeeping writes must yield to an explicit user prohibition on modifying files; provide a defined deferral path (read-only subset now, flush at the first permitted write) instead of leaving the conflict to improvisation.
