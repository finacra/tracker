# Troubleshooting Payment Errors

## Error: "Failed to create order" (500 Internal Server Error)

### Common Causes & Solutions

#### 1. Database Tables Not Created

**Symptom**: Error when trying to store payment record

**Solution**: Run the database schema
1. Go to Supabase Dashboard > SQL Editor
2. Copy and paste contents of `schema-subscriptions.sql`
3. Click "Run"
4. Verify tables exist: `subscriptions` and `payments`

#### 2. Missing Razorpay Credentials

**Symptom**: "Razorpay credentials not configured" error

**Solution**: Check `.env.local` has:
```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx  # or rzp_live_xxxxx
RAZORPAY_KEY_SECRET=your_secret_here
```

**Note**: For testing, use test keys (start with `rzp_test_`). Live keys (`rzp_live_`) will charge real money.

#### 3. Wrong Razorpay Key Type

**Symptom**: Razorpay API errors

**Solution**: 
- For local testing: Use **Test Keys** from Razorpay Dashboard > Settings > API Keys > Test Mode
- Test keys start with `rzp_test_`
- Live keys start with `rzp_live_` (only for production)

#### 4. Database RLS Policy Issues

**Symptom**: "permission denied" or "new row violates row-level security policy"

**Solution**: Verify RLS policies are created correctly in `schema-subscriptions.sql`

#### 5. Check Server Logs

Look at the terminal where `npm run dev` is running for detailed error messages.

### Debugging Steps

1. **Check Environment Variables**:
   ```powershell
   # In your project directory
   Get-Content .env.local | Select-String "RAZORPAY"
   ```

2. **Check Database Tables**:
   - Go to Supabase Dashboard > Table Editor
   - Verify `payments` and `subscriptions` tables exist

3. **Check Server Logs**:
   - Look at terminal running `npm run dev`
   - Check for detailed error messages

4. **Test Razorpay Connection**:
   - Verify keys are correct in Razorpay Dashboard
   - Make sure you're using test keys for testing

### Quick Fix Checklist

- [ ] Database schema run (`schema-subscriptions.sql`)
- [ ] `.env.local` has `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- [ ] `.env.local` has `RAZORPAY_KEY_SECRET`
- [ ] Using test keys for testing (not live keys)
- [ ] Restart dev server after changing `.env.local`
- [ ] Check server terminal for detailed errors
