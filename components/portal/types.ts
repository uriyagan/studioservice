import { TicketStatus } from "@/lib/types";

export interface PortalTask {
  id: string;
  title: string;
  status: TicketStatus;
  completed_at: string | null;
  seconds: number;
  description: string | null;
  link: string | null;
  projectId: string;
  projectName: string;
}
