const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const eventsRouter = require('./routes/events');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Security Middleware ---

// 1. Helmet sets a collection of HTTP response headers that browsers use
//    to block common attack vectors:
//    - X-Content-Type-Options: nosniff  → prevents MIME-type sniffing (drive-by downloads)
//    - X-Frame-Options: DENY           → blocks clickjacking via iframes
//    - Referrer-Policy: no-referrer    → stops referrer leaking to third parties
//    - And ~10 more headers out of the box.
//    One middleware line does the work of manually setting all of them.
app.use(helmet());

// 2. CORS (Cross-Origin Resource Sharing) restricts which origins the browser
//    will allow to make requests to this API.
//    Without this, any website on the internet could silently call our API
//    using the visitor's cookies/session — a classic CSRF vector.
//    We allow only the two local origins used during development.
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

// 3. Body size limit on JSON parser.
//    Express's built-in JSON middleware will reject payloads larger than this
//    before any route handler runs.  Prevents memory exhaustion from huge bodies.
app.use(express.json({ limit: '16kb' }));

// --- Routes ---
app.use('/api/events', eventsRouter);
app.use('/api/stats', dashboardRouter);

// Health check — useful for confirming the server started successfully
// without touching the database.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Catch-all 404 for unknown routes.
// Returning JSON (not HTML) keeps the API surface consistent and avoids
// accidentally leaking stack traces via Express's default HTML error page.
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Analytics backend running on http://localhost:${PORT}`);
});
