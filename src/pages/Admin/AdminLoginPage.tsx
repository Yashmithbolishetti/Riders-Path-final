import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const INITIAL_SUPER_ADMIN_EMAIL = 'yashmithbolishetti01@gmail.com';

interface AdminLoginPageProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onSuccess, onCancel }) => {
  const { loginAdmin, bootstrapSuperAdmin, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<'login' | 'bootstrap' | 'setup-link'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    api
      .adminGetBootstrapStatus()
      .then((res) => {
        if (active) {
          setIsBootstrapped(res.isBootstrapped);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Enter your administrator email and password.');
      return;
    }

    setLoading(true);
    try {
      const ok = await loginAdmin(cleanEmail, password);
      if (ok) {
        onSuccess();
      } else {
        setError('Invalid administrator credentials.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to verify administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail !== INITIAL_SUPER_ADMIN_EMAIL) {
      setError(
        `Only the designated initial Super Admin (${INITIAL_SUPER_ADMIN_EMAIL}) can complete initial bootstrap.`
      );
      return;
    }
    if (!password) {
      setError('Enter your Supabase Auth password to verify and bootstrap the Super Admin role.');
      return;
    }

    setLoading(true);
    try {
      const ok = await bootstrapSuperAdmin(cleanEmail, password);
      if (ok) {
        setIsBootstrapped(true);
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to bootstrap initial Super Admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendSetupOrRecoveryLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid administrator email address.');
      return;
    }

    setLoading(true);
    try {
      if (!isBootstrapped && cleanEmail === INITIAL_SUPER_ADMIN_EMAIL) {
        const res = await api.adminSendBootstrapSetupLink(cleanEmail);
        setInfoMessage(
          res.message ||
            `A secure account setup / password reset link has been sent to ${cleanEmail}.`
        );
      } else {
        await requestPasswordReset(cleanEmail);
        setInfoMessage(
          `If ${cleanEmail} is registered in Supabase Auth, a password setup / reset link has been sent to their inbox.`
        );
      }
    } catch (err: any) {
      setError(
        err?.message ||
          'Could not send the password setup link. Ensure the account exists in Supabase Auth.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-7 sm:p-8 space-y-6 shadow-xs">
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#70756F] hover:text-[#202522] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
          <span className="rp-badge rp-badge-Warning">Admin Access</span>
        </div>

        <div className="space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="font-display font-bold text-xl text-[#202522]">
            {mode === 'bootstrap'
              ? 'Initial Super-Admin Bootstrap'
              : mode === 'setup-link'
              ? 'Admin Password Setup & Recovery'
              : 'Admin Sign In'}
          </h1>
          <p className="text-xs text-[#70756F] leading-relaxed">
            {mode === 'bootstrap'
              ? `Verify your Supabase Auth account (${INITIAL_SUPER_ADMIN_EMAIL}) to claim and lock the initial Super Admin role.`
              : mode === 'setup-link'
              ? 'Receive a secure Supabase Auth link by email to establish or reset your administrator password.'
              : 'Sign in with your authorized Supabase administrator account to manage campus bikes, bookings, and administrators.'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setInfoMessage('');
            }}
            className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'login'
                ? 'bg-white text-[#202522] shadow-2xs border border-[#E5E4DE]'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('setup-link');
              setError('');
              setInfoMessage('');
            }}
            className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'setup-link'
                ? 'bg-white text-[#202522] shadow-2xs border border-[#E5E4DE]'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Set / Reset Password
          </button>
          {!isBootstrapped && (
            <button
              type="button"
              onClick={() => {
                setMode('bootstrap');
                setEmail(INITIAL_SUPER_ADMIN_EMAIL);
                setError('');
                setInfoMessage('');
              }}
              className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'bootstrap'
                  ? 'bg-white text-[#29483B] shadow-2xs border border-[#29483B]/25'
                  : 'text-[#70756F] hover:text-[#202522]'
              }`}
            >
              Bootstrap
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#FCEEEE] border border-[#B44242]/20 flex items-start gap-2.5 text-xs text-[#B44242]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="p-3 rounded-lg bg-[#EAF2EE] border border-[#29483B]/20 flex items-start gap-2.5 text-xs text-[#29483B]">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="rp-label">Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#70756F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@icfai.ac.in"
                  className="rp-input pl-10"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="rp-label mb-0">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('setup-link');
                    setError('');
                    setInfoMessage('');
                  }}
                  className="text-[11px] font-medium text-[#29483B] hover:underline"
                >
                  Invited or forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="rp-input font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="rp-btn rp-btn-primary w-full py-2.5 text-xs"
            >
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {mode === 'setup-link' && (
          <form onSubmit={handleSendSetupOrRecoveryLink} className="space-y-4">
            <div>
              <label className="rp-label">Authorized Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#70756F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your administrator email"
                  className="rp-input pl-10"
                />
              </div>
              <p className="text-[11px] text-[#70756F] mt-1.5 leading-relaxed">
                New administrators invited by the Super Admin can use this form to receive a Supabase Auth link to establish their password.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="rp-btn rp-btn-primary w-full py-2.5 text-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Sending Link...' : 'Send Password Setup Link'}</span>
            </button>
          </form>
        )}

        {mode === 'bootstrap' && (
          <form onSubmit={handleBootstrapSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5 text-[11px] text-[#4E544F]">
              <div className="flex items-center gap-1.5 font-semibold text-[#202522]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#29483B]" />
                <span>One-Time Super Admin Bootstrap</span>
              </div>
              <p className="leading-relaxed">
                1. Ensure <span className="font-mono text-[#202522]">{INITIAL_SUPER_ADMIN_EMAIL}</span> has a verified Supabase Auth account (or use the Set / Reset Password tab to receive a setup link).
              </p>
              <p className="leading-relaxed">
                2. Sign in below to permanently bind your verified Supabase user ID as the Super Admin.
              </p>
            </div>

            <div>
              <label className="rp-label">Initial Super Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#70756F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={INITIAL_SUPER_ADMIN_EMAIL}
                  className="rp-input pl-10 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="rp-label">Supabase Auth Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Supabase password"
                className="rp-input font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="rp-btn rp-btn-primary w-full py-2.5 text-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{loading ? 'Verifying & Bootstrapping...' : 'Verify & Activate Super Admin'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
