CREATE TABLE IF NOT EXISTS founder_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_on TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PREPARATION','EXPERIMENT','REGISTRATION','OFFICE','OTHER')),
  gross_paid_cents INTEGER NOT NULL CHECK (gross_paid_cents >= 0),
  refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= gross_paid_cents),
  payment_method TEXT NOT NULL DEFAULT '',
  payee TEXT NOT NULL DEFAULT '',
  payment_reference TEXT NOT NULL DEFAULT '',
  refund_reference TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  disposal TEXT NOT NULL DEFAULT '',
  business_relevance INTEGER NOT NULL DEFAULT 1 CHECK (business_relevance IN (0,1)),
  status TEXT NOT NULL DEFAULT 'PENDING_CONVERSION' CHECK (status IN ('PENDING_CONVERSION','COMPANY_CONFIRMED','PERSONAL','REIMBURSED')),
  decision_id INTEGER REFERENCES founder_decisions(id) ON DELETE SET NULL,
  evidence_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_founder_expenses_date ON founder_expenses(spent_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS founder_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  acquired_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  current_owner TEXT NOT NULL DEFAULT '创始人个人',
  payment_method TEXT NOT NULL DEFAULT '',
  payment_reference TEXT NOT NULL DEFAULT '',
  intended_use TEXT NOT NULL DEFAULT '',
  future_handling TEXT NOT NULL DEFAULT '拟投入或转让企业',
  status TEXT NOT NULL DEFAULT 'PERSONAL' CHECK (status IN ('PERSONAL','TRANSFERRED','CONTRIBUTED','DISPOSED')),
  evidence_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_founder_assets_date ON founder_assets(acquired_on DESC, id DESC);
