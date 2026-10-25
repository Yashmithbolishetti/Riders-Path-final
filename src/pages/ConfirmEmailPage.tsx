import React, { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  captureCurrentConfirmationUrlState,
  clearConfirmationSession,
  clearUserInitiatedEmailConfirmation,
  formatConfirmationErrorMessage,
  getStoredConfirmationState,
  hasUserInitiatedEmailConfirmation,
  markUserInitiatedEmailConfirmation,
  scrubSensitiveAuthUrlParams,
} from '../lib/supabase';

interface ConfirmEmailPageProps {
  onNavigate: (view: string, params?: any) => void;
  routeHash?: '#confirm-email' | '#verify-email';
}

type ConfirmationPageStatus = 'waiting' | 'ready' | 'verifying' | 'verified' | 'error';

export const ConfirmEmailPage: React.FC<ConfirmEmailPageProps> = ({
  onNavigate,
  routeHash = '#confirm-email' as const,
}) => {
  const {
    pendingVerificationEmail,
    verifyEmailConfirmationSession,
    resendVerificationCode,
    consumeAuthReturnDestination,
    studentUser,
    isStudentLoggedIn,
  } = useAuth();

  const [emailInput, setEmailInput] = useState<string>(pendingVerificationEmail || '');
  const [status, setStatus] = useState<ConfirmationPageStatus>(() => {
    if (typeof window === 'undefined') return 'waiting';
    if (isStudentLoggedIn && studentUser?.verificationStatus === 'verified') {
      return 'verified';
    }
    const initial = captureCurrentConfirmationUrlState(window.location);
    if (initial.error || initial.errorCode || initial.errorDescription) {
      return 'error';
    }
    const hasLinkOrToken = Boolean(
      initial.confirmationUrl || initial.accessToken || initial.tokenHash || initial.code
    );
    if (hasLinkOrToken) {
      // Auto-verify if:
      // 1. Supabase's /auth/v1/verify has ALREADY consumed the one-time token and redirected back
      //    with an `access_token` (completing server session sync immediately avoids the user
      //    re-clicking the email link ~6s later), OR
      // 2. The user already clicked "Confirm Email" in this tab and returned with a token/code.
      // Never auto-consume an unconsumed one-time link (`confirmationUrl`, `tokenHash`, or `code`
      // without `hasUserInitiatedEmailConfirmation()`) on initial page load!
      if (
        !initial.confirmationUrl &&
        (Boolean(initial.accessToken) ||
          (hasUserInitiatedEmailConfirmation() && (initial.tokenHash || initial.code)))
      ) {
        return 'verifying';
      }
      return 'ready';
    }
    return 'waiting';
  });

  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const initial = captureCurrentConfirmationUrlState(window.location);
    if (initial.error || initial.errorCode || initial.errorDescription) {
      return formatConfirmationErrorMessage(initial);
    }
    return null;
  });
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (pendingVerificationEmail && !emailInput) {
      setEmailInput(pendingVerificationEmail);
    }
  }, [pendingVerificationEmail, emailInput]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Scrub any sensitive URL parameters from browser history on mount without consuming unconsumed links.
  useEffect(() => {
    let mounted = true;
    const urlState =
      typeof window !== 'undefined' ? captureCurrentConfirmationUrlState(window.location) : null;
    const stored = getStoredConfirmationState();

    scrubSensitiveAuthUrlParams(routeHash);

    if (isStudentLoggedIn && studentUser?.verificationStatus === 'verified') {
      clearUserInitiatedEmailConfirmation();
      setVerifiedEmail(studentUser.email);
      setStatus('verified');
      setError(null);
      return;
    }

    const err = urlState?.error || stored?.error || null;
    const errCode = urlState?.errorCode || stored?.errorCode || null;
    const errDesc = urlState?.errorDescription || stored?.errorDescription || null;

    if (err || errCode || errDesc) {
      clearUserInitiatedEmailConfirmation();
      setStatus('error');
      setError(
        formatConfirmationErrorMessage({
          error: err,
          errorCode: errCode,
          errorDescription: errDesc,
        })
      );
      return;
    }

    const confirmationUrl = urlState?.confirmationUrl || stored?.confirmationUrl || null;
    const accessToken = urlState?.accessToken || stored?.accessToken || null;
    const hasVerifiableToken = Boolean(
      accessToken ||
        urlState?.tokenHash ||
        stored?.tokenHash ||
        urlState?.code ||
        stored?.code
    );

    if (
      hasVerifiableToken &&
      !confirmationUrl &&
      (Boolean(accessToken) || hasUserInitiatedEmailConfirmation())
    ) {
      setStatus('verifying');
      setError(null);
      verifyEmailConfirmationSession().then((res) => {
        if (!mounted) return;
        clearUserInitiatedEmailConfirmation();
        if (res.valid) {
          setVerifiedEmail(res.email || pendingVerificationEmail || emailInput || null);
          setStatus('verified');
          setError(null);
        } else {
          setStatus('error');
          setError(
            res.errorMessage ||
              'This email confirmation link is invalid or has expired. Please request a new confirmation email below.'
          );
        }
      });
      return () => {
        mounted = false;
      };
    }

    if (confirmationUrl || hasVerifiableToken) {
      setStatus('ready');
    }

    return () => {
      mounted = false;
    };
  }, []);

  const handleConfirmEmailClick = async () => {
    setError(null);
    setInfoMessage(null);

    const urlState =
      typeof window !== 'undefined' ? captureCurrentConfirmationUrlState(window.location) : null;
    const stored = getStoredConfirmationState();

    const confirmationUrl = urlState?.confirmationUrl || stored?.confirmationUrl || null;
    const hasDirectToken = Boolean(
      urlState?.accessToken ||
        stored?.accessToken ||
        urlState?.tokenHash ||
        stored?.tokenHash ||
        urlState?.code ||
        stored?.code
    );

    markUserInitiatedEmailConfirmation();

    // If the landing page received a validated Supabase confirmation_url and has not yet
    // received a post-redirect session token, clear confirmationUrl from storage first so it
    // can never be opened twice, then navigate to the Supabase confirmation URL.
    if (confirmationUrl && !hasDirectToken) {
      clearConfirmationSession();
      markUserInitiatedEmailConfirmation();
      setStatus('verifying');
      if (typeof window !== 'undefined') {
        window.location.assign(confirmationUrl);
      }
      return;
    }

    setStatus('verifying');
    const res = await verifyEmailConfirmationSession();
    clearUserInitiatedEmailConfirmation();

    if (res.valid) {
      setVerifiedEmail(res.email || pendingVerificationEmail || emailInput || null);
      setStatus('verified');
      setError(null);
    } else {
      setStatus('error');
      setError(
        res.errorMessage ||
          'This email confirmation link is invalid or has expired. Please request a new confirmation email below.'
      );
    }
  };

  const handleContinueAfterVerified = () => {
    clearConfirmationSession();
    const dest = consumeAuthReturnDestination();
    if (dest) {
      onNavigate(dest.view, dest.bikeId ? { bikeId: dest.bikeId } : undefined);
      return;
    }
    if (isStudentLoggedIn) {
      onNavigate('my-bookings');
      return;
    }
    onNavigate('login');
  };

  const handleResend = async () => {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter your registered email address below to resend the confirmation link.');
      return;
    }
    if (cooldown > 0 || isResending) return;

    setError(null);
    setInfoMessage(null);
    setIsResending(true);

    try {
      const res = await resendVerificationCode(cleanEmail);
      if (res.alreadyVerified) {
        clearConfirmationSession();
        onNavigate('login');
        return;
      }
      setCooldown(res.cooldownSeconds || 60);
      setInfoMessage(
        `A fresh confirmation link has been sent to ${cleanEmail}. Check your inbox and spam folder.`
      );
    } catch (err: any) {
      if (typeof err?.retryAfterSeconds === 'number' && err.retryAfterSeconds > 0) {
        setCooldown(err.retryAfterSeconds);
      }
      setError(err?.message || 'Could not resend confirmation email. Please wait a moment.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12 bg-[#FAF8F5]">
      <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200/90 shadow-xl shadow-stone-900/5 p-8 sm:p-10">
        {status === 'ready' && (
          <div className="text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-5 text-emerald-700">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold tracking-wide uppercase mb-3">
              Confirm Email Address
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              Confirm Your Email
            </h1>
            <p className="text-sm text-stone-600 mt-2.5 leading-relaxed">
              Click the button below to confirm your email address and activate your Riders Path
              student account.
            </p>

            <div className="mt-6 p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-left">
              <p className="text-xs text-stone-600 leading-relaxed">
                For your security and to protect one-time verification links from automated email
                scanners, your confirmation link is only activated when you click the button below.
              </p>
            </div>

            <button
              id="confirm-email-submit-btn"
              type="button"
              onClick={handleConfirmEmailClick}
              className="mt-6 w-full py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-lg shadow-emerald-900/10 transition-all flex items-center justify-center gap-2"
            >
              <span>Confirm Email</span>
              <ExternalLink className="w-4 h-4" />
            </button>

            <div className="mt-6 pt-5 border-t border-stone-100 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  clearConfirmationSession();
                  onNavigate('login');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        {status === 'verifying' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-5 text-emerald-700">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold tracking-wide uppercase mb-3">
              Verifying Account
            </span>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
              Confirming Your Email...
            </h1>
            <p className="text-sm text-stone-600 mt-2 leading-relaxed">
              Please wait a moment while we verify your email confirmation and activate your Riders
              Path student account.
            </p>
          </div>
        )}

        {status === 'verified' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-5 text-emerald-700">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold tracking-wide uppercase mb-3">
              Email Verified
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              Account Activated!
            </h1>
            <p className="text-sm text-stone-600 mt-2.5 leading-relaxed">
              {verifiedEmail ? (
                <>
                  Your email <span className="font-semibold text-stone-900">{verifiedEmail}</span>{' '}
                  has been verified and your student account is now active.
                </>
              ) : (
                'Your email address has been verified and your student account is now active.'
              )}
            </p>

            <button
              id="verify-email-continue-btn"
              type="button"
              onClick={handleContinueAfterVerified}
              className="mt-7 w-full py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-lg shadow-emerald-900/10 transition-all flex items-center justify-center gap-2"
            >
              <span>{isStudentLoggedIn ? 'Continue to Riders Path' : 'Continue to Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {(status === 'waiting' || status === 'error') && (
          <>
            <div className="text-center mb-7">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border ${
                  status === 'error'
                    ? 'bg-red-50 border-red-200/80 text-red-600'
                    : 'bg-emerald-50 border-emerald-200/80 text-emerald-700'
                }`}
              >
                {status === 'error' ? (
                  <AlertCircle className="w-7 h-7" />
                ) : (
                  <Mail className="w-7 h-7" />
                )}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-3 ${
                  status === 'error'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {status === 'error' ? 'Confirmation Link Issue' : 'Confirmation Link Sent'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                {status === 'error' ? 'Link Already Used or Expired' : 'Check Your Email'}
              </h1>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                {status === 'error'
                  ? 'This one-time confirmation link was already used (for example by a previous click or email security scanner) or has expired. If your email was already confirmed, you can sign in directly below—or request a fresh confirmation email.'
                  : 'We sent a confirmation link to your email address. Click the link in your inbox to verify and activate your student account.'}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {infoMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-emerald-800 text-xs leading-relaxed">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{infoMessage}</span>
              </div>
            )}

            {status === 'error' && (
              <button
                id="confirm-email-signin-btn"
                type="button"
                onClick={() => {
                  clearConfirmationSession();
                  onNavigate('login');
                }}
                className="mb-5 w-full py-3.5 px-6 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm shadow-lg shadow-stone-900/10 transition-all flex items-center justify-center gap-2"
              >
                <span>Sign In to Your Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {status === 'waiting' && (
              <div className="mb-6 p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs text-stone-700 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Open the email from <strong>Riders Path</strong> and click the confirmation link
                    to activate your account.
                  </span>
                </div>
                <p className="text-xs text-stone-500 pl-6">
                  Don&apos;t see the email yet? Check your spam or promotions folder, or resend the
                  confirmation link below.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Account Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="verify-email-address-input"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="student@ibsindia.org"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 bg-stone-50/70 focus:bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all"
                  />
                </div>
              </div>

              <button
                id="verify-email-resend-btn"
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || isResending}
                className="w-full py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold text-sm shadow-lg shadow-emerald-900/10 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
                {isResending
                  ? 'Sending confirmation email...'
                  : cooldown > 0
                  ? `Resend available in ${cooldown}s`
                  : 'Resend Confirmation Email'}
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <button
                type="button"
                onClick={() => {
                  clearConfirmationSession();
                  onNavigate('signup');
                }}
                className="inline-flex items-center gap-1 font-medium text-stone-600 hover:text-stone-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Email
              </button>

              <button
                type="button"
                onClick={() => {
                  clearConfirmationSession();
                  onNavigate('login');
                }}
                className="font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
              >
                <span>Back to Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
