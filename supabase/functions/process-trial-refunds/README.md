# Process Trial Refunds Edge Function

This Supabase Edge Function processes refunds for trial verification payments (₹2 charges that need to be refunded within 24 hours).

## Setup

### 1. Deploy the Edge Function

```bash
# Make sure you have Supabase CLI installed
supabase functions deploy process-trial-refunds
```

### 2. Set Environment Variables

Set the following secrets in Supabase Dashboard or via CLI:

```bash
# Required: Supabase service role key (for admin access)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required: Your app URL (for calling the refund API)
supabase secrets set NEXT_PUBLIC_APP_URL=https://yourdomain.com
# OR for local development:
supabase secrets set APP_URL=http://localhost:3000
```

**Note**: The function calls your Next.js API endpoint (`/api/payments/refund-trial-verification`) which has the Razorpay client configured. This is because:
- Edge Functions don't have direct access to your Next.js environment variables
- The Razorpay client is already set up in your Next.js API routes
- This keeps the refund logic centralized

### 3. Set Up Cron Schedule

#### Option A: Using Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Cron Jobs** (or **Extensions** → **pg_cron**)
3. Create a new cron job:

```sql
SELECT cron.schedule(
  'process-trial-refunds',           -- Job name
  '0 * * * *',                       -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-trial-refunds',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Note**: Replace:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_ANON_KEY` with your Supabase anon key (or create a service role key for this)

#### Option B: Using Supabase CLI

Create a migration file:

```sql
-- migration-setup-trial-refund-cron.sql
SELECT cron.schedule(
  'process-trial-refunds',
  '0 * * * *', -- Every hour
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-trial-refunds',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### 4. Enable Required Extensions

Make sure these extensions are enabled in your Supabase project:

```sql
-- Enable pg_cron (for scheduling)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension (for making HTTP requests from cron)
CREATE EXTENSION IF NOT EXISTS http;
```

**Note**: The `http` extension may require special permissions. If it's not available, you can:
- Use Supabase's built-in cron functionality (if available)
- Use an external cron service to call the Edge Function directly
- Call the Edge Function from a different service

## Alternative: Direct API Call from Cron

If the `http` extension is not available, you can set up an external cron service to call the Edge Function directly:

**URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-trial-refunds`

**Method**: POST

**Headers**:
```
Authorization: Bearer YOUR_ANON_KEY
Content-Type: application/json
```

**Body**: `{}`

**Frequency**: Every hour

## Testing

### Test the Edge Function Manually

```bash
# Using Supabase CLI
supabase functions invoke process-trial-refunds

# Or using curl
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-trial-refunds' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### Verify Cron Job

Check if the cron job is scheduled:

```sql
SELECT * FROM cron.job WHERE jobname = 'process-trial-refunds';
```

Check cron job execution history:

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-trial-refunds')
ORDER BY start_time DESC
LIMIT 10;
```

## Monitoring

Monitor the function logs in Supabase Dashboard:
- Go to **Edge Functions** → **process-trial-refunds** → **Logs**

Check for:
- Successful refund processing
- Errors in payment fetching
- API call failures

## Troubleshooting

1. **Function not being called**:
   - Verify cron job is scheduled: `SELECT * FROM cron.job WHERE jobname = 'process-trial-refunds';`
   - Check cron job runs: `SELECT * FROM cron.job_run_details WHERE jobid = ...`
   - Verify Edge Function is deployed

2. **Refund API errors**:
   - Check that `NEXT_PUBLIC_APP_URL` or `APP_URL` is set correctly
   - Verify the refund API endpoint is accessible
   - Check Razorpay credentials in your Next.js app

3. **Permission errors**:
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set correctly
   - Verify the service role key has necessary permissions
