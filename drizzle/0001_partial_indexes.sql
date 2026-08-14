-- drizzle/0001_partial_indexes.sql
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_active_per_player
  ON runs (player_id)
  WHERE status = 'active';
