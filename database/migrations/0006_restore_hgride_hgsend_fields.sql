-- Restore the complete HG Ride / HG Send order details without removing existing orders.
ALTER TABLE orders ADD COLUMN branch TEXT NOT NULL DEFAULT 'Healthy Go';
ALTER TABLE orders ADD COLUMN customer_name TEXT;
ALTER TABLE orders ADD COLUMN customer_phone TEXT;
ALTER TABLE orders ADD COLUMN customer_email TEXT;
ALTER TABLE orders ADD COLUMN pickup_datetime TEXT;
ALTER TABLE orders ADD COLUMN item_type TEXT;
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Individual';
ALTER TABLE orders ADD COLUMN company_share INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN courier_share INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN total_payment INTEGER NOT NULL DEFAULT 0;

-- Default tariffs from the original HG Ride / HG Send interface.
INSERT INTO pricing_rules(id,service_type,rate_per_km,minimum_price,active)
SELECT 'default-ride-motor','RIDE_MOTOR',1500,5000,1
WHERE NOT EXISTS (SELECT 1 FROM pricing_rules WHERE service_type='RIDE_MOTOR' AND active=1);
INSERT INTO pricing_rules(id,service_type,rate_per_km,minimum_price,active)
SELECT 'default-ride-car','RIDE_CAR',3500,5000,1
WHERE NOT EXISTS (SELECT 1 FROM pricing_rules WHERE service_type='RIDE_CAR' AND active=1);
INSERT INTO pricing_rules(id,service_type,rate_per_km,minimum_price,active)
SELECT 'default-send','SEND',2000,6000,1
WHERE NOT EXISTS (SELECT 1 FROM pricing_rules WHERE service_type='SEND' AND active=1);
