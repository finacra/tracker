-- Create kpi_metrics table for tracking KPI metrics
CREATE TABLE IF NOT EXISTS kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_name TEXT NOT NULL,
  category TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  metric_value NUMERIC NOT NULL,
  metric_data JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_kpi_name ON kpi_metrics(kpi_name);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_category ON kpi_metrics(category);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_user_id ON kpi_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_company_id ON kpi_metrics(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_recorded_at ON kpi_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_category_kpi ON kpi_metrics(category, kpi_name);

-- Enable Row Level Security
ALTER TABLE kpi_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmins can view all metrics
CREATE POLICY "Superadmins can view all kpi_metrics"
  ON kpi_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'superadmin'
      AND user_roles.company_id IS NULL
    )
  );

-- Policy: Users can view their own metrics
CREATE POLICY "Users can view their own kpi_metrics"
  ON kpi_metrics
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Service role can insert metrics (for server-side tracking)
CREATE POLICY "Service role can insert kpi_metrics"
  ON kpi_metrics
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update metrics
CREATE POLICY "Service role can update kpi_metrics"
  ON kpi_metrics
  FOR UPDATE
  USING (true);
