import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare Workers config for OpenNext. No KV/R2 cache
// overrides needed — all pages are dynamic (force-dynamic) and data
// lives in Supabase.
export default defineCloudflareConfig();
