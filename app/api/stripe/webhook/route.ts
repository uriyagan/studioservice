import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook. On a completed checkout, add the purchased hours
// to the project's total_hours_allocated. Uses the service-role
// client because there is no user session on a webhook request.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing signature", { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new NextResponse(`Webhook error: ${(err as Error).message}`, {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: { project_id?: string; hours?: string };
    };
    const projectId = session.metadata?.project_id;
    const hours = Number(session.metadata?.hours ?? 0);

    if (projectId && hours > 0) {
      const admin = createAdminClient();
      const { data: project } = await admin
        .from("projects")
        .select("total_hours_allocated")
        .eq("id", projectId)
        .single();

      if (project) {
        await admin
          .from("projects")
          .update({
            total_hours_allocated:
              Number(project.total_hours_allocated) + hours,
          })
          .eq("id", projectId);
      }
    }
  }

  return NextResponse.json({ received: true });
}
