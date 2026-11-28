-- Prevent more than one fully-paid payment record for the same order.
-- The payment_status column already exists in migration 0002_operations.sql.
CREATE UNIQUE INDEX idx_order_single_paid_payment
ON order_payments(order_id)
WHERE status = 'PAID';
