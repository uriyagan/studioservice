"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { createInvoicePayment } from "@/app/actions/stripe";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "@/components/icons";
import { HourPackageRow } from "@/lib/types";

const cls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface BillingInfo {
  company: string;
  company_number: string;
  email: string;
  phone: string;
  address: string;
}

export function PurchaseForm({
  pkg,
  projectId,
  billing,
  onCancel,
}: {
  pkg: HourPackageRow;
  projectId: string;
  billing: BillingInfo;
  onCancel: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [b, setB] = useState<BillingInfo>(billing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = (
    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
      {pkg.name} · {pkg.hours} שעות · <span className="font-bold">€{Number(pkg.price_ils).toLocaleString("he-IL")}</span>
    </div>
  );

  // Step 1 — billing details → create the invoice + PaymentIntent.
  const proceed = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createInvoicePayment({
      packageId: pkg.id,
      projectId,
      invoiceName: b.company,
      companyNumber: b.company_number,
      email: b.email,
      phone: b.phone,
      address: b.address,
    });
    setBusy(false);
    if (!r.ok || !r.clientSecret) {
      setError(r.error ?? "שגיאה ביצירת החשבונית");
      return;
    }
    setClientSecret(r.clientSecret);
  };

  if (!clientSecret) {
    return (
      <form onSubmit={proceed} className="space-y-4">
        {summary}
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={b.company} onChange={(e) => setB({ ...b, company: e.target.value })} placeholder="השם שיופיע על החשבונית" className={cls} />
          <input value={b.company_number} onChange={(e) => setB({ ...b, company_number: e.target.value })} placeholder="מספר חברה" className={cls} />
          <input value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} placeholder="אימייל" className={cls} dir="ltr" type="email" />
          <input value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} placeholder="טלפון" className={cls} dir="ltr" />
          <input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} placeholder="כתובת" className={`${cls} sm:col-span-2`} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? "מכין תשלום…" : "המשך לתשלום"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Elements stripe={getStripe()} options={{ clientSecret, locale: "he" }}>
      <PayStep pkg={pkg} billing={b} summary={summary} onBack={() => setClientSecret(null)} />
    </Elements>
  );
}

function PayStep({
  pkg,
  billing,
  summary,
  onBack,
}: {
  pkg: HourPackageRow;
  billing: BillingInfo;
  summary: React.ReactNode;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: payErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/portal?purchase=success`,
          payment_method_data: {
            billing_details: {
              name: billing.company || undefined,
              email: billing.email || undefined,
              phone: billing.phone || undefined,
            },
          },
        },
      });
      if (payErr) {
        setError(payErr.message ?? "התשלום נכשל");
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        setDone(true);
        router.refresh();
      } else if (paymentIntent) {
        setPending(true);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message || "שגיאה בתשלום");
    } finally {
      setBusy(false);
    }
  };

  if (done || pending) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-emerald-600">
          {done ? "התשלום בוצע בהצלחה ✓" : "התשלום בעיבוד ⏳"}
        </p>
        <p className="text-sm text-slate-500">
          {done
            ? "השעות יתווספו לחבילה תוך מספר שניות, והחשבונית תופיע בהיסטוריית הרכישות."
            : "התשלום אושר וממתין לאישור סופי. השעות יתווספו אוטומטית ברגע שהתשלום יסתיים."}
        </p>
        <Button onClick={() => router.refresh()}>רענון</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {summary}
      <div className="rounded-lg border border-slate-200 p-3">
        <PaymentElement options={{ fields: { billingDetails: { name: "never", email: "never", phone: "never" } } }} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !stripe} className="flex-1">
          {busy ? "מעבד…" : `תשלום €${Number(pkg.price_ils).toLocaleString("he-IL")}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} className="flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> חזרה לפרטים
        </Button>
      </div>
    </form>
  );
}
