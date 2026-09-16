ALTER TABLE purchase_records ADD COLUMN file_key TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_records ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_records ADD COLUMN file_type TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_records ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_records ADD COLUMN file_hash TEXT NOT NULL DEFAULT '';
