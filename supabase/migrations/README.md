# Database Migrations

This folder contains database migration scripts that modify the database schema or data structure.

## Usage

These migrations should be run in order when setting up a new environment or applying updates. Always test migrations in a development environment before applying to production.

## Migration Files

- `create_kpi_metrics_table.sql` - Creates KPI metrics tracking table
- `migration-add-*.sql` - Various migrations adding new features/columns
- `migration-create-*.sql` - Migrations creating new tables
- `migration-fix-*.sql` - Migrations fixing data issues
- `migration-restore-*.sql` - Migrations restoring data from backups
- `migration-vault-to-document-templates.sql` - Migration from vault to document templates

## Best Practices

1. Always backup your database before running migrations
2. Test migrations in development first
3. Run migrations in a transaction when possible
4. Document any breaking changes
