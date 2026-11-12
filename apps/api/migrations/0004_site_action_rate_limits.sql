BEGIN;

ALTER TABLE tracecaptcha_site_action_policies
ADD COLUMN rate_limits JSONB NOT NULL DEFAULT '{
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
  }
}'::jsonb;

ALTER TABLE tracecaptcha_site_action_policies
ADD CONSTRAINT tracecaptcha_site_action_policies_rate_limits_object_check
CHECK (jsonb_typeof(rate_limits) = 'object');

COMMIT;
