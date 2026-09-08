-- Run after 001 and 002. Add your Auth user to app_admins separately below.
begin;
create table public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
grant select on public.app_admins to authenticated;
revoke all on public.app_admins from anon;
create policy own_membership on public.app_admins for select to authenticated using (user_id = auth.uid());
create table public.league_workspaces (
 id text primary key check(id='2026-2027'),
 state jsonb not null check(jsonb_typeof(state)='object'),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.league_workspaces enable row level security;
revoke all on public.league_workspaces from anon,authenticated;
grant select on public.league_workspaces to authenticated;
create policy admin_read on public.league_workspaces for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=auth.uid()));
create function public.save_league_workspace(p_state jsonb,p_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
 if not exists(select 1 from public.app_admins where user_id=auth.uid()) then
  raise exception 'League administrator access required' using errcode='42501';
 end if;
 if p_state->>'season' is distinct from '2026-2027' or jsonb_typeof(p_state->'teams') is distinct from 'array'
  or jsonb_typeof(p_state->'bowlers') is distinct from 'array' or jsonb_typeof(p_state->'results') is distinct from 'array'
  or octet_length(p_state::text)>10000000 then raise exception 'Invalid league workspace'; end if;
 perform pg_advisory_xact_lock(202627);
 select revision into v_revision from public.league_workspaces where id='2026-2027' for update;
 if coalesce(v_revision,0)<>p_revision then raise exception 'Another session saved changes. Export your draft, then reload the saved league before editing.'; end if;
 v_revision:=coalesce(v_revision,0)+1;
 insert into public.league_workspaces(id,state,revision,updated_by)
 values('2026-2027',p_state,v_revision,auth.uid())
 on conflict(id) do update set state=excluded.state,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 return v_revision;
end $$;
revoke all on function public.save_league_workspace(jsonb,integer) from public;
grant execute on function public.save_league_workspace(jsonb,integer) to authenticated;
commit;

-- After creating your user in Authentication > Users, run separately:
-- insert into public.app_admins(user_id)
-- select id from auth.users where email = 'YOUR_EMAIL_HERE'
-- on conflict do nothing;
