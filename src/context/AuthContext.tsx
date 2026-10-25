import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminRole, User } from '../types';
import { api } from '../services/api';
import {
  DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
  DEFAULT_RECOVERY_REDIRECT_URL,
  getSupabaseBrowserClient,
  syncBrowserSupabaseSession,
  clearBrowserSupabaseSession,
  captureCurrentConfirmationUrlState,
  getStoredConfirmationState,
  saveConfirmationSession,
  clearConfirmationSession,
  formatConfirmationErrorMessage,
  hasPendingConfirmationSession,
  isNonRecoveryJwtAccessToken,
  captureCurrentRecoveryUrlState,
  getStoredRecoveryState,
  saveRecoverySession,
  clearRecoverySession,
  formatRecoveryErrorMessage,
  hasPendingRecoverySession,
  isRecoveryAccessToken,
  logRecoveryDiagnostic,
} from '../lib/supabase';

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  icfaiEnrollmentNumber: string;
  academicYear?: string;
  course?: string;
}

export interface AuthReturnDestination {
  view: string;
  bikeId?: string;
  bikeName?: string;
  reason?: string;
}

const SAFE_INTERNAL_VIEWS = new Set([
  'home',
  'bikes',
  'bike-details',
  'book',
  'booking-status',
  'onboard',
  'student-dashboard',
  'profile',
  'my-bookings',
  'my-listings',
  'account-settings',
  'how-it-works',
  'terms',
  'faq',
  'contact',
]);

/**
 * Validates return destinations so a malicious URL or parameter can never
 * redirect a user to an arbitrary external site or unsafe protocol.
 */
