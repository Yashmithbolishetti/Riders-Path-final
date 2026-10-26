import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
  DEFAULT_RECOVERY_REDIRECT_URL,
  INITIAL_CONFIRMATION_URL_STORAGE_KEY,
  INITIAL_RECOVERY_URL_STORAGE_KEY,
  PENDING_AUTH_FLOW_STORAGE_KEY,
  PENDING_VERIFY_AT_STORAGE_KEY,
  PENDING_RESET_AT_STORAGE_KEY,
  parseEmailConfirmationUrl,
  parsePasswordRecoveryUrl,
  formatConfirmationErrorMessage,
  formatRecoveryErrorMessage,
  captureCurrentConfirmationUrlState,
  captureCurrentRecoveryUrlState,
  getStoredConfirmationState,
  getStoredRecoveryState,
  clearConfirmationSession,
  clearRecoverySession,
  hasPendingConfirmationSession,
  hasPendingRecoverySession,
  isNonRecoveryJwtAccessToken,
  isRecoveryAccessToken,
  sanitizeConfirmationUrl,
  sanitizeRecoveryLogDetails,
  scrubSensitiveAuthUrlParams,
  markUserInitiatedEmailConfirmation,
  hasUserInitiatedEmailConfirmation,
  clearUserInitiatedEmailConfirmation,
  onRecoverySessionDetected,
  saveRecoverySession,
} from './supabase';

function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

test('DEFAULT_RECOVERY_REDIRECT_URL and DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL point to dedicated production callback routes', () => {
  assert.equal(DEFAULT_RECOVERY_REDIRECT_URL, 'https://riderspath.vercel.app/reset-password');
  assert.equal(
    DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
    'https://riderspath.vercel.app/#confirm-email'
  );
});

test('parseEmailConfirmationUrl detects implicit signup confirmation hash (#access_token=...&type=signup)', () => {
  const parsed = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: '#access_token=signup-jwt-123&refresh_token=signup-ref-456&expires_in=3600&token_type=bearer&type=signup',
  });

  assert.equal(parsed.isConfirmationCallback, true);
  assert.equal(parsed.isVerifyEmailRoute, true);
  assert.equal(parsed.accessToken, 'signup-jwt-123');
  assert.equal(parsed.refreshToken, 'signup-ref-456');
  assert.equal(parsed.type, 'signup');
  assert.equal(parsed.error, null);
});

test('parseEmailConfirmationUrl detects token_hash signup confirmation link (?token_hash=...&type=signup)', () => {
  const parsed = parseEmailConfirmationUrl({
    pathname: '/',
    search: '?token_hash=signup-hash-789&type=signup',
    hash: '',
  });

  assert.equal(parsed.isConfirmationCallback, true);
  assert.equal(parsed.isVerifyEmailRoute, true);
  assert.equal(parsed.tokenHash, 'signup-hash-789');
  assert.equal(parsed.type, 'signup');
});

test('parseEmailConfirmationUrl detects PKCE confirmation link on #verify-email (?code=...#verify-email)', () => {
  const parsed = parseEmailConfirmationUrl({
    pathname: '/',
    search: '?code=pkce-signup-code-123',
    hash: '#verify-email',
  });

  assert.equal(parsed.isConfirmationCallback, true);
  assert.equal(parsed.isVerifyEmailRoute, true);
  assert.equal(parsed.code, 'pkce-signup-code-123');
});

test('REGRESSION: parseEmailConfirmationUrl and parsePasswordRecoveryUrl handle multi-hash fragments and Site URL /reset-password collisions with type=signup', () => {
  // 1. Multi-hash when emailRedirectTo=#verify-email and GoTrue appends #access_token=...&type=signup
  const doubleHashVerify = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: '#verify-email#access_token=signup-jwt-1&refresh_token=signup-ref-1&type=signup',
  });
  assert.equal(doubleHashVerify.isConfirmationCallback, true);
  assert.equal(doubleHashVerify.isVerifyEmailRoute, true);
  assert.equal(doubleHashVerify.accessToken, 'signup-jwt-1');
  assert.equal(doubleHashVerify.type, 'signup');

  // 2. Trailing #verify-email after type=signup (ensures type is parsed as "signup", not "signup#verify-email")
  const trailingHashVerify = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: '#access_token=signup-jwt-2&refresh_token=signup-ref-2&type=signup#verify-email',
  });
  assert.equal(trailingHashVerify.isConfirmationCallback, true);
  assert.equal(trailingHashVerify.type, 'signup');

  // 3. Collision when Supabase Dashboard Site URL is set to /reset-password or #reset-password
  //    and /auth/v1/verify redirects a signup confirmation link there:
  const resetPathCollision = parseEmailConfirmationUrl({
    pathname: '/reset-password',
    search: '',
    hash: '#access_token=signup-jwt-3&refresh_token=signup-ref-3&type=signup',
  });
  assert.equal(resetPathCollision.isConfirmationCallback, true);
  assert.equal(resetPathCollision.isVerifyEmailRoute, true);
  assert.equal(resetPathCollision.accessToken, 'signup-jwt-3');

  const resetPathRecoveryCheck = parsePasswordRecoveryUrl({
    pathname: '/reset-password',
    search: '',
    hash: '#access_token=signup-jwt-3&refresh_token=signup-ref-3&type=signup',
  });
  assert.equal(resetPathRecoveryCheck.isRecoveryCallback, false);
  assert.equal(resetPathRecoveryCheck.isResetPasswordRoute, false);

  const resetHashCollision = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: '#reset-password#access_token=signup-jwt-4&refresh_token=signup-ref-4&type=signup',
  });
  assert.equal(resetHashCollision.isConfirmationCallback, true);
  assert.equal(resetHashCollision.isVerifyEmailRoute, true);

  const resetHashRecoveryCheck = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: '#reset-password#access_token=signup-jwt-4&refresh_token=signup-ref-4&type=signup',
  });
  assert.equal(resetHashRecoveryCheck.isRecoveryCallback, false);
  assert.equal(resetHashRecoveryCheck.isResetPasswordRoute, false);
});

