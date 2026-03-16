/**
 * tracker.js — Lightweight analytics SDK
 *
 * Design decisions:
 * - Zero dependencies: no external libraries loaded, so this script never blocks
 *   page render and introduces no supply-chain risk.
 * - sessionStorage (not localStorage): session ID lives only for the tab's lifetime.
 *   Using localStorage would persist the ID across browser restarts and make
 *   "session" meaningless from an analytics standpoint.
 * - sendBeacon preferred over fetch for session_end: the Beacon API was specifically
 *   designed for fire-and-forget payloads sent while the page is unloading.
 *   fetch() calls are cancelled by the browser when the page closes; Beacon is not.
 */

const BACKEND_URL = 'http://localhost:3001/api/events';

// --- Session ID ---
// Generate a UUID v4 once per tab session and reuse it for all events.
// This ties all events from a single tab visit together in the database.
function generateUUID() {
  // crypto.randomUUID() is available in all modern browsers and is
  // cryptographically random — far better than Math.random()-based approaches.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers: manual UUID v4 construction.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId() {
  let id = sessionStorage.getItem('analytics_session_id');
  if (!id) {
    id = generateUUID();
    sessionStorage.setItem('analytics_session_id', id);
  }
  return id;
}

const SESSION_ID = getSessionId();
const SESSION_START = Date.now();

// --- Send Event ---
function sendEvent(eventName, properties = {}) {
  const payload = {
    event_name: eventName,
    session_id: SESSION_ID,
    page_url: window.location.href,
    properties,
  };

  // Prefer sendBeacon for session_end events because the browser guarantees
  // delivery even as the page is unloading — fetch() would be cancelled.
  // For all other events we use fetch so we can handle errors gracefully.
  if (eventName === 'session_end' && navigator.sendBeacon) {
    // sendBeacon requires a Blob with the correct content-type header,
    // since it cannot set headers the same way fetch can.
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(BACKEND_URL, blob);
    return;
  }

  // Fetch with keepalive: also survives page unload, used as sendBeacon fallback.
  fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => {
    // Network errors are logged to the console but never shown to the user.
    // Analytics should be invisible — a failed event send must never break the page.
    console.warn('[tracker] Failed to send event:', err.message);
  });
}

// --- Event: page_view ---
// Fire immediately when the script runs (after DOM is ready).
// Captures viewport_width so we can segment mobile vs desktop later.
sendEvent('page_view', {
  page_url: window.location.href,
  referrer: document.referrer || '',
  viewport_width: window.innerWidth,
});

// --- Event: button_click ---
// Single delegated listener on the document instead of one listener per button.
// Event delegation is more performant (one listener vs. N) and automatically
// picks up buttons added dynamically after the script loads.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-track]');
  if (!btn) return;

  sendEvent('button_click', {
    button_id: btn.id || btn.getAttribute('data-track'),
    button_text: btn.textContent.trim().slice(0, 100), // cap length to avoid huge payloads
  });
});

// --- Event: scroll_depth ---
// Throttle: we only check thresholds after the user pauses scrolling.
// Without throttling, the scroll handler fires hundreds of times per second
// and would hammer the backend with duplicate events.
const SCROLL_THRESHOLDS = [25, 50, 75, 100];
const firedThresholds = new Set();
let scrollTimer = null;

function checkScrollDepth() {
  const scrolled = window.scrollY + window.innerHeight;
  const total = document.documentElement.scrollHeight;
  const percent = Math.round((scrolled / total) * 100);

  for (const threshold of SCROLL_THRESHOLDS) {
    if (percent >= threshold && !firedThresholds.has(threshold)) {
      firedThresholds.add(threshold);
      sendEvent('scroll_depth', { depth_percent: threshold });
    }
  }
}

window.addEventListener('scroll', () => {
  // Debounce: wait 200 ms after the last scroll event before evaluating depth.
  // This prevents firing on every pixel of movement while still being responsive.
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(checkScrollDepth, 200);
}, { passive: true }); // passive: true tells the browser we won't call preventDefault,
                       // allowing it to optimise scroll performance.

// --- Event: session_end ---
// Two triggers cover different ways a user can leave the page:
// 1. visibilitychange to 'hidden': fired when the user switches tabs or minimises the window.
//    This is more reliable than beforeunload on mobile browsers.
// 2. beforeunload: fired when the tab/window is actually closed or navigated away.
//    We keep both because neither covers 100% of cases on its own.

let sessionEndSent = false; // guard: send the event exactly once per session

function handleSessionEnd() {
  if (sessionEndSent) return;
  sessionEndSent = true;
  sendEvent('session_end', {
    session_duration_ms: Date.now() - SESSION_START,
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    handleSessionEnd();
  }
});

window.addEventListener('beforeunload', handleSessionEnd);
