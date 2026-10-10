# Security access inventory and staged grant candidates

Read-only recheck: 2026-10-10, production project bwqfuzporivryrteinjy. No customer contents or secrets read. No production grants changed. Base main 2bc8685fb6bbcc7647884432c704938099cd950c; PR #7 remains separate/unapproved.

All 27 tables below: RLS OFF, force OFF, owner postgres, no table policies; anon/authenticated/service_role/postgres have SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER (TargetDistrict raw ACL also includes MAINTAIN). Counts are exact at audit time. Browser Supabase calls found only profiles SELECT in AuthAccessBadge; server Supabase calls use profiles/profile_invitations. The paths below are static Prisma/SQL references, not proof that every endpoint is authorized or every legacy/external client is known.

| Table | Rows | Current source references |
| --- | ---: | --- |
| Account | 0 | `src/lib/gbp-reviews-sync.ts`; `src/lib/google-search-keywords.ts`; `src/lib/instagram-oauth.ts`; `src/lib/google-gbp-oauth.ts` |
| AioScoreHistory | 0 | `src/app/api/dashboard/reports/route.ts` |
| ChurnAlert | 2 | `src/app/api/dashboard/overview/route.ts`; `src/app/api/dashboard/churn-alert/route.ts` |
| GbpMetric | 0 | `src/lib/analytics.ts`; `src/lib/google-performance.ts`; `src/app/api/dashboard/reports/route.ts` |
| GoogleAccount | 1 | `src/lib/google-search-keywords.ts`; `src/lib/google-performance.ts`; `src/app/api/google/gbp-locations/route.ts`; `src/app/api/google/gbp-location-selection/route.ts`; `src/app/api/settings/google/route.ts` |
| InstagramSetting | 1 | `src/lib/instagram-sync.ts`; `src/lib/challenge-data.ts`; `src/app/(dashboard)/dashboard/instagram-sync/page.tsx`; `src/app/api/dashboard/settings/instagram/route.ts`; `src/app/api/auth/instagram/route.ts`; `src/app/api/auth/callback/instagram/route.ts`; `src/app/api/settings/school/route.ts` |
| KeywordRank | 0 | `src/app/api/dashboard/rankings/route.ts` |
| KeywordRanking | 3 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |
| MonthlyReport | 1 | `src/app/api/dashboard/reports/route.ts` |
| PromptSetting | 1 | `src/lib/prompt-settings.ts` |
| RankHistory | 0 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |
| RankingHistory | 17 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |
| Review | 4 | `src/lib/gbp-webhook.ts`; `src/lib/dashboard-summary.ts`; `src/lib/gbp-direct-reply.ts`; `src/lib/review-template.ts`; `src/lib/gbp-reviews-sync.ts`; `src/lib/challenge-data.ts`; `src/lib/line-webhook.ts`; `src/lib/manual-review-test.ts`; `src/lib/survey-persistence.ts`; `src/lib/trigger-review-test.ts`; `src/app/(dashboard)/dashboard/reviews/reviews-client.tsx`; `src/app/api/reviews/route.ts`; `src/app/api/dashboard/overview/route.ts`; `src/app/api/dashboard/reports/route.ts`; `src/app/api/dashboard/reviews/analytics/route.ts`; `src/app/api/gbp/reply/route.ts`; `src/app/(customer)/survey/[id]/survey-client.tsx` |
| School | 7 | `src/lib/dashboard-context.ts`; `src/lib/gbp-webhook.ts`; `src/lib/mock-instagram-sync.ts`; `src/lib/gbp-metrics.ts`; `src/lib/analytics.ts`; `src/lib/instagram-sync.ts`; `src/lib/dashboard-school-name.ts`; `src/lib/line-webhook.ts`; `src/lib/dashboard-rankings.ts`; `src/lib/auth-access.ts`; `src/lib/google-lead-access.ts`; `src/lib/aio-measurement.ts`; `src/lib/survey-persistence.ts`; `src/lib/public-survey-query.ts`; `src/lib/mock/meoExtendedData.ts`; `src/components/dashboard/DashboardHeader.tsx`; `src/app/(dashboard)/dashboard/roi/google-results-client.tsx`; `src/app/(dashboard)/dashboard/instagram-sync/page.tsx`; `src/app/(dashboard)/dashboard/challenge/challenge-client.tsx`; `src/app/(dashboard)/dashboard/settings/users/users-management-client.tsx`; `src/app/api/reviews/route.ts`; `src/app/api/public/survey-school/route.ts`; `src/app/api/dashboard/context/route.ts`; `src/app/api/dashboard/rankings/route.ts`; `src/app/api/dashboard/challenge/route.ts`; `src/app/api/dashboard/overview/route.ts`; `src/app/api/dashboard/google-results/route.ts`; `src/app/api/dashboard/reports/route.ts`; `src/app/api/dashboard/reviews/analytics/route.ts`; `src/app/api/dashboard/google-results/performance/route.ts`; `src/app/api/dashboard/challenge/guide-draft/route.ts`; `src/app/api/dashboard/settings/prompt/route.ts`; `src/app/api/dashboard/settings/line/route.ts`; `src/app/api/dashboard/settings/instagram/route.ts`; `src/app/api/gbp/reply/route.ts`; `src/app/api/admin/users/route.ts`; `src/app/api/admin/schools/route.ts`; `src/app/api/google/gbp-location-selection/route.ts`; `src/app/api/settings/google-review-url/route.ts`; `src/app/api/settings/google/route.ts`; `src/app/api/settings/school/route.ts` |
| SchoolSetting | 1 | `src/lib/gbp-reviews-sync.ts`; `src/lib/challenge-data.ts`; `src/lib/google-search-keywords.ts`; `src/lib/line-webhook.ts`; `src/lib/google-performance.ts`; `src/lib/public-survey-query.ts`; `src/lib/trigger-review-test.ts`; `src/app/api/dashboard/settings/prompt/route.ts`; `src/app/api/dashboard/settings/line/route.ts`; `src/app/api/dashboard/settings/instagram/route.ts`; `src/app/api/google/gbp-locations/route.ts`; `src/app/api/google/gbp-location-selection/route.ts`; `src/app/api/auth/instagram/route.ts`; `src/app/api/auth/callback/google/route.ts`; `src/app/api/auth/callback/instagram/route.ts`; `src/app/api/settings/google-review-url/route.ts`; `src/app/api/settings/google/route.ts`; `src/app/api/settings/school/route.ts` |
| SearchQueryLog | 5 | `src/app/api/dashboard/overview/route.ts`; `src/app/api/dashboard/reports/route.ts`; `src/app/api/dashboard/analytics/queries/route.ts` |
| Session | 0 | `src/components/dashboard/KeywordManager.tsx`; `src/components/dashboard/SupportChat.tsx`; `src/app/(dashboard)/dashboard/overview-client.tsx`; `src/app/(dashboard)/dashboard/roi/google-results-client.tsx`; `src/app/(dashboard)/dashboard/aio/aio-client.tsx`; `src/app/(dashboard)/dashboard/rank-tracker/ranking-client.tsx`; `src/app/(dashboard)/dashboard/challenge/challenge-client.tsx`; `src/app/(dashboard)/dashboard/challenge/action-guide.tsx`; `src/app/(dashboard)/dashboard/reviews/alerts/page.tsx`; `src/app/(dashboard)/dashboard/reviews/analytics/review-analytics-client.tsx`; `src/app/(dashboard)/dashboard/keywords/competitors/page.tsx` |
| SocialPost | 2 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |
| Survey | 4 | `src/lib/public-survey-response.ts`; `src/lib/survey-builder.ts`; `src/lib/challenge-data.ts`; `src/lib/survey-persistence.ts`; `src/lib/public-survey-query.ts`; `src/app/(dashboard)/dashboard/surveys/surveys-list-client.tsx`; `src/app/(dashboard)/dashboard/challenge/challenge-client.tsx`; `src/app/(dashboard)/dashboard/surveys/[id]/edit/survey-editor.tsx`; `src/app/api/surveys/route.ts`; `src/app/(customer)/survey/[id]/survey-client.tsx` |
| SurveyItem | 26 | `src/lib/survey-persistence.ts` |
| SurveySetting | 2 | `src/app/api/surveys/route.ts` |
| SyncedPost | 0 | `src/lib/instagram-sync.ts`; `src/lib/challenge-data.ts` |
| TargetDistrict | 3 | `src/app/api/dashboard/keywords/districts/route.ts` |
| TargetKeyword | 4 | `src/lib/challenge-data.ts`; `src/lib/aio-measurement.ts`; `src/app/(dashboard)/dashboard/instagram-sync/page.tsx`; `src/app/api/dashboard/rankings/route.ts`; `src/app/api/dashboard/overview/route.ts`; `src/app/api/dashboard/keywords/route.ts`; `src/app/api/dashboard/reports/route.ts` |
| User | 1 | `src/lib/access-control.ts`; `src/lib/supabase-access.ts`; `src/lib/auth-access.ts`; `src/lib/survey-persistence.ts`; `src/components/dashboard/AuthAccessBadge.tsx`; `src/app/(dashboard)/dashboard/settings/users/users-management-client.tsx`; `src/app/api/admin/users/route.ts`; `src/app/api/admin/schools/route.ts` |
| UserSchool | 0 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |
| VerificationToken | 0 | No current TS/TSX runtime reference found; legacy/external use unconfirmed |

