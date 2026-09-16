CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('INGREDIENT','PACKAGING','CONSUMABLE','TOOL','EQUIPMENT','OTHER')),
  unit TEXT NOT NULL,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('ONE_TIME','RECURRING')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_id INTEGER NOT NULL REFERENCES supplies(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  platform TEXT NOT NULL,
  shop TEXT NOT NULL,
  product_url TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL DEFAULT '',
  purchased_on TEXT NOT NULL,
  image_data TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_records_supply ON purchase_records(supply_id);
CREATE INDEX IF NOT EXISTS idx_purchase_records_date ON purchase_records(purchased_on DESC, id DESC);
