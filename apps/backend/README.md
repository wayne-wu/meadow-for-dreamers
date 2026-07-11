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
WS   /ws
```

Submitted PNG files are stored under `public/uploads/flowers/`.
Records are stored in `data/flowers.json`.

Both paths are local runtime storage and should not be committed.

