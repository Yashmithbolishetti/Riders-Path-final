import React, { useState } from 'react';
import { useAuth, sanitizeReturnView } from '../context/AuthContext';
import { Eye, EyeOff, AlertCircle, ArrowRight, MailCheck, ShieldCheck } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface LoginPageProps {
  onNavigate: (view: string, params?: any) => void;
  onLoginSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, onLoginSuccess }) => {
  const {
    loginWithEmail,
    setPendingVerificationEmail,
    authReturnDestination,
    consumeAuthReturnDestination,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    triggerHaptic('medium');

    setEmailError('');
    setPasswordError('');
    setGeneralError('');
    setUnverifiedEmail(null);

    let hasError = false;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailError('Enter your email address.');
      hasError = true;
    } else if (cleanEmail.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailError('Enter a valid email address.');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Enter your password.');
      hasError = true;
    }

    if (hasError) {
      triggerHaptic('error');
      return;
    }

    try {
      setLoading(true);
      await loginWithEmail(cleanEmail, password);
      triggerHaptic('success');
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        const dest = consumeAuthReturnDestination();
        if (dest && dest.view) {
          onNavigate(sanitizeReturnView(dest.view), dest.bikeId ? { bikeId: dest.bikeId } : undefined);
        } else {
          onNavigate('student-dashboard');
        }
      }
    } catch (err: any) {
      triggerHaptic('error');
      if (err?.requiresEmailVerification) {
        setUnverifiedEmail(err.email || cleanEmail);
        setGeneralError(err.message || 'Please verify your email address before signing in.');
      } else {
        setGeneralError(err.message || 'Invalid email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F7F6F2] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto">
        {/* Surface Card */}
        <div className="bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-8 shadow-2xs">
          {/* Brand Wordmark */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-[#29483B] hover:underline focus-ring rounded-xs"
            >
              Riders Path
            </button>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#202522] tracking-tight mt-2">
              Welcome back.
            </h1>
            <p className="text-sm text-[#70756F] mt-1">
              Sign in to continue your journey.
            </p>
          </div>

          {authReturnDestination?.reason && (
            <div className="mb-5 p-3.5 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#225C43] text-xs font-medium flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
              <span>{authReturnDestination.reason}</span>
            </div>
          )}

          {generalError && (
            <div
              className="mb-5 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium space-y-2.5"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
                <span>{generalError}</span>
              </div>
              {unverifiedEmail && (
                <div className="pt-1 pl-6">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingVerificationEmail(unverifiedEmail);
                      onNavigate('verify-email');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#E8C5C5] text-[#202522] text-xs font-semibold hover:bg-[#F7F6F2] transition-colors"
                  >
                    <MailCheck className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>Verify Email / Resend Confirmation Link</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email-input" className="rp-label">
                Email Address
              </label>
              <input
                id="login-email-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                  if (generalError) setGeneralError('');
                }}
                placeholder="you@student.icfaiuniversity.in"
                className={`rp-input ${emailError ? '!border-[#B44242]' : ''}`}
              />
              {emailError && (
                <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password-input" className="rp-label !mb-0">
                  Password
                </label>
                <button
                  id="login-forgot-password-link"
                  type="button"
                  onClick={() => onNavigate('forgot-password')}
                  className="text-xs font-medium text-[#29483B] hover:underline focus-ring rounded-xs"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                    if (generalError) setGeneralError('');
                  }}
                  placeholder="Enter your password"
                  className={`rp-input !pr-10 ${passwordError ? '!border-[#B44242]' : ''}`}
                />
                <button
                  id="login-toggle-password-btn"
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                id="login-submit-btn"
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
          </form>

          <div className="mt-6 pt-5 border-t border-[#E5E4DE] text-center">
            <p className="text-xs text-[#70756F]">
              Don&apos;t have a student account?{' '}
              <button
                id="login-to-signup-link"
                type="button"
                onClick={() => onNavigate('signup')}
                className="font-semibold text-[#29483B] hover:underline focus-ring rounded-xs ml-0.5"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
