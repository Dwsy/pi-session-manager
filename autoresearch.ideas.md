# Autoresearch ideas backlog

- Redesign multi-session ingest at a lower level (e.g. fewer SQL statements / different write pipeline), rather than wrapping the current `upsert_session` shape in savepoints.
- If revisiting search, target rewrites that remove enough work to beat the mixed metric, not just retrieval latency in isolation.
