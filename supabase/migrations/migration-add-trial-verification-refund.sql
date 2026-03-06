-- ============================================
-- MIGRATION: Add Trial Verification Refund Support
-- Adds columns to track trial verification payments and refunds
-- ============================================

-- Add payment_type column to distinguish trial verification from regular payments
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'subscription' 
CHECK (payment_type IN ('subscription', 'trial_verification'));

-- Add refund tracking columns
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refund_status TEXT 
CHECK (refund_status IN ('scheduled', 'completed', 'failed', NULL));

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refund_scheduled_at TIMESTAMPTZ;

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT;

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2);

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refund_error TEXT;

-- Create index for efficient refund processing
CREATE INDEX IF NOT EXISTS idx_payments_refund_scheduled 
ON payments(refund_scheduled_at) 
WHERE refund_status = 'scheduled' AND payment_type = 'trial_verification';

-- Create index for payment type lookups
CREATE INDEX IF NOT EXISTS idx_payments_payment_type 
ON payments(payment_type);

-- Show summary
SELECT 
  'Migration completed successfully' as status,
  (SELECT COUNT(*) FROM payments WHERE payment_type = 'trial_verification') as trial_verification_payments;
