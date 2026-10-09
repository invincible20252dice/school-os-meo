# Google inquiry -> scheduled meeting -> held meeting -> enrollment

## Authorization and baseline

PM relayed the user's explicit extension on 2026-10-09: implement the complete
manual lifecycle and verify real Supabase persistence. No further feature-scope
confirmation is needed. Production writes, migration application, deployment and
new credentials still need concrete approval under AGENTS. No new Supabase project.
Continue in PR #5 after mobile fix 921f8ff. Preserve existing UI/SQL acceptance.

Existing product principles require inquiry -> meeting -> enrollment, but neither
the original f9e1e31 implementation nor repository requirements define planned vs
held. Existing code records only inquiry/meeting/lost and a status-change timestamp.
Production read-only inspection: project bwqfuzporivryrteinjy, school-os-meo,
ap-northeast-1, Postgres 17.6; GoogleLead contains one legacy meeting. No new fields.
RLS is enabled with no public policies. No customer IDs/records are copied here.

## Minimal compatible implementation

- Add nullable meetingScheduledAt, meetingHeldAt and enrolledAt timestamps. Leave
  old status/meetingAt/closedAt and all existing rows untouched. No backfill.
- New explicit stage actions record manual confirmation timestamps on the server:
  inquiry -> scheduled -> held -> enrolled. This is status tracking, not calendar
  booking. Labels distinguish confirmation/update dates from appointment dates.
- Legacy meeting without milestones remains '旧面談・予定/実施未確認'. The operator
  may explicitly confirm planned or held; never automatically infer either.
- Keep legacy status=meeting for new meeting/enrollment stages so old code can
  still read rows. Existing legacy API status mutations stay accepted; they never
  fabricate new milestones. Returning to inquiry explicitly clears milestone
  confirmations; lost retains factual held/enrollment timestamps. New UI does not
  offer enrollment -> lost as a withdrawal-management feature.
- Inquiry cohorts and realized held/enrollment counts/rates are separate. Unknown
  legacy meetings are shown separately and never counted as realized held/enrolled.
  Losing an inquiry after a held meeting does not erase that actual event.
- Reuse school authorization, scoped idempotency, version CAS, safe failed-refresh
  behavior. Migration adds only nullable columns, checks and school/date indexes;
  no RLS grants, auth changes, paid APIs, cron or attribution expansion.

## Verification / delivery

- [x] Domain transitions, legacy unknown behavior, counts and date integrity.
- [x] Actual API/store/PGlite persistence, duplicate/race/failure/tenant cases.
- [x] UI progression, correction warning, legacy confirmation and accessible mobile E2E.
- [x] Exact migration tested with existing legacy row unchanged and old SQL writes.
- [x] Full local verification and PR-wide release approval packet.
- Exact-head CI evidence is maintained in PR #5 and the final handoff, so a
  documentation-only evidence update is not mistaken for a tested code SHA.
- [ ] Real Supabase persistence across independent sessions and browser reload.

Prepare scripts/procedures and local evidence before requesting one concrete
approval bundle for additive migration, strictly isolated synthetic school data,
exact staged deployment and real acceptance. Approval must identify cleanup,
rollback, cost and existing-data boundaries. Do not call the whole task complete
without real DB acceptance. Continue all independent local work while blocked.

Local `npm run codex:verify` passed: 164 test files / 1,949 tests, 32 desktop/mobile
E2E cases, Prisma generation, typecheck, lint (six pre-existing warnings), plain
production build and migration/tooling checks. Coverage: statements/lines 99.24%,
branches 97.43%, functions 99.77%. Mobile and desktop screenshots inspected.
Invalid normalized calendar dates now fail validation. Active-profile auth uses
the existing opt-in resolver; no role/membership redesign or profile writes.
GitHub read-only inspection found no rulesets and main is not protected. Release
must resolve that documented gate; no repository settings were changed.

Implementation commit af4b5a06015a4236a0f925dd040470e4aab1890b is pushed in PR #5.
Next: pin both final-head CI runs in PR #5, then obtain the single concrete approval
bundle. Keep this plan active until real DB acceptance; no production action has
been authorized by this local/CI work.
