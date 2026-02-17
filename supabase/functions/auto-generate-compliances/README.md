# Auto-Generate Recurring Compliances Edge Function

This Edge Function automatically generates future compliance periods for all companies when they're running low.

## Setup Instructions

### 1. Deploy the Edge Function

```bash
# Make sure you have Supabase CLI installed
supabase functions deploy auto-generate-compliances
```

### 2. Set up Cron Schedule

You have two options:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Cron Jobs** (or **Edge Functions** → **Cron**)
3. Click **Create New Cron Job**
4. Configure:
   - **Name**: `auto-generate-compliances-daily`
   - **Schedule**: `0 2 * * *` (runs daily at 2 AM UTC)
   - **Function**: `auto-generate-compliances`
   - **Method**: `POST`
   - **Headers**: (optional, for authentication if needed)

#### Option B: Using SQL (pg_cron extension)

If your Supabase project has pg_cron enabled, you can set it up via SQL:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run daily at 2 AM UTC
SELECT cron.schedule(
  'auto-generate-recurring-compliances',
  '0 2 * * *',  -- Daily at 2 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-compliances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  ) AS request_id;
  $$
);
```

#### Option C: Using Supabase CLI

Create a cron job configuration file:

```yaml
# supabase/config.toml (add to existing config)
[cron]
  [[cron.jobs]]
    name = "auto-generate-compliances-daily"
    schedule = "0 2 * * *"  # Daily at 2 AM UTC
    function = "auto-generate-compliances"
```

Then deploy:
```bash
supabase db push
```

### 3. Test the Function

Test manually first:

```bash
# Using curl
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-compliances' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

Or test via Supabase Dashboard:
1. Go to **Edge Functions** → **auto-generate-compliances**
2. Click **Invoke**
3. Check the response

## Schedule Options

Common cron schedules:
- `0 2 * * *` - Daily at 2 AM UTC
- `0 0 * * *` - Daily at midnight UTC
- `0 2 * * 1` - Weekly on Monday at 2 AM UTC
- `0 */6 * * *` - Every 6 hours
- `0 2 1 * *` - Monthly on the 1st at 2 AM UTC

## Monitoring

Check function logs in Supabase Dashboard:
- **Edge Functions** → **auto-generate-compliances** → **Logs**

Or query the database to see results:
```sql
-- Check which companies have future compliances
SELECT 
  c.name,
  MAX(rr.due_date) as max_future_date,
  COUNT(*) FILTER (WHERE rr.due_date > CURRENT_DATE) as future_count
FROM companies c
LEFT JOIN regulatory_requirements rr ON c.id = rr.company_id
WHERE rr.compliance_type IN ('monthly', 'quarterly', 'annual')
GROUP BY c.id, c.name
ORDER BY max_future_date;
```

## How It Works

1. Function runs on schedule (default: daily at 2 AM UTC)
2. Checks all companies for recurring compliances
3. For companies with < 6 months of future periods, generates 12 months ahead
4. Returns a report of what was generated
5. Logs results for monitoring

## Troubleshooting

If the function fails:
1. Check Edge Function logs in Supabase Dashboard
2. Verify the RPC function exists: `SELECT * FROM pg_proc WHERE proname = 'auto_generate_recurring_compliances';`
3. Test the RPC function directly:
   ```sql
   SELECT * FROM public.auto_generate_recurring_compliances(6, 12);
   ```
