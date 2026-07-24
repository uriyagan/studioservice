// Cron worker: on each scheduled tick, call the app's reconcile endpoint.
// The endpoint finds every project with a running timer, caps any that have
// crossed their active package's limit (exactly at the boundary), marks the
// package depleted, activates the next queued package, and notifies the
// responsible admin. Authenticated with a shared bearer secret.
export default {
  async scheduled(_event, env, _ctx) {
    const url = env.RECONCILE_URL || "https://service.uriyaganor.com/api/cron/reconcile";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      if (!res.ok) {
        console.error("reconcile cron failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("reconcile cron error:", e && e.message);
    }
  },
};
