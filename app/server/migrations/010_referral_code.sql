CREATE INDEX IF NOT EXISTS kalpi_sessions_referral_code_idx
  ON kalpi_sessions ((extras->>'referralCode'));
