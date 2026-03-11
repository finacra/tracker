# Fix HTTP 431 Error (Request Header Fields Too Large)

## What is HTTP 431?
HTTP 431 means "Request Header Fields Too Large" - your browser is sending too many or too large cookies/headers to the server.

## Quick Fix (Recommended)

### Option 1: Clear Cookies for localhost (Easiest)
1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. In the left sidebar, click **Cookies** → `http://localhost:3000`
4. Select all cookies and delete them
5. Refresh the page

### Option 2: Clear All Site Data
1. Click the lock icon (or info icon) in the address bar
2. Click **Cookies and site data**
3. Click **Remove** or **Clear data**
4. Refresh the page

### Option 3: Use Incognito Mode
- Open an incognito window (Ctrl+Shift+N)
- Navigate to `http://localhost:3000`
- This will use a clean session without accumulated cookies

## Why This Happens

The issue occurs when:
- Too many cookies are stored for localhost
- Session cookies have grown too large
- Authentication tokens are accumulating
- Multiple login sessions are stored

## Prevention

If this keeps happening, you may need to:
1. Increase the header size limit in Next.js (see next.config.js)
2. Reduce cookie sizes
3. Implement cookie cleanup logic

## Technical Details

The default header size limit is typically 8KB. If your cookies exceed this, you'll get HTTP 431.
