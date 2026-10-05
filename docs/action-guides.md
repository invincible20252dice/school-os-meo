# NEXT ACTION execution guides

## Implementation

- `src/lib/action-guides.ts` owns the shared, typed guide registry. Existing action/check keys resolve to guides without changing saved challenge documents.
- `action-guide.tsx` is reused by the current task, DAY details, photo confirmations and weekly actions. Opening a guide, copying text or navigating never saves completion.
- Eight fictional photography examples and one exterior NG example live in `public/examples/meo/photos`. They are references for taking real photographs, not uploadable school assets. The UI labels every image as AI-generated and prohibits publishing it as a real school photograph.
- The authenticated `POST /api/dashboard/challenge/guide-draft?schoolId=...` checks school access and reads registered school facts. It creates an editable, unsaved text draft from those facts and user-confirmed facts. Provider failures remain failures; no fabricated fallback draft is returned.
- Post topic suggestions use up to three actual stored search queries. Empty and failed demand retrieval remain distinct; these are not market-wide search volumes.
- Review replies continue through the existing review editor. Shared reply instructions prohibit inventing school, grade, results, attendance duration and family attributes. Existing saved drafts are not rewritten.

## Compatibility and boundaries

No DB schema, migration, existing document keys, CLEAR rules, version checks, authorization or publication API was changed. Existing confirmation/save operations remain authoritative. Google/Instagram publication is still a separate user-confirmed operation; copying a generated draft does not publish it or transfer it automatically to the existing composer.

Photo classification and upload verification are manual. This feature does not implement automatic photo scoring, live image generation, new search-volume collection or a new social publishing platform. Prompt grounding reduces unsupported assertions but users must still review generated text before publication.

## Verification

- Full coverage suite: 139 files, 1,658 tests passed. Statements/lines 99.22%, branches 97.26%, functions 99.75%.
- Guide registry, draft generator and guide component have focused coverage of success, failure, authorization, school changes, missing assets and copy behavior.
- Integration test follows guide -> target photo check -> existing save/version -> DAY CLEAR and next DAY.
- Typecheck and production build passed. The repository's `npm run lint` requests initial ESLint configuration; changed files are additionally checked using the installed Next ESLint rules.
- Local browser fixtures are explicitly labeled and do not connect to production DB. Desktop/mobile guide expansion and image loading were inspected; browser zoom affects the effective CSS viewport dimensions.

## Image reproduction recipe

All examples were generated with the image-generation tool, then resized to width 960 and encoded as WebP (quality 82). Retain the visible AI labels when replacing any asset.

Common prompt: Generate a realistic, ordinary smartphone photograph of a fictional small Japanese tutoring school. Modest, achievable composition rather than luxury advertising. No real school brand, readable personal records, student names, grades or identifiable real people. Show the subject clearly in natural light. This is an instructional reference for taking an actual photograph, not evidence of a real classroom.

| File | Scene instruction |
| --- | --- |
| exterior.webp | Street-level exterior with the full entrance and building context visible, level framing and daylight. |
| entrance.webp | Clear entrance and approach, door and access path unobstructed, no identifying signage. |
| classroom.webp | Tidy classroom with desks, board and walking space visible, realistic small-room proportions. |
| lesson.webp | Teacher explaining to students in a small class, non-identifying angles, no readable personal information. |
| self-study.webp | Quiet individual study desks, lighting and spacing visible, no documents with private information. |
| teacher.webp | Fictional approachable adult teacher in a modest classroom, not a real person. |
| consultation.webp | Fictional adults in a consultation space, welcoming seating, no readable records. |
| parking.webp | Modest bicycle/parking access area, spaces and approach visible, no readable license plates. |
| exterior-ng.webp | Clearly inferior exterior composition: dark or obstructed entrance and tilted framing, contrasted with the good exterior example. |

Generated source images are retained in the local Codex generated-images directory. The optimized checked-in files are the production source of truth.
