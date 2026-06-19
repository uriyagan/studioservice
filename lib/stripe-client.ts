"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Singleton browser Stripe.js instance.
let promise: Promise<Stripe | null> | null = null;

export function getStripe() {
  if (!promise) {
    promise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  }
  return promise;
}