test('REGRESSION: untyped PKCE (?code=...) and expired link (#error=otp_expired) on root URL without recovery context route to email confirmation, NEVER reset-password', () => {
  // When Supabase /auth/v1/verify redirects a signup confirmation link using PKCE (?code=...)
  // or with an error (#error=access_denied&error_code=otp_expired), GoTrue strips type=signup.
  const untypedPkceConfirm = parseEmailConfirmationUrl({
    pathname: '/',
    search: '?code=pkce-signup-exchange-code',
    hash: '',
  });
  assert.equal(untypedPkceConfirm.isConfirmationCallback, true);
  assert.equal(untypedPkceConfirm.isVerifyEmailRoute, true);
  assert.equal(untypedPkceConfirm.code, 'pkce-signup-exchange-code');

  const untypedPkceRecovery = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?code=pkce-signup-exchange-code',
    hash: '',
  });
  assert.equal(untypedPkceRecovery.isRecoveryCallback, false);
  assert.equal(untypedPkceRecovery.isResetPasswordRoute, false);

  const untypedExpiredConfirm = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  });
  assert.equal(untypedExpiredConfirm.isConfirmationCallback, true);
  assert.equal(untypedExpiredConfirm.isVerifyEmailRoute, true);
  assert.equal(untypedExpiredConfirm.errorCode, 'otp_expired');

  const untypedExpiredRecovery = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  });
  assert.equal(untypedExpiredRecovery.isRecoveryCallback, false);
  assert.equal(untypedExpiredRecovery.isResetPasswordRoute, false);
});

test('REGRESSION: cross-tab localStorage pending auth flow routes untyped callbacks in new browser tabs accurately', () => {
  const previousWindow = (globalThis as any).window;
  const mockLocalStorage = new Map<string, string>();
  const mockSessionStorage = new Map<string, string>();

  (globalThis as any).window = {
    location: { pathname: '/', search: '?code=new-tab-code', hash: '' },
    // Simulate a new browser tab opened from an email client: sessionStorage is empty,
    // while localStorage has the pending flow from the signup or forgot-password tab.
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    // Case A: User signed up in Tab 1, clicked link opening Tab 2
    mockLocalStorage.set('rp_pending_auth_flow', 'signup');
    mockLocalStorage.set('rp_pending_verify_email', 'student@icfai.edu');

    const signupTabConfirm = parseEmailConfirmationUrl({
      pathname: '/reset-password',
      search: '?code=new-tab-code',
      hash: '',
    });
    assert.equal(signupTabConfirm.isConfirmationCallback, true);
    assert.equal(
      parsePasswordRecoveryUrl({
        pathname: '/reset-password',
        search: '?code=new-tab-code',
        hash: '',
      }).isRecoveryCallback,
      false
    );

    // Case B: User requested password reset in Tab 1, clicked link opening Tab 2
    mockLocalStorage.clear();
    mockLocalStorage.set('rp_pending_auth_flow', 'recovery');
    mockLocalStorage.set('rp_pending_reset_email', 'student@icfai.edu');

    const recoveryTabCheck = parsePasswordRecoveryUrl({
      pathname: '/',
      search: '?code=new-tab-recovery-code',
      hash: '',
    });
    assert.equal(recoveryTabCheck.isRecoveryCallback, true);
    assert.equal(recoveryTabCheck.isResetPasswordRoute, true);
  } finally {
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: parsePasswordRecoveryUrl NEVER classifies signup or email confirmation links as password recovery', () => {
  const implicitSignup = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: '#access_token=signup-jwt-123&refresh_token=signup-ref-456&expires_in=3600&token_type=bearer&type=signup',
  });
  assert.equal(implicitSignup.isRecoveryCallback, false);
  assert.equal(implicitSignup.isResetPasswordRoute, false);

  const tokenHashSignup = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?token_hash=signup-hash-789&type=signup',
    hash: '',
  });
  assert.equal(tokenHashSignup.isRecoveryCallback, false);
  assert.equal(tokenHashSignup.isResetPasswordRoute, false);

  const tokenHashEmail = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?token_hash=email-hash-789&type=email',
    hash: '',
  });
  assert.equal(tokenHashEmail.isRecoveryCallback, false);
  assert.equal(tokenHashEmail.isResetPasswordRoute, false);

  const pkceVerifyEmailRoute = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?code=pkce-signup-code-123',
    hash: '#verify-email',
  });
  assert.equal(pkceVerifyEmailRoute.isRecoveryCallback, false);
  assert.equal(pkceVerifyEmailRoute.isResetPasswordRoute, false);

  const signupJwt = createMockJwt({
    sub: 'user-signup-1',
    email: 'newstudent@icfai.edu',
    amr: [{ method: 'otp', timestamp: 1710000000 }],
  });
  const untypedSignupJwtCallback = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: `#access_token=${signupJwt}&refresh_token=ref-123`,
  });
  assert.equal(untypedSignupJwtCallback.isRecoveryCallback, false);
  assert.equal(untypedSignupJwtCallback.isResetPasswordRoute, false);

  const confirmedByJwt = parseEmailConfirmationUrl({
    pathname: '/',
    search: '',
    hash: `#access_token=${signupJwt}&refresh_token=ref-123`,
  });
  assert.equal(confirmedByJwt.isConfirmationCallback, true);
  assert.equal(confirmedByJwt.isVerifyEmailRoute, true);
});

