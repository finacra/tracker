# Razorpay Payment Integration Guide

## Overview

This document describes the Razorpay payment integration for Finnovate AI subscription management.

## Architecture

### Components

1. **Database Schema** (`schema-subscriptions.sql`)
   - `subscriptions` table: Stores user subscriptions
   - `payments` table: Stores payment transactions
   - RLS policies for data security

2. **API Routes**
   - `/api/payments/create-order`: Creates Razorpay order
   - `/api/payments/verify`: Verifies payment signature
   - `/api/payments/webhook`: Handles Razorpay webhooks

3. **Client Components**
   - `PaymentButton`: Reusable payment button component
   - `PricingTiers`: Updated with payment integration

4. **Utilities**
   - `lib/razorpay/`: Razorpay configuration and client
   - `lib/subscriptions/`: Subscription management utilities
   - `hooks/useSubscription`: React hook for subscription state

## Setup Instructions

### 1. Environment Variables

Add to `.env.local`:
```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

### 2. Database Setup

Run `schema-subscriptions.sql` in Supabase SQL Editor to create:
- `subscriptions` table
- `payments` table
- RLS policies
- Helper functions

### 3. Razorpay Dashboard Configuration

1. **API Keys**: Get from Settings > API Keys
2. **Webhooks**: Configure webhook URL:
   - **Production**: `https://yourdomain.com/api/payments/webhook`
   - **Local Development**: Use ngrok or similar tunneling service:
     ```bash
     # Install ngrok: https://ngrok.com/download
     ngrok http 3000
     # Use the HTTPS URL provided, e.g.:
     # https://abc123.ngrok.io/api/payments/webhook
     ```
   - **Alternative**: Use Razorpay's webhook testing tool for testing
3. **Webhook Events**: Enable:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`

## Payment Flow

1. **User clicks "Subscribe"** on pricing page
2. **Frontend** calls `/api/payments/create-order`
3. **Backend** creates Razorpay order and stores payment record
4. **Razorpay Checkout** opens with order details
5. **User completes payment** in Razorpay modal
6. **Frontend** calls `/api/payments/verify` with payment response
7. **Backend** verifies signature and creates/updates subscription
8. **Webhook** (optional) confirms payment status

## Usage Examples

### Using PaymentButton Component

```tsx
import PaymentButton from '@/components/PaymentButton'

<PaymentButton
  tier="professional"
  billingCycle="annual"
  price={76800}
  companyId={companyId}
/>
```

### Checking Subscription Status

```tsx
import { useSubscription } from '@/hooks/useSubscription'

function MyComponent() {
  const { subscription, hasActiveSubscription, tier } = useSubscription()
  
  if (hasActiveSubscription) {
    return <div>You have an active {tier} subscription</div>
  }
  
  return <div>No active subscription</div>
}
```

## Security Considerations

1. **Signature Verification**: All payments are verified using HMAC SHA256
2. **RLS Policies**: Database access restricted to user's own data
3. **Server-side Processing**: Sensitive operations only on server
4. **Webhook Verification**: Webhook signatures verified before processing

## Testing

### Test Mode

1. Use Razorpay test keys
2. Test cards: https://razorpay.com/docs/payments/test-cards/
3. Test webhook: Use Razorpay webhook testing tool

### Test Cards

- Success: `4111 1111 1111 1111`
- Failure: `4000 0000 0000 0002`
- 3D Secure: `4012 0010 3714 1112`

## Troubleshooting

### Payment Not Processing
- Check Razorpay keys are correct
- Verify webhook URL is accessible
- Check browser console for errors

### Subscription Not Created
- Check database connection
- Verify RLS policies allow insert
- Check server logs for errors

### Webhook Not Working
- Verify webhook secret matches
- Check webhook URL is publicly accessible
- Verify signature verification logic

## Next Steps

- [ ] Implement subscription renewal
- [ ] Add subscription cancellation UI
- [ ] Implement usage limits based on tier
- [ ] Add subscription upgrade/downgrade flow
- [ ] Create subscription management page
