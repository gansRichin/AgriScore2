-- Выполни этот SQL в Supabase: Dashboard → SQL Editor
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_score float4 DEFAULT NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_verdict text DEFAULT NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_is_anomaly bool DEFAULT NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_shap jsonb DEFAULT NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_recommendation text DEFAULT NULL;
