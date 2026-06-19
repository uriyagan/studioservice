"use client";

import { useState } from "react";
import { HourPackageRow } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PurchaseForm, BillingInfo } from "@/components/portal/PurchaseForm";
import { ArrowLeft } from "@/components/icons";

// Package picker for a client with no project yet — buying creates a project.
export function BuyPackages({
  packages,
  billing,
}: {
  packages: HourPackageRow[];
  billing: BillingInfo;
}) {
  const [selected, setSelected] = useState<HourPackageRow | null>(null);

  if (selected) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">תשלום עבור {selected.name}</h3>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" /> בחירת חבילה אחרת
          </button>
        </div>
        <PurchaseForm pkg={selected} projectId="" billing={billing} onCancel={() => setSelected(null)} />
      </Card>
    );
  }

  if (packages.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400">אין חבילות זמינות כרגע. אנא פנו אלינו.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {packages.map((pkg) => (
        <Card key={pkg.id} className="flex flex-col">
          <h3 className="font-semibold text-slate-900">{pkg.name}</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            €{Number(pkg.price_ils).toLocaleString("he-IL")}
          </p>
          <p className="mt-1 text-sm text-slate-500">{pkg.hours} שעות עבודה</p>
          <Button type="button" className="mt-4 w-full" onClick={() => setSelected(pkg)}>
            רכישה
          </Button>
        </Card>
      ))}
    </div>
  );
}
