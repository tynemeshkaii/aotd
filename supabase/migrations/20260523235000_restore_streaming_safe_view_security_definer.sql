-- Keep the safe client view as security definer.
-- The base streaming_connections table intentionally has no client SELECT grant,
-- so security_invoker=true would make the view unreadable for authenticated users.
alter view public.streaming_connections_safe set (security_invoker = false);
