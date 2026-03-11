# Final Connection Fix - Critical Steps

## Current Status
- ✅ Network connectivity: Ports 6543 and 5432 are reachable
- ✅ Connection string format: Appears correct
- ❌ Prisma connection: Still failing ("Can't reach database server")

## Root Cause

The error "Can't reach database server" (not "Circuit breaker open") suggests:
1. **Supabase project might still be starting** after restart (can take 2-5 minutes)
2. **Connection string might not match Dashboard exactly**
3. **Password might need different encoding**

## CRITICAL: Get Fresh Connection Strings

**You MUST copy the connection strings directly from Supabase Dashboard:**

### Steps:
1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project: `aqziojkjtmyecfglifbc`
3. Go to **Settings** → **Database**
4. Scroll to **Connection string** section
5. **Connection pooling** tab:
   - Click the **URI** connection string
   - Copy it EXACTLY (including password)
   - This goes in `DATABASE_URL`
6. **Direct connection** tab:
   - Click the **URI** connection string  
   - Copy it EXACTLY (including password)
   - This goes in `DIRECT_URL`

### Update .env Files

Replace the connection strings in both `.env` and `.env.local` with the EXACT strings from Dashboard:

```env
DATABASE_URL="[PASTE EXACT STRING FROM DASHBOARD - Connection pooling]"
DIRECT_URL="[PASTE EXACT STRING FROM DASHBOARD - Direct connection]"
```

**Important:**
- Copy EXACTLY as shown (don't modify anything)
- Supabase Dashboard already has password properly encoded
- Ensure both are on single lines (no line breaks)

## After Updating

1. **Wait 2-3 minutes** (if project just restarted)
2. **Test connection**: `node scripts/test-connection-simple.js`
3. **If successful**: Restart dev server: `npm run dev`

## Verification

The connection string from Dashboard should look like:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Note:** The password in the Dashboard connection string is already URL-encoded if needed. Don't modify it.

## If Still Failing

1. **Check Supabase project status**:
   - Dashboard should show project as "Active" (not "Paused" or "Starting")
   - Wait 5 minutes if it shows "Starting"

2. **Verify project reference**:
   - Ensure `aqziojkjtmyecfglifbc` matches your project
   - Check region matches: `aws-1-ap-south-1`

3. **Test with Supabase client** (bypass Prisma):
   - If Supabase REST API works but Prisma doesn't, it's a Prisma connection string issue

## Expected Result

Once connection works:
```
✅ Connection successful!
✅ Tables found: app_users, auth_identities
```

Then you can:
- Restart dev server: `npm run dev`
- Run backfill script: `supabase/scripts/backfill-app-identity-from-supabase.sql`
- Test the application
