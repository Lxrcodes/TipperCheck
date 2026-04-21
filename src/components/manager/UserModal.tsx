import { useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Loader2, Mail, AlertTriangle, Copy, Check, MessageCircle } from 'lucide-react';
import type { User, UserRole } from '@/types';

interface UserModalProps {
  user: User | null;
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function UserModal({ user, orgId, currentUserId, onClose, onSaved }: UserModalProps) {
  const isEditing = !!user;
  const isSelf = user?.id === currentUserId;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [roles, setRoles] = useState<UserRole[]>(user?.roles ?? ['driver']);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleRole = (role: UserRole) => {
    if (roles.includes(role)) {
      // Don't allow removing all roles
      if (roles.length > 1) {
        setRoles(roles.filter((r) => r !== role));
      }
    } else {
      setRoles([...roles, role]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || roles.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      if (isEditing) {
        // Update existing user
        const updateData: Partial<User> = {
          name: name.trim(),
          phone: phone.trim() || null,
          roles,
          is_active: isActive,
        };

        // If deactivating, record when and who
        if (!isActive && user.is_active) {
          updateData.deactivated_at = new Date().toISOString();
          // Note: deactivated_by would need the user ID from context
        }

        const { error: updateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', user.id);

        if (updateError) throw updateError;

        onSaved();
      } else {
        // Create new user and send invite
        // Generate invite token
        const inviteToken = crypto.randomUUID();

        const { error: insertError } = await supabase
          .from('users')
          .insert({
            org_id: orgId,
            email: email.trim().toLowerCase(),
            name: name.trim(),
            phone: phone.trim() || null,
            roles,
            is_active: true,
            invite_token: inviteToken,
            invite_sent_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Also create invite record for tracking
        await supabase.from('user_invites').insert({
          org_id: orgId,
          email: email.trim().toLowerCase(),
          name: name.trim(),
          roles,
          token: inviteToken,
          invited_by: currentUserId,
          status: 'pending',
        });

        // Store invite token to show the link
        setInviteToken(inviteToken);
        setInviteSent(true);
        // Don't auto-close - let the manager copy the link first
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save user';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const newInviteToken = crypto.randomUUID();

      await supabase
        .from('users')
        .update({
          invite_token: newInviteToken,
          invite_sent_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      // Show the new invite link
      setInviteToken(newInviteToken);
      setInviteSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend invite';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerPasswordReset = async () => {
    if (!user?.email) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      alert(
        `Password reset link sent to ${user.email}. You can also share this link with the user directly.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Generate invite URL
  const getInviteUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/invite/${inviteToken}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = getInviteUrl();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    const message = `Hi ${name}, you've been invited to join TipperCheck! Click this link to set up your account: ${getInviteUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShareSMS = () => {
    const message = `You've been invited to TipperCheck. Set up your account: ${getInviteUrl()}`;
    window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank');
  };

  // Show invite sent confirmation with shareable link
  if (inviteSent && inviteToken) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Invite Created!</h2>
            <p className="text-slate-600">
              Share this link with <strong>{name}</strong> to let them set up their account.
            </p>
          </div>

          {/* Invite Link */}
          <div className="bg-slate-100 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Invite Link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-slate-700 break-all">
                {getInviteUrl()}
              </code>
              <button
                onClick={handleCopyLink}
                className="p-2 bg-white rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors flex-shrink-0"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5 text-slate-600" />
                )}
              </button>
            </div>
          </div>

          {/* Quick Share Options */}
          <div className="space-y-2 mb-6">
            <p className="text-xs text-slate-500 uppercase font-bold">Share via</p>
            <div className="flex gap-2">
              <button
                onClick={handleShareWhatsApp}
                className="flex-1 py-2 px-4 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={handleShareSMS}
                className="flex-1 py-2 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                SMS
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center mb-4">
            This link expires in 7 days. You can resend it from the Team tab.
          </p>

          <button
            onClick={onSaved}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {isEditing ? 'Edit User' : 'Invite User'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {isSelf && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                You're editing your own account. Some options are restricted.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              placeholder="John Smith"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEditing}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="john@company.com"
            />
            {isEditing && (
              <p className="text-xs text-slate-400">Email cannot be changed after creation</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              placeholder="07700 900000"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Roles *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleRole('manager')}
                disabled={isSelf && roles.includes('manager') && roles.length === 1}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  roles.includes('manager')
                    ? 'bg-purple-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => toggleRole('driver')}
                disabled={isSelf && roles.includes('driver') && roles.length === 1}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  roles.includes('driver')
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Driver
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Users can have both roles (e.g., owner-operators)
            </p>
          </div>

          {isEditing && !isSelf && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    !isActive
                      ? 'bg-red-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Deactivated
                </button>
              </div>
              {!isActive && (
                <p className="text-xs text-amber-600">
                  Deactivated users cannot log in but their check history is preserved.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Send Invite'}
            </button>
          </div>

          {/* Additional actions for existing users */}
          {isEditing && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              {!user.invite_accepted_at && (
                <button
                  type="button"
                  onClick={handleResendInvite}
                  disabled={loading}
                  className="w-full py-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Resend Invite Email
                </button>
              )}
              {user.invite_accepted_at && (
                <button
                  type="button"
                  onClick={handleTriggerPasswordReset}
                  disabled={loading}
                  className="w-full py-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Send Password Reset Link
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
