const express = require('express');
const db = require('../db');

const router = express.Router();

// All queries use prepared statements even though they contain no user input.
// This is a habit that prevents accidental injection if parameters are added later,
// and also benefits from SQLite's query-plan caching.
const queryTotalEvents = db.prepare(`SELECT COUNT(*) AS total FROM events`);

const queryUniqueSessions = db.prepare(`
  SELECT COUNT(DISTINCT session_id) AS unique_sessions FROM events
`);

const queryEventsByName = db.prepare(`
  SELECT event_name, COUNT(*) AS count
  FROM events
  GROUP BY event_name
  ORDER BY count DESC
`);

// Aggregate by hour for the last 24 hours.
// strftime rounds each timestamp down to the hour so bars in the chart
// represent complete hours rather than individual minutes.
const queryEventsOverTime = db.prepare(`
  SELECT
    strftime('%Y-%m-%d %H:00', created_at) AS hour,
    COUNT(*) AS count
  FROM events
  WHERE created_at >= datetime('now', '-24 hours')
  GROUP BY hour
  ORDER BY hour ASC
`);

const queryTopPages = db.prepare(`
  SELECT page_url, COUNT(*) AS count
  FROM events
  WHERE page_url IS NOT NULL
  GROUP BY page_url
  ORDER BY count DESC
  LIMIT 10
`);

// json_extract pulls values directly from the stored JSON string inside SQLite.
// Grouping by both button_id and button_text keeps rows distinct when the same
// button_id is used with different label text (e.g. A/B copy test), while still
// collapsing identical (id, text) pairs into a single count.
const queryButtonClicks = db.prepare(`
  SELECT
    json_extract(properties, '$.button_id')   AS button_id,
    json_extract(properties, '$.button_text') AS button_text,
    COUNT(*) AS count
  FROM events
  WHERE event_name = 'button_click'
    AND properties IS NOT NULL
  GROUP BY button_id, button_text
  ORDER BY count DESC
`);

router.get('/', (req, res) => {
  try {
    const { total } = queryTotalEvents.get();
    const { unique_sessions } = queryUniqueSessions.get();
    const events_by_name = queryEventsByName.all();
    const events_over_time = queryEventsOverTime.all();
    const top_pages = queryTopPages.all();
    const button_clicks = queryButtonClicks.all();

    res.json({
      total_events: total,
      unique_sessions,
      events_by_name,
      events_over_time,
      top_pages,
      button_clicks,
    });
  } catch (err) {
    console.error('Dashboard query error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
