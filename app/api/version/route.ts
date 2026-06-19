import { NextResponse } from "next/server";

// Returns this deploy's build id (baked in at build time). The client compares
// it to the id it loaded with to detect a new release. Never cached.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { v: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
