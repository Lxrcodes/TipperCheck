-- Per-user notification preferences
-- Managers control which email notifications they receive and at what address

CREATE TABLE notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  notify_email text,                           -- NULL = use users.email
  notify_critical_defect boolean NOT NULL DEFAULT true,
  notify_job_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own settings
CREATE POLICY "Users manage own notification settings"
  ON notification_settings
  FOR ALL
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );
