-- Existing installations created with 0003 need the purchase records split
-- between recurring supplies and one-time purchases.
CREATE TABLE purchase_records_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_id INTEGER REFERENCES supplies(id),
  purchase_type TEXT NOT NULL DEFAULT 'RECURRING' CHECK (purchase_type IN ('ONE_TIME','RECURRING')),
  item_name TEXT NOT NULL,
  specification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'OTHER' CHECK (category IN ('INGREDIENT','PACKAGING','CONSUMABLE','TOOL','EQUIPMENT','OTHER')),
  unit TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0), amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  platform TEXT NOT NULL, shop TEXT NOT NULL, product_url TEXT NOT NULL DEFAULT '', order_number TEXT NOT NULL DEFAULT '',
  purchased_on TEXT NOT NULL, image_data TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO purchase_records_v4 (id, supply_id, purchase_type, item_name, specification, category, unit, quantity, amount_cents, platform, shop, product_url, order_number, purchased_on, image_data, created_at, updated_at)
SELECT p.id, p.supply_id, s.purchase_type, s.name, s.specification, s.category, s.unit, p.quantity, p.amount_cents, p.platform, p.shop, p.product_url, p.order_number, p.purchased_on, p.image_data, p.created_at, p.updated_at
FROM purchase_records p JOIN supplies s ON s.id = p.supply_id;
DROP TABLE purchase_records;
ALTER TABLE purchase_records_v4 RENAME TO purchase_records;
CREATE INDEX IF NOT EXISTS idx_purchase_records_supply ON purchase_records(supply_id);
CREATE INDEX IF NOT EXISTS idx_purchase_records_date ON purchase_records(purchased_on DESC, id DESC);
CREATE TABLE supplies_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, specification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL, unit TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO supplies_v4 SELECT id, name, specification, category, unit, created_at, updated_at FROM supplies WHERE purchase_type = 'RECURRING';
DROP TABLE supplies;
ALTER TABLE supplies_v4 RENAME TO supplies;
