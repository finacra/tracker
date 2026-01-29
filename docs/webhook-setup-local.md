# Setting Up Razorpay Webhooks for Local Development

## Overview

Razorpay webhooks require a publicly accessible URL to send payment events. For local development, you need to expose your local server to the internet.

## Option 1: Using ngrok (Recommended)

### Step 1: Install ngrok

1. Download ngrok from [https://ngrok.com/download](https://ngrok.com/download)
2. Extract and add to your PATH, or use the executable directly

### Step 2: Start Your Local Server

```bash
npm run dev
# Server runs on http://localhost:3000
```

### Step 3: Start ngrok Tunnel

In a new terminal:

```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123def456.ngrok.io -> http://localhost:3000
```

### Step 4: Configure Razorpay Webhook

1. Go to Razorpay Dashboard > Settings > Webhooks
2. Click "Add New Webhook"
3. Enter webhook URL: `https://abc123def456.ngrok.io/api/payments/webhook`
4. Select events:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
5. Copy the webhook secret and add to `.env.local`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### Step 5: Test Webhook

1. Make a test payment
2. Check ngrok web interface: `http://127.0.0.1:4040` to see incoming requests
3. Check your server logs for webhook processing

## Option 2: Using Cloudflare Tunnel (Alternative)

```bash
# Install cloudflared
cloudflared tunnel --url http://localhost:3000
```

## Option 3: Using Razorpay Webhook Testing Tool

For quick testing without setting up tunnels:

1. Go to Razorpay Dashboard > Settings > Webhooks
2. Click on your webhook
3. Use "Send Test Webhook" feature
4. Manually trigger webhook events for testing

**Note**: This doesn't work for real payments, only for testing webhook handling logic.

## Option 4: Skip Webhooks for Local Development

For local development, you can rely on frontend payment verification:

- Payments are verified in `PaymentButton` component after user completes payment
- Webhooks are optional but recommended for production reliability
- Without webhooks, you won't receive automatic payment status updates

## Important Notes

1. **ngrok URLs change**: Free ngrok URLs change on restart. Update Razorpay webhook URL each time.
2. **ngrok Pro**: Consider ngrok Pro for static URLs if testing frequently
3. **Webhook Secret**: Always verify webhook signatures in production
4. **HTTPS Required**: Razorpay only sends webhooks to HTTPS URLs (ngrok provides this)

## Testing Webhook Locally

### Test Payment Flow

1. Start local server: `npm run dev`
2. Start ngrok: `ngrok http 3000`
3. Update Razorpay webhook URL
4. Make a test payment using Razorpay test cards
5. Check ngrok inspector: `http://127.0.0.1:4040`
6. Verify webhook is received and processed

### Test Cards

- **Success**: `4111 1111 1111 1111`
- **Failure**: `4000 0000 0000 0002`
- **3D Secure**: `4012 0010 3714 1112`

## Troubleshooting

### Webhook Not Received

1. Check ngrok is running and forwarding correctly
2. Verify webhook URL in Razorpay dashboard matches ngrok URL
3. Check webhook events are enabled
4. Verify webhook secret matches

### Signature Verification Failed

1. Ensure `RAZORPAY_WEBHOOK_SECRET` matches Razorpay dashboard
2. Check webhook payload is not modified
3. Verify signature calculation logic

### Webhook Received But Not Processed

1. Check server logs for errors
2. Verify database connection
3. Check RLS policies allow webhook updates
4. Ensure webhook handler logic is correct
