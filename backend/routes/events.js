const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const validate = require('../middleware/validate');

const router = express.Router();

// Rate limiter scoped only to the event ingestion endpoint.
// 30 events per IP per minute is generous for a real user but prevents
// a script from flooding the database and skewing analytics data.
// Keeping this separate from a global limiter lets the dashboard endpoint
// have its own (more permissive) budget.
const eventLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute sliding window
  max: 30,             // max requests per IP per window
  standardHeaders: true,  // Return `RateLimit-*` headers so clients can back off gracefully
  legacyHeaders: false,
  message: { success: false, error: 'Too many events, please slow down.' },
});

// Prepared statement created once at startup — reused for every insert.
// Parameterized queries are the primary SQL injection defence: user-supplied
// values are always bound as data, never interpolated into the SQL string.
const insertEvent = db.prepare(`
  INSERT INTO events (event_name, session_id, page_url, properties, ip_hash)
  VALUES (@event_name, @session_id, @page_url, @properties, @ip_hash)
`);

// Returns the last 100 raw events so the dashboard can inspect properties.
// No rate limiter here — this is a read-only internal endpoint, not an
// ingestion path, so flooding it doesn't pollute the database.
const queryRecentEvents = db.prepare(`
  SELECT id, event_name, session_id, page_url, properties, created_at
  FROM events
  ORDER BY id DESC
  LIMIT 100
`);

router.get('/', (req, res) => {
  try {
    const rows = queryRecentEvents.all();
    // Parse the properties JSON string back into an object so the client
    // doesn't have to deal with double-serialised data.
    const events = rows.map((r) => ({
      ...r,
      properties: r.properties ? JSON.parse(r.properties) : null,
    }));
    res.json({ events });
  } catch (err) {
    console.error('Events fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', eventLimiter, validate, (req, res) => {
  const { event_name, session_id, page_url, properties } = req.validatedData;

  // Anonymise the IP address before any storage.
  // We hash with SHA-256 so we can still detect duplicate IPs for analytics
  // (e.g. unique visitor count) without ever storing a personally identifiable address.
  // This aligns with GDPR's data minimisation principle.
  const rawIp = req.ip || '';
  const ip_hash = crypto.createHash('sha256').update(rawIp).digest('hex');

  // Serialise the properties object to a JSON string.
  // Storing it as TEXT means SQLite treats it as an opaque blob — no risk of
  // injection through JSON keys or values in the DB layer.
  const propertiesJson = properties ? JSON.stringify(properties) : null;

  try {
    const result = insertEvent.run({
      event_name,
      session_id,
      page_url: page_url || null,
      properties: propertiesJson,
      ip_hash,
    });

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    // Log the real error server-side but never expose DB internals to the client.
    console.error('DB insert error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
