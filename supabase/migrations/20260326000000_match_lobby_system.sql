begin;

-- Add team_ready column to booking_teams for match lobby readiness tracking
alter table public.booking_teams
  add column if not exists team_ready boolean not null default false;

-- Enable Supabase Realtime on booking_teams for live lobby sync
alter publication supabase_realtime add table public.booking_teams;

commit;
