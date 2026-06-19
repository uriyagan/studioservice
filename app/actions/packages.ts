"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; error?: string };

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (p?.role !== "admin") throw new Error("אין הרשאה");
  return supabase;
}

export async function savePackage(_prev: Result, formData: FormData): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const id = String(formData.get("id") ?? "") || null;
    const name = String(formData.get("name") ?? "").trim();
    const hours = Number(formData.get("hours") ?? 0);
    const price = Number(formData.get("price_ils") ?? 0);
    const sort = Number(formData.get("sort") ?? 0);
    const active = formData.get("active") === "on";

    if (!name) return { ok: false, error: "שם חבילה נדרש" };
    if (!(hours > 0) || !(price > 0)) return { ok: false, error: "שעות ומחיר חייבים להיות גדולים מאפס" };

    const payload = { name, hours, price_ils: price, sort, active };
    const { error } = id
      ? await db.from("hour_packages").update(payload).eq("id", id)
      : await db.from("hour_packages").insert(payload);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/billing");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deletePackage(_prev: Result, formData: FormData): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "מזהה חבילה חסר" };
    const { error } = await db.from("hour_packages").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/billing");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
