"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function SetPasswordPage() {
  // Plain client (implicit flow) so it reads the recovery tokens from
  // the URL hash that the email link redirects with.
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { detectSessionInUrl: true, flowType: "implicit", persistSession: true } }
      ),
    []
  );

  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setReady(true);
      else setTimeout(async () => {
        const { data: d2 } = await supabase.auth.getSession();
        if (cancelled) return;
        if (d2.session) setReady(true);
        else setInvalid(true);
      }, 1500);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) return setError("הסיסמה חייבת להכיל 6 תווים לפחות");
    if (pw !== pw2) return setError("הסיסמאות אינן תואמות");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  };

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/studio-logo.svg" alt="Uriya Ganor Studio" className="mx-auto h-12 w-auto" />
        </div>
        <Card>
          <h1 className="mb-4 text-lg font-bold text-slate-900">הגדרת סיסמה</h1>
          {done ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-600">הסיסמה נקבעה בהצלחה ✓</p>
              <a href="/login">
                <Button className="w-full">מעבר להתחברות</Button>
              </a>
            </div>
          ) : invalid ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">הקישור אינו תקין או שפג תוקפו.</p>
              <a href="/login" className="text-sm text-primary hover:underline">
                חזרה להתחברות
              </a>
            </div>
          ) : !ready ? (
            <p className="text-sm text-slate-500">מאמת קישור…</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="סיסמה חדשה" className={inputCls} required />
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="אימות סיסמה" className={inputCls} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "שומר…" : "שמירת סיסמה"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
