import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  clearRecoverySession,
  onRecoverySessionDetected,
} from '../lib/supabase';
import { triggerHaptic } from '../utils/haptics';
import {
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface ResetPasswordPageProps {
  onNavigate: (view: string, params?: any) => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onNavigate }) => {
  const {
    verifyRecoverySession,
    resetPasswordFromRecovery,
    setPendingResetEmail,
  } = useAuth();

  const [recoveryStatus, setRecoveryStatus] = useState<'verifying' | 'valid' | 'invalid'>(
    'verifying'
  );
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string>('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetComplete, setResetComplete] = useState(false);

  useEffect(() => {
    let active = true;

    const checkRecovery = async () => {
      setRecoveryStatus('verifying');
      const result = await verifyRecoverySession();
      if (!active) return;

      if (result.isEmailConfirmationRedirect) {
        onNavigate('confirm-email');
        return;
      }

      if (result.valid) {
        setRecoveryEmail(result.email || null);
        if (result.email) {
          setPendingResetEmail(result.email);
        }
        setLinkError('');
        setRecoveryStatus('valid');
      } else {
        setLinkError(
          result.errorMessage ||
            'This password reset link is invalid or has expired. Please request a new reset email.'
        );
        setRecoveryStatus('invalid');
      }
    };

    checkRecovery();

    const unsubscribeRecovery = onRecoverySessionDetected((state) => {
      if (!active) return;
      if (state.accessToken) {
        if (state.email) {
          setRecoveryEmail(state.email);
          setPendingResetEmail(state.email);
        }
        setLinkError('');
        setRecoveryStatus('valid');
      }
    });

    return () => {
      active = false;
      unsubscribeRecovery();
    };
  }, []);

  const handleRequestAnotherResetEmail = () => {
    triggerHaptic('light');
    clearRecoverySession();
    if (recoveryEmail) {
      setPendingResetEmail(recoveryEmail);
    }
    onNavigate('forgot-password');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || recoveryStatus !== 'valid') return;
    triggerHaptic('medium');
    setFormError('');

    if (!newPassword || newPassword.length < 8) {
      setFormError('New password must be at least 8 characters long.');
      triggerHaptic('error');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setFormError('New password must contain at least one letter and one number.');
      triggerHaptic('error');
      return;
    }
    if (confirmPassword !== newPassword) {
      setFormError('Passwords do not match.');
      triggerHaptic('error');
      return;
    }

    try {
      setLoading(true);
      await resetPasswordFromRecovery(newPassword);
      triggerHaptic('success');
      setResetComplete(true);
    } catch (err: any) {
      triggerHaptic('error');
      const msg =
        err?.message ||
        'Could not update password. Your reset link may have expired—please request a new one.';
      if (
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('invalid')
      ) {
        setLinkError(msg);
        setRecoveryStatus('invalid');
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F7F6F2] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-8 shadow-2xs">
          <div className="w-10 h-10 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#29483B] flex items-center justify-center mb-4">
            {resetComplete ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <KeyRound className="w-5 h-5" />
            )}
          </div>

          {resetComplete ? (
            <>
              <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
                Password updated.
              </h1>
              <p className="text-sm text-[#70756F] mt-1 leading-relaxed">
                Your Riders Path password has been reset. You can now sign in with your new
                password.
              </p>

              <div className="mt-6">
                <button
                  id="reset-goto-login-btn"
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="rp-btn rp-btn-primary rp-btn-lg w-full"
                >
                  <span>Continue to Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : recoveryStatus === 'verifying' ? (
            <div className="py-6 flex flex-col items-center text-center">
              <Loader2 className="w-6 h-6 text-[#29483B] animate-spin mb-3" />
              <h1 className="font-display font-bold text-xl text-[#202522] tracking-tight">
                Verifying reset link...
              </h1>
              <p className="text-sm text-[#70756F] mt-1">
                Please wait while we validate your password recovery session.
              </p>
            </div>
          ) : recoveryStatus === 'invalid' ? (
            <>
              <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
                Reset link expired or invalid.
              </h1>
              <p className="text-sm text-[#70756F] mt-1 leading-relaxed">
                For your security, password recovery links expire quickly and can only be used once.
              </p>

              <div
                className="mt-5 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
                <span>
                  {linkError ||
                    'This password reset link is invalid or has expired. Please request a new reset email.'}
                </span>
              </div>

              <div className="mt-5">
                <button
                  id="request-another-reset-btn"
                  type="button"
                  onClick={handleRequestAnotherResetEmail}
                  className="rp-btn rp-btn-primary rp-btn-lg w-full"
                >
                  <span>Request Another Reset Email</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-[#E5E4DE] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    clearRecoverySession();
                    onNavigate('login');
                  }}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#70756F] hover:text-[#202522]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
                Reset Password
              </h1>
              <p className="text-sm text-[#70756F] mt-1 leading-relaxed">
                {recoveryEmail ? (
                  <>
                    Enter and confirm a new password for{' '}
                    <span className="font-semibold text-[#202522]">{recoveryEmail}</span>.
                  </>
                ) : (
                  'Enter and confirm a new password for your Riders Path student account.'
                )}
              </p>

              {formError && (
                <div
                  className="mt-5 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="reset-new-password-input" className="rp-label">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-new-password-input"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (formError) setFormError('');
                      }}
                      placeholder="At least 8 characters"
                      className="rp-input !pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      aria-pressed={showNewPassword}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="rp-helper">
                    Use 8+ characters with at least one letter and one number.
                  </p>
                </div>

                <div>
                  <label htmlFor="reset-confirm-password-input" className="rp-label">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (formError) setFormError('');
                      }}
                      placeholder="Re-enter new password"
                      className="rp-input !pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    id="reset-password-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="rp-btn rp-btn-primary rp-btn-lg w-full"
                  >
                    {loading ? (
                      <span>Updating Password...</span>
                    ) : (
                      <>
                        <span>Update Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-[#E5E4DE] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleRequestAnotherResetEmail}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#70756F] hover:text-[#202522]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Request another reset email</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearRecoverySession();
                    onNavigate('login');
                  }}
                  className="font-semibold text-[#29483B] hover:underline"
                >
                  Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
