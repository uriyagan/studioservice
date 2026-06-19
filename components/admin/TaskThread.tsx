"use client";

import { ConversationThread } from "@/components/portal/ConversationThread";
import { getTicketMessages, sendTicketReply } from "@/app/actions/messages";

// Admin-side conversation. "out" = sent by us (the studio) to the client.
export function TaskThread({
  ticketId,
  title,
  onClose,
}: {
  ticketId: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <ConversationThread
      ticketId={ticketId}
      title={title}
      onClose={onClose}
      load={getTicketMessages}
      send={sendTicketReply}
      mineDirection="out"
      mineLabel="אנחנו"
      otherLabel="לקוח"
      placeholder="כתוב/י תשובה ללקוח… (תישלח במייל ותתועד כאן)"
    />
  );
}
