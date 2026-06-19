"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { createInvoicePayment } from "@/app/actions/stripe";
import { Button } from "@/components/ui/Button";
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
  // Deferred flow: render the Payment Element with amount only; the
  // invoice + PaymentIntent are created on submit (after billing entry).
  return (
    <Elements
      stripe={getStripe()}
      options={{
        mode: "payment",
        amount: Math.round(Number(pkg.price_ils) * 100),
        currency: "eur",
        locale: "he",
      }}
    >
      <Inner pkg={pkg} projectId={projectId} billing={billing} onCancel={onCancel} />
    </Elements>
  );
}

function Inner({
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
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [b, setB] = useState<BillingInfo>(billing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    try {
      const { error: submitErr } = await elements.submit();
      if (submitErr) {
        setError(submitErr.message ?? "בדוק את פרטי הכרטיס");
        return;
      }

      const r = await createInvoicePayment({
        packageId: pkg.id,
        projectId,
        invoiceName: b.company,
        companyNumber: b.company_number,
        email: b.email,
        phone: b.phone,
        address: b.address,
      });
      if (!r.ok || !r.clientSecret) {
        setError(r.error ?? "שגיאה ביצירת החשבונית");
        return;
      }

      const { error: payErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: r.clientSecret,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/portal?purchase=success`,
          payment_method_data: {
            billing_details: {
              name: b.company || undefined,
              email: b.email || undefined,
              phone: b.phone || undefined,
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
        setError("התשלום בעיבוד — נעדכן ברגע שיאושר.");
      }
    } catch (err) {
      setError((err as Error).message || "שגיאה בתשלום");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-emerald-600">התשלום בוצע בהצלחה ✓</p>
        <p className="text-sm text-slate-500">
          השעות יתווספו לחבילה תוך מספר שניות, והחשבונית תופיע בהיסטוריית הרכישות.
        </p>
        <Button onClick={() => router.refresh()}>רענון</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {pkg.name} · {pkg.hours} שעות · <span className="font-bold">€{Number(pkg.price_ils).toLocaleString("he-IL")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input value={b.company} onChange={(e) => setB({ ...b, company: e.target.value })} placeholder="השם שיופיע על החשבונית" className={cls} />
        <input value={b.company_number} onChange={(e) => setB({ ...b, company_number: e.target.value })} placeholder="מספר חברה" className={cls} />
        <input value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} placeholder="אימייל" className={cls} dir="ltr" type="email" />
        <input value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} placeholder="טלפון" className={cls} dir="ltr" />
        <input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} placeholder="כתובת" className={`${cls} sm:col-span-2`} />
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <PaymentElement options={{ fields: { billingDetails: { name: "never", email: "never", phone: "never" } } }} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !stripe} className="flex-1">
          {busy ? "מעבד…" : `תשלום €${Number(pkg.price_ils).toLocaleString("he-IL")}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
