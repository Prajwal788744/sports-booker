-- Simplify players insert RLS: any authenticated user can create
-- a player record for any user who exists in team_players
DROP POLICY IF EXISTS players_insert_by_booking_captain ON public.players;

CREATE POLICY players_insert_any_team_member ON public.players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_players tp WHERE tp.user_id = players.user_id
    )
  );
