---
id: 1
title: "Probe the toolchain install in the target environment before proposing a stack"
status: open
type: open-source
skill: []
proposes_skill: [project-bootstrap-check]
target_file: []
siblings_checked: "none — no existing skill covers project bootstrapping; ponytail:ponytail governs code size, not environment feasibility (checked — instance-specific to bootstrapping, no propagation)"
area: "stack selection before phase 1"
date: 2026-10-05
session_context: "Bootstrapping a Next.js e-commerce MVP in a network-restricted cloud sandbox"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: npx prisma --version → 403 fetching schema-engine from binaries.prisma.sh; run: drizzle-kit --version → ok"
---

**Issue:** The architecture proposal named Prisma as ORM and the user approved it. Only after approval, at first install, did the environment refuse Prisma's runtime binary download (egress allowlist), forcing a stack change the user had to be told about mid-phase.

**Suggested improvement:** A bootstrap checklist step: before presenting a stack for approval, install each proposed dependency in a scratch directory and run its CLI once (`--version` is enough to trigger post-install binary fetches). Present only candidates that passed, and name any that failed with the reason.

**Principle:** A dependency's install-time and first-run network needs are part of its feasibility; verify them in the actual execution environment before asking anyone to approve a choice built on it.
