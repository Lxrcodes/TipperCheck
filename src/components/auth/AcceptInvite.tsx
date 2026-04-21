import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { Truck, Loader2, AlertTriangle, Check, Eye, EyeOff } from 'lucide-react';

interface InviteData {
  email: string;
  name: string;
  orgName: string;
}

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [success, setSuccess] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Validate invite token on load
  useEffect(() => {
    if (!token) {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }

    validateInvite();
  }, [token]);

  const validateInvite = async () => {
    try {
      // Find user with this invite token
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, name, org_id, invite_token, invite_sent_at, invite_accepted_at')
        .eq('invite_token', token)
        .single();

      if (userError || !user) {
        setError('This invite link is invalid or has expired.');
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (user.invite_accepted_at) {
        setError('This invite has already been used. Please log in instead.');
        setLoading(false);
        return;
      }

      // Check if invite expired (7 days)
      const inviteSentAt = new Date(user.invite_sent_at);
      const now = new Date();
      const daysSinceInvite = (now.getTime() - inviteSentAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceInvite > 7) {
        setError('This invite link has expired. Please ask your manager to send a new one.');
        setLoading(false);
        return;
      }

      // Get org name
      const { data: org } = await supabase
        .from('organisations')
        .select('name')
        .eq('id', user.org_id)
        .single();

      setInviteData({
        email: user.email,
        name: user.name,
        orgName: org?.name ?? 'your company',
      });
      setLoading(false);
    } catch (err) {
      console.error('Error validating invite:', err);
      setError('Failed to validate invite. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteData || !token) return;

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create auth account with Supabase
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: inviteData.email,
        password,
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error('Failed to create account');
      }

      // Update user record to mark invite as accepted and link auth_user_id
      const { error: updateError } = await supabase
        .from('users')
        .update({
          auth_user_id: authData.user.id,
          invite_accepted_at: new Date().toISOString(),
          invite_token: null, // Clear the token
        })
        .eq('invite_token', token);

      if (updateError) throw updateError;

      setSuccess(true);

      // Redirect to app after brief delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-slate-400">Validating your invite...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !inviteData) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 rounded-2xl mb-4">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-heading text-white mb-2">Invalid Invite</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-6">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-heading text-white mb-2">Welcome to TipperCheck!</h1>
          <p className="text-slate-400">Your account is ready. Redirecting you now...</p>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-heading text-white">Set Up Your Account</h1>
          <p className="text-slate-400 mt-2">
            Hi <strong className="text-white">{inviteData?.name}</strong>! You've been invited to join{' '}
            <strong className="text-orange-400">{inviteData?.orgName}</strong> on TipperCheck.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Email</label>
            <input
              type="email"
              value={inviteData?.email ?? ''}
              disabled
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">
              Create Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none pr-12"
                placeholder="Min 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 text-sm mt-6">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-orange-500 hover:text-orange-400"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
