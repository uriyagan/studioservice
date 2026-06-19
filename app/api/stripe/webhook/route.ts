import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeWebhookCrypto } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "@/lib/email/dispatch";
import { formatHoursClock } from "@/lib/format";

const SITE = "https://service.uriyaganor.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = { from: (t: string) => any };

async function processSuccess(opts: {
  projectId?: string;
  clientId?: string;
  hours: number;
  packageName?: string;
  amount: number | null;
  currency: string;
  paymentIntentId: string | null;
  sessionId: string | null;
  receiptUrl: string | null;
}) {
  const { projectId, clientId, hours } = opts;
  if (!projectId || !(hours > 0)) return;

  const db = createAdminClient() as unknown as DB;

  // Idempotency: skip if this payment was already recorded.
  if (opts.paymentIntentId) {
    const { data: existing } = await db
      .from("purchases")
      .select("id")
      .eq("stripe_payment_intent", opts.paymentIntentId)
      .maybeSingle();
    if (existing) return;
  }

  const { data: project } = await db
    .from("projects")
    .select("total_hours_allocated")
    .eq("id", projectId)
    .single();
  if (project) {
    await db
      .from("projects")
      .update({
        total_hours_allocated: Number(project.total_hours_allocated) + hours,
        notified_half: false,
        notified_depleted: false,
      })
      .eq("id", projectId);
  }

  await db.from("purchases").insert({
    project_id: projectId,
    client_id: clientId ?? null,
    package_name: opts.packageName ?? null,
    hours,
    amount_ils: opts.amount,
    currency: opts.currency,
    stripe_session_id: opts.sessionId,
    stripe_payment_intent: opts.paymentIntentId,
    receipt_url: opts.receiptUrl,
    status: "paid",
  });

  if (clientId) {
    const { data: client } = await db
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", clientId)
      .maybeSingle();
    const { data: stats } = await db
      .from("project_stats")
      .select("hours_remaining, total_hours_allocated, name")
      .eq("id", projectId)
      .maybeSingle();
    if (client?.email) {
      await dispatchEmail("hours_added", client.email, {
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        full_name: client.name ?? "",
        client_name: client.name ?? "",
        project_name: stats?.name ?? "",
        hours_added: formatHoursClock(hours),
        hours_remaining: formatHoursClock(stats?.hours_remaining ?? 0),
        total_hours: formatHoursClock(stats?.total_hours_allocated ?? 0),
        portal_url: `${SITE}/portal`,
        site_url: SITE,
      });
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing signature", { status: 400 });

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
      undefined,
      stripeWebhookCrypto
    );
  } catch (err) {
    return new NextResponse(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi = event.data.object as any;
      const md = pi.metadata ?? {};
      let receiptUrl: string | null = null;
      try {
        const full = await stripe.paymentIntents.retrieve(pi.id, {
          expand: ["latest_charge", "invoice"],
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = full.invoice as any;
        // Prefer the invoice PDF; fall back to the charge receipt.
        receiptUrl =
          inv?.invoice_pdf ??
          inv?.hosted_invoice_url ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (full.latest_charge as any)?.receipt_url ??
          null;
      } catch {
        /* non-fatal */
      }
      await processSuccess({
        projectId: md.project_id,
        clientId: md.client_id,
        hours: Number(md.hours ?? 0),
        packageName: md.package_name,
        amount: pi.amount_received ? Number(pi.amount_received) / 100 : null,
        currency: pi.currency ?? "eur",
        paymentIntentId: pi.id,
        sessionId: null,
        receiptUrl,
      });
    } else if (event.type === "checkout.session.completed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = event.data.object as any;
      const md = session.metadata ?? {};
      await processSuccess({
        projectId: md.project_id,
        clientId: md.client_id,
        hours: Number(md.hours ?? 0),
        packageName: md.package_name,
        amount: session.amount_total ? Number(session.amount_total) / 100 : null,
        currency: session.currency ?? "eur",
        paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
        sessionId: session.id,
        receiptUrl: null,
      });
    }
  } catch (e) {
    console.error("webhook processing failed:", (e as Error).message);
  }

  return NextResponse.json({ received: true });
}
