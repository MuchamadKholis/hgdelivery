PRAGMA foreign_keys = ON;

-- Expand the initial order model without destroying existing records.
ALTER TABLE orders ADD COLUMN passenger_count INTEGER;
ALTER TABLE orders ADD COLUMN item_description TEXT;
ALTER TABLE orders ADD COLUMN item_weight_kg REAL;
ALTER TABLE orders ADD COLUMN delivery_speed TEXT CHECK(delivery_speed IS NULL OR delivery_speed IN ('SAME_DAY','KILAT'));
ALTER TABLE orders ADD COLUMN recipient_name TEXT;
ALTER TABLE orders ADD COLUMN recipient_phone TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID','PENDING','PAID','REFUNDED'));
ALTER TABLE orders ADD COLUMN assigned_at TEXT;
ALTER TABLE orders ADD COLUMN completed_at TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

CREATE TABLE pricing_rules (
  id TEXT PRIMARY KEY,
  service_type TEXT NOT NULL CHECK(service_type IN ('RIDE_MOTOR','RIDE_CAR','SEND')),
  rate_per_km INTEGER NOT NULL CHECK(rate_per_km >= 0),
  minimum_price INTEGER NOT NULL CHECK(minimum_price >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_from TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pricing_active ON pricing_rules(service_type,active,effective_from DESC);

CREATE TABLE order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  method TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','REFUNDED')),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_payments_order ON order_payments(order_id,created_at DESC);

CREATE TABLE order_proofs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 10485760),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_proofs_order ON order_proofs(order_id,created_at DESC);

CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_status_updated ON orders(status,updated_at DESC);
CREATE INDEX idx_events_order_created ON order_events(order_id,created_at DESC);
