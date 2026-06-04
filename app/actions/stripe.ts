"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, siteUrl } from "@/lib/stripe";
import { findPackage } from "@/lib/packages";

// Start a Stripe Checkout for an hour top-up. The project id and
// the number of hours travel in metadata so the webhook can
// increment total_hours_allocated after payment succeeds.
export async function buyHourPackage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const projectId = String(formData.get("project_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  const pkg = findPackage(packageId);
  if (!projectId || !pkg) throw new Error("חבילה לא תקינה");

  // Confirm the project belongs to the logged-in client (RLS-backed).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("פרויקט לא נמצא");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "ils",
          unit_amount: pkg.priceIls * 100, // agorot
          product_data: { name: pkg.label },
        },
      },
    ],
    metadata: {
      project_id: projectId,
      hours: String(pkg.hours),
    },
    success_url: `${siteUrl()}/portal?purchase=success`,
    cancel_url: `${siteUrl()}/portal?purchase=cancelled`,
  });

  if (!session.url) throw new Error("יצירת תשלום נכשלה");
  redirect(session.url);
}
