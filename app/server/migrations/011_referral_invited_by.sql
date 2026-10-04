CREATE INDEX IF NOT EXISTS kalpi_sessions_invited_by_idx
  ON kalpi_sessions ((extras->>'invitedBy'));
