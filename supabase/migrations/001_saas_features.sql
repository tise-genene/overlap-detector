-- Add SaaS columns to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Create Chat Rooms (linked to a specific partner hash)
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Chat
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see rooms for partners they have declared
CREATE POLICY "Users can view rooms for their declared partners"
ON chat_rooms FOR SELECT
USING (
    partner_hash IN (
        SELECT p.hash 
        FROM declarations d
        JOIN partners p ON p.id = d.partner_id
        WHERE d.user_id = auth.uid()
    )
);

-- Policy: Users can insert messages if they have declared the partner for that room
CREATE POLICY "Users can send messages in their rooms"
ON chat_messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM chat_rooms cr
        JOIN partners p ON p.hash = cr.partner_hash
        JOIN declarations d ON d.partner_id = p.id
        WHERE cr.id = chat_messages.room_id
        AND d.user_id = auth.uid()
    )
);

-- Policy: Users can view messages in their rooms
CREATE POLICY "Users can view messages in their rooms"
ON chat_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM chat_rooms cr
        JOIN partners p ON p.hash = cr.partner_hash
        JOIN declarations d ON d.partner_id = p.id
        WHERE cr.id = chat_messages.room_id
        AND d.user_id = auth.uid()
    )
);

-- Function for Global Stats (Cheater Heatmap)
CREATE OR REPLACE FUNCTION get_global_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_overlaps INT;
    total_declarations INT;
BEGIN
    -- Count declarations that have duplicates (overlaps)
    SELECT COUNT(*) INTO total_overlaps
    FROM (
        SELECT partner_id 
        FROM declarations 
        GROUP BY partner_id 
        HAVING COUNT(*) > 1
    ) as overlap_counts;

    SELECT COUNT(*) INTO total_declarations FROM declarations;

    RETURN json_build_object(
        'total_overlaps', total_overlaps,
        'total_declarations', total_declarations
    );
END;
$$;
