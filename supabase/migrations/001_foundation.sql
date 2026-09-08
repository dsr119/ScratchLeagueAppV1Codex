-- Run once in Supabase SQL Editor. No anonymous or signed-in user has
-- access until explicit policies are added with the application login flow.
begin;
create table public.seasons (
 id uuid primary key default gen_random_uuid(),
 name text unique not null,
 rules jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.bowlers (
 id uuid primary key default gen_random_uuid(),
 display_name text not null,
 aliases text[] not null default '{}'
);
create table public.teams (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 team_number integer not null check(team_number > 0),
 display_name text not null,
 unique(season_id,team_number),
 unique(id,season_id)
);
create table public.roster_assignments (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 bowler_id uuid not null references public.bowlers(id),
 team_id uuid,
 role text not null check(role in ('regular','substitute')),
 category text check(category in ('A','B','C')),
 entering_average numeric check(entering_average between 0 and 300),
 start_week integer not null default 1 check(start_week > 0),
 end_week integer check(end_week >= start_week),
 foreign key(team_id,season_id) references public.teams(id,season_id),
 check(role <> 'regular' or team_id is not null)
);
create table public.schedule_weeks (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 week integer not null check(week > 0),
 scheduled_date date,
 kind text not null check(kind in ('regular','third_position','overall_position','playoff','unconfirmed')),
 unique(season_id,week),
 unique(id,season_id)
);
create table public.matchups (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 week_id uuid not null,
 team_a uuid not null,
 team_b uuid not null,
 status text not null default 'scheduled' check(status in ('scheduled','completed')),
 foreign key(week_id,season_id) references public.schedule_weeks(id,season_id),
 foreign key(team_a,season_id) references public.teams(id,season_id),
 foreign key(team_b,season_id) references public.teams(id,season_id),
 check(team_a <> team_b),
 unique(id,season_id)
);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(),
 filename text not null,
 sha256 text not null unique,
 imported_at timestamptz not null default now(),
 status text not null default 'staged' check(status in ('staged','accepted','reverted'))
);
create table public.game_scores (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 bowler_id uuid not null references public.bowlers(id),
 team_id uuid,
 matchup_id uuid,
 import_id uuid references public.import_batches(id),
 source_row text not null,
 played_date date,
 session_key text not null,
 league_name text not null,
 game_number integer not null check(game_number > 0),
 score integer not null check(score between 0 and 300),
 score_type text not null check(score_type in ('actual','blind','vacant')),
 foreign key(team_id,season_id) references public.teams(id,season_id),
 foreign key(matchup_id,season_id) references public.matchups(id,season_id),
 unique(season_id,bowler_id,league_name,session_key,game_number),
 unique(import_id,source_row)
);
create table public.scenarios (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 name text not null,
 adjustments jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now()
);
create table public.simulation_runs (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id),
 scenario_id uuid references public.scenarios(id),
 model_version text not null,
 input_snapshot jsonb not null,
 random_seed text not null,
 iterations integer not null check(iterations > 0),
 results jsonb not null,
 created_at timestamptz not null default now()
);
create index game_scores_bowler_date on public.game_scores(bowler_id,played_date);
create index roster_season on public.roster_assignments(season_id);
create index simulation_season_date on public.simulation_runs(season_id,created_at);
do $$ declare t text; begin
 foreach t in array array['seasons','bowlers','teams','roster_assignments','schedule_weeks','matchups','import_batches','game_scores','scenarios','simulation_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from anon, authenticated',t);
 end loop;
end $$;
commit;
