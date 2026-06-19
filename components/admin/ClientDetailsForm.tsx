"use client";

import { useState, useTransition } from "react";
import { updateClientDetails, updateMyProfile } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";
import { Profile } from "@/lib/types";

const cls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export function ClientDetailsForm({
  profile,
  mode,
}: {
  profile: Pick<Profile, "id" | "first_name" | "last_name" | "phone" | "company" | "company_number" | "address" | "notes">;
  mode: "admin" | "self";
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isSaving, start] = useTransition();
  const action = mode === "admin" ? updateClientDetails : updateMyProfile;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await action({ ok: false }, fd);
      if (r.ok) {
        setMsg("נשמר ✓");
        setTimeout(() => setMsg(null), 2500);
      } else setErr(r.error || "שגיאה");
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {mode === "admin" && <input type="hidden" name="id" value={profile.id} />}
      <div className="flex gap-2">
        <input name="first_name" defaultValue={profile.first_name ?? ""} placeholder="שם פרטי" className={cls} />
        <input name="last_name" defaultValue={profile.last_name ?? ""} placeholder="שם משפחה" className={cls} />
      </div>
      <input name="phone" defaultValue={profile.phone ?? ""} placeholder="טלפון" className={cls} dir="ltr" />
      <div className="flex gap-2">
        <input name="company" defaultValue={profile.company ?? ""} placeholder="חברה / עסק" className={cls} />
        <input name="company_number" defaultValue={profile.company_number ?? ""} placeholder="מספר חברה" className={cls} />
      </div>
      <input name="address" defaultValue={profile.address ?? ""} placeholder="כתובת" className={cls} />
      {mode === "admin" && (
        <textarea name="notes" defaultValue={profile.notes ?? ""} rows={2} placeholder="הערות פנימיות" className={cls} />
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "שומר..." : "שמירה"}
        </Button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