test('captureCurrentConfirmationUrlState stores and clears confirmation session state and recovers pre-module snapshot', () => {
  clearConfirmationSession();
  clearRecoverySession();
  assert.equal(getStoredConfirmationState(), null);

  const initial = captureCurrentConfirmationUrlState({
    pathname: '/',
    search: '',
    hash: '#access_token=confirm-token-1&refresh_token=confirm-ref-1&type=signup',
  });
  assert.equal(initial.isConfirmationCallback, true);
  assert.equal(initial.isVerifyEmailRoute, true);

  const stored = getStoredConfirmationState();
  assert.ok(stored);
  assert.equal(stored?.accessToken, 'confirm-token-1');
  assert.equal(
    hasPendingConfirmationSession({
      pathname: '/',
      search: '',
      hash: '#',
    }),
    true
  );
  // Ensure recovery session is NOT polluted by confirmation session
  assert.equal(
    hasPendingRecoverySession({
      pathname: '/',
      search: '',
      hash: '#',
    }),
    false
  );

  clearConfirmationSession();
  assert.equal(getStoredConfirmationState(), null);
});

test('REGRESSION: pre-module snapshot in window.__RP_INITIAL_CONFIRMATION_URL__ is recovered when index.html rewrites hash to #verify-email', () => {
  clearConfirmationSession();

  const previousWindow = (globalThis as any).window;
  const mockStorage = new Map<string, string>();
  const snapshot = {
    hash: '#access_token=snap-confirm-111&refresh_token=snap-confirm-ref-222&type=signup',
    search: '',
    pathname: '/',
    capturedAt: Date.now(),
  };
  mockStorage.set(INITIAL_CONFIRMATION_URL_STORAGE_KEY, JSON.stringify(snapshot));

  (globalThis as any).window = {
    __RP_INITIAL_CONFIRMATION_URL__: snapshot,
    location: {
      pathname: '/',
      search: '',
      hash: '#verify-email',
    },
    sessionStorage: {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
      removeItem: (k: string) => mockStorage.delete(k),
    },
  };

  try {
    const state = captureCurrentConfirmationUrlState((globalThis as any).window.location);
    assert.equal(state.isConfirmationCallback, true);
    assert.equal(state.isVerifyEmailRoute, true);
    assert.equal(state.accessToken, 'snap-confirm-111');
    assert.equal(state.refreshToken, 'snap-confirm-ref-222');
  } finally {
    clearConfirmationSession();
    (globalThis as any).window = previousWindow;
  }
});

test('parseEmailConfirmationUrl formats expired confirmation link errors clearly', () => {
  const parsed = parseEmailConfirmationUrl({
    pathname: '/',
    search: '?type=signup&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    hash: '#verify-email',
  });

  assert.equal(parsed.isConfirmationCallback, true);
  assert.equal(parsed.isVerifyEmailRoute, true);
  assert.equal(parsed.errorCode, 'otp_expired');
  assert.match(formatConfirmationErrorMessage(parsed), /confirmation link.*expired/i);
});

test('parsePasswordRecoveryUrl detects implicit recovery hash (#access_token=...&type=recovery)', () => {
  const parsed = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: '#access_token=jwt-token-123&refresh_token=refresh-456&expires_in=3600&token_type=bearer&type=recovery',
  });

  assert.equal(parsed.isRecoveryCallback, true);
  assert.equal(parsed.isResetPasswordRoute, true);
  assert.equal(parsed.accessToken, 'jwt-token-123');
  assert.equal(parsed.refreshToken, 'refresh-456');
  assert.equal(parsed.type, 'recovery');
  assert.equal(parsed.error, null);
});

test('parsePasswordRecoveryUrl detects token_hash recovery link (?token_hash=...&type=recovery)', () => {
  const parsed = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?token_hash=pkce-hash-789&type=recovery',
    hash: '',
  });

  assert.equal(parsed.isRecoveryCallback, true);
  assert.equal(parsed.isResetPasswordRoute, true);
  assert.equal(parsed.tokenHash, 'pkce-hash-789');
  assert.equal(parsed.type, 'recovery');
});

test('parsePasswordRecoveryUrl detects PKCE recovery link when recovery evidence is present (?code=...&flow=recovery#reset-password)', () => {
  const parsed = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '?code=pkce-exchange-code-abc&flow=recovery',
    hash: '#reset-password',
  });

  assert.equal(parsed.isRecoveryCallback, true);
  assert.equal(parsed.isResetPasswordRoute, true);
  assert.equal(parsed.code, 'pkce-exchange-code-abc');
});

test('parsePasswordRecoveryUrl detects expired or invalid recovery link errors when recovery evidence is present', () => {
  const parsed = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: '#reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&type=recovery',
  });

  assert.equal(parsed.isRecoveryCallback, true);
  assert.equal(parsed.isResetPasswordRoute, true);
  assert.equal(parsed.error, 'access_denied');
  assert.equal(parsed.errorCode, 'otp_expired');
  assert.match(formatRecoveryErrorMessage(parsed), /invalid or has expired/i);
});

