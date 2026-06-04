// Hour packages a client can buy. Prices in ILS (agorot handled
// at checkout). Adjust freely — this is the single source of truth.
export interface HourPackage {
  id: string;
  hours: number;
  priceIls: number;
  label: string;
}

export const HOUR_PACKAGES: HourPackage[] = [
  { id: "pkg-5", hours: 5, priceIls: 1500, label: "חבילת 5 שעות" },
  { id: "pkg-10", hours: 10, priceIls: 2800, label: "חבילת 10 שעות" },
  { id: "pkg-20", hours: 20, priceIls: 5200, label: "חבילת 20 שעות" },
];

export function findPackage(id: string): HourPackage | undefined {
  return HOUR_PACKAGES.find((p) => p.id === id);
}
