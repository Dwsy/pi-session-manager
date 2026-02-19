# REST v1 Contract Tests (P0)

## Scope
- Validate REST facade behavior over existing command bus.
- Focus on status code + minimal response contract.

## Cases
1. `GET /v1/sessions` returns `200` and `{success:true,data:[...]}`.
2. `GET /v1/sessions?limit=1` returns at most one item.
3. `GET /v1/sessions/{id}/entries` returns `404` for unknown id.
4. `POST /v1/search/fulltext` with empty query returns `200` and zero hits.
5. `POST /v1/memory/recall` with `top_k=3` returns `returned<=3`.
6. `POST /v1/sessions/{id}/milestones` without `name` returns `400`.
7. `POST /v1/sessions/{id}/milestones` valid payload returns `201`.
8. `GET /v1/sessions/{id}/snapshot` returns message stats + recent entries.
9. `POST /v1/sessions/{id}/checkout` invalid target returns `400`.
10. `POST /v1/sessions/{id}/checkout` valid target returns `200` with preview payload.
11. `POST /v1/experience/extract` returns `200` and `items[]`.
12. `POST /v1/workflow/route-suggest` returns intent/confidence/next_actions.
13. `POST /v1/sessions/{id}/checkout` with `strategy=reset|squash` returns `403` in read-only mode.
14. `GET /v1/analytics/overview` returns sessions/details/top_cwds/intent_counts.
15. `POST /v1/memory/unified` returns intent/confidence/evidence/next_actions/experience.

## Example curl
```bash
curl -s -H 'Authorization: Bearer <TOKEN>' http://127.0.0.1:4123/v1/sessions | jq

curl -s -X POST -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  http://127.0.0.1:4123/v1/search/fulltext \
  -d '{"query":"memory","page":0,"page_size":10}' | jq
```
