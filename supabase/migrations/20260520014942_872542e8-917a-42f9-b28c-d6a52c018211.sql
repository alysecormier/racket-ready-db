-- Restore EXECUTE on has_role for app roles.
-- has_role is SECURITY DEFINER with a locked search_path, so granting EXECUTE
-- is safe: callers cannot escalate, they can only check membership.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;