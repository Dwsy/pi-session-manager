# Autoresearch ideas backlog

- Batch session metadata lookup inside `full_text_search` SQL to remove follow-up `get_session()` calls.
- Evaluate a composite `message_entries` index tuned for `(session_path, entry_id, timestamp)` window/dedup paths.
