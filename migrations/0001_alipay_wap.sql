ALTER TABLE orders ADD COLUMN alipay_out_trade_no TEXT;
ALTER TABLE orders ADD COLUMN alipay_trade_no TEXT;
ALTER TABLE orders ADD COLUMN paid_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_alipay_out_trade_no
ON orders(alipay_out_trade_no);