test('captureCurrentRecoveryUrlState stores and clears recovery session state', () => {
  clearRecoverySession();
  assert.equal(getStoredRecoveryState(), null);

  captureCurrentRecoveryUrlState({
    pathname: '/',
    search: '',
    hash: '#access_token=rec-token&refresh_token=rec-refresh&type=recovery',
  });

  const stored = getStoredRecoveryState();
  assert.ok(stored);
  assert.equal(stored?.accessToken, 'rec-token');
  assert.equal(stored?.refreshToken, 'rec-refresh');

  clearRecoverySession();
  assert.equal(getStoredRecoveryState(), null);
});

test('REGRESSION: when Supabase detectSessionInUrl clears URL to https://ridersspath.ai.studio/#, captureCurrentRecoveryUrlState still routes to reset-password', () => {
  clearRecoverySession();

  // Step 1: Initial callback arrives from Supabase email link
  const initialState = captureCurrentRecoveryUrlState({
    pathname: '/',
    search: '',
    hash: '#access_token=recovery-jwt-999&refresh_token=recovery-ref-999&expires_in=3600&token_type=bearer&type=recovery',
  });
  assert.equal(initialState.isRecoveryCallback, true);
  assert.equal(initialState.isResetPasswordRoute, true);

  // Step 2: GoTrueClient._getSessionFromURL executes `window.location.hash = ''`,
  // leaving the browser URL at `https://ridersspath.ai.studio/#` (hash: '#' or '').
  const afterHashCleared = captureCurrentRecoveryUrlState({
    pathname: '/',
    search: '',
    hash: '#',
  });

  assert.equal(afterHashCleared.isRecoveryCallback, true);
  assert.equal(afterHashCleared.isResetPasswordRoute, true);
  assert.equal(afterHashCleared.accessToken, 'recovery-jwt-999');
  assert.equal(afterHashCleared.refreshToken, 'recovery-ref-999');
  assert.equal(
    hasPendingRecoverySession({
      pathname: '/',
      search: '',
      hash: '#',
    }),
    true
  );

  clearRecoverySession();
});

