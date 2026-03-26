# Autoresearch ideas backlog

- Revisit single-query `total_hits` computation in `full_text_search` now that ingest is much cheaper; the earlier search win may finally beat the mixed metric.
- Further write-path reductions should target real statement-count cuts or chunking, not superficial savepoint wrappers.
