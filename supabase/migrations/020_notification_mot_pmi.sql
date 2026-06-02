-- Add MOT and PMI due-date reminder preferences to notification_settings

ALTER TABLE notification_settings
  ADD COLUMN notify_mot_due boolean NOT NULL DEFAULT true,
  ADD COLUMN mot_reminder_days integer NOT NULL DEFAULT 30,
  ADD COLUMN notify_pmi_due boolean NOT NULL DEFAULT true,
  ADD COLUMN pmi_reminder_days integer NOT NULL DEFAULT 14;
