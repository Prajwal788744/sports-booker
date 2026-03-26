-- Allow booking captains to create player profiles for their team members
CREATE POLICY players_insert_by_booking_captain ON public.players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM team_players tp
      JOIN booking_teams bt ON bt.team_id = tp.team_id
      WHERE tp.user_id = players.user_id
        AND bt.user_id = auth.uid()
    )
  );
