export type Role = "admin" | "client";

// An admin as the assignee pickers need them — the new-task form, the tasks
// table's edit modal and its assignee filter all show the same list.
export type AdminOption = { id: string; name: string };

export type TicketStatus = "pending" | "in_progress" | "paused" | "completed";

export interface Profile {
  id: string;
  email: string;
  name: string | null; // combined display name, kept in sync with first+last
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  company_number: string | null;
  address: string | null;
  notes: string | null;
  role: Role;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string | null;
  name: string;
  is_retainer: boolean;
  is_build?: boolean;
  total_hours_allocated: number;
  created_at: string;
}

export type PackageSource = "client_purchase" | "studio";
export type PackageStatus = "queued" | "active" | "depleted";

export interface ProjectStats {
  id: string;
  client_id: string | null;
  name: string;
  is_retainer: boolean;
  is_build?: boolean;
  // Re-pointed to the ACTIVE package: allocated → active hours,
  // used → consumed on active, remaining → remaining on active.
  total_hours_allocated: number;
  hours_used: number;
  hours_remaining: number;
  // Active-package metadata (null when no active package exists).
  active_package_id?: string | null;
  active_source?: PackageSource | null;
  active_started_at?: string | null;
  queued_count?: number;
  has_active?: boolean;
}

// A discrete package instance on a project (its lifecycle bucket).
export interface ProjectPackage {
  id: string;
  project_id: string;
  client_id: string | null;
  source: PackageSource;
  hours: number;
  status: PackageStatus;
  activated_at: string | null;
  closed_at: string | null;
  activated_by: string | null;
  purchase_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  // Nullable so a timer can be started immediately, then assigned a
  // project + title retroactively.
  project_id: string | null;
  title: string | null;
  description: string | null;
  link: string | null;
  status: TicketStatus;
  created_at: string;
  completed_at: string | null;
}

export interface TimeLog {
  id: string;
  ticket_id: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  file_url: string;
  file_name: string;
  created_at: string;
}

export interface HourPackageRow {
  id: string;
  name: string;
  hours: number;
  price_ils: number;
  active: boolean;
  sort: number;
}

export interface Purchase {
  id: string;
  package_name: string | null;
  hours: number | null;
  amount_ils: number | null;
  currency: string | null;
  receipt_url: string | null;
  status: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: "ממתין",
  in_progress: "בטיפול",
  paused: "מושהה",
  completed: "הושלם",
};
