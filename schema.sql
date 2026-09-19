PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  image_data TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🥐',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pickup_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  pickup_slot TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  alipay_out_trade_no TEXT,
  alipay_trade_no TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  order_status TEXT NOT NULL DEFAULT 'new' CHECK (order_status IN ('new','preparing','ready','completed','cancelled')),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_pickup_code ON orders(pickup_code);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, payment_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_alipay_out_trade_no ON orders(alipay_out_trade_no);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

INSERT INTO products (name, description, price_cents, emoji, sort_order)
SELECT '海盐卷', '当天现烤，外脆内软', 1200, '🥐', 10
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = '海盐卷');

INSERT INTO products (name, description, price_cents, emoji, sort_order)
SELECT '原味贝果', '低糖有嚼劲', 1200, '🥯', 20
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = '原味贝果');

INSERT INTO products (name, description, price_cents, emoji, sort_order)
SELECT '黄油曲奇', '酥香小份装', 1200, '🍪', 30
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = '黄油曲奇');

CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('INGREDIENT','PACKAGING','CONSUMABLE','TOOL','EQUIPMENT','OTHER')),
  unit TEXT NOT NULL,
  purchase_type TEXT NOT NULL DEFAULT 'RECURRING' CHECK (purchase_type IN ('ONE_TIME','RECURRING')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_id INTEGER REFERENCES supplies(id),
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('ONE_TIME','RECURRING')),
  item_name TEXT NOT NULL,
  specification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('INGREDIENT','PACKAGING','CONSUMABLE','TOOL','EQUIPMENT','OTHER')),
  unit TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  platform TEXT NOT NULL,
  shop TEXT NOT NULL,
  product_url TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL DEFAULT '',
  purchased_on TEXT NOT NULL,
  image_data TEXT NOT NULL DEFAULT '',
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_records_supply ON purchase_records(supply_id);
CREATE INDEX IF NOT EXISTS idx_purchase_records_date ON purchase_records(purchased_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS founder_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  decided_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  problem TEXT NOT NULL,
  experiment TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL,
  principle TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_founder_decisions_date ON founder_decisions(decided_on DESC, id DESC);

INSERT INTO founder_decisions (title, decided_on, status, problem, experiment, outcome, decision, principle, scope)
SELECT '三轮车台面安装', '2026-09-18', 'ACTIVE', '三轮车台面怎样安装？', '定制整体不锈钢架，花费200元。',
  '过重、难修改，且可能损伤车身。', '改用轻量板材和可拆卸连接件。',
  '移动设备先用可拆方案验证，再制作永久结构。', '三轮车及其他移动设备。'
WHERE NOT EXISTS (SELECT 1 FROM founder_decisions WHERE title = '三轮车台面安装');

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
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_founder_expenses_date ON founder_expenses(spent_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS receipt_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_key TEXT NOT NULL,
  raw_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LINKED')),
  linked_expense_id INTEGER REFERENCES founder_expenses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipt_email_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL REFERENCES receipt_emails(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  file_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_founder_expense_files_receipt ON founder_expense_files(expense_id, source_receipt_file_id);
CREATE INDEX IF NOT EXISTS idx_receipt_emails_status ON receipt_emails(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_email_files_email ON receipt_email_files(email_id, id);
