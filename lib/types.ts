export type Role = "admin" | "client";

export type TicketStatus = "pending" | "in_progress" | "paused" | "completed";

export interface Profile {
  id: string;
  email: string;
  name: string | null; // combined display name, kept in sync with first+last
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
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
  total_hours_allocated: number;
  created_at: string;
}

export interface ProjectStats {
  id: string;
  client_id: string | null;
  name: string;
  is_retainer: boolean;
  total_hours_allocated: number;
  hours_used: number;
  hours_remaining: number;
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
