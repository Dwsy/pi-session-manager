# Autoresearch ideas backlog

- Further write-path work should keep attacking real SQL statement count / data movement, but respect the newly discovered sweet spot: chunk size 32 currently beats both 16 and 64+.
- Search-side rewrites remain interesting only if they beat the mixed metric on top of the faster ingest path; retrieval-only wins are not enough.
