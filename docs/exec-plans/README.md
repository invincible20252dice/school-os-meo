# ExecPlans

Before a large feature, database change or cross-module change, create
`active/<short-topic>.md`. Small local fixes need no plan file.

Include objective/non-goals, inspected code, current behavior, proposed behavior,
files and consumers, school/auth/data/API risks, additive migration strategy if
needed, a checklist, validation commands and acceptance criteria. Record decisions
and failures/fixes as work progresses. Preserve existing work and identify any
operation needing approval. Do not store credentials or production payloads.

On completion move the plan to `completed/` with actual validation results and
remaining issues. An unfinished/blocked plan stays in active with a concrete next step.
