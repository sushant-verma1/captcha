BEGIN;

CREATE TABLE tracecaptcha_site_credentials (
  id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES tracecaptcha_sites (id) ON DELETE CASCADE,
  credential_kind TEXT NOT NULL CHECK (
    credential_kind IN ('public_site_key', 'private_server_credential')
  ),
  key_id UUID NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL CHECK (char_length(secret_hash) BETWEEN 1 AND 1_024),
  label TEXT CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'retiring', 'revoked')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMPTZ,
  not_after TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (
    (status = 'active' AND retired_at IS NULL AND not_after IS NULL AND revoked_at IS NULL)
    OR (
      status = 'retiring'
      AND retired_at IS NOT NULL
      AND not_after IS NOT NULL
      AND not_after > retired_at
      AND revoked_at IS NULL
    )
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tracecaptcha_site_credentials_one_active_kind_idx
ON tracecaptcha_site_credentials (site_id, credential_kind)
WHERE status = 'active';

CREATE INDEX tracecaptcha_site_credentials_site_status_idx
ON tracecaptcha_site_credentials (site_id, credential_kind, status);

COMMIT;
