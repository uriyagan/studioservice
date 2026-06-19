"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

// Create a Stripe INVOICE for the purchase and return the client secret
// of its PaymentIntent, so the card can be paid in-page (deferred flow).
// The client gets a real invoice (number + PDF), not just a receipt.
export async function createInvoicePayment(input: {
  packageId: string;
  projectId: string;
  invoiceName: string;
  companyNumber: string;
  email: string;
  phone: string;
  address: string;
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

    // A projectId may be empty for a first-time client with no project yet —
    // the webhook creates a project for them on success. When provided, verify
    // the caller owns it (defense-in-depth beyond RLS).
    if (input.projectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("id", input.projectId)
        .eq("client_id", user.id)
        .single();
      if (!project) return { ok: false, error: "פרויקט לא נמצא" };
    }

    // Reuse/create the Stripe customer for this client.
    const admin = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerData = {
      name: input.invoiceName || undefined,
      email: input.email || user.email || undefined,
      phone: input.phone || undefined,
      address: input.address ? { line1: input.address } : undefined,
    };

    let customerId: string | undefined = profile?.stripe_customer_id ?? undefined;
    if (customerId) {
      await stripe.customers.update(customerId, customerData);
    } else {
      const customer = await stripe.customers.create({
        ...customerData,
        metadata: { client_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // Persist the billing details back to the profile (remembered).
    await admin
      .from("profiles")
      .update({
        company: input.invoiceName || null,
        company_number: input.companyNumber || null,
        phone: input.phone || null,
        address: input.address || null,
      })
      .eq("id", user.id);

    const amountAgorot = Math.round(Number(pkg.price_ils) * 100);

    // Reuse an existing open invoice for this customer + package instead of
    // creating a duplicate when the user goes back and resubmits.
    try {
      const open = await stripe.invoices.list({ customer: customerId, status: "open", limit: 20 });
      const match = open.data.find(
        (inv) => inv.metadata?.project_id === input.projectId && inv.metadata?.package_name === pkg.name
      );
      const matchPiId = match
        ? typeof match.payment_intent === "string"
          ? match.payment_intent
          : match.payment_intent?.id
        : undefined;
      if (matchPiId) {
        const existingPi = await stripe.paymentIntents.retrieve(matchPiId);
        const reusable =
          existingPi.client_secret &&
          ["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(
            existingPi.status
          );
        if (reusable) {
          return { ok: true, clientSecret: existingPi.client_secret ?? undefined, amount: Number(pkg.price_ils) };
        }
      }
    } catch {
      /* fall through to creating a fresh invoice */
    }

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: amountAgorot,
      currency: "eur",
      description: pkg.name,
    });

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false,
      currency: "eur",
      pending_invoice_items_behavior: "include",
      custom_fields: input.companyNumber
        ? [{ name: "מספר חברה", value: input.companyNumber.slice(0, 30) }]
        : undefined,
      metadata: {
        project_id: input.projectId,
        hours: String(pkg.hours),
        package_name: pkg.name,
        client_id: user.id,
      },
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    const piId =
      typeof finalized.payment_intent === "string"
        ? finalized.payment_intent
        : finalized.payment_intent?.id;
    if (!piId) return { ok: false, error: "יצירת תשלום נכשלה" };

    // Mirror metadata onto the PaymentIntent so the existing
    // payment_intent.succeeded webhook can process it.
    const pi = await stripe.paymentIntents.update(piId, {
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
