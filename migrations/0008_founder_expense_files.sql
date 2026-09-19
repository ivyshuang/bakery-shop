PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS founder_expense_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES founder_expenses(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  file_hash TEXT NOT NULL,
  source_receipt_file_id INTEGER REFERENCES receipt_email_files(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_founder_expense_files_expense ON founder_expense_files(expense_id, id);
