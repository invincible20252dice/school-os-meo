# School / LINE settings access boundary
Base: production 077f147. Branch codex/school-line-settings-access. PR9 stays fixed.
Scope: authenticated active stored profile, explicit canAccessSchool and requested/effective
school match before business reads/writes, 401 invalid sessions, sanitized failure logs,
allowlisted Prisma mutation results. No schema, provider, production or customer changes.
Keep authorized response/save fields and LINE fallback behavior in this bounded stage.

## Findings and decisions
- LINE tab reads dashboard/settings/line but saves PATCH settings/school. Existing
  bearer headers support stricter API guards without frontend changes.
- Both normal responses expose LINE token aliases. School settings exposes Meta app secret.
  Masking alone breaks test notification (TestReviewNotificationButton sends token with no
  schoolId/bearer to api/test/trigger-review) and may save masks as credentials.
  This needs a separate server-side school-scoped notification flow; not done in this stage.
- LINE GET copies fallback settings when token+destination are incomplete. It looks across
  SchoolSetting and legacy tables without school ownership filtering, selects newest rows,
  and writes credentials/notification flags to requested ACTIVE school.
  Docs search found no approved headquarters-sharing specification. Existing tests encode
  behavior, not authorization. Do not infer sharing legitimacy or remove it unilaterally.
- Even authenticated assigned users may trigger fallback from another school. This remains
  a high-risk follow-up, not solved by route access guards. Parent must decide source policy.
- Public survey customer page uses public/survey-school and survey-responses. Admin surveys
  configuration route is distinct; no changes to any survey or sync/context route here.

## Progress
- [x] Read rules, consumers, helper/serializer/write code and existing tests; preflight.
- [x] Synthetic red tests:20 failed/37 passed before fix; denied responses now secret-free.
- [x] Bounded route fix; existing manager/admin normal paths retained.
- [x] Local aggregate verification:166 files/1998 tests,40 desktop/mobile E2E,
  typecheck,lint(existing6 warnings),plain build,tooling,migration checks passed.
  Coverage99.26% statements/lines,97.51% branches,99.77% functions.
  New LINE E2E verifies bearer,schoolId,read via LINE/save via school API,reload;
  no real notifications. Initial green run needed the existing exact upsert assertion
  updated for new id-only result selection; then full aggregate passed.
- [ ] Draft PR / exact-head CI (results to be recorded in PR/parent report).
- [ ] Parent review; merge/deploy not authorized.

Evidence: ../evidence/security-access-boundaries/school-line-{red,green,verify}.log,
school-line-decision-record.md and fallback-route-audit.md. Feature Preview disabled.
Next: parent decision on school-owned-only vs explicit headquarters-sharing policy,
then separately secure notification endpoint and mask secrets with save preservation.
No claim of complete secret confinement/tenant isolation while legacy fallback remains.