test('REGRESSION: pre-module snapshot in window.__RP_INITIAL_RECOVERY_URL__ recovers callback even if hash was stripped to # before module evaluation', () => {
  clearRecoverySession();

  const previousWindow = (globalThis as any).window;
  const mockStorage = new Map<string, string>();
  const snapshot = {
    hash: '#access_token=snap-token-111&refresh_token=snap-refresh-222&type=recovery',
    search: '',
    pathname: '/',
    capturedAt: Date.now(),
  };
  mockStorage.set(INITIAL_RECOVERY_URL_STORAGE_KEY, JSON.stringify(snapshot));

  (globalThis as any).window = {
    __RP_INITIAL_RECOVERY_URL__: snapshot,
    location: {
      pathname: '/',
      search: '',
      hash: '#',
    },
    sessionStorage: {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
      removeItem: (k: string) => mockStorage.delete(k),
    },
  };

  try {
    // Even though window.location.hash is now just '#', the pre-module snapshot is recovered
    const state = captureCurrentRecoveryUrlState((globalThis as any).window.location);
    assert.equal(state.isRecoveryCallback, true);
    assert.equal(state.isResetPasswordRoute, true);
    assert.equal(state.accessToken, 'snap-token-111');
    assert.equal(state.refreshToken, 'snap-refresh-222');
  } finally {
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: pre-module snapshot in window.__RP_INITIAL_RECOVERY_URL__ is recovered when index.html rewrites hash to #reset-password before GoTrueClient runs', () => {
  clearRecoverySession();

  const previousWindow = (globalThis as any).window;
  const mockStorage = new Map<string, string>();
  const snapshot = {
    hash: '#access_token=snap-token-333&refresh_token=snap-refresh-444&type=recovery',
    search: '',
    pathname: '/',
    capturedAt: Date.now(),
  };
  mockStorage.set(INITIAL_RECOVERY_URL_STORAGE_KEY, JSON.stringify(snapshot));

  (globalThis as any).window = {
    __RP_INITIAL_RECOVERY_URL__: snapshot,
    location: {
      pathname: '/',
      search: '',
      hash: '#reset-password',
    },
    sessionStorage: {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
      removeItem: (k: string) => mockStorage.delete(k),
    },
  };

  try {
    const state = captureCurrentRecoveryUrlState((globalThis as any).window.location);
    assert.equal(state.isRecoveryCallback, true);
    assert.equal(state.isResetPasswordRoute, true);
    assert.equal(state.accessToken, 'snap-token-333');
    assert.equal(state.refreshToken, 'snap-refresh-444');
  } finally {
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

test('isRecoveryAccessToken and isNonRecoveryJwtAccessToken distinguish recovery vs standard JWTs', () => {
  const recoveryJwt = createMockJwt({
    sub: 'user-123',
    email: 'rider@icfai.edu',
    amr: [{ method: 'recovery', timestamp: 1710000000 }],
  });
  const passwordJwt = createMockJwt({
    sub: 'user-123',
    email: 'rider@icfai.edu',
    amr: [{ method: 'password', timestamp: 1710000000 }],
  });

  assert.equal(isRecoveryAccessToken(recoveryJwt), true);
  assert.equal(isRecoveryAccessToken(passwordJwt), false);
  assert.equal(isRecoveryAccessToken('not-a-jwt'), false);
  assert.equal(isRecoveryAccessToken(null), false);

  assert.equal(isNonRecoveryJwtAccessToken(passwordJwt), true);
  assert.equal(isNonRecoveryJwtAccessToken(recoveryJwt), false);
  assert.equal(isNonRecoveryJwtAccessToken('not-a-jwt'), false);
});

test('onRecoverySessionDetected notifies subscribers immediately when a recovery session is saved', () => {
  clearRecoverySession();
  let notifiedToken: string | null = null;
  const unsubscribe = onRecoverySessionDetected((state) => {
    notifiedToken = state.accessToken || null;
  });

  try {
    saveRecoverySession({
      accessToken: 'async-recovery-token',
      refreshToken: 'async-refresh-token',
      email: 'student@icfai.edu',
    });
    assert.equal(notifiedToken, 'async-recovery-token');
  } finally {
    unsubscribe();
    clearRecoverySession();
  }
});

test('sanitizeRecoveryLogDetails redacts tokens, passwords, codes, hashes, and keys while preserving safe metadata', () => {
  const sanitized = sanitizeRecoveryLogDetails({
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
    refreshToken: 'secret-refresh-token',
    newPassword: 'SuperSecretPassword123',
    password: 'AnotherSecretPassword999',
    tokenHash: 'pkce-token-hash-secret',
    code: 'pkce-auth-code-secret',
    serviceRoleKey: 'sb-service-role-secret',
    rawUrl: 'https://ridersspath.ai.studio/#access_token=secret123&refresh_token=secret456',
    hasAccessToken: true,
    hasRefreshToken: false,
    errorCode: 'otp_expired',
    statusCode: 400,
    redirectTo: 'https://ridersspath.ai.studio',
  });

  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.accessToken, '[REDACTED]');
  assert.equal(sanitized.refreshToken, '[REDACTED]');
  assert.equal(sanitized.newPassword, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.tokenHash, '[REDACTED]');
  assert.equal(sanitized.code, '[REDACTED]');
  assert.equal(sanitized.serviceRoleKey, '[REDACTED]');
  assert.equal(sanitized.rawUrl, '[REDACTED_URL_PARAMS]');
  assert.equal(sanitized.hasAccessToken, true);
  assert.equal(sanitized.hasRefreshToken, false);
  assert.equal(sanitized.errorCode, 'otp_expired');
  assert.equal(sanitized.statusCode, 400);
  assert.equal(sanitized.redirectTo, 'https://ridersspath.ai.studio');

  assert.equal(serialized.includes('SuperSecretPassword123'), false);
  assert.equal(serialized.includes('secret-refresh-token'), false);
  assert.equal(serialized.includes('pkce-token-hash-secret'), false);
  assert.equal(serialized.includes('sb-service-role-secret'), false);
});

test('REGRESSION: unencoded and percent-encoded confirmation_url on #confirm-email is parsed as email confirmation even if nested redirect_to contains #reset-password', () => {
  const expectedOrigin = 'https://exampleproject.supabase.co';
  const rawUnencodedHash =
    '#confirm-email?confirmation_url=https://exampleproject.supabase.co/auth/v1/verify?token=pkce_signup_token_123&type=signup&redirect_to=https://ridersspath.ai.studio/#reset-password';

  const confirmState = parseEmailConfirmationUrl(
    {
      pathname: '/',
      search: '',
      hash: rawUnencodedHash,
    },
    expectedOrigin
  );
  const recoveryState = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: rawUnencodedHash,
  });

  assert.equal(confirmState.isConfirmationCallback, true);
  assert.equal(confirmState.isConfirmEmailRoute, true);
  assert.ok(confirmState.confirmationUrl);
  assert.equal(
    confirmState.confirmationUrl?.includes('token=pkce_signup_token_123'),
    true
  );
  assert.equal(
    confirmState.confirmationUrl?.includes('reset-password'),
    false,
    'Nested #reset-password in redirect_to must be rewritten to #confirm-email'
  );
  assert.equal(recoveryState.isRecoveryCallback, false);
  assert.equal(recoveryState.isResetPasswordRoute, false);

  const encodedVerifyUrl = encodeURIComponent(
    'https://exampleproject.supabase.co/auth/v1/verify?token=pkce_encoded_456&type=signup&redirect_to=https://riderspath.vercel.app/#confirm-email'
  );
  const encodedState = parseEmailConfirmationUrl(
    {
      pathname: '/',
      search: `?confirmation_url=${encodedVerifyUrl}`,
      hash: '#confirm-email',
    },
    expectedOrigin
  );
  assert.equal(encodedState.isConfirmationCallback, true);
  assert.equal(encodedState.isConfirmEmailRoute, true);
  assert.equal(
    encodedState.confirmationUrl,
    'https://exampleproject.supabase.co/auth/v1/verify?token=pkce_encoded_456&type=signup&redirect_to=https%3A%2F%2Friderspath.vercel.app%2F%23confirm-email'
  );
});

test('REGRESSION: sanitizeConfirmationUrl rejects non-verify paths, recovery links, javascript: URLs, and mismatched origins', () => {
  const expectedOrigin = 'https://exampleproject.supabase.co';

  assert.equal(
    sanitizeConfirmationUrl('javascript:alert(1)', expectedOrigin),
    null
  );
  assert.equal(
    sanitizeConfirmationUrl('https://evil.example.com/auth/v1/verify?token=abc&type=signup', expectedOrigin),
    null
  );
  assert.equal(
    sanitizeConfirmationUrl('https://exampleproject.supabase.co/other/path?token=abc&type=signup', expectedOrigin),
    null
  );
  assert.equal(
    sanitizeConfirmationUrl(
      'https://exampleproject.supabase.co/auth/v1/verify?token=abc&type=recovery',
      expectedOrigin
    ),
    null
  );
});

test('REGRESSION: email-scanner prefetch / initial page load captures confirmation URL and scrubs history without marking user-initiated confirmation', () => {
  clearConfirmationSession();
  clearUserInitiatedEmailConfirmation();

  const previousWindow = (globalThis as any).window;
  const mockSessionStorage = new Map<string, string>();
  const mockLocalStorage = new Map<string, string>();
  let replacedUrl: string | null = null;

  (globalThis as any).window = {
    location: {
      pathname: '/',
      search: '',
      hash: '#confirm-email?token_hash=scanner_safe_hash_999&type=signup',
    },
    history: {
      replaceState: (_data: any, _unused: string, url: string) => {
        replacedUrl = url;
        (globalThis as any).window.location.hash = '#confirm-email';
        (globalThis as any).window.location.search = '';
      },
    },
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    // Simulate initial page load / scanner prefetch
    const state = captureCurrentConfirmationUrlState((globalThis as any).window.location);
    assert.equal(state.isConfirmationCallback, true);
    assert.equal(state.isConfirmEmailRoute, true);
    assert.equal(state.tokenHash, 'scanner_safe_hash_999');

    // URL parameters must be immediately scrubbed from browser history
    assert.equal(replacedUrl, '/#confirm-email');
    assert.equal((globalThis as any).window.location.hash, '#confirm-email');
    assert.equal((globalThis as any).window.location.search, '');

    // Crucially, page load MUST NOT mark user-initiated confirmation as true
    assert.equal(hasUserInitiatedEmailConfirmation(), false);

    // Only when the user clicks "Confirm Email" does it become true
    markUserInitiatedEmailConfirmation();
    assert.equal(hasUserInitiatedEmailConfirmation(), true);
  } finally {
    clearConfirmationSession();
    clearUserInitiatedEmailConfirmation();
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: after user clicks Confirm Email or signs up, expired token redirect (#error=otp_expired) on #reset-password still routes to email confirmation', () => {
  clearConfirmationSession();
  clearRecoverySession();

  const previousWindow = (globalThis as any).window;
  const mockSessionStorage = new Map<string, string>();
  const mockLocalStorage = new Map<string, string>();

  // Simulate stale password reset from 2 hours ago, followed by a recent signup 1 minute ago
  const twoHoursAgo = String(Date.now() - 2 * 60 * 60 * 1000);
  const oneMinuteAgo = String(Date.now() - 60 * 1000);
  mockLocalStorage.set('rp_pending_reset_email', 'old@icfai.edu');
  mockLocalStorage.set(PENDING_RESET_AT_STORAGE_KEY, twoHoursAgo);
  mockLocalStorage.set('rp_pending_verify_email', 'new@icfai.edu');
  mockLocalStorage.set(PENDING_VERIFY_AT_STORAGE_KEY, oneMinuteAgo);
  mockLocalStorage.set(PENDING_AUTH_FLOW_STORAGE_KEY, 'signup');

  (globalThis as any).window = {
    location: {
      pathname: '/',
      search: '',
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    },
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    const confirmParsed = parseEmailConfirmationUrl((globalThis as any).window.location);
    const recoveryParsed = parsePasswordRecoveryUrl((globalThis as any).window.location);

    assert.equal(confirmParsed.isConfirmationCallback, true);
    assert.equal(confirmParsed.errorCode, 'otp_expired');
    assert.equal(recoveryParsed.isRecoveryCallback, false);
    assert.equal(recoveryParsed.isResetPasswordRoute, false);
  } finally {
    clearConfirmationSession();
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: sanitizeRecoveryLogDetails redacts confirmation_url and /auth/v1/verify links', () => {
  const sanitized = sanitizeRecoveryLogDetails({
    confirmationUrl: 'https://project.supabase.co/auth/v1/verify?token=secret123&type=signup',
    confirmation_url: 'https://project.supabase.co/auth/v1/verify?token=secret456&type=signup',
    callbackUrl: 'https://ridersspath.ai.studio/#confirm-email?confirmation_url=https://project.supabase.co/auth/v1/verify?token=secret789',
  });

  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.confirmationUrl, '[REDACTED]');
  assert.equal(sanitized.confirmation_url, '[REDACTED]');
  assert.equal(sanitized.callbackUrl, '[REDACTED_URL_PARAMS]');
  assert.equal(serialized.includes('secret123'), false);
  assert.equal(serialized.includes('secret456'), false);
  assert.equal(serialized.includes('secret789'), false);
});

test('REGRESSION: real 3-part Supabase recovery JWTs with amr=[{method:"otp"}] and /reset-password callbacks route to ResetPasswordPage and NEVER to #confirm-email', () => {
  clearConfirmationSession();
  clearRecoverySession();

  // Real Supabase GoTrue recovery JWTs contain amr: [{ method: "otp", timestamp: ... }]
  const realSupabaseOtpRecoveryJwt = createMockJwt({
    sub: 'user-rec-999',
    email: 'student@icfai.edu',
    amr: [{ method: 'otp', timestamp: 1710000000 }],
  });

  // 1. Implicit recovery callback on /reset-password (#access_token=<3-part-jwt>&type=recovery)
  const implicitOnResetPath = {
    pathname: '/reset-password',
    search: '',
    hash: `#access_token=${realSupabaseOtpRecoveryJwt}&refresh_token=rec-ref-999&expires_in=3600&token_type=bearer&type=recovery`,
  };
  assert.equal(isNonRecoveryJwtAccessToken(realSupabaseOtpRecoveryJwt), false);
  assert.equal(parseEmailConfirmationUrl(implicitOnResetPath).isConfirmationCallback, false);
  const recState1 = parsePasswordRecoveryUrl(implicitOnResetPath);
  assert.equal(recState1.isRecoveryCallback, true);
  assert.equal(recState1.isResetPasswordRoute, true);
  assert.equal(recState1.accessToken, realSupabaseOtpRecoveryJwt);

  // 2. Implicit recovery callback when Supabase falls back to root Site URL (/#access_token=<3-part-jwt>&type=recovery)
  const implicitOnRootPath = {
    pathname: '/',
    search: '',
    hash: `#access_token=${realSupabaseOtpRecoveryJwt}&refresh_token=rec-ref-999&expires_in=3600&token_type=bearer&type=recovery`,
  };
  assert.equal(parseEmailConfirmationUrl(implicitOnRootPath).isConfirmationCallback, false);
  const recState2 = captureCurrentRecoveryUrlState(implicitOnRootPath);
  assert.equal(recState2.isRecoveryCallback, true);
  assert.equal(recState2.isResetPasswordRoute, true);
  assert.equal(recState2.accessToken, realSupabaseOtpRecoveryJwt);
  clearRecoverySession();

  // 3. PKCE callback on dedicated /reset-password route (/reset-password?code=...)
  const pkceOnResetPath = {
    pathname: '/reset-password',
    search: '?code=pkce-recovery-code-777',
    hash: '',
  };
  assert.equal(parseEmailConfirmationUrl(pkceOnResetPath).isConfirmationCallback, false);
  const recState3 = parsePasswordRecoveryUrl(pkceOnResetPath);
  assert.equal(recState3.isRecoveryCallback, true);
  assert.equal(recState3.isResetPasswordRoute, true);
  assert.equal(recState3.code, 'pkce-recovery-code-777');

  // 4. Expired recovery link on dedicated /reset-password route (/reset-password#error=access_denied&error_code=otp_expired)
  const expiredOnResetPath = {
    pathname: '/reset-password',
    search: '',
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  };
  assert.equal(parseEmailConfirmationUrl(expiredOnResetPath).isConfirmationCallback, false);
  const recState4 = parsePasswordRecoveryUrl(expiredOnResetPath);
  assert.equal(recState4.isRecoveryCallback, true);
  assert.equal(recState4.isResetPasswordRoute, true);
  assert.equal(recState4.errorCode, 'otp_expired');
});

test('REGRESSION: explicit signup callback with stale pending-recovery storage always follows email confirmation', () => {
  clearConfirmationSession();
  clearRecoverySession();

  const previousWindow = (globalThis as any).window;
  const mockSessionStorage = new Map<string, string>();
  const mockLocalStorage = new Map<string, string>();

  // Simulate active/stale recovery flags in both sessionStorage and localStorage
  const recentTs = String(Date.now() - 10 * 1000);
  mockSessionStorage.set(PENDING_AUTH_FLOW_STORAGE_KEY, 'recovery');
  mockSessionStorage.set('rp_pending_reset_email', 'reset@icfai.edu');
  mockSessionStorage.set(PENDING_RESET_AT_STORAGE_KEY, recentTs);
  mockLocalStorage.set(PENDING_AUTH_FLOW_STORAGE_KEY, 'recovery');
  mockLocalStorage.set('rp_pending_reset_email', 'reset@icfai.edu');
  mockLocalStorage.set(PENDING_RESET_AT_STORAGE_KEY, recentTs);

  (globalThis as any).window = {
    location: {
      pathname: '/reset-password',
      search: '',
      hash: '#reset-password#access_token=signup-token-abc&refresh_token=signup-ref-def&type=signup',
    },
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    const confirmParsed = parseEmailConfirmationUrl((globalThis as any).window.location);
    const recoveryParsed = parsePasswordRecoveryUrl((globalThis as any).window.location);

    assert.equal(confirmParsed.isConfirmationCallback, true);
    assert.equal(confirmParsed.accessToken, 'signup-token-abc');
    assert.equal(recoveryParsed.isRecoveryCallback, false);
    assert.equal(recoveryParsed.isResetPasswordRoute, false);
  } finally {
    clearConfirmationSession();
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: invitation callbacks (type=invite and invite JWT amr) remain functional in recovery/password-setup flow and preserve type=invite in stored recovery session', () => {
  clearConfirmationSession();
  clearRecoverySession();

  const inviteJwt = createMockJwt({
    sub: 'admin-invite-123',
    email: 'admin@icfai.edu',
    amr: [{ method: 'invite', timestamp: 1710000000 }],
  });

  const byType = captureCurrentRecoveryUrlState({
    pathname: '/',
    search: '?token_hash=invite-hash-111&type=invite',
    hash: '',
  });
  assert.equal(byType.isRecoveryCallback, true);
  assert.equal(byType.isResetPasswordRoute, true);
  assert.equal(byType.tokenHash, 'invite-hash-111');
  assert.equal(byType.type, 'invite');
  assert.equal(getStoredRecoveryState()?.type, 'invite');

  clearRecoverySession();

  const byJwt = parsePasswordRecoveryUrl({
    pathname: '/',
    search: '',
    hash: `#access_token=${inviteJwt}&refresh_token=invite-ref-222`,
  });
  assert.equal(byJwt.isRecoveryCallback, true);
  assert.equal(byJwt.isResetPasswordRoute, true);
  assert.equal(byJwt.accessToken, inviteJwt);
});

test('REGRESSION: email_change callbacks route to confirmation and expired localStorage pending recovery markers do not hijack untyped callbacks', () => {
  clearConfirmationSession();
  clearRecoverySession();

  const emailChangeConfirm = parseEmailConfirmationUrl({
    pathname: '/reset-password',
    search: '?token_hash=email-change-hash-999&type=email_change',
    hash: '#reset-password',
  });
  assert.equal(emailChangeConfirm.isConfirmationCallback, true);
  assert.equal(emailChangeConfirm.type, 'email_change');
  assert.equal(
    parsePasswordRecoveryUrl({
      pathname: '/reset-password',
      search: '?token_hash=email-change-hash-999&type=email_change',
      hash: '#reset-password',
    }).isRecoveryCallback,
    false
  );

  const previousWindow = (globalThis as any).window;
  const mockLocalStorage = new Map<string, string>();
  const mockSessionStorage = new Map<string, string>();
  // Stale recovery flow marker from 2 hours ago (> 30-minute TTL)
  mockLocalStorage.set(PENDING_AUTH_FLOW_STORAGE_KEY, 'recovery');
  mockLocalStorage.set('rp_pending_reset_email', 'old-user@icfai.edu');
  mockLocalStorage.set(PENDING_RESET_AT_STORAGE_KEY, String(Date.now() - 2 * 60 * 60 * 1000));

  (globalThis as any).window = {
    location: {
      pathname: '/',
      search: '',
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    },
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    const confirmParsed = parseEmailConfirmationUrl((globalThis as any).window.location);
    const recoveryParsed = parsePasswordRecoveryUrl((globalThis as any).window.location);
    assert.equal(confirmParsed.isConfirmationCallback, true);
    assert.equal(recoveryParsed.isRecoveryCallback, false);
  } finally {
    clearConfirmationSession();
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

test('REGRESSION: GoTrue #confirm-email=&error=access_denied&error_code=otp_expired encoding and duplicate confirmation click 6s later stay on #confirm-email even with legacy un-timestamped rp_pending_reset_email', () => {
  clearConfirmationSession();
  clearRecoverySession();

  const previousWindow = (globalThis as any).window;
  const mockLocalStorage = new Map<string, string>();
  const mockSessionStorage = new Map<string, string>();

  // Simulate legacy un-timestamped rp_pending_reset_email (resetAt === 0) left in localStorage
  // and recent signup verification timestamp (from the first /auth/v1/verify hit 6 seconds earlier)
  mockLocalStorage.set('rp_pending_reset_email', 'legacy-reset@icfai.edu');
  mockLocalStorage.set(PENDING_VERIFY_AT_STORAGE_KEY, String(Date.now() - 6000));
  mockLocalStorage.set(PENDING_AUTH_FLOW_STORAGE_KEY, 'signup');

  // Case A: GoTrue encodes #confirm-email via url.ParseQuery + q.Encode() as `#confirm-email=&error=access_denied&error_code=otp_expired...`
  const goTrueEncodedErrorLoc = {
    pathname: '/',
    search: '',
    hash: '#confirm-email=&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  };

  (globalThis as any).window = {
    location: goTrueEncodedErrorLoc,
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
  };

  try {
    const confirmState = parseEmailConfirmationUrl(goTrueEncodedErrorLoc);
    const recoveryState = parsePasswordRecoveryUrl(goTrueEncodedErrorLoc);

    assert.equal(confirmState.isConfirmEmailRoute, true);
    assert.equal(confirmState.isVerifyEmailRoute, true);
    assert.equal(confirmState.isConfirmationCallback, true);
    assert.equal(confirmState.errorCode, 'otp_expired');
    assert.equal(recoveryState.isRecoveryCallback, false);
    assert.equal(recoveryState.isResetPasswordRoute, false);

    // Legacy un-timestamped rp_pending_reset_email must also be purged from storage
    assert.equal(mockLocalStorage.has('rp_pending_reset_email'), false);

    // Case B: Second GET /auth/v1/verify 6 seconds later where GoTrue overwrites fragment
    // (`#error=access_denied&error_code=otp_expired...` without `confirm-email` in hash)
    const bareErrorLoc = {
      pathname: '/',
      search: '',
      hash: '#error=access_denied&error_code=otp_expired&error_description=One-time+token+not+found',
    };
    const bareConfirm = captureCurrentConfirmationUrlState(bareErrorLoc);
    const bareRecovery = captureCurrentRecoveryUrlState(bareErrorLoc);

    assert.equal(bareConfirm.isConfirmationCallback, true);
    assert.equal(bareConfirm.errorCode, 'otp_expired');
    assert.equal(bareRecovery.isRecoveryCallback, false);
    assert.equal(bareRecovery.isResetPasswordRoute, false);

    // Case C: After index.html scrubs browser URL to plain `#confirm-email`,
    // captureCurrentRecoveryUrlState must still return false even if window.location has no auth params
    (globalThis as any).window.location = {
      pathname: '/',
      search: '',
      hash: '#confirm-email',
    };
    const postScrubConfirm = captureCurrentConfirmationUrlState((globalThis as any).window.location);
    const postScrubRecovery = captureCurrentRecoveryUrlState((globalThis as any).window.location);

    assert.equal(postScrubConfirm.isConfirmationCallback, true);
    assert.equal(postScrubConfirm.isConfirmEmailRoute, true);
    assert.equal(postScrubRecovery.isRecoveryCallback, false);
    assert.equal(postScrubRecovery.isResetPasswordRoute, false);
  } finally {
    clearConfirmationSession();
    clearRecoverySession();
    (globalThis as any).window = previousWindow;
  }
});

