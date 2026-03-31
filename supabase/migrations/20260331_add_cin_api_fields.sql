-- Add CIN API fields to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS authorised_capital DECIMAL(15,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paid_up_capital DECIMAL(15,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscribed_capital DECIMAL(15,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_category TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_subcategory TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS class_of_company TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS roc_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_status TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS date_of_last_agm DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS balance_sheet_date DATE;
