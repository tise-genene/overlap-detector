-- Ensure RLS is enabled on base tables
ALTER TABLE declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own declarations
-- (This is needed for the Chat RLS policies to work)
CREATE POLICY "Users can view own declarations"
ON declarations FOR SELECT
USING (user_id = auth.uid());

-- Allow users to view partners they have declared
-- (This is needed for the Chat RLS policies to work)
CREATE POLICY "Users can view declared partners"
ON partners FOR SELECT
USING (
    id IN (
        SELECT partner_id 
        FROM declarations 
        WHERE user_id = auth.uid()
    )
);
