import { supabase } from './supabaseClient';
import {
  getPendingChecks,
  deletePendingCheck,
  updatePendingCheckSyncAttempt,
  cacheTemplates,
  cacheVehicles,
} from './offlineDb';
import type { PendingCheck, SyncResult, CheckTemplate, Vehicle } from '@/types';

// ============================================================================
// Sync Manager - Handles offline/online synchronization
// ============================================================================

const MAX_SYNC_ATTEMPTS = 5;

/**
 * Sync all pending checks to the server
 */
export async function syncPendingChecks(): Promise<SyncResult> {
  console.log('Starting sync...');

  const result: SyncResult = {
    success: true,
    synced_count: 0,
    failed_count: 0,
    errors: [],
  };

  const pendingChecks = await getPendingChecks();
  console.log('Pending checks to sync:', pendingChecks.length);

  for (const check of pendingChecks) {
    console.log('Syncing check:', check.client_id);
    console.log('Check data:', JSON.stringify(check, null, 2));
    try {
      console.log('Sync attempts:', check.sync_attempts);
      // Skip if too many attempts
      if (check.sync_attempts >= MAX_SYNC_ATTEMPTS) {
        console.log('Max sync attempts reached, skipping');
        result.failed_count++;
        result.errors.push(
          `Check ${check.client_id}: Max sync attempts reached`
        );
        continue;
      }

      console.log('About to upload photos...');
      // First, upload any pending photos
      console.log('Uploading pending photos...');
      const uploadedPhotoUrls = await uploadPendingPhotos(check);
      console.log('Photo upload complete');

      // Upload signature if present
      let signatureUrl: string | null = null;
      if (check.signature_data_url) {
        console.log('Uploading signature...');
        try {
          signatureUrl = await uploadSignature(
            check.client_id,
            check.signature_data_url
          );
          console.log('Signature URL:', signatureUrl);
        } catch (sigErr) {
          console.error('Signature upload threw:', sigErr);
        }
      } else {
        console.log('No signature to upload');
      }

      // Upload reg photo if present
      let regPhotoUrl: string | null = null;
      if (check.reg_photo_data_url) {
        console.log('Uploading reg photo...');
        try {
          regPhotoUrl = await uploadRegPhoto(
            check.client_id,
            check.reg_photo_data_url
          );
          console.log('Reg photo URL:', regPhotoUrl);
        } catch (regErr) {
          console.error('Reg photo upload threw:', regErr);
        }
      } else {
        console.log('No reg photo to upload');
      }

      // Prepare check data for submission
      const checkData = {
        org_id: check.org_id,
        user_id: check.user_id,
        vehicle_id: check.vehicle_id,
        template_id: check.template_id,
        // Denormalized fields
        driver_name: check.driver_name,
        driver_email: check.driver_email,
        vehicle_registration: check.vehicle_registration,
        vehicle_type: check.vehicle_type,
        template_name: check.template_name,
        template_version: check.template_version,
        // Check details
        check_date: check.check_date,
        started_at: check.started_at,
        completed_at: check.completed_at,
        gps_start: check.gps_start,
        gps_end: check.gps_end,
        results: updateResultsWithPhotoUrls(check.results, uploadedPhotoUrls),
        overall_status: check.overall_status,
        signature_url: signatureUrl,
        reg_photo_url: regPhotoUrl,
      };

      console.log('Inserting check into check_runs:', checkData);

      // Insert the check into check_runs table
      const { error: insertError } = await supabase
        .from('check_runs')
        .insert(checkData);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(insertError.message);
      }

      console.log('Check synced successfully');

      // Success - remove from pending
      await deletePendingCheck(check.client_id);
      result.synced_count++;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Sync error:', errorMessage);
      result.failed_count++;
      result.errors.push(`Check ${check.client_id}: ${errorMessage}`);
      await updatePendingCheckSyncAttempt(check.client_id, errorMessage);
      result.success = false;
    }
  }

  return result;
}

/**
 * Upload pending photos and return mapping of item_id to uploaded URLs
 */
async function uploadPendingPhotos(
  check: PendingCheck
): Promise<Map<string, string[]>> {
  const urlMap = new Map<string, string[]>();
  console.log('Pending photos to upload:', check.pending_photos?.length ?? 0);

  if (!check.pending_photos) {
    return urlMap;
  }

  for (const photo of check.pending_photos) {
    if (photo.uploaded && photo.url) {
      // Already uploaded
      const existing = urlMap.get(photo.item_id) || [];
      existing.push(photo.url);
      urlMap.set(photo.item_id, existing);
      continue;
    }

    try {
      // Convert data URL to blob
      const response = await fetch(photo.data_url);
      const blob = await response.blob();

      // Generate file path
      const ext = blob.type.split('/')[1] || 'jpg';
      const fileName = `checks/${check.client_id}/${photo.id}.${ext}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('check-photos')
        .upload(fileName, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (uploadError) {
        console.error('Photo upload failed:', uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('check-photos')
        .getPublicUrl(fileName);

      const existing = urlMap.get(photo.item_id) || [];
      existing.push(urlData.publicUrl);
      urlMap.set(photo.item_id, existing);
    } catch (error) {
      console.error('Photo upload error:', error);
    }
  }

  return urlMap;
}

/**
 * Upload signature and return URL
 */
async function uploadSignature(
  checkId: string,
  dataUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const fileName = `signatures/${checkId}.png`;

    const { error: uploadError } = await supabase.storage
      .from('check-photos')
      .upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Signature upload failed:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('check-photos')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Signature upload error:', error);
    return null;
  }
}

/**
 * Upload reg photo and return URL
 */
async function uploadRegPhoto(
  checkId: string,
  dataUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    const fileName = `reg-photos/${checkId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('check-photos')
      .upload(fileName, blob, {
        contentType: blob.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Reg photo upload failed:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('check-photos')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Reg photo upload error:', error);
    return null;
  }
}

/**
 * Update results with uploaded photo URLs
 */
function updateResultsWithPhotoUrls(
  results: PendingCheck['results'],
  urlMap: Map<string, string[]>
): PendingCheck['results'] {
  return results.map((result) => ({
    ...result,
    photo_urls: urlMap.get(result.item_id) || result.photo_urls,
  }));
}

/**
 * Fetch and cache templates for offline use
 */
export async function refreshTemplateCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('check_templates')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch templates:', error);
      return;
    }

    if (data) {
      await cacheTemplates(data as CheckTemplate[]);
    }
  } catch (err) {
    console.error('Error in refreshTemplateCache:', err);
  }
}

/**
 * Fetch and cache vehicles for offline use
 */
export async function refreshVehicleCache(orgId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (error) {
      console.error('Failed to fetch vehicles:', error);
      return;
    }

    if (data) {
      await cacheVehicles(data as Vehicle[]);
    }
  } catch (err) {
    console.error('Error in refreshVehicleCache:', err);
  }
}

/**
 * Register for background sync (if supported)
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // TypeScript doesn't know about sync, so we need to use 'as any'
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-checks');
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }
  return false;
}
