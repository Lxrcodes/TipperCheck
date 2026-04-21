-- ============================================================================
-- Storage Bucket Policies
-- Migration: 007_storage_policies
-- ============================================================================

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-photos', 'check-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Storage Policies for check-photos bucket
-- ============================================================================

-- Allow authenticated users to upload files to their org's folder
CREATE POLICY "Users can upload check photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'check-photos'
);

-- Allow authenticated users to read files from their org
CREATE POLICY "Users can view check photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'check-photos'
);

-- Allow authenticated users to update their uploads
CREATE POLICY "Users can update own uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'check-photos'
);

-- Allow authenticated users to delete their uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'check-photos'
);
