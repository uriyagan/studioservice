import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileProject } from "@/lib/packages";

// Safety net: reconcile every project that currently has a RUNNING timer,
// so a package that runs out while a tab is closed still gets capped and
// its timer stopped. Wire this to a Cloudflare Cron Trigger (e.g. every
// few minutes). Protected by CRON_SECRET.
//
//   GET /api/cron/reconcile   with  Authorization: Bearer <CRON_SECRET>
//                             or    ?key=<CRON_SECRET>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = { from: (t: string) => any };

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "") || key;
  if (!secret || provided !== secret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createAdminClient() as unknown as DB;

  // Tickets with an open (running) segment.
  const { data: openLogs } = await db
    .from("time_logs")
    .select("ticket_id")
    .is("end_time", null);
  const ticketIds = Array.from(
    new Set(((openLogs ?? []) as { ticket_id: string }[]).map((l) => l.ticket_id))
  );
  if (!ticketIds.length) return NextResponse.json({ reconciled: 0 });

  const { data: tix } = await db.from("tickets").select("project_id").in("id", ticketIds);
  const projectIds = Array.from(
    new Set(
      ((tix ?? []) as { project_id: string | null }[])
        .map((t) => t.project_id)
        .filter(Boolean) as string[]
    )
  );

  let depleted = 0;
  for (const pid of projectIds) {
    try {
      const r = await reconcileProject(pid);
      if (r.depleted) depleted++;
    } catch (e) {
      console.error("cron reconcile failed for", pid, (e as Error).message);
    }
  }

  return NextResponse.json({ reconciled: projectIds.length, depleted });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
