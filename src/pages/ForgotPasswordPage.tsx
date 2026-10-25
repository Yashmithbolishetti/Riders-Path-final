import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { clearRecoverySession } from '../lib/supabase';
import { triggerHaptic } from '../utils/haptics';
import { KeyRound, AlertCircle, ArrowRight, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (view: string, params?: any) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const { requestPasswordReset, pendingResetEmail } = useAuth();
  const [email, setEmail] = useState(pendingResetEmail || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    triggerHaptic('medium');
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter the email address registered with your Riders Path account.');
      triggerHaptic('error');
      return;
    }

    try {
      setLoading(true);
      clearRecoverySession();
      await requestPasswordReset(cleanEmail);
      triggerHaptic('success');
      setSentToEmail(cleanEmail);
    } catch (err: any) {
      triggerHaptic('error');
      setError(err.message || 'Could not process password recovery request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F7F6F2] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-8 shadow-2xs">
          <div className="w-10 h-10 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#29483B] flex items-center justify-center mb-4">
            {sentToEmail ? <Mail className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
          </div>

          {sentToEmail ? (
            <>
              <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
                Check your email.
              </h1>
              <p className="text-sm text-[#70756F] mt-1 leading-relaxed">
                If an account exists for{' '}
                <span className="font-semibold text-[#202522]">{sentToEmail}</span>, we&apos;ve sent
                a password recovery link. Open the link in your email to choose a new password.
              </p>

              <div
                className="mt-5 p-3.5 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#29483B] text-xs font-medium flex items-start gap-2.5"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <span>
                  Recovery email sent. Check your spam or promotions folder if it doesn&apos;t
                  arrive within a minute.
                </span>
              </div>

              {error && (
                <div
                  className="mt-4 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-5 space-y-3">
                <button
                  id="forgot-resend-btn"
                  type="button"
                  disabled={loading}
                  onClick={handleSubmit}
                  className="rp-btn rp-btn-primary rp-btn-lg w-full"
                >
                  {loading ? (
                    <span>Sending Reset Link...</span>
                  ) : (
                    <>
                      <span>Resend Recovery Email</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSentToEmail(null);
                    setError('');
                  }}
                  className="w-full py-2 text-xs font-semibold text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Use a different email address
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
                Reset your password.
              </h1>
              <p className="text-sm text-[#70756F] mt-1 leading-relaxed">
                Enter the email address linked to your student account and we&apos;ll send you a
                password reset link.
              </p>

              {error && (
                <div
                  className="mt-5 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="forgot-email-input" className="rp-label">
                    Registered Email Address
                  </label>
                  <input
                    id="forgot-email-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="you@student.icfaiuniversity.in"
                    className={`rp-input ${error ? '!border-[#B44242]' : ''}`}
                  />
                </div>

                <div className="pt-2">
                  <button
                    id="forgot-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="rp-btn rp-btn-primary rp-btn-lg w-full"
                  >
                    {loading ? (
                      <span>Sending Reset Link...</span>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-[#E5E4DE] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="inline-flex items-center gap-1.5 font-semibold text-[#70756F] hover:text-[#202522]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
