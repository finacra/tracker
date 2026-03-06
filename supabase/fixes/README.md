# Database Fix Scripts

This folder contains SQL scripts used to fix specific issues or bugs in the database.

## Usage

These scripts are typically run to resolve specific problems. Use with caution and always backup your database first.

## Fix Scripts

- `CRITICAL-FIX-*.sql` - Critical fixes for urgent issues
- `fix-*.sql` - General fix scripts for various issues
- `FIX-*.sql` - Fix scripts for specific components
- `DEBUG-*.sql` - Debugging scripts
- `TEST-*.sql` - Testing scripts
- `verify-fix.sql` - Verification scripts

## Categories

- **RLS (Row Level Security) Fixes**: `fix-rls-recursion*.sql`, `FIX-COMPANIES-RLS-POLICY.sql`
- **Subscription Fixes**: `fix-subscription-constraint-violation*.sql`
- **Penalty Fixes**: `fix-all-penalties-comprehensive.sql`, `fix-remaining-penalties.sql`
- **Template Fixes**: `fix-template-matching.sql`, `fix-entity-type-matching.sql`
- **Team Member Fixes**: `CRITICAL-FIX-TEAM-MEMBER-INSERT.sql`, `DEBUG-TEAM-MEMBER-ISSUE.sql`
- **RPC Fixes**: `FIX-RPC-FUNCTION.sql`

## Best Practices

1. **Always backup before running fix scripts**
2. Review the script to understand what it does
3. Test in development first
4. Some fixes may be one-time only - check if they've already been applied
5. Document when and why a fix was applied
