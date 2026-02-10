# Resend Email Setup

## Required environment variables

- `RESEND_API_KEY`: Resend API key (do not commit).
- `RESEND_FROM`: Verified sender (example: `Finacra <noreply@yourdomain.com>`).
- `NEXT_PUBLIC_SITE_URL`: Production site URL (example: `https://comptracker.vercel.app`).

## Security note

If a Resend key was shared in chat/logs, assume it is compromised and **rotate it** in Resend immediately.

## Supabase scheduler note (reminders)

This repo includes a Supabase Edge Function at `supabase/functions/send-compliance-reminders`.

- Deploy the function to Supabase.
- Create a **Scheduled Edge Function** to run it daily (UTC) from the Supabase dashboard.

