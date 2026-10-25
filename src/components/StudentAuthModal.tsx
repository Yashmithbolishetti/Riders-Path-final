import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { triggerHaptic } from '../utils/haptics';
import { X, ShieldCheck, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const StudentAuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, loginWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAuthModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const navigateHash = (hash: string) => {
    closeAuthModal();
    window.location.hash = `#${hash}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    triggerHaptic('medium');
    setError('');

    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      triggerHaptic('error');
      return;
    }

    try {
      setLoading(true);
      await loginWithEmail(email.trim(), password);
      triggerHaptic('success');
      closeAuthModal();
    } catch (err: any) {
      triggerHaptic('error');
      if (err?.requiresEmailVerification) {
        closeAuthModal();
        window.location.hash = '#verify-email';
        return;
      }
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/45 backdrop-blur-[2px] animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-auth-modal-title"
    >
      <div
        id="student-auth-modal-card"
        className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 shadow-xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E4DE]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] flex items-center justify-center text-[#29483B]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="student-auth-modal-title" className="font-display font-semibold text-base text-[#202522]">
                Welcome back.
              </h3>
              <p className="text-xs text-[#70756F]">
                Sign in to continue your journey.
              </p>
            </div>
          </div>
          <button
            id="close-auth-modal-btn"
            type="button"
            onClick={closeAuthModal}
            className="p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
            aria-label="Close student sign in modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          {error && (
            <div
              className="p-3 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="modal-email-input" className="rp-label">
              Email Address
            </label>
            <input
              id="modal-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="you@student.icfaiuniversity.in"
              className="rp-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-password-input" className="rp-label !mb-0">
                Password
              </label>
              <button
                type="button"
                onClick={() => navigateHash('forgot-password')}
                className="text-xs font-medium text-[#29483B] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="modal-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your password"
                className="rp-input !pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="student-auth-submit-btn"
              type="submit"
              disabled={loading}
              className="rp-btn rp-btn-primary rp-btn-lg w-full"
            >
              {loading ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="pt-3 border-t border-[#E5E4DE] text-center text-xs text-[#70756F]">
            New to Riders Path?{' '}
            <button
              type="button"
              onClick={() => navigateHash('signup')}
              className="font-semibold text-[#29483B] hover:underline ml-0.5"
            >
              Create a student account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
