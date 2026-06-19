"use client";

import { ConversationThread } from "@/components/portal/ConversationThread";
import { getMyTicketMessages, sendClientReply } from "@/app/actions/messages";

// Client-side conversation. "in" = sent by the client (me).
export function ClientTaskThread({
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
      load={getMyTicketMessages}
      send={sendClientReply}
      mineDirection="in"
      mineLabel="אני"
      otherLabel="הסטודיו"
      placeholder="כתוב/י הודעה… (תישלח לצוות ותתועד כאן)"
      closeOnSend
    />
  );
}
