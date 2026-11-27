-- Track the payment state directly on each order for fast operational views.
ALTER TABLE orders
ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID'
CHECK (payment_status IN ('UNPAID','PAID','REFUNDED'));

-- A manual full-payment record may be recorded only once per order.
CREATE UNIQUE INDEX idx_order_single_paid_payment
ON order_payments(order_id)
WHERE status = 'PAID';
