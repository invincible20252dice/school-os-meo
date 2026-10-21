# Preserve the measured school in Overview ranking actions

Cycle3, existing PR7. Owner root; independent reviewer lane C.

All-school Overview selects a specific school's latest MEO measurement, but both
ranking links previously passed schoolId=all. RankingClient then required the user
to select a school again. Preserve the selected scope when one exists; otherwise
use summary.meo.schoolId for ranking links only. Other aggregate links stay all-school.
No backend authorization, schema, metrics or provider behavior changes.

Acceptance: regression for both absent/all scope fails before fix and passes after;
existing single-school/empty/loading/error cases remain. Desktop/mobile browser
checks click both links and verify the ranking request targets the measured school.

- RED: two component regressions failed (received all instead of school-b), 20 passed.
- GREEN: all 22 component cases passed after the limited href correction.
- Full codex:verify and independent review pending; do not claim completion or CI.

No production, real OAuth, DB, deploy, alias or settings changes. Existing PR7
branch suppression must be rechecked before normal push. PR body save remains
APPROVAL from Cycle2; no GUI or denied API retry is part of this implementation.
