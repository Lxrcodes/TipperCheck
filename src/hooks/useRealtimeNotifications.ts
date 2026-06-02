import { useEffect, useRef } from 'react';
import { supabase } from '@/services/supabaseClient';
import { useToast } from '@/components/shared/Toast';

export function useRealtimeNotifications(orgId: string | null, isManagerRole: boolean) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!orgId || !isManagerRole) return;

    const channel = supabase
      .channel(`org-notifications:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_runs', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const rec = payload.new as { overall_status: string; vehicle_registration: string; driver_name: string };
          if (rec.overall_status === 'do_not_drive') {
            toastRef.current.showError(
              `Critical defect raised on ${rec.vehicle_registration} by ${rec.driver_name}`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const next = payload.new as { status: string; reference: string };
          if (next.status === 'completed') {
            toastRef.current.showSuccess(`Job ${next.reference} completed`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, isManagerRole]);
}
