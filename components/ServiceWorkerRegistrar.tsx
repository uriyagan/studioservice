"use client";

import { useEffect } from "react";

// Registers /sw.js, which exists only to make the app installable — it caches
// nothing. See public/sw.js for why that's deliberate.
//
// Mounted in the root layout so the app is installable from the login screen
// too: a client's first visit is the moment they'd want to install it, and
// that's before they have a session.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Nothing depends on registration succeeding — it only affects whether the
    // browser offers to install. Swallow failures (private mode, unsupported
    // browser, blocked by policy) rather than surfacing an error the user can
    // do nothing about.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