## Direct profiles access

RLS ON, force OFF; profiles_select_own SELECT USING (auth.uid() = id); profiles_update_own UPDATE USING/WITH CHECK (auth.uid() = id), roles public. Current broad table privileges include UPDATE; authenticated can update every column: id, role, school_id, school_ids, full_name, created_at, updated_at, status. The current ACL has no PUBLIC entry, column ACLs or inherited roles for anon/authenticated/service_role. Existing profiles_set_updated_at trigger remains untouched.

Proposal is separate from TargetDistrict: revoke table/column UPDATE from anon/authenticated, grant authenticated UPDATE(full_name), preserve SELECT/self-row policies/service_role. scripts/sql/security/profiles-name-only.sql and profiles-restore.sql are manually gated candidates; not migrations, not automatic build steps. Rollback restores the original broad UPDATE risk and requires explicit approval.

## First production gate: TargetDistrict only

- Change target: public.TargetDistrict only, 3 existing rows. No row changes.
- Access path: dashboard/keywords/competitors/page.tsx bearer request -> /api/dashboard/keywords/districts -> resolveRequestAccess / approval / canAccessSchool -> school-scoped Prisma. No external publish action.
- Candidate: scripts/sql/security/target-district-revoke.sql removes anon/authenticated direct privileges, preserving postgres/service_role and leaving RLS/policies unchanged.
- Impact: browser direct requests should fail, server operations should remain available only if runtime DB role retains privileges. The observed production district request is confirmed as postgres by correlated error metadata (details below). Successful CRUD is blocked by legacy updatedAt schema drift; external/old implementation dependencies remain unknown. Do not fetch credentials. These remain production blockers.
- Rollback: scripts/sql/security/target-district-restore.sql restores the audited two role grants for this table only; recheck latest ACL before execution. No schema rollback/data deletion.

