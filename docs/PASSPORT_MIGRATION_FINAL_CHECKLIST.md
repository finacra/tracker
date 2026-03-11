# Passport Migration - Final Pre-Migration Checklist

**Date:** Current  
**Status:** Pre-Migration Verification

---

## ✅ Completed Prerequisites

### 1. Database & Infrastructure ✅
- [x] Database connection verified and stable
- [x] `app_users` table exists
- [x] `auth_identities` table exists
- [x] Prisma schema synced
- [x] Repository can query identity tables

### 2. Code Architecture ✅
- [x] All server actions use `AuthService` (canonical user resolution)
- [x] All API routes use `AuthService`
- [x] Zero direct Supabase auth in feature code
- [x] All auth interfaces exist (`SessionProvider`, `AuthGateway`, `MiddlewareAuthCheck`, `ClientAuthAdapter`)
- [x] All repositories have Prisma implementations
- [x] Composition root properly configured

### 3. Identity System ✅
- [x] Schema supports Passport (`provider IN ('supabase', 'passport')`)
- [x] Backfill script available
- [x] `PrismaUserRepository` implements `getByLegacyAuthIdentity()`

---

## ⚠️ Pre-Migration Actions (Optional but Recommended)

### 1. Verify Backfill Status

**Run verification script:**
```bash
node scripts/verify-backfill-status.js
```

**Expected output:**
- `app_users` table should have rows (one per active user)
- `auth_identities` table should have rows (one per Supabase user)
- Supabase identities should match active users

**If backfill not run:**
- Run `supabase/scripts/backfill-app-identity-from-supabase.sql` in Supabase SQL Editor
- Re-run verification script

---

### 2. Install Passport Dependencies

**Required packages:**
```bash
npm install passport passport-google-oauth20 passport-local express-session
npm install --save-dev @types/passport @types/passport-google-oauth20 @types/passport-local @types/express-session
```

**Note:** For Next.js App Router, you may also need:
- `next-connect` or custom API route handlers
- Session storage solution (Redis, database, or encrypted cookies)

---

### 3. Environment Variables

**Add to `.env.local`:**
```env
# Passport OAuth (Google)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your_session_secret_here

# Passport Callback URL
NEXT_PUBLIC_PASSPORT_CALLBACK_URL=http://localhost:3000/auth/callback
```

---

### 4. Test Current Auth Flows

**Before migration, verify:**
- [ ] Login with Google OAuth works
- [ ] Login with email/password works
- [ ] Sign up flow works
- [ ] Password reset works
- [ ] Session persistence works (survives page refresh)
- [ ] Logout works
- [ ] Protected routes redirect correctly
- [ ] All server actions work
- [ ] All API routes work

**If any flows are broken, fix them before migration.**

---

## 🚀 Ready to Start Migration

### Checklist Before Starting:

- [x] Database connection stable ✅
- [x] Identity tables exist ✅
- [x] Prisma schema synced ✅
- [x] Code architecture ready ✅
- [x] **Backfill verified** ✅ (21 users, 21 identities - all linked correctly)
- [ ] **Passport packages installed** (run `npm install passport ...`)
- [ ] **Environment variables configured** (add to `.env.local`)
- [ ] **Current auth flows tested** (verify everything works)

---

## Migration Execution Order

Once all pre-migration items are complete:

1. **Install Passport packages** (if not done)
2. **Implement Passport adapters** (Phase 2 from deep analysis)
3. **Update composition root** (Phase 3)
4. **Migrate entry points** (Phase 4 - login/callback)
5. **Test thoroughly** (Phase 6)

**See `PASSPORT_MIGRATION_READINESS_DEEP_ANALYSIS.md` for detailed execution plan.**

---

## Quick Start Commands

```bash
# 1. Verify backfill
node scripts/verify-backfill-status.js

# 2. Install Passport
npm install passport passport-google-oauth20 passport-local express-session
npm install --save-dev @types/passport @types/passport-google-oauth20 @types/passport-local @types/express-session

# 3. Generate session secret
openssl rand -base64 32

# 4. Add to .env.local (see Environment Variables section above)

# 5. Start migration implementation
```

---

## Final Verdict

**Status:** ✅ **READY** (3 quick steps remaining)

**Critical prerequisites:** ✅ All met  
**Backfill status:** ✅ Verified (21 users, 21 identities - all linked)

**Remaining steps:** 
1. ✅ ~~Verify backfill~~ **DONE** (21 users, 21 identities)
2. ⚠️ Install Passport packages (`npm install passport ...`)
3. ⚠️ Configure environment variables (add to `.env.local`)
4. ⚠️ Test current auth flows (optional but recommended)

**Then proceed with migration!**

---

**You're almost there! Just verify backfill and install packages, then you can start the migration. 🚀**
