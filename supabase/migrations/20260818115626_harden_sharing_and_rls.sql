-- Keep helper functions used by RLS outside the exposed public API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.can_view_folder(_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.folder_shares as share
    join public.territory_folders as folder
      on folder.id = share.folder_id
     and folder.user_id = share.owner_id
    where share.folder_id = _folder_id
      and share.shared_with = (select auth.uid())
  );
$$;

create or replace function private.can_view_preset(_preset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.preset_shares as share
    join public.category_presets as preset
      on preset.id = share.preset_id
     and preset.user_id = share.owner_id
    where share.preset_id = _preset_id
      and share.shared_with = (select auth.uid())
  );
$$;

revoke execute on function private.can_view_folder(uuid) from public, anon, authenticated;
revoke execute on function private.can_view_preset(uuid) from public, anon, authenticated;

drop policy if exists "Shared folders are viewable" on public.territory_folders;
drop policy if exists "Areas in shared folders are viewable" on public.territories;
drop policy if exists "Shared presets are viewable" on public.category_presets;

create policy "Shared folders are viewable"
on public.territory_folders
for select
to authenticated
using (private.can_view_folder(id));

create policy "Areas in shared folders are viewable"
on public.territories
for select
to authenticated
using (folder_id is not null and private.can_view_folder(folder_id));

create policy "Shared presets are viewable"
on public.category_presets
for select
to authenticated
using (private.can_view_preset(id));

drop function if exists public.can_view_folder(uuid, uuid);
drop function if exists public.can_view_preset(uuid, uuid);

-- Split territory permissions so a user cannot attach a row to somebody else's folder.
drop policy if exists "Users manage own territories" on public.territories;

create policy "Users read own territories"
on public.territories
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create own territories"
on public.territories
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.territory_folders as folder
      where folder.id = folder_id
        and folder.user_id = (select auth.uid())
    )
  )
);

create policy "Users update own territories"
on public.territories
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.territory_folders as folder
      where folder.id = folder_id
        and folder.user_id = (select auth.uid())
    )
  )
);

create policy "Users delete own territories"
on public.territories
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- The owner_id supplied by a client must match the real owner of the target object.
drop policy if exists "Owner manages folder shares" on public.folder_shares;
drop policy if exists "Recipient reads folder shares" on public.folder_shares;

create policy "Owners read folder shares"
on public.folder_shares
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.territory_folders as folder
    where folder.id = folder_id and folder.user_id = (select auth.uid())
  )
);

create policy "Recipients read folder shares"
on public.folder_shares
for select
to authenticated
using (shared_with = (select auth.uid()));

create policy "Owners create folder shares"
on public.folder_shares
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and shared_with <> (select auth.uid())
  and exists (
    select 1 from public.territory_folders as folder
    where folder.id = folder_id and folder.user_id = (select auth.uid())
  )
);

create policy "Owners update folder shares"
on public.folder_shares
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.territory_folders as folder
    where folder.id = folder_id and folder.user_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and shared_with <> (select auth.uid())
  and exists (
    select 1 from public.territory_folders as folder
    where folder.id = folder_id and folder.user_id = (select auth.uid())
  )
);

create policy "Owners delete folder shares"
on public.folder_shares
for delete
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.territory_folders as folder
    where folder.id = folder_id and folder.user_id = (select auth.uid())
  )
);

drop policy if exists "Owner manages preset shares" on public.preset_shares;
drop policy if exists "Recipient reads preset shares" on public.preset_shares;

create policy "Owners read preset shares"
on public.preset_shares
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.category_presets as preset
    where preset.id = preset_id and preset.user_id = (select auth.uid())
  )
);

create policy "Recipients read preset shares"
on public.preset_shares
for select
to authenticated
using (shared_with = (select auth.uid()));

create policy "Owners create preset shares"
on public.preset_shares
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and shared_with <> (select auth.uid())
  and exists (
    select 1 from public.category_presets as preset
    where preset.id = preset_id and preset.user_id = (select auth.uid())
  )
);

create policy "Owners update preset shares"
on public.preset_shares
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.category_presets as preset
    where preset.id = preset_id and preset.user_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and shared_with <> (select auth.uid())
  and exists (
    select 1 from public.category_presets as preset
    where preset.id = preset_id and preset.user_id = (select auth.uid())
  )
);

create policy "Owners delete preset shares"
on public.preset_shares
for delete
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.category_presets as preset
    where preset.id = preset_id and preset.user_id = (select auth.uid())
  )
);

-- Foreign-key indexes keep authorization checks and cascade deletes efficient.
create index if not exists folder_shares_owner_id_idx on public.folder_shares(owner_id);
create index if not exists folder_shares_shared_with_idx on public.folder_shares(shared_with);
create index if not exists preset_shares_owner_id_idx on public.preset_shares(owner_id);
create index if not exists preset_shares_shared_with_idx on public.preset_shares(shared_with);

-- Reassert explicit Data API access for the roles used by the application.
grant select, insert, update, delete on public.territories to authenticated;
grant select, insert, update, delete on public.territory_folders to authenticated;
grant select, insert, update, delete on public.category_presets to authenticated;
grant select, insert, update, delete on public.folder_shares to authenticated;
grant select, insert, update, delete on public.preset_shares to authenticated;
grant select, insert, update, delete on public.leads to authenticated;

grant all on public.territories to service_role;
grant all on public.territory_folders to service_role;
grant all on public.category_presets to service_role;
grant all on public.folder_shares to service_role;
grant all on public.preset_shares to service_role;
grant all on public.leads to service_role;

revoke all on public.territories from anon;
revoke all on public.territory_folders from anon;
revoke all on public.category_presets from anon;
revoke all on public.folder_shares from anon;
revoke all on public.preset_shares from anon;
revoke all on public.leads from anon;

grant usage on type public.territory_status, public.lead_status to authenticated, service_role;

create or replace function public.user_id_by_email(_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where lower(email) = lower(_email)
  limit 1;
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
