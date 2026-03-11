# Fixing Prisma Database Connection Issues

## Current Error
```
FATAL: Circuit breaker open: Too many authentication errors
```

## Root Cause
The Supabase connection pooler has temporarily blocked connections due to too many failed authentication attempts. This happens when:
1. The database password in the connection string is incorrect
2. The connection string format is malformed
3. Special characters in the password aren't properly encoded

## Solution Steps

### Step 1: Get the Correct Connection String from Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll down to **Connection string** section
5. Select **Connection pooling** tab
6. Copy the **URI** connection string (it should look like):
   ```
   postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
7. Also copy the **Direct connection** string for `DIRECT_URL`

### Step 2: Update `.env.local`

Replace the `DATABASE_URL` and `DIRECT_URL` in your `.env.local` file with the strings from Supabase Dashboard.

**Important Notes:**
- If the password contains special characters (`$`, `@`, `#`, etc.), they should be **URL-encoded**:
  - `$` → `%24`
  - `@` → `%40`
  - `#` → `%23`
  - `%` → `%25`
  - etc.
- The connection string must be on a **single line** (no line breaks)
- Keep the quotes around the connection string

**Example:**
```env
DATABASE_URL="postgresql://postgres.abc123:MyP@ssw0rd%24@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abc123:MyP@ssw0rd%24@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
```

### Step 3: Wait for Circuit Breaker to Reset

The Supabase connection pooler has a circuit breaker that opens after too many failed attempts. You need to:

1. **Wait 1-2 minutes** for the circuit breaker to automatically reset
2. Or **restart your Supabase project** (if possible) to immediately reset it

### Step 4: Restart Your Dev Server

After updating the connection strings:

1. Stop the current dev server (Ctrl+C)
2. Restart it: `npm run dev`
3. The Prisma connection should now work

## Verifying the Fix

Once the server restarts, check the terminal for:
- ✅ No Prisma connection errors
- ✅ `/api/auth/profile` returns 200 instead of 500
- ✅ No "Circuit breaker open" errors

## Alternative: Use Direct Connection (Temporary)

If the connection pooler continues to have issues, you can temporarily use the direct connection for both URLs:

```env
DATABASE_URL="postgresql://postgres.abc123:MyP@ssw0rd%24@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.abc123:MyP@ssw0rd%24@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
```

**Note:** Direct connections don't use connection pooling, so they may be slower and have connection limits.

## Password Encoding Reference

Common special characters and their URL encodings:
- `$` → `%24`
- `@` → `%40`
- `#` → `%23`
- `%` → `%25`
- `&` → `%26`
- `+` → `%2B`
- `=` → `%3D`
- `?` → `%3F`
- `/` → `%2F`
- `:` → `%3A`
- ` ` (space) → `%20`

## Quick Test

To test if your connection string is correct, you can use `psql` or Prisma Studio:

```bash
# Test with Prisma Studio (if connection works)
npx prisma studio
```

If Prisma Studio connects successfully, your connection string is correct.
