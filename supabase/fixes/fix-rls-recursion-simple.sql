-- Simple fix: Remove the problematic policy entirely
-- Users can already view their own roles via "Users can view their own roles" policy
-- This policy was trying to let users see OTHER users' roles for companies they're in,
-- but it's causing recursion. We can remove it for now.

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;

-- Note: Users can still:
-- 1. View their own roles (via "Users can view their own roles" policy)
-- 2. View all roles if they're superadmin (via "Superadmins can view all roles" policy)
-- 3. View roles for companies they manage (via admin policies)

-- If you need users to see other team members' roles, we'll need to implement
-- a different approach using a SECURITY DEFINER function (see fix-rls-recursion-v2.sql)
