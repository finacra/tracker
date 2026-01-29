# Setting Up ngrok on Windows for Local Webhook Development

## Problem
You're getting errors because:
1. You're in the wrong directory (`C:\Windows\System32` instead of your project folder)
2. ngrok is not installed or not in your PATH

## Solution

### Step 1: Navigate to Your Project Directory

Open PowerShell or Command Prompt and run:

```powershell
cd "C:\Users\camun\Documents\finnovate tracker"
```

Verify you're in the right place:
```powershell
Get-Location
# Should show: C:\Users\camun\Documents\finnovate tracker
```

### Step 2: Install ngrok

**Option A: Using Chocolatey (Recommended)**
```powershell
# Install Chocolatey first if you don't have it: https://chocolatey.org/install
choco install ngrok
```

**Option B: Manual Installation**
1. Download ngrok from: https://ngrok.com/download
2. Extract `ngrok.exe` to a folder (e.g., `C:\ngrok`)
3. Add to PATH:
   - Right-click "This PC" > Properties > Advanced System Settings
   - Click "Environment Variables"
   - Under "System Variables", find "Path" and click "Edit"
   - Click "New" and add: `C:\ngrok` (or wherever you extracted ngrok)
   - Click OK on all dialogs
   - **Restart your terminal** for changes to take effect

**Option C: Use npx (No Installation Required)**
```powershell
npx ngrok http 3000
```

### Step 3: Set Up ngrok Authtoken

1. Sign up at https://dashboard.ngrok.com/signup (free account)
2. Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
3. Run:
```powershell
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### Step 4: Start Your Development Server

In one terminal:
```powershell
cd "C:\Users\camun\Documents\finnovate tracker"
npm run dev
```

### Step 5: Start ngrok Tunnel

In a **new terminal** (keep the dev server running):
```powershell
cd "C:\Users\camun\Documents\finnovate tracker"
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

### Step 6: Configure Razorpay Webhook

1. Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`)
2. Go to Razorpay Dashboard > Settings > Webhooks
3. Add webhook URL: `https://abc123.ngrok.io/api/payments/webhook`
4. Enable events: `payment.captured`, `payment.failed`, `order.paid`
5. Copy the webhook secret
6. Add to `.env.local`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## Quick Commands Summary

```powershell
# 1. Navigate to project
cd "C:\Users\camun\Documents\finnovate tracker"

# 2. Start dev server (Terminal 1)
npm run dev

# 3. Start ngrok (Terminal 2 - new window)
cd "C:\Users\camun\Documents\finnovate tracker"
ngrok http 3000

# 4. Use the ngrok HTTPS URL in Razorpay webhook settings
```

## Troubleshooting

### "ngrok is not recognized"
- ngrok is not installed or not in PATH
- Use `npx ngrok http 3000` as a workaround
- Or install ngrok properly (see Step 2)

### "npm run dev" fails
- Make sure you're in the project directory
- Check that `package.json` exists: `Test-Path package.json`

### ngrok URL changes every time
- This is normal for free ngrok accounts
- Update Razorpay webhook URL each time you restart ngrok
- Consider ngrok Pro for static URLs

## Alternative: Skip Webhooks for Local Testing

For local development, webhooks are optional. The payment verification happens in the frontend after payment completion. You can test payments without webhooks, but they're recommended for production.