export function sanitizeReturnView(rawView?: string | null): string {
  if (!rawView || typeof rawView !== 'string') return 'student-dashboard';
  const cleaned = rawView.replace(/^#\/?/, '').trim();
  if (
    !cleaned ||
    cleaned.includes('://') ||
    cleaned.startsWith('//') ||
    cleaned.startsWith('http:') ||
    cleaned.startsWith('https:') ||
    cleaned.toLowerCase().startsWith('javascript:') ||
    cleaned.toLowerCase().startsWith('data:') ||
    cleaned.includes('\\')
  ) {
    return 'student-dashboard';
  }
  return SAFE_INTERNAL_VIEWS.has(cleaned) ? cleaned : 'student-dashboard';
}

interface AuthContextType {
  // Student Session & User
  studentUser: User | null;
  isStudentLoggedIn: boolean;
  isLoadingSession: boolean;

  // Complete Authentication Foundation (Part 6A)
  signupWithEmail: (payload: SignupPayload) => Promise<{
    requiresEmailVerification: boolean;
    email: string;
    devVerificationCode?: string;
    emailDeliveryMode: 'live' | 'sandbox';
  }>;
  loginWithEmail: (email: string, password: string) => Promise<User>;
  verifyEmail: (email: string, code: string) => Promise<User>;
  verifyEmailConfirmationSession: () => Promise<{
    valid: boolean;
    email: string | null;
    user?: User | null;
    errorMessage?: string;
  }>;
  resendVerificationCode: (email: string) => Promise<{
    alreadyVerified?: boolean;
    cooldownSeconds?: number;
    devVerificationCode?: string;
    emailDeliveryMode: 'live' | 'sandbox';
  }>;
  requestPasswordReset: (email: string) => Promise<{
    email: string;
    devResetCode?: string;
    emailDeliveryMode: 'live' | 'sandbox';
  }>;
  verifyRecoverySession: () => Promise<{
    valid: boolean;
    email: string | null;
    errorMessage?: string;
    isEmailConfirmationRedirect?: boolean;
  }>;
  resetPasswordFromRecovery: (newPassword: string) => Promise<void>;
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<void>;
  changeStudentPassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Pending Verification & Recovery State
  pendingVerificationEmail: string;
  setPendingVerificationEmail: (email: string) => void;
  pendingDevVerificationCode: string | null;
  setPendingDevVerificationCode: (code: string | null) => void;
  pendingResetEmail: string;
  setPendingResetEmail: (email: string) => void;
  pendingDevResetCode: string | null;
  setPendingDevResetCode: (code: string | null) => void;

  // Protected Workflow Return Destination (Part 6B)
  authReturnDestination: AuthReturnDestination | null;
  setAuthReturnDestination: (dest: AuthReturnDestination | null) => void;
  consumeAuthReturnDestination: () => AuthReturnDestination | null;

  // Profile & Legacy Compatibility
  loginStudent: (
    fullName: string,
    enrollment: string,
    phone?: string,
    email?: string,
    academicYear?: string,
    course?: string
  ) => Promise<User>;
  updateStudentProfile: (updates: {
    fullName: string;
    enrollment: string;
    phone?: string;
    email?: string;
    academicYear?: string;
    course?: string;
  }) => Promise<User>;
  logoutStudent: () => Promise<void>;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;

  // Admin
  isAdminLoggedIn: boolean;
  adminRole: AdminRole | null;
  adminEmail: string | null;
  isSuperAdmin: boolean;
  loginAdmin: (email: string, password?: string) => Promise<boolean>;
  bootstrapSuperAdmin: (email: string, password?: string) => Promise<boolean>;
  logoutAdmin: () => void;

  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const RETURN_TO_STORAGE_KEY = 'rp_auth_return_to';

let inFlightConfirmationPromise: Promise<{
  valid: boolean;
  email: string | null;
  user?: User | null;
  errorMessage?: string;
}> | null = null;

let inFlightRecoveryPromise: Promise<{
  valid: boolean;
  email: string | null;
  errorMessage?: string;
  isEmailConfirmationRedirect?: boolean;
}> | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [studentUser, setStudentUser] = useState<User | null>(() => {
    try {
      const token = localStorage.getItem('rp_student_token');
      const saved = localStorage.getItem('rp_student_user');
      if (!token || !saved) return null;
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);

  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>(() => {
    try {
      return (
        sessionStorage.getItem('rp_pending_verify_email') ||
        localStorage.getItem('rp_pending_verify_email') ||
        ''
      );
    } catch {
      return '';
    }
  });
  const [pendingDevVerificationCode, setPendingDevVerificationCode] = useState<string | null>(null);

  const [pendingResetEmail, setPendingResetEmail] = useState<string>(() => {
    try {
      return (
        sessionStorage.getItem('rp_pending_reset_email') ||
        localStorage.getItem('rp_pending_reset_email') ||
        ''
      );
    } catch {
      return '';
    }
  });
  const [pendingDevResetCode, setPendingDevResetCode] = useState<string | null>(null);

  const [authReturnDestination, setAuthReturnDestinationState] =
    useState<AuthReturnDestination | null>(() => {
      try {
        const raw = sessionStorage.getItem(RETURN_TO_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.view !== 'string') return null;
        return {
          ...parsed,
          view: sanitizeReturnView(parsed.view),
        };
      } catch {
        return null;
      }
    });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('rp_admin_token'));
  });
  const [adminRole, setAdminRole] = useState<AdminRole | null>(() => {
    const saved = localStorage.getItem('rp_admin_role');
    return saved === 'super_admin' || saved === 'admin' ? saved : null;
  });
  const [adminEmail, setAdminEmail] = useState<string | null>(() => {
    return localStorage.getItem('rp_admin_email') || null;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const setAuthReturnDestination = (dest: AuthReturnDestination | null) => {
    if (!dest) {
      setAuthReturnDestinationState(null);
      try {
        sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
      } catch {}
      return;
    }
    const safeDest: AuthReturnDestination = {
      ...dest,
      view: sanitizeReturnView(dest.view),
    };
    setAuthReturnDestinationState(safeDest);
    try {
      sessionStorage.setItem(RETURN_TO_STORAGE_KEY, JSON.stringify(safeDest));
    } catch {}
  };

  const consumeAuthReturnDestination = (): AuthReturnDestination | null => {
    const current = authReturnDestination;
    setAuthReturnDestination(null);
    return current;
  };

  // Verify active student and admin sessions on mount / page refresh
  useEffect(() => {
    let mounted = true;
    try {
      sessionStorage.removeItem('rp_pending_verify_code');
      sessionStorage.removeItem('rp_pending_reset_code');
    } catch {}

    const verifySessions = async () => {
      const studentToken = localStorage.getItem('rp_student_token');
      const adminToken = localStorage.getItem('rp_admin_token');

      if (adminToken) {
        api
          .adminVerifySession()
          .then((res) => {
            if (mounted && res.authenticated) {
              setIsAdminLoggedIn(true);
              const resolvedRole: AdminRole = res.role === 'super_admin' ? 'super_admin' : 'admin';
              setAdminRole(resolvedRole);
              setAdminEmail(res.email || null);
              localStorage.setItem('rp_admin_role', resolvedRole);
              if (res.email) localStorage.setItem('rp_admin_email', res.email);
            }
          })
          .catch(() => {
            if (mounted) {
              localStorage.removeItem('rp_admin_token');
              localStorage.removeItem('rp_admin_role');
              localStorage.removeItem('rp_admin_email');
              setIsAdminLoggedIn(false);
              setAdminRole(null);
              setAdminEmail(null);
            }
          });
      }

      if (!studentToken) {
        if (mounted) {
          setStudentUser(null);
          localStorage.removeItem('rp_student_user');
          setIsLoadingSession(false);
        }
        return;
      }

      try {
        const res = await api.authMe();
        if (mounted && res.authenticated && res.user) {
          setStudentUser(res.user);
          localStorage.setItem('rp_student_user', JSON.stringify(res.user));
        }
      } catch {
        if (mounted) {
          setStudentUser(null);
          localStorage.removeItem('rp_student_user');
          localStorage.removeItem('rp_student_token');
        }
      } finally {
        if (mounted) setIsLoadingSession(false);
      }
    };
    verifySessions();

    return () => {
      mounted = false;
    };
  }, []);

  const persistPendingVerify = (email: string, _code?: string | null) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const nowStr = String(Date.now());
    setPendingVerificationEmail(normalizedEmail);
    setPendingDevVerificationCode(null);
    try {
      if (normalizedEmail) {
        clearRecoverySession();
        sessionStorage.setItem('rp_pending_verify_email', normalizedEmail);
        sessionStorage.setItem('rp_pending_auth_flow', 'signup');
        sessionStorage.setItem('rp_pending_verify_at', nowStr);
        sessionStorage.removeItem('rp_pending_reset_email');
        sessionStorage.removeItem('rp_pending_reset_at');

        localStorage.setItem('rp_pending_verify_email', normalizedEmail);
        localStorage.setItem('rp_pending_auth_flow', 'signup');
        localStorage.setItem('rp_pending_verify_at', nowStr);
        localStorage.removeItem('rp_pending_reset_email');
        localStorage.removeItem('rp_pending_reset_at');
      } else {
        sessionStorage.removeItem('rp_pending_verify_email');
        sessionStorage.removeItem('rp_pending_verify_at');
        if (sessionStorage.getItem('rp_pending_auth_flow') === 'signup') {
          sessionStorage.removeItem('rp_pending_auth_flow');
        }
        localStorage.removeItem('rp_pending_verify_email');
        localStorage.removeItem('rp_pending_verify_at');
        if (localStorage.getItem('rp_pending_auth_flow') === 'signup') {
          localStorage.removeItem('rp_pending_auth_flow');
        }
      }
      sessionStorage.removeItem('rp_pending_verify_code');
    } catch {}
  };

  const persistPendingReset = (email: string, _code?: string | null) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const nowStr = String(Date.now());
    setPendingResetEmail(normalizedEmail);
    setPendingDevResetCode(null);
    try {
      if (normalizedEmail) {
        clearConfirmationSession();
        sessionStorage.setItem('rp_pending_reset_email', normalizedEmail);
        sessionStorage.setItem('rp_pending_auth_flow', 'recovery');
        sessionStorage.setItem('rp_pending_reset_at', nowStr);
        sessionStorage.removeItem('rp_pending_verify_email');
        sessionStorage.removeItem('rp_pending_verify_at');

        localStorage.setItem('rp_pending_reset_email', normalizedEmail);
        localStorage.setItem('rp_pending_auth_flow', 'recovery');
        localStorage.setItem('rp_pending_reset_at', nowStr);
        localStorage.removeItem('rp_pending_verify_email');
        localStorage.removeItem('rp_pending_verify_at');
      } else {
        sessionStorage.removeItem('rp_pending_reset_email');
        sessionStorage.removeItem('rp_pending_reset_at');
        if (sessionStorage.getItem('rp_pending_auth_flow') === 'recovery') {
          sessionStorage.removeItem('rp_pending_auth_flow');
        }
        localStorage.removeItem('rp_pending_reset_email');
        localStorage.removeItem('rp_pending_reset_at');
        if (localStorage.getItem('rp_pending_auth_flow') === 'recovery') {
          localStorage.removeItem('rp_pending_auth_flow');
        }
      }
      sessionStorage.removeItem('rp_pending_reset_code');
    } catch {}
  };

  const signupWithEmail = async (payload: SignupPayload) => {
    const requestedEmail = payload.email.trim().toLowerCase();
    persistPendingVerify(requestedEmail, null);
    const res = await api.authSignup({
      ...payload,
      redirectTo: DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
    });
    const targetEmail = (res.email || requestedEmail).trim().toLowerCase();
    if (!res.requiresEmailVerification && res.token && res.user) {
      setStudentUser(res.user);
      localStorage.setItem('rp_student_user', JSON.stringify(res.user));
      localStorage.setItem('rp_student_token', res.token);
      await syncBrowserSupabaseSession(res.token, res.refreshToken);
      persistPendingVerify('', null);
      showToast(`Welcome to Riders Path, ${res.user.fullName.split(' ')[0]}!`, 'success');
    } else {
      persistPendingVerify(targetEmail, null);
      showToast(
        'Account created! Check your email and click the confirmation link to activate your account.',
        'info'
      );
    }
    return {
      requiresEmailVerification: res.requiresEmailVerification,
      email: targetEmail,
      emailDeliveryMode: res.emailDeliveryMode,
    };
  };

  const loginWithEmail = async (email: string, password: string): Promise<User> => {
    try {
      const res = await api.authLogin(email, password);
      setStudentUser(res.user);
      localStorage.setItem('rp_student_user', JSON.stringify(res.user));
      localStorage.setItem('rp_student_token', res.token);
      await syncBrowserSupabaseSession(res.token, res.refreshToken);
      persistPendingVerify('', null);
      persistPendingReset('', null);
      showToast(`Welcome back, ${res.user.fullName.split(' ')[0]}!`, 'success');
      return res.user;
    } catch (err: any) {
      if (err?.requiresEmailVerification) {
        persistPendingVerify(err.email || email, null);
      }
      throw err;
    }
  };

  const verifyEmail = async (email: string, code: string): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.replace(/\s+/g, '').trim();
    const res = await api.authVerifyEmail(cleanEmail, cleanCode);
    setStudentUser(res.user);
    localStorage.setItem('rp_student_user', JSON.stringify(res.user));
    localStorage.setItem('rp_student_token', res.token);
    await syncBrowserSupabaseSession(res.token, res.refreshToken);
    persistPendingVerify('', null);
    persistPendingReset('', null);
    showToast('Email verified! Welcome to Riders Path.', 'success');
    return res.user;
  };

  const verifyEmailConfirmationSession = async (): Promise<{
    valid: boolean;
    email: string | null;
    user?: User | null;
    errorMessage?: string;
  }> => {
    if (inFlightConfirmationPromise) {
      return inFlightConfirmationPromise;
    }

    inFlightConfirmationPromise = (async () => {
      const urlState =
        typeof window !== 'undefined' ? captureCurrentConfirmationUrlState(window.location) : null;
      const stored = getStoredConfirmationState();

      const error = urlState?.error || stored?.error || null;
      const errorCode = urlState?.errorCode || stored?.errorCode || null;
      const errorDescription = urlState?.errorDescription || stored?.errorDescription || null;

      if (error || errorCode || errorDescription) {
        return {
          valid: false,
          email: null,
          errorMessage: formatConfirmationErrorMessage({
            error,
            errorCode,
            errorDescription,
          }),
        };
      }

      let accessToken = urlState?.accessToken || stored?.accessToken || null;
      let refreshToken = urlState?.refreshToken || stored?.refreshToken || null;
      const tokenHash = urlState?.tokenHash || stored?.tokenHash || null;
      const code = urlState?.code || stored?.code || null;
      const type = urlState?.type || stored?.type || 'signup';

      if (!accessToken && !tokenHash && !code) {
        const client = getSupabaseBrowserClient();
        if (client) {
          const { data } = await client.auth.getSession();
          const sessionToken = data.session?.access_token || null;
          if (
            sessionToken &&
            !isRecoveryAccessToken(sessionToken) &&
            (isNonRecoveryJwtAccessToken(sessionToken) || hasPendingConfirmationSession())
          ) {
            accessToken = sessionToken;
            refreshToken = data.session?.refresh_token || null;
          }
        }
      }

      if (!accessToken && !tokenHash && !code) {
        return {
          valid: false,
          email: null,
          errorMessage:
            'This email confirmation link is invalid or has expired. Please request a new confirmation email.',
        };
      }

      try {
        const res = await api.authVerifyEmailConfirmation({
          accessToken,
          refreshToken,
          tokenHash,
          code,
          type,
        });
        setStudentUser(res.user);
        localStorage.setItem('rp_student_user', JSON.stringify(res.user));
        localStorage.setItem('rp_student_token', res.token);
        await syncBrowserSupabaseSession(res.token, res.refreshToken);
        persistPendingVerify('', null);
        persistPendingReset('', null);
        // Preserve recent signup flow timestamp so if the user or an email scanner triggers
        // a duplicate confirmation request seconds later (#error=otp_expired), it still
        // recognizes the recent signup flow and never falls into password recovery.
        try {
          const verifiedNow = String(Date.now());
          sessionStorage.setItem('rp_pending_auth_flow', 'signup');
          sessionStorage.setItem('rp_pending_verify_at', verifiedNow);
          localStorage.setItem('rp_pending_auth_flow', 'signup');
          localStorage.setItem('rp_pending_verify_at', verifiedNow);
        } catch {}
        saveConfirmationSession({
          confirmationUrl: null,
          accessToken: res.token,
          refreshToken: res.refreshToken || refreshToken || null,
          tokenHash: null,
          code: null,
          type: 'signup',
          email: res.user.email || null,
          error: null,
          errorCode: null,
          errorDescription: null,
        });
        showToast('Email verified! Welcome to Riders Path.', 'success');
        return {
          valid: true,
          email: res.user.email || null,
          user: res.user,
        };
      } catch (err: any) {
        return {
          valid: false,
          email: null,
          errorMessage:
            err?.message ||
            'This email confirmation link is invalid or has expired. Please request a new confirmation email.',
        };
      }
    })();

    try {
      return await inFlightConfirmationPromise;
    } finally {
      inFlightConfirmationPromise = null;
    }
  };

  const resendVerificationCode = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await api.authResendVerification(
      cleanEmail,
      DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL
    );
    persistPendingVerify(res.email || cleanEmail, null);
    showToast(res.message || 'A new confirmation link has been sent to your email.', 'info');
    return {
      alreadyVerified: res.alreadyVerified,
      cooldownSeconds: res.cooldownSeconds ?? 60,
      emailDeliveryMode: res.emailDeliveryMode,
    };
  };

  const requestPasswordReset = async (email: string) => {
    logRecoveryDiagnostic('requestPasswordResetStart', {
      redirectTo: DEFAULT_RECOVERY_REDIRECT_URL,
    });
    const res = await api.authForgotPassword(email, DEFAULT_RECOVERY_REDIRECT_URL);
    persistPendingReset(res.email || email, null);
    logRecoveryDiagnostic('requestPasswordResetSuccess', {
      redirectTo: DEFAULT_RECOVERY_REDIRECT_URL,
      emailDeliveryMode: res.emailDeliveryMode,
    });
    showToast('Password reset link sent. Check your email inbox.', 'info');
    return {
      email: res.email || email,
      emailDeliveryMode: res.emailDeliveryMode,
    };
  };

  const verifyRecoverySession = async (): Promise<{
    valid: boolean;
    email: string | null;
    errorMessage?: string;
    isEmailConfirmationRedirect?: boolean;
  }> => {
    if (inFlightRecoveryPromise) {
      return inFlightRecoveryPromise;
    }

    inFlightRecoveryPromise = (async () => {
      if (typeof window !== 'undefined' && hasPendingConfirmationSession(window.location)) {
        return {
          valid: false,
          email: null,
          isEmailConfirmationRedirect: true,
        };
      }
      const urlState =
        typeof window !== 'undefined' ? captureCurrentRecoveryUrlState(window.location) : null;
      const stored = getStoredRecoveryState();

      const error = urlState?.error || stored?.error || null;
      const errorCode = urlState?.errorCode || stored?.errorCode || null;
      const errorDescription = urlState?.errorDescription || stored?.errorDescription || null;

      if (error || errorCode || errorDescription) {
        logRecoveryDiagnostic('verifyRecoverySessionCallbackError', {
          error,
          errorCode,
        });
        return {
          valid: false,
          email: null,
          errorMessage: formatRecoveryErrorMessage({
            error,
            errorCode,
            errorDescription,
          }),
        };
      }

      let accessToken = urlState?.accessToken || stored?.accessToken || null;
      let refreshToken = urlState?.refreshToken || stored?.refreshToken || null;
      const tokenHash = urlState?.tokenHash || stored?.tokenHash || null;
      const code = urlState?.code || stored?.code || null;
      const type = urlState?.type || stored?.type || 'recovery';

      if (!accessToken && !tokenHash && !code) {
        const client = getSupabaseBrowserClient();
        if (client) {
          const { data } = await client.auth.getSession();
          const sessionToken = data.session?.access_token || null;
          if (
            sessionToken &&
            (isRecoveryAccessToken(sessionToken) || hasPendingRecoverySession())
          ) {
            accessToken = sessionToken;
            refreshToken = data.session?.refresh_token || null;
          }
        }
      }

      if (!accessToken && !tokenHash && !code) {
        logRecoveryDiagnostic('verifyRecoverySessionMissingCredentials', {
          hasAccessToken: false,
          hasTokenHash: false,
          hasCode: false,
        });
        return {
          valid: false,
          email: null,
          errorMessage:
            'This password reset link is invalid or has expired. Please request a new reset email.',
        };
      }

      try {
        const verified = await api.authVerifyRecovery({
          accessToken,
          refreshToken,
          tokenHash,
          code,
          type,
        });
        saveRecoverySession({
          accessToken: verified.accessToken,
          refreshToken: verified.refreshToken,
          tokenHash: null,
          code: null,
          type,
          email: verified.email,
          error: null,
          errorCode: null,
          errorDescription: null,
        });
        logRecoveryDiagnostic('verifyRecoverySessionVerified', {
          valid: true,
          hasEmail: Boolean(verified.email),
        });
        return {
          valid: true,
          email: verified.email,
        };
      } catch (err: any) {
        if (err?.isEmailConfirmationRedirect) {
          const existingConfirm = getStoredConfirmationState();
          if (!existingConfirm?.accessToken && (accessToken || tokenHash || code)) {
            saveConfirmationSession({
              accessToken: accessToken || null,
              refreshToken: refreshToken || null,
              tokenHash: tokenHash || null,
              code: code || null,
              type: 'signup',
              email: null,
              error: null,
              errorCode: null,
              errorDescription: null,
            });
          }
          clearRecoverySession();
          return {
            valid: false,
            email: null,
            isEmailConfirmationRedirect: true,
            errorMessage: err.message,
          };
        }
        logRecoveryDiagnostic('verifyRecoverySessionFailed', {
          valid: false,
          reason: err?.message || 'verification_failed',
        });
        return {
          valid: false,
          email: null,
          errorMessage:
            err?.message ||
            'This password reset link is invalid or has expired. Please request a new reset email.',
        };
      }
    })();

    try {
      return await inFlightRecoveryPromise;
    } finally {
      inFlightRecoveryPromise = null;
    }
  };

  const resetPasswordFromRecovery = async (newPassword: string) => {
    const urlState =
      typeof window !== 'undefined' ? captureCurrentRecoveryUrlState(window.location) : null;
    const stored = getStoredRecoveryState();

    let accessToken = urlState?.accessToken || stored?.accessToken || null;
    let refreshToken = urlState?.refreshToken || stored?.refreshToken || null;
    const tokenHash = urlState?.tokenHash || stored?.tokenHash || null;

    if (!accessToken && !tokenHash) {
      const client = getSupabaseBrowserClient();
      if (client) {
        const { data } = await client.auth.getSession();
        const sessionToken = data.session?.access_token || null;
        if (
          sessionToken &&
          (isRecoveryAccessToken(sessionToken) || hasPendingRecoverySession())
        ) {
          accessToken = sessionToken;
          refreshToken = data.session?.refresh_token || null;
        }
      }
    }

    if (!accessToken && !tokenHash) {
      logRecoveryDiagnostic('resetPasswordRejectedNoRecoverySession', {
        hasAccessToken: false,
        hasTokenHash: false,
      });
      throw new Error(
        'Your password reset session is missing or has expired. Please request a new reset email.'
      );
    }

    logRecoveryDiagnostic('resetPasswordFromRecoveryStart', {
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      hasTokenHash: Boolean(tokenHash),
    });

    const res = await api.authResetPasswordWithRecovery({
      accessToken,
      refreshToken,
      tokenHash,
      newPassword,
    });

    logRecoveryDiagnostic('resetPasswordFromRecoverySuccess', {
      success: true,
    });

    clearRecoverySession();
    await clearBrowserSupabaseSession();
    persistPendingReset('', null);
    showToast(
      res.message || 'Your password has been reset successfully. Please sign in.',
      'success'
    );
  };

  const resetPasswordWithCode = async (email: string, code: string, newPassword: string) => {
    const res = await api.authResetPassword(email, code, newPassword);
    clearRecoverySession();
    persistPendingReset('', null);
    showToast(res.message || 'Password reset successfully. Please sign in.', 'success');
  };

  const changeStudentPassword = async (currentPassword: string, newPassword: string) => {
    if (!studentUser) throw new Error('Please sign in first.');
    const res = await api.authChangePassword(studentUser.id, currentPassword, newPassword);
    showToast(res.message || 'Password updated.', 'success');
  };

  const loginStudent = async (
    _fullName: string,
    _enrollment: string,
    _phone?: string,
    _email?: string,
    _academicYear?: string,
    _course?: string
  ): Promise<User> => {
    const err = new Error(
      'Legacy passwordless student login has been disabled. Please sign in with your email and password.'
    );
    showToast(err.message, 'error');
    throw err;
  };

  const updateStudentProfile = async (updates: {
    fullName: string;
    enrollment: string;
    phone?: string;
    email?: string;
    academicYear?: string;
    course?: string;
  }): Promise<User> => {
    const token = localStorage.getItem('rp_student_token');
    if (!studentUser || !token) {
      const err = new Error('Please sign in to your student account before updating your profile.');
      showToast(err.message, 'error');
      throw err;
    }

    try {
      const res = await api.authUpdateProfile(studentUser.id, {
        fullName: updates.fullName,
        phone: updates.phone,
        icfaiEnrollmentNumber: updates.enrollment,
        academicYear: updates.academicYear,
        course: updates.course,
      });
      setStudentUser(res.user);
      localStorage.setItem('rp_student_user', JSON.stringify(res.user));
      showToast('Student profile saved', 'success');
      return res.user;
    } catch (err: any) {
      showToast(err.message || 'Could not update profile', 'error');
      throw err;
    }
  };

  const logoutStudent = async () => {
    await api.authLogout();
    await clearBrowserSupabaseSession();
    persistPendingVerify('', null);
    persistPendingReset('', null);
    try {
      sessionStorage.removeItem('rp_active_booking');
    } catch {
      // Ignore storage errors
    }
    setStudentUser(null);
    showToast('Signed out of student account', 'info');
  };

  const loginAdmin = async (email: string, password?: string): Promise<boolean> => {
    try {
      const res = await api.adminLogin(email, password);
      if (res.token) {
        const resolvedRole: AdminRole = res.role === 'super_admin' ? 'super_admin' : 'admin';
        localStorage.setItem('rp_admin_token', res.token);
        localStorage.setItem('rp_admin_role', resolvedRole);
        localStorage.setItem('rp_admin_email', res.email || email.trim().toLowerCase());
        setIsAdminLoggedIn(true);
        setAdminRole(resolvedRole);
        setAdminEmail(res.email || email.trim().toLowerCase());
        showToast(
          resolvedRole === 'super_admin'
            ? 'Signed in to Admin Portal as Super Admin'
            : 'Signed in to Admin Portal',
          'success'
        );
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Invalid administrator credentials', 'error');
      throw err;
    }
  };

  const bootstrapSuperAdmin = async (email: string, password?: string): Promise<boolean> => {
    try {
      const res = await api.adminBootstrapSuperAdmin({ email, password });
      if (res.token) {
        localStorage.setItem('rp_admin_token', res.token);
        localStorage.setItem('rp_admin_role', 'super_admin');
        localStorage.setItem('rp_admin_email', res.email || email.trim().toLowerCase());
        setIsAdminLoggedIn(true);
        setAdminRole('super_admin');
        setAdminEmail(res.email || email.trim().toLowerCase());
        showToast('Initial Super Admin account verified and activated!', 'success');
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Could not bootstrap initial Super Admin', 'error');
      throw err;
    }
  };

  const logoutAdmin = async () => {
    try {
      await api.adminLogout();
    } catch {
      // ignore
    }
    localStorage.removeItem('rp_admin_token');
    localStorage.removeItem('rp_admin_role');
    localStorage.removeItem('rp_admin_email');
    setIsAdminLoggedIn(false);
    setAdminRole(null);
    setAdminEmail(null);
    showToast('Signed out of Admin Portal', 'info');
  };

  return (
    <AuthContext.Provider
      value={{
        studentUser,
        isStudentLoggedIn: Boolean(studentUser),
        isLoadingSession,
        signupWithEmail,
        loginWithEmail,
        verifyEmail,
        verifyEmailConfirmationSession,
        resendVerificationCode,
        requestPasswordReset,
        verifyRecoverySession,
        resetPasswordFromRecovery,
        resetPasswordWithCode,
        changeStudentPassword,
        pendingVerificationEmail,
        setPendingVerificationEmail: (e) => persistPendingVerify(e, null),
        pendingDevVerificationCode,
        setPendingDevVerificationCode: () => setPendingDevVerificationCode(null),
        pendingResetEmail,
        setPendingResetEmail: (e) => persistPendingReset(e, null),
        pendingDevResetCode,
        setPendingDevResetCode: () => setPendingDevResetCode(null),
        authReturnDestination,
        setAuthReturnDestination,
        consumeAuthReturnDestination,
        loginStudent,
        updateStudentProfile,
        logoutStudent,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        isAdminLoggedIn,
        adminRole,
        adminEmail,
        isSuperAdmin: adminRole === 'super_admin',
        loginAdmin,
        bootstrapSuperAdmin,
        logoutAdmin,
        toast,
        showToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
