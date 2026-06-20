import { createClient } from "@/lib/supabase/server";
import { ProjectStats } from "@/lib/types";

// Projects the logged-in client owns (client_id) OR is a member of.
// The members table may not exist yet → falls back to owned-only.
export async function getMyProjects() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, projects: [] as ProjectStats[] };

  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("profile_id", user.id);
  const memberIds = ((memberRows ?? []) as { project_id: string }[]).map((m) => m.project_id);

  let q = supabase.from("project_stats").select("*").order("name");
  q = memberIds.length
    ? q.or(`client_id.eq.${user.id},id.in.(${memberIds.join(",")})`)
    : q.eq("client_id", user.id);
  const { data } = await q;
  return { supabase, user, projects: (data ?? []) as ProjectStats[] };
}
