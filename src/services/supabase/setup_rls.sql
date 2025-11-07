-- Enable Row Level Security on toggl_time_entries table
ALTER TABLE toggl_time_entries ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow service role to do everything
-- This allows your backend scripts with service_role_key to perform all operations
CREATE POLICY "Service role has full access"
ON toggl_time_entries
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: Allow authenticated users to read all entries
-- If you want authenticated users in your app to read the data
CREATE POLICY "Authenticated users can read all entries"
ON toggl_time_entries
FOR SELECT
TO authenticated
USING (true);

-- Policy 3: (Optional) Allow public read access
-- Uncomment if you want anonymous users to read the data
-- CREATE POLICY "Public read access"
-- ON toggl_time_entries
-- FOR SELECT
-- TO anon
-- USING (true);

-- Policy 4: (Optional) Restrict to specific user
-- If you want to restrict access based on uid column
-- CREATE POLICY "Users can only see their own entries"
-- ON toggl_time_entries
-- FOR SELECT
-- TO authenticated
-- USING (auth.uid()::text = uid::text);

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'toggl_time_entries';

-- View all policies on the table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'toggl_time_entries';
