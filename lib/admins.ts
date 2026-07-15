import type { AdminOption } from "@/lib/types";

// Single definition of "an admin a task can be assigned to", so the dashboard's
// picker and a project page's picker can't drift apart on who's on the list.
//
// Takes rows rather than querying: the dashboard already holds every profile
// for other reasons (name/role lookups), so making this fetch its own would add
// a redundant round-trip there.
export function toAdminOptions(
  profiles: { id: string; name: string | null; role: string }[]
): AdminOption[] {
  return profiles
    .filter((p) => p.role === "admin")
    .map((p) => ({ id: p.id, name: p.name || "" }));
}
