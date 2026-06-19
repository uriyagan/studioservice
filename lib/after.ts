// Run a best-effort task without blocking the response. On Cloudflare
// Workers this uses waitUntil so the promise keeps running after the
// response is sent; off-Workers (dev/build) it just awaits inline.
// Errors are swallowed — callers use this for fire-and-forget side effects
// (notification emails) that must never fail the user's action.
export async function runAfter(task: () => Promise<unknown>): Promise<void> {
  const guarded = () =>
    Promise.resolve()
      .then(task)
      .catch((e) => console.error("runAfter task failed:", (e as Error)?.message));
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(guarded());
  } catch {
    await guarded();
  }
}
