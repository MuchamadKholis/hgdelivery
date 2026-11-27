-- Google Drive stores proof files; D1 stores only metadata and Drive file IDs.
ALTER TABLE order_proofs ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'GOOGLE_DRIVE' CHECK(storage_provider IN ('GOOGLE_DRIVE'));
ALTER TABLE order_proofs ADD COLUMN original_file_name TEXT;
CREATE INDEX idx_proofs_provider ON order_proofs(storage_provider);
