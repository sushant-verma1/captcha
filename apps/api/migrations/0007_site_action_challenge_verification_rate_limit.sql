BEGIN;

ALTER TABLE tracecaptcha_site_action_policies
  ALTER COLUMN rate_limits SET DEFAULT '{
    "decision": {
      "windowMs": 60000,
      "siteActionLimit": 120,
      "sessionActionLimit": 20,
      "networkLimit": 240
    },
    "challenge_creation": {
      "windowMs": 60000,
      "siteActionLimit": 60,
      "sessionActionLimit": 10,
      "networkLimit": 120
    },
    "challenge_verification": {
      "windowMs": 60000,
      "siteActionLimit": 60,
      "sessionActionLimit": 8,
      "networkLimit": 120
    }
  }'::jsonb;

UPDATE tracecaptcha_site_action_policies
SET rate_limits = rate_limits || jsonb_build_object(
  'challenge_verification',
  jsonb_build_object(
    'windowMs', 60000,
    'siteActionLimit', 60,
    'sessionActionLimit', 8,
    'networkLimit', 120
  )
)
WHERE NOT rate_limits ? 'challenge_verification';

COMMIT;
