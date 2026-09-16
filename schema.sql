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
