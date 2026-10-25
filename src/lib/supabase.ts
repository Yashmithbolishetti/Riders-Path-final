import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Access import.meta.env properties directly so Vite's static define replacement works in production builds,
// with a safe fallback for Node test runners.
const viteSupabaseUrl =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env.VITE_SUPABASE_URL
    : undefined;
const viteSupabaseAnonKey =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY
    : undefined;
const nodeEnv =
  typeof process !== 'undefined' && process?.env ? process.env : ({} as Record<string, string | undefined>);

export const supabaseUrl = String(
  viteSupabaseUrl || nodeEnv.VITE_SUPABASE_URL || nodeEnv.SUPABASE_URL || ''
).trim();
export const supabaseAnonKey = String(
  viteSupabaseAnonKey || nodeEnv.VITE_SUPABASE_ANON_KEY || nodeEnv.SUPABASE_ANON_KEY || ''
).trim();

export const isSupabaseBrowserConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const DEFAULT_RECOVERY_REDIRECT_URL = 'https://ridersspath.ai.studio/#reset-password';
export const DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL = 'https://ridersspath.ai.studio/#confirm-email';
export const RECOVERY_SESSION_STORAGE_KEY = 'rp_recovery_session';
export const INITIAL_RECOVERY_URL_STORAGE_KEY = 'rp_initial_recovery_url';
export const CONFIRMATION_SESSION_STORAGE_KEY = 'rp_confirmation_session';
export const INITIAL_CONFIRMATION_URL_STORAGE_KEY = 'rp_initial_confirmation_url';
export const PENDING_AUTH_FLOW_STORAGE_KEY = 'rp_pending_auth_flow';
export const PENDING_VERIFY_AT_STORAGE_KEY = 'rp_pending_verify_at';
export const PENDING_RESET_AT_STORAGE_KEY = 'rp_pending_reset_at';
export const CONFIRM_BUTTON_CLICKED_STORAGE_KEY = 'rp_confirm_button_clicked';
const RECOVERY_SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CONFIRM_CLICK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface PasswordRecoveryUrlState {
  isRecoveryCallback: boolean;
  isResetPasswordRoute: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export interface EmailConfirmationUrlState {
  isConfirmationCallback: boolean;
  isVerifyEmailRoute: boolean;
  isConfirmEmailRoute: boolean;
  confirmationUrl: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export interface StoredRecoverySession {
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenHash?: string | null;
  code?: string | null;
  type?: string | null;
  email?: string | null;
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  capturedAt: number;
}

export interface StoredConfirmationSession {
  confirmationUrl?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenHash?: string | null;
  code?: string | null;
  type?: string | null;
  email?: string | null;
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  capturedAt: number;
}

const SENSITIVE_KEY_PATTERN =
  /token|password|secret|key|authorization|code|hash|confirmation_url|confirmationurl/i;

/**
 * Redacts any sensitive fields from diagnostic metadata so access tokens,
 * refresh tokens, PKCE codes, token hashes, confirmation URLs, and passwords are never printed.
 */
export function sanitizeRecoveryLogDetails(
  details?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!details || typeof details !== 'object') {
    return {};
  }
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    const lowerKey = k.toLowerCase();
    // Allow explicit boolean presence flags and errorCode/statusCode
    if (
      typeof v === 'boolean' ||
      lowerKey === 'errorcode' ||
      lowerKey === 'error_code' ||
      lowerKey === 'statuscode'
    ) {
      safe[k] = v;
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      safe[k] = v ? '[REDACTED]' : null;
      continue;
    }
    if (
      typeof v === 'string' &&
      (v.includes('access_token=') ||
        v.includes('refresh_token=') ||
        v.includes('token_hash=') ||
        v.includes('token=') ||
        v.includes('confirmation_url=') ||
        v.includes('/auth/v1/verify'))
    ) {
      safe[k] = '[REDACTED_URL_PARAMS]';
      continue;
    }
    safe[k] = v;
  }
  return safe;
}

/**
 * Logs password recovery diagnostic events without ever printing tokens, passwords, or secrets.
 */
export function logRecoveryDiagnostic(
  step: string,
  details?: Record<string, unknown> | null
): void {
  try {
    const safeDetails = sanitizeRecoveryLogDetails(details);
    console.info(`[RidersPath:Recovery] ${step}`, safeDetails);
  } catch {
    // Never fail application logic on logging
  }
}

/**
 * Validates and normalizes a Supabase confirmation URL (`{{ .ConfirmationURL }}`),
 * ensuring it is a safe HTTPS (or localhost HTTP) `/auth/v1/verify` endpoint for the
 * configured Supabase project, never a recovery link, and never redirecting to `#reset-password`.
 */
export function sanitizeConfirmationUrl(
  rawUrl?: string | null,
  expectedSupabaseOrigin?: string | null
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }
  let candidate = rawUrl.trim();
  if (!candidate) {
    return null;
  }

  // Decode up to 2 times if percent-encoded in query/hash parameter
  for (let i = 0; i < 2; i++) {
    if (/^https?%3a%2f%2f/i.test(candidate)) {
      try {
        candidate = decodeURIComponent(candidate).trim();
      } catch {
        break;
      }
    }
  }

  // Decode HTML entities if any leaked from an email client (`&amp;`)
  candidate = candidate.replace(/&amp;/gi, '&');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return null;
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const isLocalHttp =
    parsedUrl.protocol === 'http:' &&
    (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

  if (!isHttps && !isLocalHttp) {
    return null;
  }

  if (!/\/auth\/v1\/verify\/?$/i.test(parsedUrl.pathname)) {
    return null;
  }

  const configuredOriginSource =
    expectedSupabaseOrigin !== undefined ? expectedSupabaseOrigin : supabaseUrl;
  if (configuredOriginSource) {
    try {
      const allowedOrigin = new URL(configuredOriginSource).origin;
      if (parsedUrl.origin !== allowedOrigin) {
        return null;
      }
    } catch {
      // Ignore invalid configured origin fallback in unit tests
    }
  }

  const verifyType = (parsedUrl.searchParams.get('type') || '').trim().toLowerCase();
  if (verifyType === 'recovery' || verifyType === 'invite') {
    return null;
  }

  const token = (
    parsedUrl.searchParams.get('token') ||
    parsedUrl.searchParams.get('token_hash') ||
    ''
  ).trim();
  if (!token) {
    return null;
  }

  if (!verifyType) {
    parsedUrl.searchParams.set('type', 'signup');
  }

  const rawRedirectTo = (parsedUrl.searchParams.get('redirect_to') || '').trim();
  const trailingHash = (parsedUrl.hash || '').trim();
  parsedUrl.hash = '';
  const combinedRedirectTo =
    rawRedirectTo && trailingHash && !rawRedirectTo.includes('#')
      ? `${rawRedirectTo}${trailingHash}`
      : rawRedirectTo || trailingHash;

  if (!combinedRedirectTo || /reset-password/i.test(combinedRedirectTo)) {
    parsedUrl.searchParams.set('redirect_to', DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL);
  } else {
    parsedUrl.searchParams.set('redirect_to', combinedRedirectTo);
  }

  return parsedUrl.toString();
}

