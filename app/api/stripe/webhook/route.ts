import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeWebhookCrypto } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "@/lib/email/dispatch";

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

  if (event.type === "checkout.session.completed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = event.data.object as any;
    const md = session.metadata ?? {};
    const projectId: string | undefined = md.project_id;
    const clientId: string | undefined = md.client_id;
    const hours = Number(md.hours ?? 0);
    const packageName: string | undefined = md.package_name;

    const admin = createAdminClient();
    const db = admin as unknown as { from: (t: string) => any };

    // Fetch the receipt URL from the underlying charge (best-effort).
    let receiptUrl: string | null = null;
    try {
      if (session.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), {
          expand: ["latest_charge"],
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptUrl = (pi.latest_charge as any)?.receipt_url ?? null;
      }
    } catch {
      /* non-fatal */
    }

    if (projectId && hours > 0) {
      const { data: project } = await db
        .from("projects")
        .select("total_hours_allocated, name")
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

      // Record the purchase for the client's history.
      await db.from("purchases").insert({
        project_id: projectId,
        client_id: clientId ?? null,
        package_name: packageName ?? null,
        hours,
        amount_ils: session.amount_total ? Number(session.amount_total) / 100 : null,
        currency: session.currency ?? "eur",
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent ? String(session.payment_intent) : null,
        receipt_url: receiptUrl,
        status: "paid",
      });

      // Notify the client that hours were added.
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
            hours_added: hours,
            hours_remaining: stats?.hours_remaining ?? "",
            total_hours: stats?.total_hours_allocated ?? "",
            portal_url: "https://service.uriyaganor.com/portal",
            site_url: "https://service.uriyaganor.com",
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
