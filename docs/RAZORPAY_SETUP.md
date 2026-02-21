# Razorpay Configuration Guide

## Issues and Solutions

### Issue 1: Payment Blocked - "Website does not match registered website(s)"

**Error Message:**
```
Payment blocked as website does not match registered website(s)
Error Reason: payment_risk_check_failed
```

**Solution:**
1. Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Go to **Settings** → **Configuration** → **Website Settings**
3. Add your production domain (e.g., `https://finacra.com`)
4. Add your development domain if needed (e.g., `http://localhost:3000` for local testing)
5. Save the changes

**Note:** Razorpay blocks payments from domains that aren't registered in your account for security reasons.

---

### Issue 2: Webhook Missing Signature

**Error Message:**
```
Missing signature
X-Razorpay-Signature header is required
```

**Solution:**

1. **Configure Webhook Secret:**
   - Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com/)
   - Go to **Settings** → **Webhooks**
   - Find or create your webhook URL: `https://finacra.com/api/payments/webhook`
   - Click on the webhook to view/edit it
   - Copy the **Webhook Secret** (it will be shown only once when created)
   - Add it to your `.env.local` file:
     ```env
     RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
     ```

2. **Verify Webhook Events:**
   - In the webhook settings, ensure these events are enabled:
     - `payment.captured`
     - `payment.failed`
     - `order.paid`
   - Save the changes

3. **Test Webhook:**
   - In Razorpay Dashboard → Webhooks, click "Send Test Webhook"
   - Select event type: `payment.failed` or `payment.captured`
   - Check your server logs to verify the webhook is received

**Note:** Test webhooks from Razorpay dashboard may not include signatures. This is expected behavior for testing.

---

### Issue 3: Console Warnings (Non-Critical)

These warnings are from Razorpay's SDK and don't affect functionality:

- `Refused to get unsafe header "x-rtb-fingerprint-id"` - Razorpay fraud detection
- `Permissions policy violation: accelerometer` - Razorpay biometric tracking
- `Mixed Content` warnings - Razorpay loading resources

These can be safely ignored as they don't impact payment processing.

---

## Complete Razorpay Setup Checklist

- [ ] Razorpay account created
- [ ] API keys generated (Key ID and Key Secret)
- [ ] Website domains added in Settings → Configuration → Website Settings
- [ ] Webhook URL configured: `https://finacra.com/api/payments/webhook`
- [ ] Webhook secret copied and added to `.env.local`
- [ ] Webhook events enabled: `payment.captured`, `payment.failed`, `order.paid`
- [ ] Test payment completed successfully
- [ ] Webhook test sent and verified in server logs

---

## Environment Variables Required

```env
# Razorpay Configuration
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxx  # or rzp_test_xxxxx for test mode
RAZORPAY_KEY_SECRET=your_key_secret_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## Testing Payments

### Test Mode
- Use test API keys (starts with `rzp_test_`)
- Test cards: https://razorpay.com/docs/payments/test-cards/
- Test UPI: Use any UPI ID ending with `@razorpay`

### Production Mode
- Use live API keys (starts with `rzp_live_`)
- Ensure website domain is registered
- Ensure webhook secret is configured

---

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook URL is accessible (should return JSON response)
2. Verify webhook secret is correct in `.env.local`
3. Check server logs for webhook requests
4. Verify webhook events are enabled in Razorpay dashboard

### Payments Failing
1. Check if domain is registered in Razorpay dashboard
2. Verify API keys are correct
3. Check payment logs in Razorpay dashboard for specific error
4. Ensure account is activated (not in test mode if using live keys)

### Signature Verification Failing
1. Verify `RAZORPAY_WEBHOOK_SECRET` matches the secret in Razorpay dashboard
2. Ensure webhook secret hasn't been regenerated (old secret won't work)
3. Check server logs for signature comparison details

---

## Support

For Razorpay-specific issues:
- Razorpay Support: https://razorpay.com/support/
- Razorpay Docs: https://razorpay.com/docs/

For application-specific issues, check server logs and error messages.
