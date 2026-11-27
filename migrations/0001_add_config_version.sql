-- Safe idempotent migration adding row-level optimistic locking config_version column
ALTER TABLE subscriptions ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE nodes ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;

UPDATE subscriptions
SET config_version = MAX(1, COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1))
WHERE config_version IS NULL OR config_version < 1;

UPDATE nodes
SET config_version = MAX(1, COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1))
WHERE config_version IS NULL OR config_version < 1;

UPDATE profiles
SET config_version = MAX(1, COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1))
WHERE config_version IS NULL OR config_version < 1;
