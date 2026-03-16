# Web Analytics Playground

A full-stack learning project that captures user events on a demo landing page, sends them to a Node.js backend, stores them in SQLite, and visualises them on a live dashboard — all with six security measures applied and explained.

---

## What You'll Learn

### 1. Event-Driven Analytics (tracker.js)
How to capture user behaviour with a lightweight JavaScript SDK. You'll see how `page_view` fires on load, how a single **delegated** click listener catches every `[data-track]` element efficiently, how scroll depth is measured with a debounced `scroll` listener to avoid performance issues, and why `session_end` uses the **Beacon API** (`navigator.sendBeacon`) rather than `fetch` — because `fetch` is cancelled when the page closes but Beacon is not.

### 2. Input Validation with Zod (`middleware/validate.js`)
Why you should never trust data arriving at an API endpoint. Zod schemas enforce types, string formats, length caps, and an explicit whitelist of allowed `event_name` values. You'll see how validation middleware intercepts bad requests before they reach the database, and how returning structured errors helps clients debug without leaking server internals.

### 3. Rate Limiting (`express-rate-limit`)
How to prevent a single IP from flooding your database with fake events. The `express-rate-limit` middleware tracks request counts per IP in a sliding 1-minute window and returns HTTP 429 when the limit is exceeded. Scoping the limiter to only `/api/events` (not the whole app) gives the dashboard endpoint its own independent budget.

### 4. HTTP Security Headers with Helmet (`server.js`)
How one middleware line sets ~15 response headers that harden the browser's security model: `X-Content-Type-Options: nosniff` prevents MIME-sniffing attacks, `X-Frame-Options: DENY` blocks clickjacking, `Referrer-Policy` stops referrer leakage, and more. You'll understand why these headers exist by reading the inline comments in `server.js`.

### 5. IP Anonymisation (`routes/events.js`)
GDPR's **data minimisation** principle in practice. The raw IP address (`req.ip`) is run through `crypto.createHash('sha256')` before any storage. The hash lets you count unique visitors without ever persisting a personally identifiable address. You'll see exactly where in the request lifecycle this transformation happens.

### 6. SQL Injection Prevention (`db.js`, `routes/events.js`)
Why parameterized queries are non-negotiable. `better-sqlite3`'s `db.prepare()` + `.run({ @param })` pattern ensures user-supplied values are always bound as data — never interpolated into the SQL string. Prepared statements are created once at startup and reused, giving both security and a performance benefit from SQLite's query-plan cache.

### Bonus: SQLite WAL Mode (`db.js`)
Why `PRAGMA journal_mode = WAL` is almost always the right choice for a read-heavy analytics workload. WAL (Write-Ahead Logging) allows simultaneous reads and writes, which matters when the dashboard is polling while events are being inserted.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS + HTML + CSS (zero dependencies) |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| Security | `express-rate-limit`, `helmet`, `cors`, `zod` |

---

## Folder Structure

```
analytics-project/
├── backend/
│   ├── server.js            # Express app, security middleware setup
│   ├── db.js                # SQLite connection, schema init, WAL mode
│   ├── routes/
│   │   ├── events.js        # POST /api/events — ingestion + IP hashing
│   │   └── dashboard.js     # GET /api/stats  — aggregate queries
│   ├── middleware/
│   │   └── validate.js      # Zod schema validation for incoming events
│   └── package.json
├── frontend/
│   ├── index.html           # Demo landing page (tracked)
│   ├── dashboard.html       # Live analytics dashboard
│   ├── tracker.js           # Frontend SDK (page_view, button_click, scroll_depth, session_end)
│   └── dashboard.js         # Dashboard fetch + SVG chart rendering
└── README.md
```

---

## Tracked Events

| Event | Trigger | Properties |
|---|---|---|
| `page_view` | Page load | `page_url`, `referrer`, `viewport_width` |
| `button_click` | Click on `[data-track]` element | `button_id`, `button_text` |
| `scroll_depth` | 25%, 50%, 75%, 100% thresholds crossed | `depth_percent` |
| `session_end` | `visibilitychange` hidden or `beforeunload` | `session_duration_ms` |

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/isikkara/web-analytics-playground.git
cd web-analytics-playground

# 2. Install backend dependencies
cd backend
npm install

# 3. Start the backend (runs on port 3001)
node server.js

# 4. Open a second terminal and serve the frontend (runs on port 3000)
cd ../frontend
npx serve . -p 3000
```

Then open:
- **Demo page:** http://localhost:3000/index.html
- **Dashboard:** http://localhost:3000/dashboard.html

---

## API Reference

### `POST /api/events`
Ingest a single analytics event.

**Request body:**
```json
{
  "event_name": "button_click",
  "session_id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "page_url": "http://localhost:3000/index.html",
  "properties": {
    "button_id": "cta-get-started",
    "button_text": "Get Started Free"
  }
}
```

**Validation rules:**
- `event_name`: one of `page_view | button_click | scroll_depth | session_end`
- `session_id`: UUID v4 format
- `page_url`: valid URL, max 512 characters
- `properties`: flat object, max 10 keys, each value max 256 characters

**Response:** `{ "success": true, "id": 42 }`

---

### `GET /api/stats`
Aggregate statistics for the dashboard.

**Response:**
```json
{
  "total_events": 1024,
  "unique_sessions": 87,
  "events_by_name": [
    { "event_name": "page_view", "count": 412 }
  ],
  "events_over_time": [
    { "hour": "2024-01-15 14:00", "count": 34 }
  ],
  "top_pages": [
    { "page_url": "http://localhost:3000/index.html", "count": 412 }
  ]
}
```

---

## Security Measures

| # | Measure | Where |
|---|---|---|
| 1 | Rate limiting (30 req/IP/min) | `routes/events.js` |
| 2 | Input validation with Zod | `middleware/validate.js` |
| 3 | CORS origin whitelist | `server.js` |
| 4 | HTTP security headers (Helmet) | `server.js` |
| 5 | IP anonymisation (SHA-256) | `routes/events.js` |
| 6 | Parameterized SQL queries | `routes/events.js`, `routes/dashboard.js` |

Every security decision is documented with an inline comment explaining **why** it exists.

---

## License

MIT
