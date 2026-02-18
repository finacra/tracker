# Trial Verification Refund Setup

This document explains how to set up the trial verification system with automatic refunds.

## Overview

When users start a trial, they are required to verify their payment method by paying ₹2. This amount is automatically refunded within 24 hours.

## Components

1. **Trial Verification Payment API** (`/api/payments/trial-verification`)
   - Creates a Razorpay order for ₹2
   - Marks payment as `trial_verification` type

2. **Webhook Handler** (`/api/payments/webhook`)
   - Processes payment capture events
   - Schedules refunds for trial verification payments (24 hours after payment)

3. **Refund Processing API** (`/api/payments/refund-trial-verification`)
   - Processes scheduled refunds
   - Should be called by a scheduled job (cron) every hour

## Database Migration

Run the migration to add refund tracking columns:

```sql
-- Run: migration-add-trial-verification-refund.sql
```

This adds:
- `payment_type` column (to distinguish trial verification from subscriptions)
- `refund_status` column (scheduled, completed, failed)
- `refund_scheduled_at` timestamp
- `razorpay_refund_id` for tracking refunds
- `refunded_at` timestamp
- `refund_amount` and `refund_error` for tracking

## Setting Up Scheduled Refunds

### Option 1: Using Supabase Edge Functions with Cron (Recommended)

A Supabase Edge Function has been created at `supabase/functions/process-trial-refunds/` that processes refunds.

#### Step 1: Deploy the Edge Function

```bash
# Make sure you have Supabase CLI installed and linked to your project
supabase functions deploy process-trial-refunds
```

#### Step 2: Set Environment Variables

Set the required secrets in Supabase Dashboard or via CLI:

```bash
# Required: Supabase service role key (for admin access)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required: Your app URL (for calling the refund API)
supabase secrets set NEXT_PUBLIC_APP_URL=https://yourdomain.com
# OR for local development:
supabase secrets set APP_URL=http://localhost:3000
```

**Note**: The function calls your Next.js API endpoint (`/api/payments/refund-trial-verification`) which has the Razorpay client configured.

#### Step 3: Set Up Cron Schedule

See `setup-trial-refund-cron.sql` for the SQL script to set up the cron job. You need to:

1. Replace `YOUR_PROJECT_REF` with your Supabase project reference
2. Replace `YOUR_ANON_KEY` with your Supabase anon key (or service role key)
3. Run the script in your Supabase SQL Editor

The cron job will call the Edge Function every hour, which in turn calls your refund API endpoint.

### Option 2: Using External Cron Service

Use a service like:
- **Cron-job.org**
- **EasyCron**
- **GitHub Actions** (with scheduled workflows)

Configure it to call:
```
POST https://yourdomain.com/api/payments/refund-trial-verification
```

**Frequency**: Every hour

**Headers**:
```
Content-Type: application/json
```

**Body**: Empty (or you can add authentication if needed)

### Option 3: Using pg_cron (PostgreSQL)

If you have `pg_cron` extension enabled in Supabase:

```sql
-- Create a function to call the refund API
CREATE OR REPLACE FUNCTION process_trial_refunds()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This would need to be called via HTTP from PostgreSQL
  -- Consider using http extension or Supabase Edge Function instead
  RAISE NOTICE 'Refund processing should be done via API endpoint';
END;
$$;

-- Schedule to run every hour
SELECT cron.schedule(
  'process-trial-refunds',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT process_trial_refunds()$$
);
```

**Note**: Direct HTTP calls from PostgreSQL require the `http` extension, which may not be available. It's better to use Supabase Edge Functions or external cron services.

## Testing

1. **Test Trial Verification Payment**:
   - Start a trial from the subscribe page
   - Complete the ₹2 payment
   - Verify payment is marked as `trial_verification` in the database
   - Verify `refund_scheduled_at` is set to 24 hours from now

2. **Test Refund Processing**:
   - Manually call the refund API endpoint
   - Verify refund is created in Razorpay
   - Verify payment record is updated with refund details

## Monitoring

Monitor the following:
- Payments with `payment_type = 'trial_verification'`
- Payments with `refund_status = 'scheduled'` where `refund_scheduled_at < NOW()`
- Failed refunds (`refund_status = 'failed'`)

## Troubleshooting

1. **Refunds not processing**:
   - Check if the scheduled job is running
   - Check Razorpay API credentials
   - Check payment records for errors in `refund_error` column

2. **Payment verification failing**:
   - Check Razorpay order creation
   - Verify webhook is receiving events
   - Check payment status in database

3. **Refund errors**:
   - Check Razorpay refund API response
   - Verify payment ID exists in Razorpay
   - Check if payment is already refunded
