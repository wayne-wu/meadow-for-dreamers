# Studio Meadow Backend

Local MVP backend for flower submissions.

## Run

```bash
npm install
npm run dev
```

Default URL:

```text
http://localhost:8787
```

## Endpoints

```text
GET  /health
POST /api/flowers
GET  /api/flowers/active
GET  /api/flowers/recent?since=2026-08-29T20:14:22Z
GET  /api/sessions
GET  /api/sessions/active
POST /api/sessions
WS   /ws
```

Submitted PNG files are stored under `public/uploads/flowers/<meadow_session_id>/`.
Records are stored in `data/flowers.json`.

Both paths are local runtime storage and should not be committed.

## Meadow Sessions

The backend keeps two session concepts:

- `session_id`: anonymous visitor/browser session from the phone.
- `meadow_session_id`: installation run/session used by TouchDesigner.

`GET /api/flowers/active` and `GET /api/flowers/recent` default to the current active meadow session. Starting a new meadow session effectively clears the projection scene without deleting old flowers.

Start a new meadow session:

```bash
curl -X POST http://localhost:8787/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"name":"Opening Night Test 2"}'
```

List sessions:

```bash
curl http://localhost:8787/api/sessions
```

Load a specific older session:

```bash
curl "http://localhost:8787/api/flowers/active?session=<meadow_session_id>"
```
