import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Issues a signed URL for a direct browser → Storage upload, so
// large/many files never pass through the server. The client PUTs
// the file bytes to the returned URL, then records metadata via
// the attachFile action.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { ticketId, fileName } = await req.json();
  if (!fileName) {
    return new NextResponse("Missing fileName", { status: 400 });
  }

  // Namespace by user; files may be uploaded before a ticket/message exists
  // (the attachment row links them afterwards), so ticketId is optional.
  const safeName = String(fileName).replace(/[^\w.\-]/g, "_");
  const path = `${user.id}/${ticketId || "pending"}/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUploadUrl(path);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
