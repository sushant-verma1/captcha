BEGIN;

CREATE TABLE tracecaptcha_site_action_policies (
  id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES tracecaptcha_sites (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (
    action IN ('signup', 'login', 'password_reset', 'otp_request')
  ),
  version INTEGER NOT NULL CHECK (version >= 1),
  low_risk_decision TEXT NOT NULL CHECK (
    low_risk_decision IN ('allow', 'challenge', 'cooldown', 'block')
  ),
  elevated_risk_decision TEXT NOT NULL CHECK (
    elevated_risk_decision IN ('allow', 'challenge', 'cooldown', 'block')
  ),
  high_risk_decision TEXT NOT NULL CHECK (
    high_risk_decision IN ('allow', 'challenge', 'cooldown', 'block')
  ),
  severe_risk_decision TEXT NOT NULL CHECK (
    severe_risk_decision IN ('allow', 'challenge', 'cooldown', 'block')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TIMESTAMPTZ,
  CHECK (
    (status = 'active' AND superseded_at IS NULL)
    OR (status = 'superseded' AND superseded_at IS NOT NULL)
  ),
  UNIQUE (site_id, action, version)
);

CREATE UNIQUE INDEX tracecaptcha_site_action_policies_one_active_idx
ON tracecaptcha_site_action_policies (site_id, action)
WHERE status = 'active';

COMMIT;
