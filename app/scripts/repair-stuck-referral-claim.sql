-- Read-only first. Do not run the UPDATE until the SELECT proves
-- "claimed / no referral instance" for that invitee code.
--
-- Marker format: referral-<INVITEE_REFERRAL_CODE>
-- The pack is stored on the INVITER (invitee.extras.invitedBy).

-- 1. Inspect one invitee (replace the code):
-- SELECT
--   invitee.token AS invitee_token,
--   invitee.display_name AS invitee_name,
--   invitee.extras->>'referralCode' AS invitee_code,
--   invitee.extras->>'referralRewardedAt' AS rewarded_at,
--   invitee.extras->>'invitedBy' AS inviter_token,
--   inviter.display_name AS inviter_name,
--   (
--     SELECT count(*) FROM kalpi_instances AS instance
--     WHERE instance.session_token = invitee.extras->>'invitedBy'
--       AND instance.acquired_by = 'referral-' || (invitee.extras->>'referralCode')
--   ) AS referral_instances,
--   (
--     SELECT count(*) FROM kalpi_packs AS pack
--     WHERE pack.session_token = invitee.extras->>'invitedBy'
--       AND pack.mode = 'referral'
--       AND pack.pack_id LIKE 'referral-%'
--   ) AS referral_packs
-- FROM kalpi_sessions AS invitee
-- LEFT JOIN kalpi_sessions AS inviter ON inviter.token = invitee.extras->>'invitedBy'
-- WHERE invitee.extras->>'referralCode' = :invitee_code;

-- 2. Repair only when referral_instances = 0. The fixed claim path also
--    self-heals this row on the next tap; use this only if you cannot deploy first.
-- UPDATE kalpi_sessions AS invitee
-- SET extras = extras - 'referralRewardedAt',
--     updated_at = NOW()
-- WHERE extras->>'referralCode' = :invitee_code
--   AND extras->>'referralRewardedAt' IS NOT NULL
--   AND extras->>'invitedBy' IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1
--     FROM kalpi_instances AS instance
--     WHERE instance.session_token = invitee.extras->>'invitedBy'
--       AND instance.acquired_by = 'referral-' || (invitee.extras->>'referralCode')
--   );

SELECT
  invitee.token AS invitee_token,
  invitee.display_name AS invitee_name,
  invitee.extras->>'referralCode' AS invitee_code,
  invitee.extras->>'referralRewardedAt' AS rewarded_at,
  invitee.extras->>'invitedBy' AS inviter_token,
  inviter.display_name AS inviter_name,
  (
    SELECT count(*) FROM kalpi_instances AS instance
    WHERE instance.session_token = invitee.extras->>'invitedBy'
      AND instance.acquired_by = 'referral-' || (invitee.extras->>'referralCode')
  ) AS referral_instances
FROM kalpi_sessions AS invitee
LEFT JOIN kalpi_sessions AS inviter ON inviter.token = invitee.extras->>'invitedBy'
WHERE invitee.extras->>'referralRewardedAt' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM kalpi_instances AS instance
    WHERE instance.session_token = invitee.extras->>'invitedBy'
      AND instance.acquired_by = 'referral-' || (invitee.extras->>'referralCode')
  );