/**
 * Extracts `confirmation_url` from a raw search or hash string (handling both
 * percent-encoded and unencoded `{{ .ConfirmationURL }}` template values) and returns
 * both the sanitized confirmation URL and the remaining outer string with `confirmation_url` removed.
 */
function extractAndStripConfirmationUrl(
  rawInput: string,
  expectedSupabaseOrigin?: string | null
): {
  confirmationUrl: string | null;
  rawConfirmationUrlProvided: boolean;
  strippedInput: string;
} {
  if (!rawInput) {
    return {
      confirmationUrl: null,
      rawConfirmationUrlProvided: false,
      strippedInput: '',
    };
  }

  const match = rawInput.match(/(?:^|[?&#])confirmation_url=([^]*)$/i);
  if (!match) {
    return {
      confirmationUrl: null,
      rawConfirmationUrlProvided: false,
      strippedInput: rawInput,
    };
  }

  const fullMatchIndex = rawInput.toLowerCase().indexOf('confirmation_url=');
  const prefixBeforeKey =
    fullMatchIndex > 0 ? rawInput.slice(0, fullMatchIndex).replace(/[?&#]+$/, '') : '';
  const rawAfterEquals = rawInput.slice(fullMatchIndex + 'confirmation_url='.length).trim();

  let extractedRaw = rawAfterEquals;
  // If percent-encoded (`https%3A%2F%2F...`), stop at the first `&` or `#` outside the encoded value
  if (/^https?%3a%2f%2f/i.test(rawAfterEquals)) {
    const endIdx = rawAfterEquals.search(/[&#]/);
    if (endIdx !== -1) {
      extractedRaw = rawAfterEquals.slice(0, endIdx);
    }
  }

  const sanitized = sanitizeConfirmationUrl(extractedRaw, expectedSupabaseOrigin);
  return {
    confirmationUrl: sanitized,
    rawConfirmationUrlProvided: true,
    strippedInput: prefixBeforeKey,
  };
}

function decodeJwtPayload(accessToken?: string | null): Record<string, any> | null {
  if (!accessToken || typeof accessToken !== 'string') {
    return null;
  }
  const parts = accessToken.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    let jsonPayload = '';
    if (typeof atob === 'function') {
      jsonPayload = atob(padded);
    } else if (typeof Buffer !== 'undefined') {
      jsonPayload = Buffer.from(padded, 'base64').toString('utf8');
    } else {
      return null;
    }
    const payload = JSON.parse(jsonPayload);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Safely decodes the middle payload segment of a JWT (without logging or exposing the token)
 * and checks whether the `amr` (Authentication Methods Reference) claim indicates a
 * Supabase password recovery session (`method: "recovery"`).
 */
export function isRecoveryAccessToken(accessToken?: string | null): boolean {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return false;
  }
  if (Array.isArray(payload.amr)) {
    return payload.amr.some(
      (entry: any) =>
        entry === 'recovery' ||
        entry === 'invite' ||
        (entry &&
          typeof entry === 'object' &&
          (String(entry.method || '').toLowerCase() === 'recovery' ||
            String(entry.method || '').toLowerCase() === 'invite'))
    );
  }
  return false;
}

/**
 * Checks whether a token is a valid decoded JWT whose `amr` claim explicitly indicates
 * a non-recovery authentication method (e.g., `otp` from signup confirmation or `password`).
 */
export function isNonRecoveryJwtAccessToken(accessToken?: string | null): boolean {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return false;
  }
  return !isRecoveryAccessToken(accessToken);
}

/**
 * Records that the user deliberately clicked the "Confirm Email" button in the current tab.
 * Used so the post-redirect return from Supabase `/auth/v1/verify` can complete seamlessly,
 * while initial page loads / email-scanner prefetches never auto-consume tokens.
 */
export function markUserInitiatedEmailConfirmation(): void {
  const nowStr = String(Date.now());
  try {
    if (typeof window !== 'undefined') {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY, nowStr);
        window.sessionStorage.setItem(PENDING_AUTH_FLOW_STORAGE_KEY, 'signup');
        window.sessionStorage.setItem(PENDING_VERIFY_AT_STORAGE_KEY, nowStr);
      }
      if (window.localStorage) {
        window.localStorage.setItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY, nowStr);
        window.localStorage.setItem(PENDING_AUTH_FLOW_STORAGE_KEY, 'signup');
        window.localStorage.setItem(PENDING_VERIFY_AT_STORAGE_KEY, nowStr);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function hasUserInitiatedEmailConfirmation(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const rawSession = window.sessionStorage?.getItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY);
      const rawLocal = window.localStorage?.getItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY);
      const ts = Number(rawSession || rawLocal || '0') || 0;
      if (ts > 0 && Date.now() - ts <= CONFIRM_CLICK_MAX_AGE_MS) {
        return true;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

export function clearUserInitiatedEmailConfirmation(): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY);
      window.localStorage?.removeItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Removes sensitive query and hash parameters (`confirmation_url`, `token_hash`, `token`,
 * `code`, `access_token`, `refresh_token`, `error_description`) from browser history.
 */
export function scrubSensitiveAuthUrlParams(
  targetHash: '#confirm-email' | '#verify-email' | '#reset-password' = '#confirm-email'
): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) {
    return;
  }
  try {
    const rawPathname = (window.location.pathname || '/').trim() || '/';
    const normalizedPath =
      rawPathname.replace(/\/(reset-password|verify-email|confirm-email)\/?$/i, '') || '/';
    const cleanUrl = `${normalizedPath}${targetHash}`;
    const currentFull = `${window.location.pathname || '/'}${window.location.search || ''}${
      window.location.hash || ''
    }`;
    if (currentFull !== cleanUrl) {
      window.history.replaceState(null, '', cleanUrl);
    }
  } catch {
    // Ignore history errors
  }
}

interface ExtractedUrlCallbackParams {
  hashRouteName: string;
  lastPathSegment: string;
  isDirectResetRoute: boolean;
  isDirectVerifyRoute: boolean;
  isDirectConfirmRoute: boolean;
  confirmationUrl: string | null;
  type: string | null;
  flow: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  hasAuthError: boolean;
  hasAnyAuthParam: boolean;
  isConfirmationCallback: boolean;
  isRecoveryCallback: boolean;
}

function extractUrlCallbackParams(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null,
  expectedSupabaseOrigin?: string | null
): ExtractedUrlCallbackParams {
  const empty: ExtractedUrlCallbackParams = {
    hashRouteName: '',
    lastPathSegment: '',
    isDirectResetRoute: false,
    isDirectVerifyRoute: false,
    isDirectConfirmRoute: false,
    confirmationUrl: null,
    type: null,
    flow: null,
    accessToken: null,
    refreshToken: null,
    tokenHash: null,
    code: null,
    error: null,
    errorCode: null,
    errorDescription: null,
    hasAuthError: false,
    hasAnyAuthParam: false,
    isConfirmationCallback: false,
    isRecoveryCallback: false,
  };

  if (!locationLike) {
    return empty;
  }

  const rawHashInput = typeof locationLike.hash === 'string' ? locationLike.hash.trim() : '';
  const rawSearchInput = typeof locationLike.search === 'string' ? locationLike.search.trim() : '';
  const rawPathname = typeof locationLike.pathname === 'string' ? locationLike.pathname.trim() : '';

  // Extract and strip any nested confirmation_url=... FIRST so nested parameters
  // (like redirect_to=...#reset-password) never pollute outer route/parameter parsing.
  const searchConfirmExtract = extractAndStripConfirmationUrl(
    rawSearchInput,
    expectedSupabaseOrigin
  );
  const hashConfirmExtract = extractAndStripConfirmationUrl(
    rawHashInput,
    expectedSupabaseOrigin
  );

  const confirmationUrl =
    hashConfirmExtract.confirmationUrl || searchConfirmExtract.confirmationUrl || null;
  const rawConfirmationUrlProvided =
    hashConfirmExtract.rawConfirmationUrlProvided ||
    searchConfirmExtract.rawConfirmationUrlProvided;

  const rawSearch = searchConfirmExtract.strippedInput;
  const rawHash = hashConfirmExtract.strippedInput;

  const searchParams = new URLSearchParams(rawSearch.replace(/^\?/, ''));
  const hashParams = new URLSearchParams();

  const hashSegments = rawHash
    .split('#')
    .map((s) => s.replace(/^\/+/, '').trim())
    .filter(Boolean);

  const hashRouteCandidates: string[] = [];

  for (const segment of hashSegments) {
    const queryParts = segment.split('?').filter(Boolean);
    for (const part of queryParts) {
      const ampTokens = part.split('&').filter(Boolean);
      const paramTokens: string[] = [];
      for (const token of ampTokens) {
        const eqIndex = token.indexOf('=');
        if (eqIndex === -1) {
          hashRouteCandidates.push(token.replace(/^\/+/, '').trim());
        } else {
          const keyCandidate = token.slice(0, eqIndex).replace(/^\/+/, '').trim().toLowerCase();
          const valCandidate = token.slice(eqIndex + 1).trim();
          if (
            !valCandidate &&
            (keyCandidate === 'confirm-email' ||
              keyCandidate === 'verify-email' ||
              keyCandidate === 'reset-password')
          ) {
            // Supabase GoTrue url.ParseQuery(u.Fragment) + q.Encode() encodes `#confirm-email`
            // as `#confirm-email=&error=access_denied&error_code=otp_expired...`
            hashRouteCandidates.push(keyCandidate);
          } else {
            paramTokens.push(token);
          }
        }
      }
      if (paramTokens.length > 0) {
        const parsedSub = new URLSearchParams(paramTokens.join('&'));
        parsedSub.forEach((value, key) => hashParams.set(key, value));
      }
    }
  }

  let hashRouteName = hashRouteCandidates[0] || '';
  if (hashRouteCandidates.some((c) => c.toLowerCase() === 'confirm-email')) {
    hashRouteName = 'confirm-email';
  } else if (hashRouteCandidates.some((c) => c.toLowerCase() === 'verify-email')) {
    hashRouteName = 'verify-email';
  } else if (hashRouteCandidates.some((c) => c.toLowerCase() === 'reset-password')) {
    hashRouteName = 'reset-password';
  }

  const lastPathSegment = rawPathname.split('/').filter(Boolean).pop()?.toLowerCase() ?? '';
  const lowerHashRoute = hashRouteName.toLowerCase();

  const isDirectConfirmRoute =
    lowerHashRoute === 'confirm-email' || lastPathSegment === 'confirm-email';
  const isDirectVerifyRoute =
    isDirectConfirmRoute ||
    lowerHashRoute === 'verify-email' ||
    lastPathSegment === 'verify-email';
  const isDirectResetRoute =
    !isDirectVerifyRoute &&
    (lowerHashRoute === 'reset-password' || lastPathSegment === 'reset-password');

  const type =
    (hashParams.get('type') || searchParams.get('type') || '').trim().toLowerCase() || null;
  const flow =
    (hashParams.get('flow') || searchParams.get('flow') || '').trim().toLowerCase() || null;
  const accessToken =
    (hashParams.get('access_token') || searchParams.get('access_token') || '').trim() || null;
  const refreshToken =
    (hashParams.get('refresh_token') || searchParams.get('refresh_token') || '').trim() || null;
  const rawTokenHash =
    (
      hashParams.get('token_hash') ||
      searchParams.get('token_hash') ||
      hashParams.get('token') ||
      searchParams.get('token') ||
      ''
    ).trim() || null;
  const code = (searchParams.get('code') || hashParams.get('code') || '').trim() || null;

  let error = (hashParams.get('error') || searchParams.get('error') || '').trim() || null;
  let errorCode =
    (hashParams.get('error_code') || searchParams.get('error_code') || '').trim() || null;
  let errorDescription =
    (hashParams.get('error_description') || searchParams.get('error_description') || '').trim() ||
    null;

  if (rawConfirmationUrlProvided && !confirmationUrl && !error && !errorCode) {
    error = 'invalid_confirmation_url';
    errorCode = 'invalid_confirmation_url';
    errorDescription =
      'This email confirmation link is invalid or malformed. Please request a new confirmation email.';
  }

  const hasAuthError = Boolean(error || errorCode || errorDescription);
  const hasAnyAuthParam =
    Boolean(confirmationUrl) ||
    rawConfirmationUrlProvided ||
    Boolean(type) ||
    Boolean(accessToken) ||
    Boolean(rawTokenHash) ||
    Boolean(code) ||
    hasAuthError;

  const isExplicitConfirmType =
    Boolean(confirmationUrl) ||
    rawConfirmationUrlProvided ||
    type === 'signup' ||
    type === 'email' ||
    type === 'email_change' ||
    flow === 'signup';
  const isExplicitRecoveryType =
    !isExplicitConfirmType &&
    (type === 'recovery' || type === 'invite' || flow === 'recovery');

  const jwtIsRecovery = isRecoveryAccessToken(accessToken);
  const jwtIsNonRecovery = isNonRecoveryJwtAccessToken(accessToken);

  const now = Date.now();
  let pendingFlow = '';
  let hasPendingVerifyEmail = false;
  let hasPendingResetEmail = false;
  let verifyAt = 0;
  let resetAt = 0;
  let confirmClickedAt = 0;

  try {
    if (typeof window !== 'undefined') {
      let sFlow = '';
      let lFlow = '';
      let sVerifyAt = 0;
      let lVerifyAt = 0;
      let sResetAt = 0;
      let lResetAt = 0;
      let sClickAt = 0;
      let lClickAt = 0;

      if (window.sessionStorage) {
        sFlow = window.sessionStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) || '';
        sVerifyAt = Number(window.sessionStorage.getItem(PENDING_VERIFY_AT_STORAGE_KEY) || '0') || 0;
        sResetAt = Number(window.sessionStorage.getItem(PENDING_RESET_AT_STORAGE_KEY) || '0') || 0;
        sClickAt =
          Number(window.sessionStorage.getItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY) || '0') || 0;
        hasPendingVerifyEmail = Boolean(window.sessionStorage.getItem('rp_pending_verify_email'));
        hasPendingResetEmail = Boolean(window.sessionStorage.getItem('rp_pending_reset_email'));
      }
      if (window.localStorage) {
        lFlow = window.localStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) || '';
        lVerifyAt = Number(window.localStorage.getItem(PENDING_VERIFY_AT_STORAGE_KEY) || '0') || 0;
        lResetAt = Number(window.localStorage.getItem(PENDING_RESET_AT_STORAGE_KEY) || '0') || 0;
        lClickAt =
          Number(window.localStorage.getItem(CONFIRM_BUTTON_CLICKED_STORAGE_KEY) || '0') || 0;
        if (!hasPendingVerifyEmail) {
          hasPendingVerifyEmail = Boolean(window.localStorage.getItem('rp_pending_verify_email'));
        }
        if (!hasPendingResetEmail) {
          hasPendingResetEmail = Boolean(window.localStorage.getItem('rp_pending_reset_email'));
        }
      }

      verifyAt = Math.max(sVerifyAt, lVerifyAt);
      resetAt = Math.max(sResetAt, lResetAt);
      confirmClickedAt = Math.max(sClickAt, lClickAt);
      pendingFlow = sFlow || lFlow;
    }
  } catch {
    // Ignore storage access errors
  }

  const isResetExpired = resetAt > 0 && now - resetAt > RECOVERY_SESSION_MAX_AGE_MS;
  const isVerifyExpired = verifyAt > 0 && now - verifyAt > RECOVERY_SESSION_MAX_AGE_MS;

  if (isResetExpired || (!resetAt && pendingFlow !== 'recovery')) {
    hasPendingResetEmail = false;
    if (pendingFlow === 'recovery') {
      pendingFlow = '';
    }
    try {
      if (typeof window !== 'undefined') {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem('rp_pending_reset_email');
          window.sessionStorage.removeItem(PENDING_RESET_AT_STORAGE_KEY);
          if (window.sessionStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) === 'recovery') {
            window.sessionStorage.removeItem(PENDING_AUTH_FLOW_STORAGE_KEY);
          }
        }
        if (window.localStorage) {
          window.localStorage.removeItem('rp_pending_reset_email');
          window.localStorage.removeItem(PENDING_RESET_AT_STORAGE_KEY);
          if (window.localStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) === 'recovery') {
            window.localStorage.removeItem(PENDING_AUTH_FLOW_STORAGE_KEY);
          }
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }
  if (isVerifyExpired) {
    hasPendingVerifyEmail = false;
    if (pendingFlow === 'signup') {
      pendingFlow = '';
    }
    try {
      if (typeof window !== 'undefined') {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem('rp_pending_verify_email');
          window.sessionStorage.removeItem(PENDING_VERIFY_AT_STORAGE_KEY);
          if (window.sessionStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) === 'signup') {
            window.sessionStorage.removeItem(PENDING_AUTH_FLOW_STORAGE_KEY);
          }
        }
        if (window.localStorage) {
          window.localStorage.removeItem('rp_pending_verify_email');
          window.localStorage.removeItem(PENDING_VERIFY_AT_STORAGE_KEY);
          if (window.localStorage.getItem(PENDING_AUTH_FLOW_STORAGE_KEY) === 'signup') {
            window.localStorage.removeItem(PENDING_AUTH_FLOW_STORAGE_KEY);
          }
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }
  if (
    (hasPendingVerifyEmail || (!isVerifyExpired && verifyAt > 0)) &&
    (!hasPendingResetEmail || verifyAt >= resetAt)
  ) {
    hasPendingResetEmail = false;
    pendingFlow = 'signup';
  }

  const hasActiveConfirmClick =
    confirmClickedAt > 0 && now - confirmClickedAt <= CONFIRM_CLICK_MAX_AGE_MS;

  const hasPendingVerifyInStorage =
    hasActiveConfirmClick ||
    pendingFlow === 'signup' ||
    (hasPendingVerifyEmail && pendingFlow !== 'recovery' && !hasPendingResetEmail);
  const hasPendingResetInStorage =
    !hasActiveConfirmClick &&
    !isResetExpired &&
    (pendingFlow === 'recovery' ||
      (hasPendingResetEmail && pendingFlow !== 'signup' && !hasPendingVerifyEmail));

  let isConfirmationCallback = false;
  let isRecoveryCallback = false;

  if (hasAnyAuthParam) {
    if (!isExplicitRecoveryType && !jwtIsRecovery && (isExplicitConfirmType || jwtIsNonRecovery)) {
      // Explicit signup/email confirmation signal, confirmation_url, or non-recovery JWT ALWAYS wins,
      // even if Supabase Site URL, current route, or stale storage contains reset-password/recovery.
      isConfirmationCallback = true;
    } else if (
      !isExplicitConfirmType &&
      !jwtIsNonRecovery &&
      (isExplicitRecoveryType || jwtIsRecovery)
    ) {
      isRecoveryCallback = true;
    } else if (isDirectVerifyRoute || hasPendingVerifyInStorage) {
      isConfirmationCallback = true;
    } else if (hasPendingResetInStorage) {
      // Untyped callbacks (?code= or #error=) are only classified as recovery when supported
      // by active pending-recovery storage evidence—never by route name (#reset-password) alone.
      isRecoveryCallback = true;
    } else {
      // Untyped auth callback (?code= or #error=) without active recovery evidence defaults to
      // email confirmation even if the URL contains /reset-password or #reset-password.
      isConfirmationCallback = true;
    }
  }

  return {
    hashRouteName,
    lastPathSegment,
    isDirectResetRoute,
    isDirectVerifyRoute,
    isDirectConfirmRoute,
    confirmationUrl,
    type,
    flow,
    accessToken,
    refreshToken,
    tokenHash: rawTokenHash,
    code,
    error,
    errorCode,
    errorDescription,
    hasAuthError,
    hasAnyAuthParam,
    isConfirmationCallback,
    isRecoveryCallback,
  };
}

/**
 * Parses URL hash, query string, and pathname to detect Supabase Auth
 * email confirmation / signup verification links (`confirmation_url=...`, `type=signup`, `type=email`, `#confirm-email`, `#verify-email`).
 */
export function parseEmailConfirmationUrl(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null,
  expectedSupabaseOrigin?: string | null
): EmailConfirmationUrlState {
  const extracted = extractUrlCallbackParams(locationLike, expectedSupabaseOrigin);
  return {
    isConfirmationCallback: extracted.isConfirmationCallback,
    isVerifyEmailRoute: extracted.isDirectVerifyRoute || extracted.isConfirmationCallback,
    isConfirmEmailRoute:
      extracted.isDirectConfirmRoute ||
      Boolean(extracted.confirmationUrl) ||
      extracted.isConfirmationCallback,
    confirmationUrl: extracted.confirmationUrl,
    accessToken: extracted.accessToken,
    refreshToken: extracted.refreshToken,
    tokenHash: extracted.tokenHash,
    code: extracted.code,
    type: extracted.type,
    error: extracted.error,
    errorCode: extracted.errorCode,
    errorDescription: extracted.errorDescription,
  };
}

/**
 * Parses URL hash, query string, and pathname to detect Supabase Auth
 * password recovery links (valid recovery tokens, token_hash, PKCE codes, or expired/invalid link errors).
 * Never matches signup or email confirmation links (`confirmation_url`, `type=signup`, `type=email`).
 */
export function parsePasswordRecoveryUrl(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null
): PasswordRecoveryUrlState {
  const extracted = extractUrlCallbackParams(locationLike);
  return {
    isRecoveryCallback: extracted.isRecoveryCallback,
    isResetPasswordRoute:
      (extracted.isDirectResetRoute && !extracted.isConfirmationCallback) ||
      extracted.isRecoveryCallback,
    accessToken: extracted.isConfirmationCallback ? null : extracted.accessToken,
    refreshToken: extracted.isConfirmationCallback ? null : extracted.refreshToken,
    tokenHash: extracted.isConfirmationCallback ? null : extracted.tokenHash,
    code: extracted.isConfirmationCallback ? null : extracted.code,
    type: extracted.isConfirmationCallback ? null : extracted.type,
    error: extracted.isConfirmationCallback ? null : extracted.error,
    errorCode: extracted.isConfirmationCallback ? null : extracted.errorCode,
    errorDescription: extracted.isConfirmationCallback ? null : extracted.errorDescription,
  };
}

export function formatRecoveryErrorMessage(
  state?: {
    error?: string | null;
    errorCode?: string | null;
    errorDescription?: string | null;
  } | null
): string {
  if (!state) {
    return 'This password reset link is invalid or has expired. Please request a new reset email.';
  }
  const code = (state.errorCode || '').toLowerCase();
  const desc = (state.errorDescription || '').trim();
  const lowerDesc = desc.toLowerCase();

  if (
    code === 'otp_expired' ||
    lowerDesc.includes('expired') ||
    lowerDesc.includes('invalid') ||
    (state.error || '').toLowerCase() === 'access_denied'
  ) {
    return 'This password reset link is invalid or has expired. Recovery links can only be used once—please request a new reset email below.';
  }
  if (desc) {
    return desc;
  }
  return 'This password reset link is invalid or has expired. Please request a new reset email.';
}

export function formatConfirmationErrorMessage(
  state?: {
    error?: string | null;
    errorCode?: string | null;
    errorDescription?: string | null;
  } | null
): string {
  if (!state) {
    return 'This email confirmation link is invalid or has expired. Please request a new confirmation email below.';
  }
  const code = (state.errorCode || '').toLowerCase();
  const desc = (state.errorDescription || '').trim();
  const lowerDesc = desc.toLowerCase();

  if (
    code === 'otp_expired' ||
    lowerDesc.includes('expired') ||
    lowerDesc.includes('invalid') ||
    (state.error || '').toLowerCase() === 'access_denied'
  ) {
    return 'This email confirmation link is invalid or has expired. Confirmation links can only be used once—please resend a new confirmation link below.';
  }
  if (desc) {
    return desc;
  }
  return 'This email confirmation link is invalid or has expired. Please request a new confirmation email below.';
}

let inMemoryRecoveryState: StoredRecoverySession | null = null;
type RecoveryStateListener = (state: StoredRecoverySession) => void;
const recoveryListeners = new Set<RecoveryStateListener>();

export function onRecoverySessionDetected(listener: RecoveryStateListener): () => void {
  recoveryListeners.add(listener);
  return () => {
    recoveryListeners.delete(listener);
  };
}

function notifyRecoveryListeners(state: StoredRecoverySession): void {
  recoveryListeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Ignore listener errors
    }
  });
}

