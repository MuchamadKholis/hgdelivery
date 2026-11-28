-- Add separate customer/courier rates and order creator tracking without rewriting existing data.
ALTER TABLE pricing_rules ADD COLUMN courier_rate_per_km INTEGER NOT NULL DEFAULT 1000 CHECK(courier_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN courier_rate_per_km INTEGER NOT NULL DEFAULT 1000 CHECK(courier_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN customer_rate_per_km INTEGER NOT NULL DEFAULT 0 CHECK(customer_rate_per_km >= 0);
ALTER TABLE orders ADD COLUMN created_by_id TEXT REFERENCES users(id);
UPDATE pricing_rules SET courier_rate_per_km=1000 WHERE courier_rate_per_km=0;
CREATE INDEX idx_orders_created_by ON orders(created_by_id, created_at DESC);
