begin;

-- Add is_active flag to users for admin enable/disable
alter table public.users
  add column if not exists is_active boolean not null default true;

-- ─── Tournaments ───────────────────────────────────────────────────
create table if not exists public.tournaments (
  id bigserial primary key,
  name text not null,
  sport_id integer not null references public.sports(id),
  format text not null default 'league',
  status text not null default 'draft',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  winner_team_id bigint,
  constraint tournaments_format_check check (format in ('league', 'knockout')),
  constraint tournaments_status_check check (status in ('draft', 'active', 'completed'))
);

-- ─── Tournament Teams ──────────────────────────────────────────────
create table if not exists public.tournament_teams (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  team_name text not null,
  team_id bigint references public.teams(id) on delete set null,
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  matches_played integer not null default 0,
  nrr numeric(6,3) not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint tournament_teams_unique unique (tournament_id, team_name)
);

-- ─── Tournament Matches ────────────────────────────────────────────
create table if not exists public.tournament_matches (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  match_id integer references public.matches(id) on delete set null,
  round integer not null default 1,
  match_number integer not null default 1,
  team_a_id bigint not null references public.tournament_teams(id) on delete cascade,
  team_b_id bigint not null references public.tournament_teams(id) on delete cascade,
  winner_team_id bigint references public.tournament_teams(id) on delete set null,
  status text not null default 'scheduled',
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint tournament_matches_status_check check (status in ('scheduled', 'ongoing', 'completed', 'cancelled'))
);

-- ─── Indexes ───────────────────────────────────────────────────────
create index if not exists tournaments_status_idx on public.tournaments (status);
create index if not exists tournaments_sport_idx on public.tournaments (sport_id);
create index if not exists tournament_teams_tournament_idx on public.tournament_teams (tournament_id);
create index if not exists tournament_matches_tournament_idx on public.tournament_matches (tournament_id);
create index if not exists tournament_matches_teams_idx on public.tournament_matches (team_a_id, team_b_id);
create index if not exists users_is_active_idx on public.users (is_active);

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_matches enable row level security;

-- Everyone authenticated can read tournaments
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'tournaments_select_all'
  ) then
    create policy tournaments_select_all
      on public.tournaments for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'tournaments_admin_all'
  ) then
    create policy tournaments_admin_all
      on public.tournaments for all to authenticated
      using (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      )
      with check (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournament_teams' and policyname = 'tournament_teams_select_all'
  ) then
    create policy tournament_teams_select_all
      on public.tournament_teams for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournament_teams' and policyname = 'tournament_teams_admin_all'
  ) then
    create policy tournament_teams_admin_all
      on public.tournament_teams for all to authenticated
      using (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      )
      with check (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournament_matches' and policyname = 'tournament_matches_select_all'
  ) then
    create policy tournament_matches_select_all
      on public.tournament_matches for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournament_matches' and policyname = 'tournament_matches_admin_all'
  ) then
    create policy tournament_matches_admin_all
      on public.tournament_matches for all to authenticated
      using (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      )
      with check (
        exists (select 1 from public.users where id = (select auth.uid()) and role = 'admin')
      );
  end if;
end $$;

commit;
