import Stripe from "stripe";

// Server-only Stripe client. On Cloudflare Workers the Stripe SDK must
// use the Fetch HTTP client (Node's http module isn't available).
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Workers-compatible crypto provider for async webhook verification.
export const stripeWebhookCrypto = Stripe.createSubtleCryptoProvider();

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
