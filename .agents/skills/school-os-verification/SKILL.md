---
name: school-os-verification
description: Verify School OS changes, regression scope, database safety and UI behavior before completion. Use after School OS edits; does not authorize production writes or deployment.
---

# School OS verification

1. Run `npm run codex:preflight` from the School OS root. Stop on wrong origin or
   package. Inspect git diff and preserve unrelated changes.
2. Read [development rules](../../../docs/DEVELOPMENT_RULES.md) and the affected
   [architecture](../../../docs/ARCHITECTURE.md). Trace callers, schoolId filters,
   auth, schema and external writes. Keep an [ExecPlan](../../../docs/exec-plans/README.md)
   for complex work.
3. Add behavioral tests proportional to risk: unauthorized/cross-school access,
   reload persistence, missing/error data and quota failures when relevant.
   Reuse PGlite and route workflows; mock only external boundaries.
4. Run `npm run codex:verify`. Inspect actual results. UI changes need browser
   interaction and desktop/mobile screenshots. Read [testing](../../../docs/testing.md)
   for fixture boundaries and known AIO gaps.
5. Investigate FAIL, fix safely, rerun affected checks and aggregate verification.
   Never lower coverage or hide failures. Stop if resolution needs destructive DB
   changes, production data changes, increased spend, auth redesign or major product changes.
6. Manually review schema/SQL even when static checks pass. Production migrations
   and deployments must satisfy AGENTS.md's conditional authorization and safety
   gates; verification alone is not approval. Preapproved feature push/CI work
   does not need another confirmation.
7. Report changes/files, DB/data impact, tests, failure/fix, build, remaining gaps
   and production follow-up. Mocked tests do not prove live provider availability.
