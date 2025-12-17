-- Enable Realtime for Chat Messages
-- This is required for the chat window and unread indicators to update live.
BEGIN;
  -- Check if the publication exists (it usually does in Supabase)
  -- and add the table to it.
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
COMMIT;
