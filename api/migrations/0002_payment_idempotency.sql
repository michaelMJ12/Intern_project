ALTER TABLE bill_shares
ADD COLUMN idempotency_key TEXT DEFAULT NULL;

CREATE UNIQUE INDEX uq_share_idempotency_key
ON bill_shares(id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
