# Setting Up Scheduled Auto-Generation of Recurring Compliances

This guide will help you set up automatic generation of future compliance periods.

## Prerequisites

1. ✅ Run `generate-recurring-compliances.sql` (creates the base functions)
2. ✅ Run `auto-generate-recurring-compliances.sql` (creates the auto-generation functions and trigger)

## Option 1: Using Supabase Dashboard (Easiest - Recommended)

### Step 1: Deploy Edge Function

1. Install Supabase CLI (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the Edge Function:
   ```bash
   supabase functions deploy auto-generate-compliances
   ```

### Step 2: Set Up Cron Schedule in Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → **Cron Jobs** (or **Database** → **Cron**)
3. Click **Create New Cron Job** or **Add Schedule**
4. Configure:
   - **Name**: `auto-generate-compliances-daily`
   - **Schedule**: `0 2 * * *` (runs daily at 2 AM UTC)
   - **Function**: `auto-generate-compliances`
   - **Method**: `POST`
   - **Enabled**: ✅

5. Save the cron job

### Step 3: Test

1. Go to **Edge Functions** → **auto-generate-compliances**
2. Click **Invoke** to test manually
3. Check the response - it should show how many periods were generated

---

## Option 3: External Cron Service (Most Flexible)

If you prefer using an external service like GitHub Actions, Vercel Cron, or a traditional cron server:

### Using GitHub Actions

Create `.github/workflows/auto-generate-compliances.yml`:

```yaml
name: Auto-Generate Recurring Compliances

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            'https://${{ secrets.SUPABASE_PROJECT_REF }}.supabase.co/functions/v1/auto-generate-compliances' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}' \
            -H 'Content-Type: application/json'
```

### Using Vercel Cron

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/auto-generate-compliances",
    "schedule": "0 2 * * *"
  }]
}
```

Then create `app/api/cron/auto-generate-compliances/route.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('auto_generate_recurring_compliances', {
    p_min_months_ahead: 6,
    p_generate_months_ahead: 12
  })

  return Response.json({ success: !error, data, error })
}
```

---

## Schedule Options

Common cron schedules (UTC timezone):

| Schedule | Description |
|----------|-------------|
| `0 2 * * *` | Daily at 2 AM UTC (recommended) |
| `0 0 * * *` | Daily at midnight UTC |
| `0 2 * * 1` | Weekly on Monday at 2 AM UTC |
| `0 */6 * * *` | Every 6 hours |
| `0 2 1 * *` | Monthly on the 1st at 2 AM UTC |

**Note**: Adjust for your timezone. For example, if you're in IST (UTC+5:30) and want it to run at 2 AM IST, use `0 20 * * *` (8:30 PM previous day UTC).

---

## Monitoring & Verification

### Check Function Execution

1. **Supabase Dashboard**: Edge Functions → auto-generate-compliances → Logs
2. **Database Query**:
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

### Manual Testing

Test the function manually:
```sql
-- Test the RPC function directly
SELECT * FROM public.auto_generate_recurring_compliances(6, 12);
```

Or via Edge Function:
```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-compliances' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

---

## Troubleshooting

### Function not running?

1. **Check if cron job exists**:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%auto-generate%';
   ```

2. **Check cron execution history**:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-generate-recurring-compliances-daily')
   ORDER BY start_time DESC 
   LIMIT 10;
   ```

3. **Check Edge Function logs** in Supabase Dashboard

4. **Verify RPC function exists**:
   ```sql
   SELECT proname, prosrc 
   FROM pg_proc 
   WHERE proname = 'auto_generate_recurring_compliances';
   ```

### Function running but not generating?

1. Check if companies have recurring compliances:
   ```sql
   SELECT COUNT(*) 
   FROM regulatory_requirements 
   WHERE compliance_type IN ('monthly', 'quarterly', 'annual');
   ```

2. Check if companies already have enough future periods:
   ```sql
   SELECT c.name, MAX(rr.due_date) as max_date
   FROM companies c
   LEFT JOIN regulatory_requirements rr ON c.id = rr.company_id
   WHERE rr.compliance_type IN ('monthly', 'quarterly', 'annual')
   GROUP BY c.id, c.name;
   ```

---

## Recommended Setup

For production, I recommend:

1. **Use Option 1 (Supabase Dashboard)** - Easiest to manage
2. **Schedule**: Daily at 2 AM UTC (or adjust for your timezone)
3. **Monitor**: Check logs weekly to ensure it's running
4. **Backup**: The trigger (from auto-generate-recurring-compliances.sql) will also auto-generate when compliances are completed, providing redundancy

This ensures your system always has future compliance periods generated automatically! 🚀
