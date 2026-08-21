-- RLS policies execute these private helpers while evaluating shared rows.
-- The private schema is not exposed by the Data API, so clients cannot call
-- these functions as endpoints; EXECUTE is required only for policy checks.
grant execute on function private.can_view_folder(uuid) to authenticated;
grant execute on function private.can_view_preset(uuid) to authenticated;
