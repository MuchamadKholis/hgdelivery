-- Add separate customer/courier rates and order creator tracking without rewriting existing data.
ALTER TABLE pricing_rules ADD COLUMN courier_rate_per_km INTEGER NOT NULL DEFAULT 1000 CHECK(courier_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN courier_rate_per_km INTEGER NOT NULL DEFAULT 1000 CHECK(courier_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN customer_rate_per_km INTEGER NOT NULL DEFAULT 0 CHECK(customer_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN created_by_id TEXT REFERENCES users(id);
UPDATE pricing_rules SET courier_rate_per_km=1000 WHERE courier_rate_per_km=0;
CREATE INDEX idx_orders_created_by ON orders(created_by_id, created_at DESC);

CREATE TABLE route_quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  distance_km REAL NOT NULL CHECK(distance_km > 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_route_quotes_user_expiry ON route_quotes(user_id, expires_at);
ALTER TABLE orders ADD COLUMN minimum_price INTEGER NOT NULL DEFAULT 0 CHECK(minimum_price >= 0);
