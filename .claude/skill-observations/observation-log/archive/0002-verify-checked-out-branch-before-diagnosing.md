---
id: 2
title: "Verify the checked-out branch matches the described state before diagnosing missing features"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "none — target is a project instruction file, not a skill family"
area: "diagnosis at session start"
date: 2026-10-05
session_context: "FASE 3 UI iteration: user reported an unstyled 'en construcción' page"
parked_until:
resolved: 2026-10-05
resolution: "The rule lives in CLAUDE.md, Reglas del proyecto (compare local branch with origin/main via git branch -a / git log --all --graph; node_modules vs lockfile). Applied in the FASE 5 session: local main was stale (FASE 2) while origin/main had FASE 4 merged; the phase branch was created from origin/main."
reference:
commands_verified: "git branch -a; git log --all --oneline --graph — run, showed local on fase-1-base while origin/main had FASE 2 and 3 merged"
---

**Issue:** The user described a codebase with Tailwind, an admin panel and a catalog, but the working tree had none of it. The real cause of the "unstyled page" was a local checkout on an old phase branch, with dependencies of the newer branch never installed. Diagnosing CSS first would have rebuilt existing work.

**Suggested improvement:** Add to the project instructions: at the start of any diagnosis, compare the local branch to the remote default branch (`git branch -a`, `git log --all --graph`) and confirm `node_modules` matches the lockfile before treating features as missing.

**Principle:** When the code on disk contradicts the user's description, check which revision is checked out before diagnosing or building anything.
