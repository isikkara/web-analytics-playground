/**
 * dashboard.js — Fetches /api/stats and renders the analytics dashboard.
 *
 * Design decisions:
 * - Zero dependencies: all charts are built with inline SVG and CSS.
 * - 30-second polling interval: simple and reliable; no WebSocket complexity.
 * - DOMContentLoaded guard: ensures all DOM elements exist before we touch them.
 */

const API_URL = 'http://localhost:3001/api/stats';
const POLL_INTERVAL_MS = 30_000;

async function fetchStats() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

// Escape HTML to prevent stored XSS when rendering page URLs or event names
// that came from the database.
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render Functions ──────────────────────────────────────────────────────────

function renderKPIs(data) {
  el('total-events').textContent = data.total_events.toLocaleString();
  el('unique-sessions').textContent = data.unique_sessions.toLocaleString();
}

function renderEventTable(events) {
  if (!events.length) {
    el('events-table').innerHTML = '<tr><td colspan="2" class="empty">No events yet</td></tr>';
    return;
  }
  const max = Math.max(...events.map((e) => e.count));
  el('events-table').innerHTML = events
    .map(
      (e) => `
      <tr>
        <td>${esc(e.event_name)}</td>
        <td>
          <div class="bar-wrap">
            <div class="bar-fill" style="width:${Math.round((e.count / max) * 100)}%"></div>
            <span>${e.count.toLocaleString()}</span>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

function renderTopPages(pages) {
  if (!pages.length) {
    el('pages-list').innerHTML = '<li class="empty">No page data yet</li>';
    return;
  }
  const max = Math.max(...pages.map((p) => p.count));
  el('pages-list').innerHTML = pages
    .map(
      (p) => `
      <li>
        <span class="page-url">${esc(p.page_url)}</span>
        <div class="bar-wrap">
          <div class="bar-fill" style="width:${Math.round((p.count / max) * 100)}%"></div>
          <span>${p.count.toLocaleString()}</span>
        </div>
      </li>`
    )
    .join('');
}

// Inline SVG line chart — no external libraries.
// Renders hourly event counts for the last 24 hours.
function renderHourlyChart(points) {
  const svg = el('hourly-chart');
  const W = svg.clientWidth || 600;
  const H = svg.clientHeight || 180;
  const PAD = { top: 20, right: 20, bottom: 40, left: 40 };

  if (!points.length) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#666" font-size="13">No data for the last 24 hours</text>`;
    return;
  }

  const counts = points.map((p) => p.count);
  const maxCount = Math.max(...counts, 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xScale = (i) => PAD.left + (i / (points.length - 1 || 1)) * innerW;
  const yScale = (v) => PAD.top + innerH - (v / maxCount) * innerH;

  // Polyline path
  const polyPoints = points.map((p, i) => `${xScale(i)},${yScale(p.count)}`).join(' ');

  // Area fill (gradient effect using a closed polygon)
  const areaPoints = [
    `${xScale(0)},${PAD.top + innerH}`,
    ...points.map((p, i) => `${xScale(i)},${yScale(p.count)}`),
    `${xScale(points.length - 1)},${PAD.top + innerH}`,
  ].join(' ');

  // X-axis labels: show every N-th label to avoid crowding
  const labelStep = Math.ceil(points.length / 8);
  const xLabels = points
    .map((p, i) =>
      i % labelStep === 0
        ? `<text x="${xScale(i)}" y="${H - PAD.bottom + 16}" text-anchor="middle" fill="#666" font-size="10">${esc(p.hour.slice(11, 16))}</text>`
        : ''
    )
    .join('');

  // Y-axis gridlines
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const y = PAD.top + innerH * (1 - frac);
      const val = Math.round(maxCount * frac);
      return `
        <line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#2e2e40" stroke-dasharray="3,3"/>
        <text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end" fill="#666" font-size="10">${val}</text>`;
    })
    .join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6c63ff" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#6c63ff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <polygon points="${areaPoints}" fill="url(#areaGrad)"/>
    <polyline points="${polyPoints}" fill="none" stroke="#6c63ff" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((p, i) => `<circle cx="${xScale(i)}" cy="${yScale(p.count)}" r="3" fill="#6c63ff"/>`).join('')}
    ${xLabels}
  `;
}

// ── Main Update Loop ──────────────────────────────────────────────────────────

async function update() {
  el('status').textContent = 'Refreshing…';
  try {
    const data = await fetchStats();
    renderKPIs(data);
    renderEventTable(data.events_by_name);
    renderHourlyChart(data.events_over_time);
    renderTopPages(data.top_pages);
    el('status').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    el('status').style.color = '#22c55e';
  } catch (err) {
    el('status').textContent = `Error: ${err.message}`;
    el('status').style.color = '#ef4444';
    console.warn('[dashboard] fetch failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  update();
  setInterval(update, POLL_INTERVAL_MS);
});
