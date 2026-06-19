"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

// Create a PaymentIntent for an hour-package purchase. Card details are
// collected in-page via the Stripe Payment Element; this returns the
// client secret to confirm against. project/hours/client travel in
// metadata so the webhook can add the hours after payment.
export async function createPaymentIntent(input: {
  packageId: string;
  projectId: string;
}): Promise<{ ok: boolean; clientSecret?: string; amount?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "לא מחובר" };

    const db = supabase as unknown as { from: (t: string) => any };
    const { data: pkg } = await db
      .from("hour_packages")
      .select("*")
      .eq("id", input.packageId)
      .eq("active", true)
      .maybeSingle();
    if (!pkg) return { ok: false, error: "חבילה לא נמצאה" };

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .single();
    if (!project) return { ok: false, error: "פרויקט לא נמצא" };

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(Number(pkg.price_ils) * 100),
      currency: "eur",
      receipt_email: user.email ?? undefined,
      automatic_payment_methods: { enabled: true },
      metadata: {
        project_id: input.projectId,
        hours: String(pkg.hours),
        package_name: pkg.name,
        client_id: user.id,
      },
    });

    return { ok: true, clientSecret: pi.client_secret ?? undefined, amount: Number(pkg.price_ils) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Save the billing details the client entered back onto their profile
// (so they're pre-filled next time). Scoped to the caller's own row.
export async function saveBillingDetails(input: {
  company: string;
  company_number: string;
  phone: string;
  address: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "לא מחובר" };

    const admin = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await admin
      .from("profiles")
      .update({
        company: input.company || null,
        company_number: input.company_number || null,
        phone: input.phone || null,
        address: input.address || null,
      })
      .eq("id", user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
