# Database Schemas

This folder contains SQL schema definitions for creating database tables and structures.

## Usage

These schema files define the structure of various database components. They are typically run during initial database setup.

## Schema Files

- `schema-tracker-v2.sql` - Main compliance tracker schema
- `schema-tracker-rbac.sql` - Role-based access control schema
- `schema-app-identity.sql` - App-owned canonical user identity and provider mapping
- `schema-subscriptions*.sql` - Various subscription-related schemas
- `schema-compliance-vault.sql` - Compliance vault schema
- `schema-email-*.sql` - Email-related schemas (batch queue, cron schedule, preferences, logs)
- `schema-global-countries.sql` - Global countries configuration
- `schema-admin-helpers.sql` - Admin helper functions
- `schema-team-invitations.sql` - Team invitation system
- `schema-contact-submissions.sql` - Contact form submissions
- `schema-legal-research-cache.sql` - Legal research caching

## Best Practices

1. Review schema files before applying to understand dependencies
2. Some schemas may depend on others - check for dependencies
3. Use these for initial setup or reference when creating new environments
