import { TicketStatus } from "@/lib/types";
import { ClientTaskStatus } from "@/components/ui/Badge";

export interface PortalTask {
  id: string;
  title: string;
  status: TicketStatus;
  // Client-facing presentation of `status` — see ClientStatusBadge.
  clientStatus: ClientTaskStatus;
  completed_at: string | null;
  seconds: number;
  description: string | null;
  link: string | null;
  projectId: string;
  projectName: string;
  // Conversation stats for the tasks list: how many messages the thread has,
  // and whether the latest studio message is newer than my last read.
  msgCount: number;
  unread: boolean;
}
