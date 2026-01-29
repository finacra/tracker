# Setting Up ngrok Authtoken

## Step-by-Step Guide

### Step 1: Sign Up for ngrok Account

1. Go to: https://dashboard.ngrok.com/signup
2. Sign up with your email (free account is fine)
3. Verify your email

### Step 2: Get Your Authtoken

1. After signing up, go to: https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your authtoken (it looks like: `2abc123def456ghi789jkl012mno345pq_6r7s8t9u0v1w2x3y4z5`)

### Step 3: Configure ngrok with Authtoken

**If using npx:**
```powershell
npx ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

**If ngrok is installed:**
```powershell
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

Replace `YOUR_AUTHTOKEN_HERE` with your actual authtoken from Step 2.

### Step 4: Verify Setup

After adding authtoken, try:
```powershell
ngrok http 3000
```

You should see ngrok start successfully without authentication errors.

### Step 5: Get Your Webhook URL

Once ngrok is running, you'll see:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Important**: The URL `https://abc123.ngrok.io/api/payments/webhook` is NOT a command to run. 
It's the URL you need to **paste into Razorpay Dashboard** webhook settings.

### Step 6: Configure Razorpay Webhook

1. Go to: https://dashboard.razorpay.com/app/webhooks
2. Click "Add New Webhook" or edit existing
3. **Paste** the URL: `https://abc123.ngrok.io/api/payments/webhook`
   - Replace `abc123.ngrok.io` with YOUR actual ngrok URL
4. Select events:
   - ✅ payment.captured
   - ✅ payment.failed
   - ✅ order.paid
5. Click "Create Webhook"
6. Copy the "Webhook Secret" (starts with `whsec_`)
7. Add to your `.env.local`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## Quick Command Reference

```powershell
# 1. Navigate to project
cd "C:\Users\camun\Documents\finnovate tracker"

# 2. Add authtoken (one time setup)
npx ngrok config add-authtoken YOUR_AUTHTOKEN

# 3. Start dev server (Terminal 1)
npm run dev

# 4. Start ngrok tunnel (Terminal 2)
npx ngrok http 3000

# 5. Copy the HTTPS URL and paste into Razorpay webhook settings
```

## Troubleshooting

### "authtoken command not found"
- Make sure you're using `npx ngrok` or have ngrok installed
- Try: `npx ngrok config add-authtoken YOUR_TOKEN`

### "Invalid authtoken"
- Double-check you copied the entire token
- Make sure there are no extra spaces
- Get a fresh token from ngrok dashboard

### Webhook URL not working
- Make sure ngrok is running
- Verify the URL format: `https://your-url.ngrok.io/api/payments/webhook`
- Check that your dev server is running on port 3000
