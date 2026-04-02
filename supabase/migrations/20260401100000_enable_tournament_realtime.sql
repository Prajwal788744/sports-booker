-- Enable realtime for tournament tables so points update instantly across users
alter publication supabase_realtime add table public.tournaments;
alter publication supabase_realtime add table public.tournament_teams;
alter publication supabase_realtime add table public.tournament_matches;
