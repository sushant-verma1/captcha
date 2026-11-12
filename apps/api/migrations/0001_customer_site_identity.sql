BEGIN;

CREATE TABLE tracecaptcha_customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracecaptcha_environments (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES tracecaptcha_customers (id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (
    name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, customer_id),
  UNIQUE (customer_id, name)
);

CREATE TABLE tracecaptcha_sites (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES tracecaptcha_customers (id) ON DELETE RESTRICT,
  environment_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (environment_id, customer_id)
    REFERENCES tracecaptcha_environments (id, customer_id)
    ON DELETE RESTRICT,
  UNIQUE (environment_id, name)
);

CREATE TABLE tracecaptcha_site_identifiers (
  site_id UUID NOT NULL REFERENCES tracecaptcha_sites (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('web_hostname', 'android_package', 'ios_bundle')
  ),
  value TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, kind, value),
  UNIQUE (kind, value),
  CHECK (kind <> 'web_hostname' OR value = lower(value))
);

CREATE INDEX tracecaptcha_environments_customer_active_idx
  ON tracecaptcha_environments (customer_id, id)
  WHERE status = 'active';

CREATE INDEX tracecaptcha_sites_customer_environment_active_idx
  ON tracecaptcha_sites (customer_id, environment_id, id)
  WHERE status = 'active';

CREATE INDEX tracecaptcha_site_identifiers_site_idx
  ON tracecaptcha_site_identifiers (site_id);

COMMIT;
