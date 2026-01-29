# Finnovate AI

A modern financial compliance management application built with Next.js 16.

## Features

- Google OAuth authentication via Supabase
- CIN/DIN verification and auto-fill
- Modern, clean UI with dark theme and orange accents
- Responsive design
- Subscription management with Razorpay payments
- Tiered pricing (Starter, Professional, Enterprise)
- Multiple billing cycles (Monthly, Quarterly, Half-yearly, Annual)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project
- Google Cloud Platform project with OAuth credentials

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
Create a `.env.local` file in the root directory with:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
KYC_API_TOKEN_ID=EE3DAIZZ
KYC_API_TOKEN_SECRET=PLZ3FSYY67DS

# Razorpay Configuration
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

3. Configure Supabase:
   - Go to your [Supabase Dashboard](https://app.supabase.com/)
   - Navigate to Authentication > Providers
   - Enable Google provider
   - Add your Google OAuth Client ID and Client Secret
   - Add redirect URL: `http://localhost:3000/auth/callback` (for local development)
   - Add production redirect URL: `https://yourdomain.com/auth/callback`

4. Configure Google OAuth:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Go to Credentials and create OAuth 2.0 Client ID
   - Under Authorized JavaScript origins, add:
     - `http://localhost:3000` (for local development)
     - Your production domain
     - Your Supabase project URL: `https://<your-project-ref>.supabase.co`
   - Under Authorized redirect URIs, add:
     - **IMPORTANT**: Add your Supabase callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     - For local development, also add: `http://localhost:3000/auth/v1/callback` (if using Supabase local)
     - **DO NOT** add `http://localhost:3000/auth/callback` - that's your app's callback, not Google's
   - Copy the Client ID and Client Secret to Supabase Dashboard

5. Run the development server:
```bash
npm run dev
```

6. Set up Razorpay:
   - Create a Razorpay account at [https://razorpay.com](https://razorpay.com)
   - Get your Key ID and Key Secret from Razorpay Dashboard > Settings > API Keys
   - Add them to your `.env.local` file
   - **For Local Development**: Use ngrok to expose local server:
     ```bash
     ngrok http 3000
     # Use the HTTPS URL: https://your-ngrok-url.ngrok.io/api/payments/webhook
     ```
   - **For Production**: Set up webhook URL: `https://yourdomain.com/api/payments/webhook`
   - Get webhook secret from Razorpay Dashboard > Settings > Webhooks
   - See `docs/webhook-setup-local.md` for detailed webhook setup guide

7. Set up database:
   - Run the SQL schema files in your Supabase SQL Editor:
     - `schema-tracker-rbac.sql` (if not already run)
     - `schema-subscriptions.sql` (for payment/subscription tables)

8. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Supabase Auth
- React 19