let inMemoryConfirmationState: StoredConfirmationSession | null = null;
type ConfirmationStateListener = (state: StoredConfirmationSession) => void;
const confirmationListeners = new Set<ConfirmationStateListener>();

export function onConfirmationSessionDetected(listener: ConfirmationStateListener): () => void {
  confirmationListeners.add(listener);
  return () => {
    confirmationListeners.delete(listener);
  };
}

function notifyConfirmationListeners(state: StoredConfirmationSession): void {
  confirmationListeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Ignore listener errors
    }
  });
}

export function saveConfirmationSession(
  session: Omit<StoredConfirmationSession, 'capturedAt'>
): void {
  const payload: StoredConfirmationSession = {
    ...session,
    capturedAt: Date.now(),
  };
  inMemoryConfirmationState = payload;
  inMemoryRecoveryState = null;
  try {
    if (typeof window !== 'undefined') {
      delete (window as any).__RP_INITIAL_RECOVERY_URL__;
      if (window.sessionStorage) {
        window.sessionStorage.setItem(CONFIRMATION_SESSION_STORAGE_KEY, JSON.stringify(payload));
        window.sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(INITIAL_RECOVERY_URL_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
  notifyConfirmationListeners(payload);
}

export function getStoredConfirmationState(): StoredConfirmationSession | null {
  if (inMemoryConfirmationState) {
    if (Date.now() - inMemoryConfirmationState.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS) {
      return inMemoryConfirmationState;
    }
    inMemoryConfirmationState = null;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(CONFIRMATION_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredConfirmationSession;
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.capturedAt === 'number' &&
          Date.now() - parsed.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS
        ) {
          inMemoryConfirmationState = parsed;
          return parsed;
        }
        window.sessionStorage.removeItem(CONFIRMATION_SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function clearConfirmationSession(): void {
  inMemoryConfirmationState = null;
  clearUserInitiatedEmailConfirmation();
  try {
    if (typeof window !== 'undefined') {
      delete (window as any).__RP_INITIAL_CONFIRMATION_URL__;
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(CONFIRMATION_SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(INITIAL_CONFIRMATION_URL_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
}

export function saveRecoverySession(session: Omit<StoredRecoverySession, 'capturedAt'>): void {
  const payload: StoredRecoverySession = {
    ...session,
    capturedAt: Date.now(),
  };
  inMemoryRecoveryState = payload;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(RECOVERY_SESSION_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore sessionStorage errors
  }
  logRecoveryDiagnostic('saveRecoverySession', {
    hasAccessToken: Boolean(payload.accessToken),
    hasRefreshToken: Boolean(payload.refreshToken),
    hasTokenHash: Boolean(payload.tokenHash),
    hasCode: Boolean(payload.code),
    hasEmail: Boolean(payload.email),
    errorCode: payload.errorCode || null,
  });
  notifyRecoveryListeners(payload);
}

export function getStoredRecoveryState(): StoredRecoverySession | null {
  if (inMemoryRecoveryState) {
    if (Date.now() - inMemoryRecoveryState.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS) {
      return inMemoryRecoveryState;
    }
    inMemoryRecoveryState = null;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(RECOVERY_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredRecoverySession;
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.capturedAt === 'number' &&
          Date.now() - parsed.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS
        ) {
          inMemoryRecoveryState = parsed;
          return parsed;
        }
        window.sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function clearRecoverySession(): void {
  inMemoryRecoveryState = null;
  try {
    if (typeof window !== 'undefined') {
      delete (window as any).__RP_INITIAL_RECOVERY_URL__;
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(INITIAL_RECOVERY_URL_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
  logRecoveryDiagnostic('clearRecoverySession', { cleared: true });
}

function consumePreModuleConfirmationSnapshot(): {
  hash?: string;
  search?: string;
  pathname?: string;
} | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const winSnap = (window as any).__RP_INITIAL_CONFIRMATION_URL__;
    if (winSnap && typeof winSnap === 'object') {
      return winSnap;
    }
    if (window.sessionStorage) {
      const raw = window.sessionStorage.getItem(INITIAL_CONFIRMATION_URL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.capturedAt === 'number' &&
          Date.now() - parsed.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS
        ) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function consumePreModuleRecoverySnapshot(): {
  hash?: string;
  search?: string;
  pathname?: string;
} | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const winSnap = (window as any).__RP_INITIAL_RECOVERY_URL__;
    if (winSnap && typeof winSnap === 'object') {
      return winSnap;
    }
    if (window.sessionStorage) {
      const raw = window.sessionStorage.getItem(INITIAL_RECOVERY_URL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.capturedAt === 'number' &&
          Date.now() - parsed.capturedAt <= RECOVERY_SESSION_MAX_AGE_MS
        ) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Inspects the current browser URL (or provided location), pre-module confirmation snapshot,
 * and persisted confirmation state before hash routing or Supabase URL cleanup removes them.
 * Never auto-consumes one-time confirmation links or tokens.
 */
export function captureCurrentConfirmationUrlState(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null
): EmailConfirmationUrlState {
  const target =
    locationLike !== undefined
      ? locationLike
      : typeof window !== 'undefined'
      ? window.location
      : null;

  let parsed = parseEmailConfirmationUrl(target);

  const isBrowserLocation =
    typeof window !== 'undefined' && (locationLike === undefined || locationLike === window.location);
  const isStrippedHash =
    !target ||
    !target.hash ||
    target.hash === '#' ||
    target.hash === '#verify-email' ||
    target.hash === '#confirm-email';

  if (!parsed.isConfirmationCallback && (isBrowserLocation || isStrippedHash)) {
    const preSnap = consumePreModuleConfirmationSnapshot();
    if (preSnap) {
      const snapParsed = parseEmailConfirmationUrl(preSnap);
      if (snapParsed.isConfirmationCallback) {
        parsed = snapParsed;
      }
    }
  }

  if (parsed.isConfirmationCallback) {
    if (parsed.error || parsed.errorCode || parsed.errorDescription) {
      saveConfirmationSession({
        confirmationUrl: null,
        accessToken: null,
        refreshToken: null,
        tokenHash: null,
        code: null,
        type: parsed.type || 'signup',
        error: parsed.error,
        errorCode: parsed.errorCode,
        errorDescription: parsed.errorDescription,
      });
    } else if (
      parsed.confirmationUrl ||
      parsed.accessToken ||
      parsed.tokenHash ||
      parsed.code
    ) {
      saveConfirmationSession({
        confirmationUrl: parsed.confirmationUrl,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        tokenHash: parsed.tokenHash,
        code: parsed.code,
        type: parsed.type || 'signup',
        error: null,
        errorCode: null,
        errorDescription: null,
      });
    }
    if (isBrowserLocation) {
      scrubSensitiveAuthUrlParams('#confirm-email');
    }
    return parsed;
  }

  const stored = getStoredConfirmationState();
  if (
    stored &&
    (stored.confirmationUrl ||
      stored.accessToken ||
      stored.tokenHash ||
      stored.code ||
      stored.error ||
      stored.errorCode ||
      stored.errorDescription)
  ) {
    return {
      isConfirmationCallback: true,
      isVerifyEmailRoute: true,
      isConfirmEmailRoute: true,
      confirmationUrl: stored.confirmationUrl || null,
      accessToken: stored.accessToken || null,
      refreshToken: stored.refreshToken || null,
      tokenHash: stored.tokenHash || null,
      code: stored.code || null,
      type: stored.type || 'signup',
      error: stored.error || null,
      errorCode: stored.errorCode || null,
      errorDescription: stored.errorDescription || null,
    };
  }

  return parsed;
}

export function hasPendingConfirmationSession(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null
): boolean {
  const state = captureCurrentConfirmationUrlState(locationLike);
  return state.isConfirmationCallback;
}

/**
 * Inspects the current browser URL (or provided location), pre-module URL snapshot,
 * and persisted recovery state before hash routing or Supabase URL cleanup removes them.
 */
export function captureCurrentRecoveryUrlState(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null
): PasswordRecoveryUrlState {
  const target =
    locationLike !== undefined
      ? locationLike
      : typeof window !== 'undefined'
      ? window.location
      : null;

  // Never treat an explicit email confirmation callback or confirmation route as password recovery
  const directConfirm = parseEmailConfirmationUrl(target);
  if (
    directConfirm.isConfirmationCallback ||
    directConfirm.isConfirmEmailRoute ||
    directConfirm.isVerifyEmailRoute
  ) {
    if (directConfirm.isConfirmationCallback) {
      captureCurrentConfirmationUrlState(target);
    }
    return {
      isRecoveryCallback: false,
      isResetPasswordRoute: false,
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      code: null,
      type: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    };
  }

  let parsed = parsePasswordRecoveryUrl(target);

  const isBrowserLocation =
    typeof window !== 'undefined' && (locationLike === undefined || locationLike === window.location);
  const isStrippedHash =
    !target || !target.hash || target.hash === '#' || target.hash === '#reset-password';

  if (!parsed.isRecoveryCallback && (isBrowserLocation || isStrippedHash)) {
    const preConfirmSnap = consumePreModuleConfirmationSnapshot();
    if (preConfirmSnap) {
      const snapConfirm = parseEmailConfirmationUrl(preConfirmSnap);
      if (snapConfirm.isConfirmationCallback) {
        captureCurrentConfirmationUrlState(preConfirmSnap);
        return {
          isRecoveryCallback: false,
          isResetPasswordRoute: false,
          accessToken: null,
          refreshToken: null,
          tokenHash: null,
          code: null,
          type: null,
          error: null,
          errorCode: null,
          errorDescription: null,
        };
      }
    }

    const preSnap = consumePreModuleRecoverySnapshot();
    if (preSnap) {
      const snapConfirm = parseEmailConfirmationUrl(preSnap);
      if (snapConfirm.isConfirmationCallback) {
        captureCurrentConfirmationUrlState(preSnap);
        return {
          isRecoveryCallback: false,
          isResetPasswordRoute: false,
          accessToken: null,
          refreshToken: null,
          tokenHash: null,
          code: null,
          type: null,
          error: null,
          errorCode: null,
          errorDescription: null,
        };
      }
      const snapParsed = parsePasswordRecoveryUrl(preSnap);
      if (snapParsed.isRecoveryCallback || snapParsed.isResetPasswordRoute) {
        parsed = snapParsed;
      }
    }
  }

  if (parsed.isRecoveryCallback) {
    if (parsed.error || parsed.errorCode || parsed.errorDescription) {
      saveRecoverySession({
        accessToken: null,
        refreshToken: null,
        tokenHash: null,
        code: null,
        type: parsed.type || 'recovery',
        error: parsed.error,
        errorCode: parsed.errorCode,
        errorDescription: parsed.errorDescription,
      });
    } else if (parsed.accessToken || parsed.tokenHash || parsed.code) {
      saveRecoverySession({
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        tokenHash: parsed.tokenHash,
        code: parsed.code,
        type: parsed.type || 'recovery',
        error: null,
        errorCode: null,
        errorDescription: null,
      });
    }
    return parsed;
  }

  const storedConfirm = getStoredConfirmationState();
  const stored = getStoredRecoveryState();
  if (
    storedConfirm &&
    (storedConfirm.confirmationUrl ||
      storedConfirm.accessToken ||
      storedConfirm.tokenHash ||
      storedConfirm.code ||
      storedConfirm.error ||
      storedConfirm.errorCode ||
      storedConfirm.errorDescription) &&
    (!stored || storedConfirm.capturedAt >= stored.capturedAt)
  ) {
    return {
      isRecoveryCallback: false,
      isResetPasswordRoute: false,
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      code: null,
      type: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    };
  }

  // Also check if a recovery session was already captured earlier in this tab
  // (e.g., before GoTrueClient executed `window.location.hash = ''`).
  if (
    stored &&
    (stored.accessToken ||
      stored.tokenHash ||
      stored.code ||
      stored.error ||
      stored.errorCode ||
      stored.errorDescription)
  ) {
    return {
      isRecoveryCallback: true,
      isResetPasswordRoute: true,
      accessToken: stored.accessToken || null,
      refreshToken: stored.refreshToken || null,
      tokenHash: stored.tokenHash || null,
      code: stored.code || null,
      type: stored.type || 'recovery',
      error: stored.error || null,
      errorCode: stored.errorCode || null,
      errorDescription: stored.errorDescription || null,
    };
  }

  return parsed;
}

/**
 * Returns true whenever the current tab has an active, unconsumed password recovery
 * callback or stored recovery session/error that should display the Reset Password screen.
 */
export function hasPendingRecoverySession(
  locationLike?: {
    hash?: string;
    search?: string;
    pathname?: string;
  } | null
): boolean {
  if (hasPendingConfirmationSession(locationLike)) {
    return false;
  }
  const state = captureCurrentRecoveryUrlState(locationLike);
  return state.isRecoveryCallback || state.isResetPasswordRoute;
}

// Capture any confirmation or recovery tokens/errors from the initial page load URL BEFORE
// createClient() / GoTrueClient._initialize() mutates window.location.hash.
if (typeof window !== 'undefined') {
  const initialConfirm = captureCurrentConfirmationUrlState(window.location);
  if (initialConfirm.isConfirmationCallback || initialConfirm.isConfirmEmailRoute) {
    scrubSensitiveAuthUrlParams('#confirm-email');
  } else {
    const initial = captureCurrentRecoveryUrlState(window.location);
    if (initial.isRecoveryCallback || initial.isResetPasswordRoute) {
      logRecoveryDiagnostic('initialUrlCaptured', {
        isRecoveryCallback: initial.isRecoveryCallback,
        isResetPasswordRoute: initial.isResetPasswordRoute,
        hasAccessToken: Boolean(initial.accessToken),
        hasRefreshToken: Boolean(initial.refreshToken),
        hasTokenHash: Boolean(initial.tokenHash),
        hasCode: Boolean(initial.code),
        type: initial.type,
        errorCode: initial.errorCode,
      });
      scrubSensitiveAuthUrlParams('#reset-password');
    }
  }
}

let browserClient: SupabaseClient | null = null;

/**
 * Returns the singleton browser Supabase client configured with
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 * Never auto-consumes one-time signup confirmation tokens on page load;
 * confirmation tokens are only consumed when the user clicks "Confirm Email".
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseBrowserConfigured) {
    return null;
  }
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: ((url: URL, params: Record<string, string>) => {
          const locLike = {
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
          };
          const confirmParsed = parseEmailConfirmationUrl(locLike);
          if (
            confirmParsed.isConfirmationCallback ||
            confirmParsed.isConfirmEmailRoute ||
            confirmParsed.isVerifyEmailRoute ||
            hasPendingConfirmationSession(locLike)
          ) {
            captureCurrentConfirmationUrlState(locLike);
            scrubSensitiveAuthUrlParams('#confirm-email');
            // Return false so GoTrueClient never auto-consumes a confirmation code/token on page load
            return false;
          }

          if (
            params?.access_token ||
            params?.code ||
            params?.token_hash ||
            params?.error ||
            params?.error_code ||
            params?.error_description
          ) {
            const recoveryState = captureCurrentRecoveryUrlState(locLike);
            if (recoveryState.isRecoveryCallback || recoveryState.isResetPasswordRoute) {
              scrubSensitiveAuthUrlParams('#reset-password');
            } else {
              captureCurrentConfirmationUrlState(locLike);
              scrubSensitiveAuthUrlParams('#confirm-email');
            }
            // Return false so verifyRecoverySession / verifyEmailConfirmationSession performs a single controlled verification without racing GoTrueClient
            return false;
          }
          return false;
        }) as any,
      },
    });

    if (typeof window !== 'undefined') {
      const storedInitialRecovery = getStoredRecoveryState();
      if (
        !hasPendingConfirmationSession() &&
        storedInitialRecovery?.accessToken &&
        storedInitialRecovery?.refreshToken
      ) {
        browserClient.auth
          .setSession({
            access_token: storedInitialRecovery.accessToken,
            refresh_token: storedInitialRecovery.refreshToken,
          })
          .catch(() => {});
      }

      browserClient.auth.onAuthStateChange((event, session) => {
        const jwtIsRecovery = isRecoveryAccessToken(session?.access_token);
        const jwtIsNonRecovery = isNonRecoveryJwtAccessToken(session?.access_token);
        const pendingConfirm = hasPendingConfirmationSession();
        const pendingRecovery = hasPendingRecoverySession();

        // If a session is established and we have a pending confirmation callback (or a PKCE code
        // was exchanged into a non-recovery JWT), route to email confirmation (#confirm-email).
        if (
          event !== 'PASSWORD_RECOVERY' &&
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
          session?.access_token &&
          (pendingConfirm || (jwtIsNonRecovery && !jwtIsRecovery && pendingRecovery))
        ) {
          clearRecoverySession();
          saveConfirmationSession({
            accessToken: session.access_token,
            refreshToken: session.refresh_token || null,
            email: session.user?.email || null,
            type: 'signup',
            error: null,
            errorCode: null,
            errorDescription: null,
          });
          scrubSensitiveAuthUrlParams('#confirm-email');
          return;
        }

        if (
          event === 'PASSWORD_RECOVERY' ||
          ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
            session?.access_token &&
            !pendingConfirm &&
            (jwtIsRecovery || (pendingRecovery && !jwtIsNonRecovery)))
        ) {
          logRecoveryDiagnostic('authStateChangeRecoveryDetected', {
            event,
            isJwtRecoveryAmr: jwtIsRecovery,
            hadPendingRecovery: pendingRecovery,
            hasAccessToken: Boolean(session?.access_token),
            hasRefreshToken: Boolean(session?.refresh_token),
          });

          if (session?.access_token) {
            saveRecoverySession({
              accessToken: session.access_token,
              refreshToken: session.refresh_token || null,
              email: session.user?.email || null,
              error: null,
              errorCode: null,
              errorDescription: null,
            });
          }

          scrubSensitiveAuthUrlParams('#reset-password');
        }
      });
    }
  }
  return browserClient;
}

export const supabase = getSupabaseBrowserClient();

/**
 * Retrieves the current Supabase Auth session access token (JWT) from the browser client,
 * or null if Supabase is not configured or no active session exists.
 */
export async function getBrowserAccessToken(): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return null;
  }
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    return null;
  }
  return data.session.access_token;
}

/**
 * Synchronizes a verified Supabase Auth session (access_token + refresh_token)
 * into the browser Supabase client when configured.
 */
export async function syncBrowserSupabaseSession(
  accessToken?: string | null,
  refreshToken?: string | null
): Promise<void> {
  if (!accessToken || !refreshToken) {
    return;
  }
  const client = getSupabaseBrowserClient();
  if (!client) {
    return;
  }
  try {
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch {
    // Ignore browser session sync errors; API bearer token remains stored in localStorage
  }
}

/**
 * Clears any active session from the browser Supabase client.
 */
export async function clearBrowserSupabaseSession(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return;
  }
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // Ignore sign-out errors
  }
}
