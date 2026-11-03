# Labmitra Medical Knowledge Library

Server-side only. Never import these files into client components and never return them whole from an API.

## Layout
```
medical-library/
├── _meta/
│   ├── categories.json          20 fixed categories
│   ├── symptom-synonyms.json    one group = one symptom across Hindi / English / Hinglish (de-duplication lives here)
│   └── catalog-planned.json     BACKLOG of topics not written yet (names + search words only)
└── conditions/
    └── <category-id>.json       array of full records, one file per category
```
Scaling path: hundreds of records fit comfortably in memory per serverless instance. At ~1000+ records, split a category into several files (the loader reads every `conditions/*.json`) or add a build step that creates a lightweight keyword index.

## Record fields (all required, enforced by `npm run medical:validate`)
`id` (kebab-case, unique) · `name_en` · `name_hi` · `name_aliases` · `category` · `summary` · `symptoms` ·
`keywords {hi, en, hinglish}` · `causes` · `risk_factors` · `tests[]` · `specialist {primary, also}` ·
`prevention` · `lifestyle` · `red_flags` · `when_to_consult` · `special_populations` (age / sex / pregnancy) ·
`faqs[]` · `sources[]` · `dates {published, updated}` · `review {status, reviewer, last_verified, notes}`

Each **test**: `name`, `type` (screening / diagnostic / monitoring ...), `purpose`, `preparation {fasting?, cycle_timing?, other?}`, `exceptions`.
Never write a universal rule ("always fast"). Say when it applies and when it does not.

Each **source**: `organization`, `title`, `url`, `url_status`:
`needs_source` (no url) → `unchecked` (url believed correct, not opened) → `seen_in_search` → `checked_by_reviewer`.

## Review workflow
`pending_review` → `in_review` → `verified` (or `rejected`).
A record may be `verified` only if: reviewer name set, `last_verified` date set, and EVERY source has a url with `url_status = "checked_by_reviewer"`.
The validator fails the build check otherwise. In production the API serves ONLY `verified` records; everything else returns the "information under medical review" message
(set `MEDICAL_ALLOW_UNREVIEWED=true` only for local/Preview testing).

## Adding a condition
1. Add the record to `conditions/<category>.json` with `review.status = "pending_review"`.
2. Put new spellings of shared symptoms in `symptom-synonyms.json`, not in every record.
3. `npm run medical:validate` and `npm run test:medical`.
4. A clinician reviews content + opens every source URL, then updates the `review` block and `sources[].url_status`.
