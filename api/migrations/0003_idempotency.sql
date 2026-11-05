
CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope, idempotency_key)
);


CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_shares_idempotency_key
  ON bill_shares (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_shares_bill_member
  ON bill_shares (bill_id, member_id);


CREATE UNIQUE INDEX IF NOT EXISTS idx_members_home_position
  ON members (home_id, position);
