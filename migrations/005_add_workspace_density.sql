ALTER TABLE app_settings
ADD COLUMN workspace_density TEXT NOT NULL DEFAULT 'small'
CHECK (workspace_density IN ('small', 'medium', 'large', 'max'));
