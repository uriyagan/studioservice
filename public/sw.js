/*
 * Minimal service worker. It exists so the app can be installed to a phone's
 * home screen, and it deliberately caches NOTHING.
 *
 * Why it exists at all: Chrome dropped the service-worker requirement for
 * installing from the browser menu (108 mobile / 112 desktop), but the
 * automatic install prompt is still gated on a fetch handler being present.
 * Without this file the app is installable only for someone who goes looking
 * for "Install app" in the menu. iOS ignores service workers for Add to Home
 * Screen either way.
 *
 * Why it caches nothing — three reasons, the first being the important one:
 *
 * 1. It would break deploys. app/error.tsx and app/global-error.tsx recover
 *    from a stale chunk by reloading once, and VersionWatcher offers a refresh
 *    when /api/version reports a new build. All of that assumes a reload
 *    reaches the network. Serve /_next/static/** from a cache and the reloaded
 *    page gets the same stale chunks back: the error boundary's 20s guard
 *    trips, decides "reloaded already and it still errors, so this is a real
 *    bug", and shows the manual-recovery UI — whose refresh button can't fix it
 *    either. A condition that heals itself in one second becomes permanent.
 *    Chunks are already immutable-hashed and edge-cached, so there is nothing
 *    to win here anyway.
 *
 * 2. It would leak client data. Pages here render real client tasks, hours and
 *    billing. A cached response outlives a logout and is readable by whoever
 *    picks the device up next.
 *
 * 3. Offline is not a goal. Every page is force-dynamic and reads live data
 *    from Supabase; served from a cache it would show stale hours and task
 *    states, which is worse than an honest error. Chrome supplies its own
 *    offline page, which is a fair trade for not having to get this right.
 *
 * So the fetch listener below is empty on purpose. Registering a listener is
 * what the install prompt looks for; never calling respondWith() leaves every
 * request on the browser's normal network path, untouched.
 *
 * If this ever does start caching, it must skip /_next/static/**, /api/version,
 * and anything under /admin or /portal — see the three points above.
 */

// Take over as soon as a new copy is deployed, rather than waiting for every
// tab to close. Safe precisely because there are no caches to migrate.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Intentionally empty — see above.
self.addEventListener("fetch", () => {});
