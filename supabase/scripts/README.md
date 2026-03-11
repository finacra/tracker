# Utility Scripts

This folder contains utility SQL scripts for various database operations, data population, and maintenance tasks.

## Usage

These scripts are used for setup, data generation, synchronization, and other utility operations.

## Script Categories

### Setup Scripts
- `setup-cron-job.sql` - Sets up cron jobs
- `setup-trial-refund-cron*.sql` - Sets up trial refund cron jobs

### Data Generation
- `generate-recurring-compliances*.sql` - Generates recurring compliance records
- `auto-generate-recurring-compliances.sql` - Auto-generation of compliances
- `populate-compliance-templates.sql` - Populates compliance templates

### Data Synchronization
- `sync-required-documents.sql` - Syncs required documents
- `apply-all-templates.sql` - Applies all templates
- `backfill-app-identity-from-supabase.sql` - Backfills canonical app users and provider identities from Supabase Auth

### Data Updates
- `update-penalties-from-csv.sql` - Updates penalties from CSV
- `update-penalty-to-numbers.sql` - Converts penalties to numeric format
- `add-missing-roc-compliances.sql` - Adds missing ROC compliances

### Automation
- `auto-apply-templates-trigger.sql` - Trigger for auto-applying templates
- `auto-update-overdue-status.sql` - Auto-updates overdue status

### Table Creation
- `create-document-templates-table.sql` - Creates document templates table

### Utilities
- `make-user-superadmin.sql` - Grants superadmin role to a user
- `diagnose-subscription-violations.sql` - Diagnoses subscription constraint violations

## Best Practices

1. Review scripts before running to understand their impact
2. Some scripts may modify data - backup first
3. Check if scripts are idempotent (safe to run multiple times)
4. Use appropriate scripts for your environment (dev vs prod)
