# Current architecture

Evidence reviewed against the local repository on 2026-10-09. This describes code,
not a certification of deployed credentials, migrations or provider availability.

| Area | Current implementation / evidence |
| --- | --- |
| Application | Next.js 15 App Router, React 19, TypeScript; `src/app`, CSS Modules, inline SVG components. |
| Data | PostgreSQL through Prisma, `prisma/schema.prisma`, singleton `src/lib/prisma.ts`. School, SchoolMembership and schoolId relations define tenancy. |
| Supabase | `src/lib/supabase.ts`, `supabase-auth.ts`, `supabase-access.ts`; OAuth sessions, profile approval and role/school access. |
| Hosting | Vercel build paths now run client generation and Next build only. Legacy SQL preparation scripts remain but must not run during build or this pilot. |
| Google | `src/lib/google-gbp-oauth.ts`, `src/app/api/auth/google`, callback and settings APIs; stored account/location connection. |
| Reviews | `src/app/api/reviews`, `api/gbp/reply`, `lib/gbp-reviews-sync.ts`, `gbp-direct-reply.ts`, `review-reply-assist.ts`; list, drafts, sync and provider replies. |
| Challenges | `dashboard/challenge`, `api/dashboard/challenge`, `lib/challenge*.ts`, `action-guides.ts`; seven-day tasks, manual evidence, versioned SchoolChallenge JSON and next actions. |
| Surveys | `dashboard/surveys`, `(customer)/survey/[id]`, surveys/survey-responses APIs and `survey-persistence.ts`; editing, public answers and generated review drafts. |
| Rankings | `api/dashboard/rankings`, `api/dashboard/keywords`, `lib/dashboard-rankings.ts`; TargetKeyword, RankHistory and legacy KeywordRank. `ranking-simulation.ts` is a separate simulated-data path, not evidence of live measurement. |
| Competitors | `dashboard/keywords/competitors`; competitorData from ranking histories. This is separate from AIO competitor scoring. |
| AIO | `dashboard/aio/aio-client.tsx` (also aio-score alias), authenticated `api/dashboard/aio`, `lib/aio-provider.ts`, `aio-measurement.ts`, new AioMeasurement. OpenAI API search only; manual single-keyword pilot awaiting live acceptance. Legacy AioScoreHistory retained, excluded from new AIO API. |
| Google outcomes | `dashboard/roi/google-results-client.tsx`, `api/dashboard/google-results`, `lib/google-leads.ts`, `google-lead-lifecycle.ts`, `google-lead-store.ts`, GoogleLead; manual inquiry -> scheduled -> held -> enrolled confirmations, event counts and inquiry-cohort rates. Legacy meeting rows remain explicitly unclassified. Three additive milestone columns are implemented and tested locally; production migration/deployment and real persistence acceptance remain pending. See `google-lead-release-approval.md`. |
| Diagnostics | `api/dashboard/reports`, `lib/dashboard-reports.ts`, `dashboard/report`; database aggregates, not guaranteed causal attribution. |
| Tests | Vitest + Testing Library, provider/route mocks and PGlite SQL persistence. Browser tests add UI/navigation coverage with synthetic API boundaries. |

## Search-demand diagnostic boundary

`google-search-keywords.ts` retains existing month/location storage and auth scope.
Failed cached results return neither old rows nor an old success fetchedAt.
`google-diagnostics.ts` allowlists stage and HTTP status for UI/logging. Provider
error bodies, arbitrary scopes/codes and identifiers are not spread into logs.
`action-guides.ts` is the common status-aware topic selector for guides and
`challenge-next-actions.ts`; daily/weekly notices distinguish information shortage
from a successful empty month. No inquiry/milestone or performance-sync route is
changed by this diagnostic work; no production validation is implied.

## AIO live-pilot boundaries

- The legacy aio-analyzer still contains sample helpers, but no production caller
  reaches them. Cron now fails closed and returns disabled even with authorization.
- New AIO GET/POST uses bearer authentication, approval and schoolId authorization.
- New AioMeasurement stores attempts, status, nullable metrics, query/response,
  model, citations, classification evidence and safe error codes.
- Success recommendation rate for the selected keyword is recommended successes /
  successful measurements (one latest attempt). Failure/unmeasured/configuration
  states never render successful zero. It is not a public ChatGPT recommendation rate.
- Gemini/Google AI Overview are unsupported, not silently replaced with API scores.
- Aggregate/history/competitor charts are pending the live pilot and do not show
  fabricated data. Legacy overview/report consumers still use legacy AIO summaries;
  migrating those consumers is a separate required rollout task before release.
- Additive migration is authored and tested in PGlite, not applied to live databases.
- Real provider + Prisma transport + authenticated browser reload acceptance awaits
  approved additive SQL and Vercel deployment. Secrets stay in Vercel. Admin-only
  POST pins one school/keyword/server request ID; see aio-production-pilot.md.

Do not activate the current sample-based cron as a substitute for real measurement.
