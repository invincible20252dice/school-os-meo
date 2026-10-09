# School OS development

- Before edits, run `git remote get-url origin` and `npm run codex:preflight`.
  Only `invincible20252dice/school-os-meo.git` on GitHub is authorized here.
  Stop on a mismatched repository or package.
- Read [product principles](docs/PRODUCT_PRINCIPLES.md), relevant
  [architecture](docs/ARCHITECTURE.md) and [development rules](docs/DEVELOPMENT_RULES.md).
  Inspect affected code and tests before planning or changing it. Reuse existing behavior.
- Never delete existing data, reset databases, DROP TABLE/COLUMN, or apply destructive migrations.
- Preserve schoolId isolation and existing authentication/authorization on every read and write.
- For DB changes, large features or multiple modules, create an
  [ExecPlan](docs/exec-plans/README.md) in `docs/exec-plans/active/` before edits.
- After changes follow the [verification skill](.agents/skills/school-os-verification/SKILL.md)
  and run `npm run codex:verify`. Investigate failures, fix safe causes and rerun.
  Do not weaken tests or claim completion before verification succeeds.
- Stop and report when a fix requires destructive DB changes, production data changes,
  increased billing, authentication redesign or major product scope changes.
- Production migrations/deployments require explicit authorization for the concrete
  operation. Check authorization already given in this task; do not request it twice.
  Verification never authorizes deployment. Protect secrets in logs and reports.
- Final report: changes/files, DB changes, existing-data impact, tests, failure/fix,
  build result, remaining issues and production follow-up. Keep it concise.