## Verification and fixture gate

Local PGlite: two synthetic schools/districts; two synthetic profile rows; anon/authenticated/service_role roles and local auth.uid stub. No Supabase project/account/token created. Route tests cover anonymous/pending/member/admin/other-school IDs and response secrecy; accepted invitation cannot reactivate a profile. Browser fixtures are loopback-only and block unmocked provider traffic.

Required production regression remains NOT RUN: login/logout, school switch, dashboard, reviews, surveys, challenge, Google outcomes, inquiry/scheduled/held/enrolled, AIO, settings and user permissions. Profile role/school-ID denial tests use synthetic data only.

Before any production fixture: propose two unconnected synthetic schools with unique test place markers, one district and alert each, one synthetic draft survey, and dedicated manager-A/manager-B/admin/suspended profile contexts. Prefer existing authorized synthetic accounts if available; otherwise report need for account/token issuance and obtain approval first. No archived prior acceptance school reuse/reactivation. Fixture creation is not approved.

Never use Google performance GET as read-only (may UPSERT GbpMetric), profile resolution GET as write-free (may accept invitation), or survey save on customers (replaces SurveyItem). Do not perform Google/Instagram publication, LINE sends or paid AIO in production regression.

Parent must present the five items before any production permission change. One small change -> real-screen verification -> complete regression -> next approved scope. No blanket 27-table operation. Keep remaining tables unchanged.

Reference checked: [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security) explains that broad table UPDATE must be revoked before column UPDATE can restrict authorization fields. Existing SELECT is preserved.

## Pilot preparation update (2026-10-10; no production changes)
PR #8 follow-up handles expired/rejected sessions as safe 401 responses, preserving
403 for pending/cross-school access and 500 for auth-service failures. District GET
uses an explicit UI-field select: production lacks Prisma's updatedAt column,
confirmed by metadata and the scoped failing-request log. Write operations remain
blocked pending a separately approved additive schema reconciliation; do not apply
the one-table GRANT pilot before normal read/write prerequisites pass.

Minimal fixture proposal supersedes the broader first-pilot fixture list above:
reuse archived synthetic schools codex-google-lifecycle-20261009-a/b only after
explicit approval; add one district each and use existing admin plus one dedicated
manager assigned only A. The two nominated Google identities already hold active
business roles (manager on a real school; admin), so neither may be repurposed.
No account, invitation, session or fixture has been created/reactivated.

Cleanup must not DELETE: keep the two synthetic districts, restore schools to
ARCHIVED, and suspend/unassign the dedicated manager. This removes normal selector
visibility; the district API has no ACTIVE-school check, so explicit admin access
remains possible. Archive is not a database isolation boundary. No current global
TargetDistrict aggregate consumer exists; external clients remain unconfirmed.

Subsequent correlated log evidence resolves the observed runtime role: controlled
Chrome GET at 03:55:14 UTC -> PostgreSQL 03:55:17.940 UTC, TargetDistrict PARSE,
SQLSTATE 42703, user postgres, application Supavisor. This proves that request's
connection identity; successful CRUD after schema reconciliation is still untested.
The newly designated test identity is an existing pending manager, no assignments.
No new Auth user is needed. Activation/A-only assignment require fixture approval;
cleanup restores pending/unassigned baseline, without account or data deletion.

Legacy drift extends beyond updatedAt: aiMessage/createdAt are nullable and the
school FK is absent; existing (schoolId,name) unique index is present. Read-only
counts: 3 rows, zero duplicates, orphans or NULL aiMessage/createdAt. Preserve
legacy competitor columns. Any additive reconciliation needs its own tested SQL
and explicit approval; CREATE TABLE IF NOT EXISTS is insufficient.
