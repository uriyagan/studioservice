"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, siteUrl } from "@/lib/stripe";

// Start a Stripe Checkout for an hour top-up. Package is read from
// the in-app hour_packages table. project_id, hours, package_name and
// client_id travel in metadata so the webhook can add the hours,
// record the purchase, and email the client after payment succeeds.
export async function buyHourPackage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const projectId = String(formData.get("project_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!projectId || !packageId) throw new Error("חבילה לא תקינה");

  const db = supabase as unknown as { from: (t: string) => any };
  const { data: pkg } = await db
    .from("hour_packages")
    .select("*")
    .eq("id", packageId)
    .eq("active", true)
    .maybeSingle();
  if (!pkg) throw new Error("חבילה לא נמצאה");

  // Confirm the project belongs to the logged-in client (RLS-backed).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("פרויקט לא נמצא");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "ils",
          unit_amount: Math.round(Number(pkg.price_ils) * 100), // agorot
          product_data: { name: pkg.name },
        },
      },
    ],
    metadata: {
      project_id: projectId,
      hours: String(pkg.hours),
      package_name: pkg.name,
      client_id: user.id,
    },
    success_url: `${siteUrl()}/portal?purchase=success`,
    cancel_url: `${siteUrl()}/portal?purchase=cancelled`,
  });

  if (!session.url) throw new Error("יצירת תשלום נכשלה");
  redirect(session.url);
}
