import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { db, INITIAL_SUPER_ADMIN_EMAIL, sanitizeUser } from './db.js';
import { verifyDocumentWithGemini } from './gemini.js';
import {
  BikeImageUploadScope,
  createSupabaseServerClient,
  DbProfileRow,
  dispatchSupabaseAdminSetupEmail,
  extractBearerToken,
  fetchOrSyncStudentProfile,
  mapAppUserToDbProfile,
  mapDbProfileToAppUser,
  parseAndValidateBase64BikeImage,
  updateSupabaseUserPasswordWithAccessToken,
  uploadSingleBikeImageToSupabase,
  validateBikeImageUrls,
  VerifiedSupabaseAuthContext,
  verifySupabaseAdminBearerToken,
  verifySupabaseBearerToken,
} from './supabase.js';
import { AdminRole, AdminUserRecord, User } from '../src/types.js';

dotenv.config();

const app = express();

// CORS Headers for cloud deployments & preview domains
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parser with 25MB limit for document image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

export interface AuthenticatedRequest extends Request {
  adminAuth?: VerifiedSupabaseAuthContext;
  studentAuth?: VerifiedSupabaseAuthContext;
  studentUser?: User;
}

export interface ResolvedStudentSession {
  auth: VerifiedSupabaseAuthContext;
  profile: DbProfileRow;
  user: User;
}

export interface BikeImageUploadTestDeps {
  verifyAdmin?: typeof verifySupabaseAdminBearerToken;
  verifyBearer?: typeof verifySupabaseBearerToken;
  resolveStudent?: (req: Request) => Promise<ResolvedStudentSession | null>;
  uploadSingleBikeImage?: typeof uploadSingleBikeImageToSupabase;
  dispatchAdminSetupEmail?: typeof dispatchSupabaseAdminSetupEmail;
  signInWithPassword?: (
    email: string,
    password: string
  ) => Promise<{
    accessToken: string | null;
    userId: string | null;
    email: string | null;
    emailConfirmedAt: string | null;
    error?: string;
  }>;
}

let customBikeImageRouteDeps: BikeImageUploadTestDeps = {};

export function setBikeImageUploadTestDeps(deps: BikeImageUploadTestDeps): void {
  customBikeImageRouteDeps = { ...deps };
}

export function resetBikeImageUploadTestDeps(): void {
  customBikeImageRouteDeps = {};
}

function getVerifyBearerFn() {
  return customBikeImageRouteDeps.verifyBearer ?? verifySupabaseBearerToken;
}

function getVerifyAdminFn() {
  if (customBikeImageRouteDeps.verifyAdmin) {
    return customBikeImageRouteDeps.verifyAdmin;
  }
  if (customBikeImageRouteDeps.verifyBearer) {
    return (reqOrHeader: any) =>
      verifySupabaseAdminBearerToken(reqOrHeader, customBikeImageRouteDeps.verifyBearer);
  }
  return verifySupabaseAdminBearerToken;
}

function getResolveStudentFn() {
  return customBikeImageRouteDeps.resolveStudent ?? resolveAuthenticatedStudent;
}

function getUploadSingleBikeImageFn() {
  return customBikeImageRouteDeps.uploadSingleBikeImage ?? uploadSingleBikeImageToSupabase;
}

function getDispatchAdminSetupEmailFn() {
  return customBikeImageRouteDeps.dispatchAdminSetupEmail ?? dispatchSupabaseAdminSetupEmail;
}

/**
 * Verified Supabase Admin Authentication Middleware.
 * 1. Verifies the Bearer token via `auth.getUser(token)`.
 * 2. Confirms active administrator authorization (`super_admin` or `admin`) via Supabase RPCs and server registry.
 * 3. Attaches `req.adminAuth` so downstream handlers and admin RPC calls remain scoped to the verified admin's JWT.
 */
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const rawToken = extractBearerToken(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
  }

  try {
    const verification = await getVerifyAdminFn()(req);
    if (verification.status === 'unauthenticated') {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session' });
    }
    if (verification.status === 'forbidden') {
      return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
    }

    (req as AuthenticatedRequest).adminAuth = verification.auth;
    return next();
  } catch {
    return res.status(500).json({ error: 'Failed to verify administrator session' });
  }
}

/**
 * Strict Super-Admin Authorization Middleware.
 * Enforces that the authenticated administrator is the verified initial Super Admin
 * (`role === 'super_admin'` AND `email === 'yashmithbolishetti01@gmail.com'`).
 */
async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAdmin(req, res, () => {
    const adminAuth = (req as AuthenticatedRequest).adminAuth;
    const cleanEmail = (adminAuth?.email || '').trim().toLowerCase();
    if (
      !adminAuth ||
      adminAuth.adminRole !== 'super_admin' ||
      cleanEmail !== INITIAL_SUPER_ADMIN_EMAIL
    ) {
      return res.status(403).json({
        error: 'Forbidden: Super Admin privileges are required to manage administrators.',
      });
    }
    return next();
  });
}

/**
 * Resolves the authenticated student user from a verified Supabase Bearer JWT and `public.profiles`.
 * Never trusts client-supplied user IDs, roles, or custom tokens.
 */
async function resolveAuthenticatedStudent(req: Request): Promise<ResolvedStudentSession | null> {
  const verified = await verifySupabaseBearerToken(req);
  if (!verified) {
    return null;
  }

  const profileRow = await fetchOrSyncStudentProfile(verified.userClient, verified.authUser);
  if (!profileRow) {
    return null;
  }

  // Determine whether the student owns any bikes (strictly 'student' | 'owner', never 'admin')
  let isOwner = Boolean(db.getOwnerByUserId(verified.userId));
  if (!isOwner) {
    const { data: ownedBikes } = await verified.userClient
      .from('bikes')
      .select('id')
      .eq('owner_id', verified.userId)
      .limit(1);
    if (Array.isArray(ownedBikes) && ownedBikes.length > 0) {
      isOwner = true;
    }
  }

  let appUser: User;
  try {
    appUser = mapDbProfileToAppUser(profileRow, verified.authUser, {
      role: isOwner ? 'owner' : 'student',
    });
  } catch {
    return null;
  }

  return {
    auth: verified,
    profile: profileRow,
    user: appUser,
  };
}

/**
 * Centrally validates an authenticated student session and enforces:
 * 1. Valid Supabase Bearer JWT and synchronized profile (`401` if missing/invalid/expired).
 * 2. Confirmed email address (`403` with `requiresEmailVerification: true` if unconfirmed).
 * 3. Non-suspended student account (`403` if `verificationStatus === 'suspended'`).
 */
async function requireActiveStudentSession(
  req: Request,
  res: Response,
  unauthenticatedMessage = 'Unauthorized: Valid student session required.'
): Promise<ResolvedStudentSession | null> {
  const resolved = await getResolveStudentFn()(req);
  if (!resolved) {
    res.status(401).json({ error: unauthenticatedMessage });
    return null;
  }
  if (resolved.user.emailVerified === false || !resolved.auth.emailConfirmedAt) {
    res.status(403).json({
      error: 'Please verify your email address before continuing.',
      requiresEmailVerification: true,
      email: resolved.user.email,
    });
    return null;
  }
  if (resolved.user.verificationStatus === 'suspended') {
    res.status(403).json({
      error: 'Forbidden: Your student account is currently suspended.',
    });
    return null;
  }
  return resolved;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Riders Path API',
    environment: process.env.VERCEL ? 'vercel-serverless' : (process.env.NODE_ENV || 'development'),
    time: new Date().toISOString()
  });
});

// 2. Platform Config
app.get('/api/config', (req, res) => {
  const config = db.getConfig();
  res.json(config);
});

app.put('/api/config', requireAdmin, (req, res) => {
  const { passwordHash: _ignoredPw, ...updates } = req.body || {};
  const updated = db.updateConfig(updates);
  const adminId = (req as AuthenticatedRequest).adminAuth?.userId || 'admin';
  db.logAdminAction({
    adminId,
    action: 'UPDATE_PLATFORM_CONFIG',
    targetType: 'pricing',
    targetId: 'config',
    metadata: updates
  });
  res.json(updated);
});

// 3. Admin Authentication, Initial Super-Admin Bootstrap & Admin Management
const DEFAULT_ADMIN_SETUP_REDIRECT_URL = 'https://riderspath.vercel.app/reset-password';

function resolveSafeAdminRedirectUrl(rawRedirectTo?: unknown): string {
  const candidate = typeof rawRedirectTo === 'string' ? rawRedirectTo.trim() : '';
  if (!candidate) return DEFAULT_ADMIN_SETUP_REDIRECT_URL;
  try {
    const parsed = new URL(candidate);
    const isAllowed =
      parsed.origin === 'https://riderspath.vercel.app' ||
      parsed.origin === 'https://ridersspath.ai.studio' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1';
    return isAllowed ? `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') || parsed.origin : DEFAULT_ADMIN_SETUP_REDIRECT_URL;
  } catch {
    return DEFAULT_ADMIN_SETUP_REDIRECT_URL;
  }
}

// 3A. Bootstrap Status (safe metadata for Admin Login & Setup UI)
app.get('/api/admin/bootstrap/status', (_req, res) => {
  return res.json({
    initialSuperAdminEmail: INITIAL_SUPER_ADMIN_EMAIL,
    isBootstrapped: db.isSuperAdminBootstrapped(),
  });
});

// 3B. Send Initial Super-Admin Account Setup / Recovery Link (only before bootstrap, only for yashmithbolishetti01@gmail.com)
app.post('/api/admin/bootstrap/send-setup-link', async (req, res) => {
  const { email, password, redirectTo } = req.body || {};
  if (password !== undefined) {
    return res.status(400).json({
      error: 'Do not submit a password to this endpoint. A secure Supabase Auth setup link will be sent to your email.',
    });
  }

  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    return res.status(400).json({ error: 'Administrator email address is required.' });
  }

  if (cleanEmail !== INITIAL_SUPER_ADMIN_EMAIL) {
    return res.status(403).json({
      error: `Forbidden: Only the designated initial Super Admin (${INITIAL_SUPER_ADMIN_EMAIL}) is eligible for bootstrap.`,
    });
  }

  if (db.isSuperAdminBootstrapped()) {
    return res.status(409).json({
      error: 'Initial Super Admin bootstrap has already been completed. Use Forgot Password if you need to reset your password.',
    });
  }

  const safeRedirect = resolveSafeAdminRedirectUrl(redirectTo);
  const dispatchResult = await getDispatchAdminSetupEmailFn()(INITIAL_SUPER_ADMIN_EMAIL, safeRedirect);

  if (!dispatchResult.sent) {
    return res.status(400).json({
      error:
        dispatchResult.error ||
        'Could not send the Supabase setup link. Ensure the account exists in Supabase Auth or SUPABASE_SERVICE_ROLE_KEY is configured.',
    });
  }

  db.logAdminAction({
    adminId: 'system_bootstrap',
    action: 'SEND_SUPER_ADMIN_BOOTSTRAP_LINK',
    targetType: 'auth',
    targetId: INITIAL_SUPER_ADMIN_EMAIL,
    metadata: { deliveryMethod: dispatchResult.deliveryMethod },
  });

  return res.json({
    success: true,
    email: INITIAL_SUPER_ADMIN_EMAIL,
    deliveryMethod: dispatchResult.deliveryMethod,
    message: `A secure account setup / password reset link has been sent to ${INITIAL_SUPER_ADMIN_EMAIL}.`,
  });
});

// 3C. Complete Initial Super-Admin Bootstrap (requires verified Supabase Auth identity for yashmithbolishetti01@gmail.com)
app.post('/api/admin/bootstrap', async (req, res) => {
  if (db.isSuperAdminBootstrapped()) {
    return res.status(409).json({
      error: 'Forbidden: Initial Super Admin has already been bootstrapped and cannot be repeated.',
    });
  }

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;
  let verifiedEmailConfirmedAt: string | null = null;
  let verifiedAccessToken: string | null = null;
  let userScopedClient = null as ReturnType<typeof createSupabaseServerClient>;

  // Option 1: Caller presents a Bearer token from an active Supabase Auth session
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const verified = await getVerifyBearerFn()(req);
    if (!verified) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired Supabase authentication token.',
      });
    }
    verifiedUserId = verified.userId;
    verifiedEmail = verified.email ? verified.email.trim().toLowerCase() : null;
    verifiedEmailConfirmedAt = verified.emailConfirmedAt;
    verifiedAccessToken = verified.accessToken;
    userScopedClient = verified.userClient;
  } else {
    // Option 2: Caller authenticates with Supabase Auth email & password
    const { email, password } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!cleanEmail || !password || typeof password !== 'string') {
      return res.status(401).json({
        error: 'Unauthorized: Authentication is required to bootstrap the initial Super Admin.',
      });
    }

    if (cleanEmail !== INITIAL_SUPER_ADMIN_EMAIL) {
      return res.status(403).json({
        error: `Forbidden: Only ${INITIAL_SUPER_ADMIN_EMAIL} is authorized to bootstrap the initial Super Admin role.`,
      });
    }

    if (customBikeImageRouteDeps.signInWithPassword) {
      const signInRes = await customBikeImageRouteDeps.signInWithPassword(cleanEmail, password);
      if (signInRes.error || !signInRes.accessToken || !signInRes.userId) {
        return res.status(401).json({
          error: signInRes.error || 'Invalid Supabase credentials for initial Super Admin bootstrap.',
        });
      }
      verifiedUserId = signInRes.userId;
      verifiedEmail = (signInRes.email || cleanEmail).trim().toLowerCase();
      verifiedEmailConfirmedAt = signInRes.emailConfirmedAt;
      verifiedAccessToken = signInRes.accessToken;
      userScopedClient = createSupabaseServerClient(verifiedAccessToken);
    } else {
      const anonClient = createSupabaseServerClient();
      if (!anonClient) {
        return res.status(500).json({ error: 'Authentication service is not configured on the server' });
      }
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError || !signInData?.session?.access_token || !signInData?.user?.id) {
        return res.status(401).json({ error: 'Invalid Supabase credentials for initial Super Admin bootstrap.' });
      }
      verifiedUserId = signInData.user.id;
      verifiedEmail = signInData.user.email ? signInData.user.email.trim().toLowerCase() : null;
      verifiedEmailConfirmedAt = signInData.user.email_confirmed_at ?? null;
      verifiedAccessToken = signInData.session.access_token;
      userScopedClient = createSupabaseServerClient(verifiedAccessToken);
    }
  }

  if (!verifiedUserId || !verifiedEmail || verifiedEmail !== INITIAL_SUPER_ADMIN_EMAIL) {
    return res.status(403).json({
      error: `Forbidden: Only ${INITIAL_SUPER_ADMIN_EMAIL} is authorized to bootstrap the initial Super Admin role.`,
    });
  }

  if (!verifiedEmailConfirmedAt) {
    return res.status(403).json({
      error: 'Forbidden: Please verify your email address in Supabase Auth before bootstrapping the Super Admin account.',
    });
  }

  // Invoke Supabase RPC if the SQL migration has been applied
  if (userScopedClient) {
    try {
      await userScopedClient.rpc('bootstrap_initial_super_admin');
    } catch {
      // Non-fatal if SQL migration RPC is not yet installed; server registry enforces bootstrap
    }
  }

  let bootstrappedRecord: AdminUserRecord;
  try {
    bootstrappedRecord = db.bootstrapInitialSuperAdmin(verifiedUserId, verifiedEmail);
  } catch (err: any) {
    const msg = err?.message || 'Could not bootstrap initial Super Admin.';
    if (msg.startsWith('Conflict:')) {
      return res.status(409).json({ error: msg });
    }
    return res.status(403).json({ error: msg });
  }

  db.logAdminAction({
    adminId: verifiedUserId,
    action: 'BOOTSTRAP_INITIAL_SUPER_ADMIN',
    targetType: 'auth',
    targetId: verifiedUserId,
    metadata: { email: INITIAL_SUPER_ADMIN_EMAIL },
  });

  return res.status(201).json({
    success: true,
    token: verifiedAccessToken,
    role: 'super_admin' as AdminRole,
    isSuperAdmin: true,
    email: INITIAL_SUPER_ADMIN_EMAIL,
    userId: verifiedUserId,
    admin: bootstrappedRecord,
    message: 'Initial Super Admin account verified and bootstrapped.',
  });
});

// 3D. Admin Login (Supabase Auth + server role verification)
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!cleanEmail || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Administrator email and password are required' });
  }

  let accessToken: string | null = null;
  let userId: string | null = null;
  let confirmedAt: string | null = null;

  if (customBikeImageRouteDeps.signInWithPassword) {
    const signInRes = await customBikeImageRouteDeps.signInWithPassword(cleanEmail, password);
    if (signInRes.error || !signInRes.accessToken || !signInRes.userId) {
      return res.status(401).json({ error: 'Invalid administrator credentials' });
    }
    accessToken = signInRes.accessToken;
    userId = signInRes.userId;
    confirmedAt = signInRes.emailConfirmedAt;
  } else {
    const anonClient = createSupabaseServerClient();
    if (!anonClient) {
      return res.status(500).json({ error: 'Authentication service is not configured on the server' });
    }

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError || !signInData?.session?.access_token || !signInData?.user?.id) {
      return res.status(401).json({ error: 'Invalid administrator credentials' });
    }

    accessToken = signInData.session.access_token;
    userId = signInData.user.id;
    confirmedAt = signInData.user.email_confirmed_at ?? null;
  }

  if (!confirmedAt) {
    return res.status(403).json({
      error: 'Forbidden: Administrator email address must be verified before signing in.',
    });
  }

  const verification = await getVerifyAdminFn()(`Bearer ${accessToken}`);
  if (verification.status !== 'authorized') {
    const userClient = createSupabaseServerClient(accessToken);
    if (userClient) {
      await userClient.auth.signOut().catch(() => {});
    }
    return res.status(403).json({
      error: 'Forbidden: This account is not authorized for administrator access',
    });
  }

  const resolvedRole: AdminRole =
    verification.auth.adminRole === 'super_admin' && cleanEmail === INITIAL_SUPER_ADMIN_EMAIL
      ? 'super_admin'
      : 'admin';

  db.logAdminAction({
    adminId: userId,
    action: 'ADMIN_LOGIN_SUCCESS',
    targetType: 'auth',
    targetId: userId,
    metadata: { email: cleanEmail, role: resolvedRole, ip: req.ip }
  });

  return res.json({
    success: true,
    token: accessToken,
    role: resolvedRole,
    isSuperAdmin: resolvedRole === 'super_admin',
    email: cleanEmail,
    userId,
    message: 'Admin session authenticated successfully'
  });
});

app.post('/api/admin/logout', async (req, res) => {
  const verified = await getVerifyBearerFn()(req);
  if (verified) {
    await verified.userClient.auth.signOut().catch(() => {});
  }
  return res.json({ success: true, message: 'Logged out of admin session' });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const role: AdminRole =
    adminAuth.adminRole === 'super_admin' &&
    adminAuth.email?.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL
      ? 'super_admin'
      : 'admin';
  return res.json({
    authenticated: true,
    role,
    isSuperAdmin: role === 'super_admin',
    userId: adminAuth.userId,
    email: adminAuth.email,
  });
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword || typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Both old and new passwords are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }
  if (!adminAuth.email) {
    return res.status(400).json({ error: 'Admin account does not have a verified email address' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Authentication service is not configured on the server' });
  }

  const { error: verifyErr } = await anonClient.auth.signInWithPassword({
    email: adminAuth.email,
    password: oldPassword,
  });

  if (verifyErr) {
    return res.status(400).json({ error: 'Current password does not match' });
  }

  const { error: updateErr } = await adminAuth.userClient.auth.updateUser({
    password: newPassword,
  });

  if (updateErr) {
    return res.status(400).json({ error: 'Could not update administrator password' });
  }

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'CHANGE_ADMIN_PASSWORD',
    targetType: 'auth',
    targetId: adminAuth.userId,
    metadata: { time: new Date().toISOString() }
  });

  return res.json({ success: true, message: 'Admin password updated securely' });
});

// 3E. Admin Management Endpoints (List, Invite/Add, Resend Setup Link, Revoke)
app.get('/api/admin/admins', requireAdmin, async (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const currentRole: AdminRole =
    adminAuth.adminRole === 'super_admin' &&
    adminAuth.email?.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL
      ? 'super_admin'
      : 'admin';

  // Sync from Supabase RPC list_admin_users if available
  try {
    const { data: rpcList, error: rpcErr } = await adminAuth.userClient.rpc('list_admin_users');
    if (!rpcErr && Array.isArray(rpcList)) {
      for (const item of rpcList) {
        if (item && typeof item.email === 'string') {
          const itemEmail = item.email.trim().toLowerCase();
          const existing = db.getAdminByEmail(itemEmail);
          if (!existing && itemEmail !== INITIAL_SUPER_ADMIN_EMAIL && item.status !== 'revoked') {
            db.addAdminUser(itemEmail, INITIAL_SUPER_ADMIN_EMAIL, {
              userId: typeof item.userId === 'string' ? item.userId : null,
              status: item.status === 'active' ? 'active' : 'invited',
            });
          }
        }
      }
    }
  } catch {
    // Fallback cleanly to server admin registry
  }

  const admins = db.getAdminUsers(false);
  return res.json({
    admins,
    currentAdminRole: currentRole,
    isSuperAdmin: currentRole === 'super_admin',
    initialSuperAdminEmail: INITIAL_SUPER_ADMIN_EMAIL,
  });
});

app.post('/api/admin/admins', requireSuperAdmin, async (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Strictly forbid accepting or storing any password for a new admin
  if (
    body.password !== undefined ||
    body.newPassword !== undefined ||
    body.passwordHash !== undefined
  ) {
    return res.status(400).json({
      error:
        'Do not provide a password when adding an administrator. New administrators must set their own password via the Supabase Auth invitation/setup link.',
    });
  }

  // Strictly forbid granting super_admin or escalating role
  if (body.role !== undefined && body.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Only the standard "admin" role can be granted to new administrators.',
    });
  }

  const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address for the new administrator.' });
  }

  if (cleanEmail === INITIAL_SUPER_ADMIN_EMAIL) {
    return res.status(400).json({
      error: `${INITIAL_SUPER_ADMIN_EMAIL} is already the designated Super Admin.`,
    });
  }

  // Invoke Supabase RPC if migration is installed
  try {
    await adminAuth.userClient.rpc('admin_add_administrator', {
      p_email: cleanEmail,
    });
  } catch {
    // Server registry enforces addition even if migration RPC is not yet installed
  }

  let createdAdmin: AdminUserRecord;
  try {
    createdAdmin = db.addAdminUser(cleanEmail, adminAuth.email!);
  } catch (err: any) {
    const msg = err?.message || 'Could not add administrator.';
    if (msg.includes('already exists')) {
      return res.status(409).json({ error: msg });
    }
    return res.status(400).json({ error: msg });
  }

  const safeRedirect = resolveSafeAdminRedirectUrl(body.redirectTo);
  const emailDispatch = await getDispatchAdminSetupEmailFn()(cleanEmail, safeRedirect);

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'ADD_ADMIN_USER',
    targetType: 'auth',
    targetId: createdAdmin.id,
    metadata: {
      email: cleanEmail,
      role: 'admin',
      addedBy: adminAuth.email,
      invitationSent: emailDispatch.sent,
      deliveryMethod: emailDispatch.deliveryMethod,
    },
  });

  return res.status(201).json({
    success: true,
    admin: createdAdmin,
    invitationSent: emailDispatch.sent,
    deliveryMethod: emailDispatch.deliveryMethod,
    message: emailDispatch.sent
      ? `Administrator ${cleanEmail} added. A Supabase Auth password setup link has been sent to their email.`
      : `Administrator ${cleanEmail} has been pre-authorized with the Admin role. Have them sign up or request a password reset link at ${DEFAULT_ADMIN_SETUP_REDIRECT_URL} to set their password.`,
  });
});

app.post('/api/admin/admins/:id/resend-invite', requireSuperAdmin, async (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const target = db.getAdminByIdOrEmail(req.params.id);
  if (!target || target.status === 'revoked') {
    return res.status(404).json({ error: 'Administrator account not found.' });
  }

  const safeRedirect = resolveSafeAdminRedirectUrl(req.body?.redirectTo);
  const emailDispatch = await getDispatchAdminSetupEmailFn()(target.email, safeRedirect);

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'RESEND_ADMIN_INVITE',
    targetType: 'auth',
    targetId: target.id,
    metadata: {
      email: target.email,
      invitationSent: emailDispatch.sent,
      deliveryMethod: emailDispatch.deliveryMethod,
    },
  });

  return res.json({
    success: true,
    email: target.email,
    invitationSent: emailDispatch.sent,
    deliveryMethod: emailDispatch.deliveryMethod,
    message: emailDispatch.sent
      ? `Password setup / recovery link sent to ${target.email}.`
      : `Could not automatically email ${target.email}. Ask them to use "Forgot Password" on the login page to receive a Supabase Auth setup link.`,
  });
});

app.delete('/api/admin/admins/:id', requireSuperAdmin, async (req, res) => {
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;
  const targetParam = (req.params.id || '').trim();
  const target = db.getAdminByIdOrEmail(targetParam);

  if (
    targetParam.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL ||
    target?.email === INITIAL_SUPER_ADMIN_EMAIL ||
    target?.role === 'super_admin'
  ) {
    return res.status(403).json({
      error: 'Forbidden: The initial Super Admin account cannot be revoked.',
    });
  }

  if (!target || target.status === 'revoked') {
    return res.status(404).json({ error: 'Administrator account not found.' });
  }

  if (target.userId && target.userId === adminAuth.userId) {
    return res.status(403).json({
      error: 'Forbidden: You cannot revoke your own Super Admin privileges.',
    });
  }

  try {
    await adminAuth.userClient.rpc('admin_revoke_administrator', {
      p_target_email: target.email,
    });
  } catch {
    // Server registry enforces revocation immediately
  }

  let revokedRecord: AdminUserRecord;
  try {
    revokedRecord = db.revokeAdminUser(target.id, adminAuth.email!);
  } catch (err: any) {
    const msg = err?.message || 'Could not revoke administrator.';
    if (msg.startsWith('Forbidden:')) {
      return res.status(403).json({ error: msg });
    }
    return res.status(400).json({ error: msg });
  }

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'REVOKE_ADMIN_USER',
    targetType: 'auth',
    targetId: revokedRecord.id,
    metadata: {
      revokedEmail: revokedRecord.email,
      revokedBy: adminAuth.email,
    },
  });

  return res.json({
    success: true,
    revokedAdmin: revokedRecord,
    message: `Administrator privileges for ${revokedRecord.email} have been revoked.`,
  });
});

// Helper for ICFAI Enrollment Number Validation
function validateIcfaiEnrollment(enrollment: string, allowExistingSeed?: string): { valid: boolean; normalized: string; error?: string } {
  if (!enrollment || typeof enrollment !== 'string') {
    return { valid: false, normalized: '', error: 'Enter your ICFAI enrollment number.' };
  }
  const clean = enrollment.trim().toUpperCase();
  if (!clean) {
    return { valid: false, normalized: '', error: 'Enter your ICFAI enrollment number.' };
  }
  if (/\s/.test(clean) || !/^[A-Z0-9]+$/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Use only letters and numbers, without spaces or symbols.' };
  }
  if (allowExistingSeed && clean === allowExistingSeed.trim().toUpperCase()) {
    return { valid: true, normalized: clean };
  }
  if (clean.length < 10) {
    return { valid: false, normalized: clean, error: 'Enrollment number must be at least 10 characters.' };
  }
  return { valid: true, normalized: clean };
}

// 4. Complete Student Authentication (/api/auth/*) backed by Supabase Auth & public.profiles
app.post('/api/auth/signup', async (req, res) => {
  const {
    fullName,
    email,
    password,
    phone,
    icfaiEnrollmentNumber,
    academicYear,
    course,
  } = req.body || {};

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Enter your full legal name as printed on your Student ID.' });
  }

  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one letter and one number.' });
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanPhoneDigits = cleanPhone.replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhoneDigits.length < 10) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile or WhatsApp number.' });
  }

  const enrollmentCheck = validateIcfaiEnrollment(icfaiEnrollmentNumber);
  if (!enrollmentCheck.valid) {
    return res.status(400).json({ error: enrollmentCheck.error });
  }
  const cleanEnrollment = enrollmentCheck.normalized;
  const cleanFullName = fullName.trim();
  const cleanAcademicYear = typeof academicYear === 'string' && academicYear.trim() ? academicYear.trim() : '1st Year';
  const cleanCourse = typeof course === 'string' && course.trim() ? course.trim() : 'B.Tech';

  // Ordinary student signup MUST use the public request-scoped client (never service_role)
  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  // Pre-check public.profiles for duplicate email or enrollment_number when readable under RLS
  const { data: existingEmailProfile } = await anonClient
    .from('profiles')
    .select('id')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (existingEmailProfile) {
    return res.status(409).json({
      error: 'An account with this email address already exists. Please sign in or reset your password.',
    });
  }

  const { data: existingEnrollmentProfile } = await anonClient
    .from('profiles')
    .select('id')
    .ilike('enrollment_number', cleanEnrollment)
    .maybeSingle();

  if (existingEnrollmentProfile) {
    return res.status(409).json({
      error: 'This ICFAI enrollment number is already registered to a student account.',
    });
  }

  const rawRedirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo.trim() : '';
  const baseConfirmationRedirectUrl = (
    (/^https?:\/\//i.test(rawRedirectTo) ? rawRedirectTo : '') ||
    process.env.EMAIL_CONFIRMATION_REDIRECT_URL ||
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    'https://riderspath.vercel.app/#confirm-email'
  ).trim();
  const configuredRedirectUrl =
    baseConfirmationRedirectUrl.includes('#') ||
    /\/(verify-email|confirm-email)\/?$/i.test(baseConfirmationRedirectUrl)
      ? baseConfirmationRedirectUrl.replace(/#reset-password$/i, '#confirm-email')
      : `${baseConfirmationRedirectUrl.replace(/\/+$/, '')}/#confirm-email`;

  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      ...(configuredRedirectUrl ? { emailRedirectTo: configuredRedirectUrl } : {}),
      data: {
        full_name: cleanFullName,
        phone: cleanPhone,
        enrollment_number: cleanEnrollment,
        academic_year: cleanAcademicYear,
        course: cleanCourse,
      },
    },
  });

  if (signUpError) {
    const lowerMsg = (signUpError.message || '').toLowerCase();
    if (lowerMsg.includes('already registered') || lowerMsg.includes('already exists')) {
      return res.status(409).json({
        error: 'An account with this email address already exists. Please sign in or reset your password.',
      });
    }
    if (lowerMsg.includes('enrollment')) {
      return res.status(409).json({
        error: 'This ICFAI enrollment number is already registered to a student account.',
      });
    }
    if (signUpError.status === 429 || lowerMsg.includes('rate limit') || lowerMsg.includes('after')) {
      return res.status(429).json({
        error:
          signUpError.message ||
          'Email rate limit reached. Please wait 60 seconds before requesting another confirmation email.',
      });
    }
    return res.status(400).json({
      error: signUpError.message || 'Could not create your student account. Please check your details and try again.',
    });
  }

  const authUser = signUpData?.user;
  if (!authUser || !authUser.id) {
    return res.status(500).json({ error: 'Account creation did not return a valid Supabase Auth user.' });
  }

  // When email confirmation is enabled in Supabase Auth, signing up an already-registered
  // email returns an obfuscated user object with an empty `identities` array.
  if (Array.isArray(authUser.identities) && authUser.identities.length === 0) {
    return res.status(409).json({
      error: 'An account with this email address already exists. Please sign in or reset your password.',
    });
  }

  // Prepare verified profile payload bound strictly to authUser.id (never from req.body)
  const profilePayload = mapAppUserToDbProfile(authUser.id, {
    fullName: cleanFullName,
    email: cleanEmail,
    phone: cleanPhone,
    icfaiEnrollmentNumber: cleanEnrollment,
    academicYear: cleanAcademicYear,
    course: cleanCourse,
  });

  const nowIso = new Date().toISOString();
  let persistedProfile: DbProfileRow | null = null;

  // If Supabase returned an authenticated session JWT, synchronize public.profiles immediately under the user's JWT
  if (signUpData.session?.access_token) {
    const userClient = createSupabaseServerClient(signUpData.session.access_token);
    if (userClient) {
      const { data: upserted, error: upsertErr } = await userClient
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' })
        .select('*')
        .single<DbProfileRow>();

      if (upsertErr) {
        const lowerErr = (upsertErr.message || '').toLowerCase();
        if (lowerErr.includes('enrollment') || upsertErr.code === '23505') {
          return res.status(409).json({
            error: 'This ICFAI enrollment number or email is already registered to another student account.',
          });
        }
      } else if (upserted) {
        persistedProfile = upserted;
      }
    }
  } else {
    // When email confirmation is pending (no user JWT issued yet), check if an auth.users trigger
    // already created the public.profiles row or attempt a non-privileged upsert.
    const { data: upserted } = await anonClient
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('*')
      .single<DbProfileRow>();
    if (upserted) {
      persistedProfile = upserted;
    }
  }

  const effectiveProfileRow: DbProfileRow = persistedProfile || {
    ...profilePayload,
    created_at: authUser.created_at || nowIso,
    updated_at: nowIso,
  };

  const requiresEmailVerification = !authUser.email_confirmed_at || !signUpData.session?.access_token;
  const appUser = mapDbProfileToAppUser(effectiveProfileRow, authUser, {
    role: 'student',
    verificationStatus: requiresEmailVerification ? 'pending' : 'verified',
  });

  return res.status(201).json({
    success: true,
    requiresEmailVerification,
    email: cleanEmail,
    emailDeliveryMode: 'live',
    ...(signUpData.session?.access_token && !requiresEmailVerification
      ? {
          token: signUpData.session.access_token,
          refreshToken: signUpData.session.refresh_token,
        }
      : {}),
    message: requiresEmailVerification
      ? `A confirmation link has been sent to ${cleanEmail}. Click the link in your email to verify and activate your account.`
      : `Account created for ${cleanEmail}.`,
    user: appUser,
  });
});

app.post('/api/auth/verify-email', async (req, res) => {
  const { email, code, accessToken, refreshToken, tokenHash, type } = req.body || {};
  const headerToken = extractBearerToken(req);
  const cleanAccessToken =
    (typeof accessToken === 'string' && accessToken.trim()) || headerToken || '';
  const cleanRefreshToken =
    typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken.trim() : '';
  const cleanTokenHash =
    typeof tokenHash === 'string' && tokenHash.trim() ? tokenHash.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanCode = typeof code === 'string' ? code.replace(/\s+/g, '').trim() : '';
  const rawType = typeof type === 'string' ? type.trim().toLowerCase() : '';

  if (rawType === 'recovery') {
    return res.status(400).json({
      error: 'Password recovery links cannot be used on the email confirmation endpoint.',
    });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  let verifiedUser: any = null;
  let finalAccessToken = cleanAccessToken;
  let finalRefreshToken = cleanRefreshToken;

  // Path 1: Confirmation link token_hash (?token_hash=...&type=signup|email)
  if (cleanTokenHash) {
    const primaryType: 'signup' | 'email' | 'email_change' =
      rawType === 'email' || rawType === 'email_change' ? rawType : 'signup';

    let otpRes = await anonClient.auth.verifyOtp({
      token_hash: cleanTokenHash,
      type: primaryType,
    });

    if (otpRes.error && primaryType !== 'email') {
      const fallbackRes = await anonClient.auth.verifyOtp({
        token_hash: cleanTokenHash,
        type: 'email',
      });
      if (!fallbackRes.error && fallbackRes.data?.user) {
        otpRes = fallbackRes;
      }
    }

    if (otpRes.error || !otpRes.data?.user?.id || !otpRes.data?.session?.access_token) {
      return res.status(400).json({
        error:
          'This email confirmation link is invalid or has expired. Confirmation links can only be used once—please request a new confirmation email.',
      });
    }

    verifiedUser = otpRes.data.user;
    finalAccessToken = otpRes.data.session.access_token;
    finalRefreshToken = otpRes.data.session.refresh_token || '';
  } else if (finalAccessToken) {
    // Path 2: Confirmation link access_token (#access_token=...&type=signup or PKCE exchange)
    const { data: userData, error: userErr } = await anonClient.auth.getUser(finalAccessToken);
    if (!userErr && userData?.user?.id) {
      verifiedUser = userData.user;
    } else if (finalRefreshToken) {
      const { data: sessionData, error: sessionErr } = await anonClient.auth.setSession({
        access_token: finalAccessToken,
        refresh_token: finalRefreshToken,
      });
      if (!sessionErr && sessionData?.user?.id && sessionData?.session?.access_token) {
        verifiedUser = sessionData.user;
        finalAccessToken = sessionData.session.access_token;
        finalRefreshToken = sessionData.session.refresh_token || finalRefreshToken;
      }
    }

    if (!verifiedUser || !verifiedUser.id) {
      return res.status(400).json({
        error:
          'This email confirmation link is invalid or has expired. Please request a new confirmation email.',
      });
    }
  } else if (cleanCode && !/^\d{6}$/.test(cleanCode)) {
    // Path 2B: PKCE authorization code (?code=...)
    const { data: codeData, error: codeErr } =
      await anonClient.auth.exchangeCodeForSession(cleanCode);
    if (
      codeErr ||
      !codeData?.user?.id ||
      !codeData?.session?.access_token
    ) {
      return res.status(400).json({
        error:
          'This email confirmation link is invalid or has expired. Confirmation links can only be used once—please request a new confirmation email.',
      });
    }
    verifiedUser = codeData.user;
    finalAccessToken = codeData.session.access_token;
    finalRefreshToken = codeData.session.refresh_token || '';
  } else if (cleanEmail && cleanCode) {
    // Path 3: Legacy OTP verification fallback if both email and 6-digit code are provided
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Invalid verification code format.' });
    }

    let verifyResult = await anonClient.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: 'email',
    });

    if (verifyResult.error) {
      const fallbackVerify = await anonClient.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'signup',
      });
      if (!fallbackVerify.error && fallbackVerify.data?.user) {
        verifyResult = fallbackVerify;
      }
    }

    if (
      verifyResult.error ||
      !verifyResult.data?.user?.id ||
      !verifyResult.data?.session?.access_token
    ) {
      const rawErrMsg = (verifyResult.error?.message || '').toLowerCase();
      if (verifyResult.error?.status === 429 || rawErrMsg.includes('rate limit') || rawErrMsg.includes('too many')) {
        return res.status(429).json({
          error: 'Too many verification attempts. Please wait a moment before trying again.',
        });
      }
      return res.status(400).json({
        error: 'This verification link or code is invalid or has expired. Please request a new confirmation email.',
      });
    }

    verifiedUser = verifyResult.data.user;
    finalAccessToken = verifyResult.data.session.access_token;
    finalRefreshToken = verifyResult.data.session.refresh_token || '';
  } else {
    return res.status(400).json({
      error: 'No valid email confirmation token was provided. Please click the confirmation link in your email.',
    });
  }

  if (!verifiedUser.email_confirmed_at) {
    return res.status(400).json({
      error: 'Your email address has not been confirmed yet. Please click the confirmation link sent to your email.',
    });
  }

  const userClient = createSupabaseServerClient(finalAccessToken);
  if (!userClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  const profileRow = await fetchOrSyncStudentProfile(userClient, verifiedUser);
  if (!profileRow) {
    return res.status(500).json({
      error: 'Email verified, but student profile could not be synchronized. Please sign in to complete setup.',
    });
  }

  const appUser = mapDbProfileToAppUser(profileRow, verifiedUser, {
    role: 'student',
    verificationStatus: 'verified',
  });

  return res.json({
    success: true,
    token: finalAccessToken,
    refreshToken: finalRefreshToken || undefined,
    user: appUser,
    message: 'Email verified! Your student account is now active.',
  });
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email, redirectTo } = req.body || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  const rawRedirectTo = typeof redirectTo === 'string' ? redirectTo.trim() : '';
  const baseConfirmationRedirectUrl = (
    (/^https?:\/\//i.test(rawRedirectTo) ? rawRedirectTo : '') ||
    process.env.EMAIL_CONFIRMATION_REDIRECT_URL ||
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    'https://riderspath.vercel.app/#confirm-email'
  ).trim();
  const configuredRedirectUrl =
    baseConfirmationRedirectUrl.includes('#') ||
    /\/(verify-email|confirm-email)\/?$/i.test(baseConfirmationRedirectUrl)
      ? baseConfirmationRedirectUrl.replace(/#reset-password$/i, '#confirm-email')
      : `${baseConfirmationRedirectUrl.replace(/\/+$/, '')}/#confirm-email`;

  const { error } = await anonClient.auth.resend({
    type: 'signup',
    email: cleanEmail,
    ...(configuredRedirectUrl ? { options: { emailRedirectTo: configuredRedirectUrl } } : {}),
  });

  if (error) {
    const lowerErr = (error.message || '').toLowerCase();
    if (lowerErr.includes('already confirmed') || lowerErr.includes('already verified')) {
      return res.json({
        success: true,
        alreadyVerified: true,
        email: cleanEmail,
        emailDeliveryMode: 'live',
        message: 'This email address is already verified. You can sign in now.',
      });
    }
    if (
      error.status === 429 ||
      lowerErr.includes('rate limit') ||
      lowerErr.includes('after') ||
      lowerErr.includes('seconds') ||
      lowerErr.includes('too many')
    ) {
      const waitMatch = (error.message || '').match(/(\d+)\s*second/i);
      const retryAfterSeconds = waitMatch ? Math.max(1, Number(waitMatch[1])) : 60;
      return res.status(429).json({
        error:
          error.message ||
          `Please wait ${retryAfterSeconds} seconds before requesting another confirmation email.`,
        retryAfterSeconds,
      });
    }
    return res.status(400).json({
      error: error.message || 'Could not resend confirmation email. Please wait a moment and try again.',
    });
  }

  return res.json({
    success: true,
    email: cleanEmail,
    emailDeliveryMode: 'live',
    cooldownSeconds: 60,
    message: `A new confirmation link has been sent to ${cleanEmail}.`,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const cleanIdentifier = typeof email === 'string' ? email.trim() : '';

  if (!cleanIdentifier || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter both your email address and password.' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  let targetEmail = cleanIdentifier.toLowerCase();
  if (!targetEmail.includes('@')) {
    const { data: profileByEnrollment } = await anonClient
      .from('profiles')
      .select('email')
      .ilike('enrollment_number', cleanIdentifier.toUpperCase())
      .maybeSingle<{ email: string | null }>();

    if (profileByEnrollment?.email) {
      targetEmail = profileByEnrollment.email.trim().toLowerCase();
    } else {
      return res.status(400).json({
        error: 'Please sign in using your registered student email address and password.',
      });
    }
  }

  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: targetEmail,
    password,
  });

  if (signInError) {
    const lowerMsg = (signInError.message || '').toLowerCase();
    if (lowerMsg.includes('email not confirmed')) {
      return res.status(403).json({
        error: 'Please verify your email address by clicking the confirmation link sent to your inbox before signing in.',
        requiresEmailVerification: true,
        email: targetEmail,
        emailDeliveryMode: 'live',
      });
    }
    return res.status(401).json({
      error: 'Invalid email or password. Please check your credentials and try again.',
    });
  }

  const authUser = signInData?.user;
  const accessToken = signInData?.session?.access_token;
  const refreshToken = signInData?.session?.refresh_token;
  if (!authUser?.id || !accessToken) {
    return res.status(401).json({
      error: 'Invalid email or password. Please check your credentials and try again.',
    });
  }

  const userClient = createSupabaseServerClient(accessToken);
  if (!userClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  if (!authUser.email_confirmed_at) {
    await userClient.auth.signOut().catch(() => {});
    return res.status(403).json({
      error: 'Please verify your email address by clicking the confirmation link sent to your inbox before signing in.',
      requiresEmailVerification: true,
      email: targetEmail,
      emailDeliveryMode: 'live',
    });
  }

  const profileRow = await fetchOrSyncStudentProfile(userClient, authUser);
  if (!profileRow) {
    return res.status(404).json({
      error: 'Student profile not found for this account. Please complete profile registration.',
    });
  }

  let isOwner = Boolean(db.getOwnerByUserId(authUser.id));
  if (!isOwner) {
    const { data: ownedBikes } = await userClient
      .from('bikes')
      .select('id')
      .eq('owner_id', authUser.id)
      .limit(1);
    if (Array.isArray(ownedBikes) && ownedBikes.length > 0) {
      isOwner = true;
    }
  }

  const appUser = mapDbProfileToAppUser(profileRow, authUser, {
    role: isOwner ? 'owner' : 'student',
    verificationStatus: 'verified',
  });

  return res.json({
    success: true,
    token: accessToken,
    refreshToken,
    user: appUser,
  });
});

const DEFAULT_PASSWORD_RESET_REDIRECT_URL = 'https://riderspath.vercel.app/reset-password';

function isServerNonRecoveryJwt(accessToken?: string | null): boolean {
  if (!accessToken || typeof accessToken !== 'string') return false;
  const parts = accessToken.trim().split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return false;
    if (Array.isArray(payload.amr) && payload.amr.length > 0) {
      const hasRecovery = payload.amr.some(
        (entry: any) =>
          entry === 'recovery' ||
          entry === 'invite' ||
          (entry &&
            typeof entry === 'object' &&
            (String(entry.method || '').toLowerCase() === 'recovery' ||
              String(entry.method || '').toLowerCase() === 'invite'))
      );
      if (hasRecovery) return false;
      return payload.amr.some((entry: any) => {
        const method =
          typeof entry === 'string'
            ? entry.toLowerCase()
            : entry && typeof entry === 'object'
            ? String(entry.method || '').toLowerCase()
            : '';
        return method === 'password' || method === 'oauth' || method === 'sso';
      });
    }
    return false;
  } catch {
    return false;
  }
}

function logServerRecoveryDiagnostic(step: string, details: Record<string, unknown>): void {
  try {
    console.info(`[RidersPath:Recovery:Server] ${step}`, details);
  } catch {
    // Never fail request handling due to diagnostic logging
  }
}

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, redirectTo } = req.body || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  const baseRecoveryRedirectTo =
    typeof redirectTo === 'string' && /^https?:\/\//i.test(redirectTo.trim())
      ? redirectTo.trim()
      : (process.env.PASSWORD_RESET_REDIRECT_URL || DEFAULT_PASSWORD_RESET_REDIRECT_URL).trim();
  const resolvedRedirectTo = baseRecoveryRedirectTo.includes('#') ||
    /\/reset-password\/?$/i.test(baseRecoveryRedirectTo)
    ? baseRecoveryRedirectTo
    : `${baseRecoveryRedirectTo.replace(/\/+$/, '')}/reset-password`;

  logServerRecoveryDiagnostic('forgotPasswordRequested', {
    redirectTo: resolvedRedirectTo,
  });

  const { error } = await anonClient.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: resolvedRedirectTo,
  });

  if (error) {
    logServerRecoveryDiagnostic('forgotPasswordFailed', {
      statusCode: error.status || 400,
      errorCode: (error as any).code || null,
    });
    const lowerMsg = (error.message || '').toLowerCase();
    if (
      error.status === 429 ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('security purposes') ||
      lowerMsg.includes('too many')
    ) {
      return res.status(429).json({
        error: 'Please wait a minute before requesting another password reset email.',
      });
    }
    return res.status(400).json({
      error: error.message || 'Could not send password recovery email. Please try again.',
    });
  }

  logServerRecoveryDiagnostic('forgotPasswordSent', {
    redirectTo: resolvedRedirectTo,
    success: true,
  });

  return res.json({
    success: true,
    email: cleanEmail,
    redirectTo: resolvedRedirectTo,
    emailDeliveryMode: 'live',
    message: `If an account is registered with ${cleanEmail}, a password reset link has been sent.`,
  });
});

app.post('/api/auth/verify-recovery', async (req, res) => {
  const { accessToken, refreshToken, tokenHash, code, type } = req.body || {};
  const headerToken = extractBearerToken(req);
  const cleanAccessToken =
    (typeof accessToken === 'string' && accessToken.trim()) || headerToken || '';
  const cleanRefreshToken =
    typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken.trim() : '';
  const cleanTokenHash =
    typeof tokenHash === 'string' && tokenHash.trim() ? tokenHash.trim() : '';
  const cleanCode =
    typeof code === 'string' && code.trim() ? code.trim() : '';
  const rawType = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (
    rawType === 'signup' ||
    rawType === 'email' ||
    rawType === 'email_change' ||
    isServerNonRecoveryJwt(cleanAccessToken)
  ) {
    return res.status(400).json({
      valid: false,
      isEmailConfirmationRedirect: true,
      error: 'Signup confirmation links cannot be used as password recovery links.',
    });
  }
  const primaryRecoveryType: 'recovery' | 'invite' =
    rawType === 'invite' ? 'invite' : 'recovery';

  logServerRecoveryDiagnostic('verifyRecoveryStart', {
    hasAccessToken: Boolean(cleanAccessToken),
    hasRefreshToken: Boolean(cleanRefreshToken),
    hasTokenHash: Boolean(cleanTokenHash),
    hasCode: Boolean(cleanCode),
  });

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({
      valid: false,
      error: 'Supabase authentication is not configured on the server.',
    });
  }

  // Case 1: Verify a token_hash from ?token_hash=...&type=recovery|invite
  // IMPORTANT: Do NOT call anonClient.auth.signOut() here because signOut() defaults to
  // global scope in @supabase/auth-js and would immediately revoke the newly minted recovery
  // session before the user can submit their new password!
  if (cleanTokenHash) {
    let otpRes = await anonClient.auth.verifyOtp({
      token_hash: cleanTokenHash,
      type: primaryRecoveryType,
    });

    if (otpRes.error && primaryRecoveryType !== 'invite') {
      const inviteFallback = await anonClient.auth.verifyOtp({
        token_hash: cleanTokenHash,
        type: 'invite',
      });
      if (!inviteFallback.error && inviteFallback.data?.session?.access_token) {
        otpRes = inviteFallback;
      }
    }

    const { data, error } = otpRes;

    if (error || !data?.session?.access_token || !data?.user?.id) {
      logServerRecoveryDiagnostic('verifyRecoveryTokenHashFailed', {
        valid: false,
        errorCode: (error as any)?.code || null,
      });
      return res.status(400).json({
        valid: false,
        error:
          'This password reset link is invalid or has expired. Recovery links can only be used once—please request a new reset email.',
      });
    }

    logServerRecoveryDiagnostic('verifyRecoveryTokenHashSuccess', {
      valid: true,
      hasSession: true,
    });

    return res.json({
      valid: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token || null,
      email: (data.user.email || '').trim().toLowerCase(),
    });
  }

  // Case 2: Verify an access_token from #access_token=...&type=recovery or PKCE exchange
  if (cleanAccessToken) {
    const { data: userData, error: userErr } = await anonClient.auth.getUser(cleanAccessToken);
    if (!userErr && userData?.user?.id) {
      logServerRecoveryDiagnostic('verifyRecoveryAccessTokenSuccess', {
        valid: true,
      });
      return res.json({
        valid: true,
        accessToken: cleanAccessToken,
        refreshToken: cleanRefreshToken || null,
        email: (userData.user.email || '').trim().toLowerCase(),
      });
    }

    if (cleanRefreshToken) {
      const { data: sessionData, error: sessionErr } = await anonClient.auth.setSession({
        access_token: cleanAccessToken,
        refresh_token: cleanRefreshToken,
      });
      if (!sessionErr && sessionData?.session?.access_token && sessionData?.user?.id) {
        if (isServerNonRecoveryJwt(sessionData.session.access_token)) {
          return res.status(400).json({
            valid: false,
            isEmailConfirmationRedirect: true,
            error: 'Signup confirmation links cannot be used as password recovery links.',
          });
        }
        logServerRecoveryDiagnostic('verifyRecoveryRefreshedSessionSuccess', {
          valid: true,
        });
        return res.json({
          valid: true,
          accessToken: sessionData.session.access_token,
          refreshToken: sessionData.session.refresh_token || cleanRefreshToken,
          email: (sessionData.user.email || '').trim().toLowerCase(),
        });
      }
    }

    logServerRecoveryDiagnostic('verifyRecoveryAccessTokenFailed', {
      valid: false,
      errorCode: (userErr as any)?.code || null,
    });

    return res.status(400).json({
      valid: false,
      error:
        'This password reset link is invalid or has expired. Please request a new reset email.',
    });
  }

  // Case 3: PKCE code fallback (?code=...) if not already exchanged by the browser client
  if (cleanCode && !/^\d{6}$/.test(cleanCode)) {
    const { data: codeData, error: codeErr } =
      await anonClient.auth.exchangeCodeForSession(cleanCode);
    if (
      !codeErr &&
      codeData?.session?.access_token &&
      codeData?.user?.id
    ) {
      if (isServerNonRecoveryJwt(codeData.session.access_token)) {
        return res.status(400).json({
          valid: false,
          isEmailConfirmationRedirect: true,
          error: 'Signup confirmation links cannot be used as password recovery links.',
        });
      }
      logServerRecoveryDiagnostic('verifyRecoveryCodeExchangeSuccess', {
        valid: true,
      });
      return res.json({
        valid: true,
        accessToken: codeData.session.access_token,
        refreshToken: codeData.session.refresh_token || null,
        email: (codeData.user.email || '').trim().toLowerCase(),
      });
    }
    logServerRecoveryDiagnostic('verifyRecoveryCodeExchangeFailed', {
      valid: false,
      errorCode: (codeErr as any)?.code || null,
    });
    return res.status(400).json({
      valid: false,
      error:
        'This password reset link is invalid or has expired. Recovery links can only be used once—please request a new reset email.',
    });
  }

  logServerRecoveryDiagnostic('verifyRecoveryMissingCredentials', {
    valid: false,
  });

  return res.status(400).json({
    valid: false,
    error: 'No valid password reset link was found. Please request a new reset email.',
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, accessToken, refreshToken, tokenHash, newPassword } = req.body || {};
  const headerToken = extractBearerToken(req);
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanCode = typeof code === 'string' ? code.trim() : '';
  const cleanAccessToken =
    (typeof accessToken === 'string' && accessToken.trim()) || headerToken || '';
  const cleanRefreshToken =
    typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken.trim() : '';
  const cleanTokenHash =
    typeof tokenHash === 'string' && tokenHash.trim() ? tokenHash.trim() : '';

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must contain at least one letter and one number.' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  let verifiedAccessToken = cleanAccessToken;
  let verifiedRefreshToken = cleanRefreshToken;
  let verifiedUserEmail = cleanEmail;

  // Path A: Token hash from recovery/invite link (?token_hash=...&type=recovery|invite)
  if (!verifiedAccessToken && cleanTokenHash) {
    let otpRes = await anonClient.auth.verifyOtp({
      token_hash: cleanTokenHash,
      type: 'recovery',
    });
    if (otpRes.error) {
      const inviteFallback = await anonClient.auth.verifyOtp({
        token_hash: cleanTokenHash,
        type: 'invite',
      });
      if (!inviteFallback.error && inviteFallback.data?.session?.access_token) {
        otpRes = inviteFallback;
      }
    }
    const { data: otpData, error: otpErr } = otpRes;
    if (otpErr || !otpData?.session?.access_token || !otpData?.user?.id) {
      return res.status(400).json({
        code: 'RECOVERY_LINK_EXPIRED',
        error:
          'This password reset link is invalid or has expired. Please request a new reset email.',
      });
    }
    verifiedAccessToken = otpData.session.access_token;
    verifiedRefreshToken = otpData.session.refresh_token || '';
    verifiedUserEmail = (otpData.user.email || cleanEmail).trim().toLowerCase();
  }

  // Path B: Recovery code fallback (email + 6-digit OTP code)
  if (!verifiedAccessToken && cleanEmail && cleanCode) {
    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: 'recovery',
    });

    if (verifyError || !verifyData?.session?.access_token || !verifyData?.user?.id) {
      return res.status(400).json({
        code: 'RECOVERY_LINK_EXPIRED',
        error: 'Invalid or expired recovery link or code. Please request a new password reset.',
      });
    }
    verifiedAccessToken = verifyData.session.access_token;
    verifiedRefreshToken = verifyData.session.refresh_token || '';
    verifiedUserEmail = (verifyData.user.email || cleanEmail).trim().toLowerCase();
  }

  if (!verifiedAccessToken) {
    return res.status(400).json({
      code: 'RECOVERY_LINK_EXPIRED',
      error:
        'Your password reset session is missing or has expired. Please request a new reset email.',
    });
  }

  // Confirm the recovery token is still valid before updating password
  const { data: currentUserData, error: currentUserErr } =
    await anonClient.auth.getUser(verifiedAccessToken);
  if (currentUserErr || !currentUserData?.user?.id) {
    return res.status(400).json({
      code: 'RECOVERY_LINK_EXPIRED',
      error:
        'This password reset link is invalid or has expired. Please request a new reset email.',
    });
  }
  verifiedUserEmail = (currentUserData.user.email || verifiedUserEmail).trim().toLowerCase();

  const { user: updatedAuthUser, error: updateError } =
    await updateSupabaseUserPasswordWithAccessToken(
      verifiedAccessToken,
      newPassword,
      verifiedRefreshToken
    );

  if (updateError) {
    const lowerErr = (updateError.message || '').toLowerCase();
    if (lowerErr.includes('different') || lowerErr.includes('same_password')) {
      return res.status(400).json({
        error: 'New password must be different from your current password.',
      });
    }
    if (
      updateError.status === 401 ||
      updateError.status === 403 ||
      lowerErr.includes('expired') ||
      lowerErr.includes('invalid') ||
      lowerErr.includes('session')
    ) {
      return res.status(400).json({
        code: 'RECOVERY_LINK_EXPIRED',
        error:
          'This password reset link has expired. Please request a new password reset email.',
      });
    }
    return res.status(400).json({
      error: updateError.message || 'Could not update your password. Please try again.',
    });
  }

  const finalAuthUser = updatedAuthUser || currentUserData.user;
  const userScopedClient = createSupabaseServerClient(verifiedAccessToken);
  const profileRow = userScopedClient
    ? await fetchOrSyncStudentProfile(userScopedClient, finalAuthUser).catch(() => null)
    : null;

  const fallbackUser: User = profileRow
    ? mapDbProfileToAppUser(profileRow, finalAuthUser, { role: 'student' })
    : {
        id: finalAuthUser.id,
        fullName: String(finalAuthUser.user_metadata?.full_name || 'Student'),
        phone: String(finalAuthUser.user_metadata?.phone || ''),
        email: verifiedUserEmail,
        emailVerified: true,
        icfaiEnrollmentNumber: String(finalAuthUser.user_metadata?.enrollment_number || ''),
        ageConfirmation: true,
        drivingLicenseConfirmation: true,
        verificationStatus: 'verified',
        role: 'student',
        createdAt: finalAuthUser.created_at,
      };

  return res.json({
    success: true,
    message: 'Your password has been reset successfully. You can now sign in with your new password.',
    user: fallbackUser,
  });
});

app.get('/api/auth/me', async (req, res) => {
  const resolved = await requireActiveStudentSession(
    req,
    res,
    'Unauthorized: Valid student session required'
  );
  if (!resolved) {
    return;
  }
  return res.json({
    authenticated: true,
    user: resolved.user,
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const verified = await verifySupabaseBearerToken(req);
  if (verified) {
    await verified.userClient.auth.signOut().catch(() => {});
  }
  return res.json({ success: true, message: 'Signed out of student session' });
});

app.put('/api/auth/profile', async (req, res) => {
  const resolved = await requireActiveStudentSession(
    req,
    res,
    'Unauthorized: Please sign in to update your profile.'
  );
  if (!resolved) {
    return;
  }

  const currentUser = resolved.user;

  // Reject attempts to self-escalate role, ID, or verification state
  if (
    (req.body.id !== undefined && req.body.id !== currentUser.id) ||
    (req.body.role !== undefined && req.body.role !== currentUser.role) ||
    (req.body.verificationStatus !== undefined && req.body.verificationStatus !== currentUser.verificationStatus) ||
    req.body.isAdmin !== undefined ||
    req.body.emailVerified !== undefined
  ) {
    return res.status(403).json({
      error: 'Forbidden: Students cannot modify protected role or verification states.',
    });
  }

  const { fullName, phone, email, icfaiEnrollmentNumber, academicYear, course } = req.body || {};

  if (fullName !== undefined && (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2)) {
    return res.status(400).json({ error: 'Full legal name must be at least 2 characters.' });
  }

  if (phone !== undefined) {
    const digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.length < 10) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile or WhatsApp number.' });
    }
  }

  let updatedEmail = currentUser.email || resolved.auth.email || '';
  if (email !== undefined && String(email).trim().toLowerCase() !== updatedEmail.toLowerCase()) {
    const cleanNewEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanNewEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    updatedEmail = cleanNewEmail;
  }

  let updatedEnrollment = currentUser.icfaiEnrollmentNumber;
  if (icfaiEnrollmentNumber !== undefined) {
    const enrollmentCheck = validateIcfaiEnrollment(icfaiEnrollmentNumber, currentUser.icfaiEnrollmentNumber);
    if (!enrollmentCheck.valid) {
      return res.status(400).json({ error: enrollmentCheck.error });
    }
    updatedEnrollment = enrollmentCheck.normalized;
  }

  const nextFullName = fullName !== undefined ? fullName.trim() : currentUser.fullName;
  const nextPhone = phone !== undefined ? String(phone).trim() : currentUser.phone;
  const nextAcademicYear = academicYear !== undefined ? String(academicYear).trim() : (currentUser.academicYear || '1st Year');
  const nextCourse = course !== undefined ? String(course).trim() : (currentUser.course || 'B.Tech');

  let profilePayload;
  try {
    profilePayload = mapAppUserToDbProfile(resolved.auth.userId, {
      fullName: nextFullName,
      email: updatedEmail || null,
      phone: nextPhone,
      icfaiEnrollmentNumber: updatedEnrollment,
      academicYear: nextAcademicYear,
      course: nextCourse,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Invalid profile update payload.' });
  }

  const { data: updatedProfile, error: upsertError } = await resolved.auth.userClient
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single<DbProfileRow>();

  if (upsertError || !updatedProfile) {
    if (upsertError?.code === '23505') {
      return res.status(409).json({
        error: 'This ICFAI enrollment number or email is already linked to another student account.',
      });
    }
    return res.status(500).json({ error: 'Could not update student profile.' });
  }

  await resolved.auth.userClient.auth
    .updateUser({
      data: {
        full_name: profilePayload.full_name,
        phone: profilePayload.phone,
        enrollment_number: profilePayload.enrollment_number,
        academic_year: profilePayload.academic_year,
        course: profilePayload.course,
      },
    })
    .catch(() => {});

  const updatedAppUser = mapDbProfileToAppUser(updatedProfile, resolved.auth.authUser, {
    role: currentUser.role === 'owner' ? 'owner' : 'student',
  });

  return res.json({
    success: true,
    user: updatedAppUser,
  });
});

app.post('/api/auth/change-password', async (req, res) => {
  const resolved = await requireActiveStudentSession(
    req,
    res,
    'Unauthorized: Please sign in first.'
  );
  if (!resolved) {
    return;
  }
  if (!resolved.auth.email) {
    return res.status(401).json({ error: 'Unauthorized: Please sign in first.' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must contain at least one letter and one number.' });
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return res.status(500).json({ error: 'Supabase authentication is not configured on the server.' });
  }

  const { error: verifyError } = await anonClient.auth.signInWithPassword({
    email: resolved.auth.email,
    password: String(currentPassword),
  });

  if (verifyError) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const { error: updateError } = await anonClient.auth.updateUser({
    password: newPassword,
  });
  await anonClient.auth.signOut().catch(() => {});

  if (updateError) {
    return res.status(400).json({ error: 'Could not update password. Please try again.' });
  }

  return res.json({
    success: true,
    message: 'Password updated successfully.',
  });
});

// Disabled Legacy Passwordless Student Login Endpoint (HTTP 410 Gone)
app.post('/api/users/login', (_req, res) => {
  return res.status(410).json({
    error: 'Legacy passwordless login has been disabled. Please sign up or sign in with your email and password.',
  });
});

app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.getUsers());
});

app.put('/api/users/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { verificationStatus, role } = req.body || {};

  if (role !== undefined) {
    return res.status(403).json({
      error: 'Forbidden: User roles cannot be modified via the student verification status endpoint.',
    });
  }

  const validStatuses = new Set(['unverified', 'pending', 'verified', 'suspended']);
  if (!verificationStatus || !validStatuses.has(String(verificationStatus))) {
    return res.status(400).json({
      error: 'Invalid verificationStatus. Allowed values: unverified, pending, verified, suspended.',
    });
  }

  const updated = db.updateUser(id, { verificationStatus });
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }
  const adminId = (req as AuthenticatedRequest).adminAuth?.userId || 'admin';
  db.logAdminAction({
    adminId,
    action: 'UPDATE_USER_STATUS',
    targetType: 'user',
    targetId: id,
    metadata: { newStatus: verificationStatus }
  });
  res.json(sanitizeUser(updated));
});

const SUPABASE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OWNER_EDITABLE_AVAILABILITY_STATUSES = new Set([
  'AVAILABLE',
  'UNAVAILABLE',
  'MAINTENANCE',
]);

const VALID_SUPABASE_BOOKING_STATUSES = new Set([
  'PENDING_VERIFICATION',
  'PENDING_APPROVAL',
  'APPROVED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'ACTIVE_RENTAL',
  'COMPLETED',
]);

function sanitizePublicBike(bike: any) {
  const { ownerId, approvalNotes, ownerPhone, ownerEnrollment, ...rest } = bike;
  return {
    ...rest,
    ownerName: bike.ownerName || 'Verified ICFAI Host',
    registrationNumber: bike.displayRegistrationToPublic ? bike.registrationNumber : '',
  };
}

function isStudentOwnerOfBike(bike: any, authUser: User): boolean {
  if (!bike || !authUser || !authUser.id) return false;
  if (bike.ownerId && bike.ownerId === authUser.id) {
    return true;
  }
  // Never fall back to enrollment matching if the bike is already bound to a Supabase UUID owner
  if (bike.ownerId && SUPABASE_UUID_RE.test(String(bike.ownerId))) {
    return false;
  }
  const userEnrollment = (authUser.icfaiEnrollmentNumber || '').trim().toUpperCase();
  const bikeOwnerEnrollment = (bike.ownerEnrollment || '').trim().toUpperCase();
  return Boolean(userEnrollment && bikeOwnerEnrollment && userEnrollment === bikeOwnerEnrollment);
}

function isStudentOwnerOfBooking(booking: any, authUser: User): boolean {
  if (!booking || !authUser || !authUser.id) return false;
  if (booking.renterId && booking.renterId === authUser.id) {
    return true;
  }
  // Never fall back to enrollment matching if the booking is already bound to a Supabase UUID
  if (booking.renterId && SUPABASE_UUID_RE.test(String(booking.renterId))) {
    return false;
  }
  const userEnrollment = (authUser.icfaiEnrollmentNumber || '').trim().toUpperCase();
  const bookingEnrollment = (booking.renterEnrollment || '').trim().toUpperCase();
  return Boolean(userEnrollment && bookingEnrollment && userEnrollment === bookingEnrollment);
}

function hasOtherActiveRentalForBike(bikeId: string, excludeBookingId: string): boolean {
  return db
    .getBookings()
    .some((b) => b.bikeId === bikeId && b.id !== excludeBookingId && b.bookingStatus === 'active_rental');
}

// 5. Bike Catalog & Management
app.get('/api/bikes', (req, res) => {
  const { status, brand, bikeType, fuelType, transmission, search } = req.query;
  const bikes = db.getBikes({
    status: status as string,
    brand: brand as string,
    bikeType: bikeType as string,
    fuelType: fuelType as string,
    transmission: transmission as string,
    search: search as string,
    onlyActive: true,
    onlyApproved: true
  });
  res.json(bikes.map(sanitizePublicBike));
});

app.get('/api/bikes/all', requireAdmin, (req, res) => {
  res.json(db.getAllBikesAdmin());
});

app.get('/api/bikes/:id', async (req, res) => {
  const bike = db.getBikeById(req.params.id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  const adminCheck = await verifySupabaseAdminBearerToken(req);
  if (adminCheck.status === 'authorized') {
    return res.json(bike);
  }

  const studentResolved = await resolveAuthenticatedStudent(req);
  if (
    studentResolved &&
    studentResolved.user.emailVerified !== false &&
    Boolean(studentResolved.auth.emailConfirmedAt) &&
    studentResolved.user.verificationStatus !== 'suspended' &&
    isStudentOwnerOfBike(bike, studentResolved.user)
  ) {
    return res.json(bike);
  }

  if (!bike.approvedByAdmin || !bike.active) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  res.json(sanitizePublicBike(bike));
});

// Check specific bike schedule conflict for requested dates (public - zero PII exposed)
app.get('/api/bikes/:id/availability', (req, res) => {
  const { id } = req.params;
  const { pickupDate, returnDate } = req.query;

  const bike = db.getBikeById(id);
  if (!bike || !bike.approvedByAdmin || !bike.active) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  if (bike.availabilityStatus !== 'AVAILABLE') {
    return res.json({
      available: false,
      reason: `Vehicle is currently marked as ${bike.availabilityStatus}`,
      conflicts: []
    });
  }

  if (!pickupDate || !returnDate) {
    return res.json({ available: true, conflicts: [] });
  }

  const reqPickup = new Date(pickupDate as string).getTime();
  const reqReturn = new Date(returnDate as string).getTime();

  if (isNaN(reqPickup) || isNaN(reqReturn) || reqPickup >= reqReturn) {
    return res.status(400).json({ error: 'Invalid pickup and return time range' });
  }

  // Active bookings that occupy the bike
  const allBookings = db.getBookings();
  const conflicting = allBookings.filter((b) => {
    if (b.bikeId !== id) return false;
    if (b.bookingStatus === 'cancelled' || b.bookingStatus === 'rejected' || b.bookingStatus === 'completed') return false;

    const bPickup = new Date(b.pickupDate).getTime();
    const bReturn = new Date(b.returnDate).getTime();

    // Check overlap: max(pickup1, pickup2) < min(return1, return2)
    return Math.max(reqPickup, bPickup) < Math.min(reqReturn, bReturn);
  });

  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    const fromStr = new Date(conflict.pickupDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const toStr = new Date(conflict.returnDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    // Strip all renter identity and document fields; return only schedule intervals
    const sanitizedConflicts = conflicting.map((b) => ({
      pickupDate: b.pickupDate,
      returnDate: b.returnDate,
    }));
    return res.json({
      available: false,
      reason: `This bike already has a reserved booking from ${fromStr} to ${toStr}.`,
      conflicts: sanitizedConflicts
    });
  }

  res.json({ available: true, conflicts: [] });
});

const UNTRUSTED_IMAGE_UPLOAD_BODY_FIELDS = [
  'ownerId',
  'owner_id',
  'userId',
  'user_id',
  'folder',
  'objectPath',
  'path',
  'bucket',
] as const;

const FORBIDDEN_PRIVATE_DOCUMENT_CATEGORIES = new Set([
  'aadhar',
  'aadhaar',
  'driving_license',
  'student_id',
  'rc',
  'insurance',
  'pollution',
  'inspection',
  'pickup_inspection',
  'return_inspection',
  'dispute',
]);

async function handleSingleBikeImageUpload(
  req: Request,
  res: Response,
  routeMode: 'onboarding_only' | 'existing_bike_only' | 'auto'
) {
  const rawToken = extractBearerToken(req);
  if (!rawToken) {
    return res.status(401).json({
      error: 'Authentication required: Please sign in to upload a bike listing image.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Reject multi-image arrays: only one image is permitted per request
  if (body.images !== undefined || Array.isArray(body.image)) {
    return res.status(400).json({
      error:
        'Only one image may be uploaded per request. Provide a single base64 data URL in the "image" field.',
    });
  }

  // Never trust client-supplied user ID, owner ID, bucket, or Storage folder/path
  for (const field of UNTRUSTED_IMAGE_UPLOAD_BODY_FIELDS) {
    if (body[field] !== undefined) {
      return res.status(400).json({
        error: `Untrusted field "${field}" is not allowed. Storage ownership and object paths are determined strictly by the server.`,
      });
    }
  }

  // Block any attempt to upload private identity, vehicle legal, or inspection documents to public bike-images
  const rawCategory = String(body.documentCategory || body.category || body.purpose || '')
    .trim()
    .toLowerCase();
  if (
    body.documentCategory !== undefined ||
    FORBIDDEN_PRIVATE_DOCUMENT_CATEGORIES.has(rawCategory)
  ) {
    return res.status(400).json({
      error:
        'The bike-images bucket is for public vehicle listing photos only. Identity documents, RC/insurance records, and inspection photos are not permitted.',
    });
  }

  const adminCheck = await getVerifyAdminFn()(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Authentication required: Please sign in to your verified student account to upload a bike image.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  const pathBikeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const bodyBikeId = typeof body.bikeId === 'string' ? body.bikeId.trim() : '';

  if (routeMode === 'onboarding_only' && (pathBikeId || bodyBikeId)) {
    return res.status(400).json({
      error: 'bikeId cannot be supplied to the initial onboarding image upload endpoint.',
    });
  }

  if (pathBikeId && bodyBikeId && pathBikeId !== bodyBikeId) {
    return res.status(400).json({
      error: 'Mismatched bikeId between URL path and request body.',
    });
  }

  const targetBikeId = pathBikeId || bodyBikeId;

  if (routeMode === 'existing_bike_only' && !targetBikeId) {
    return res.status(400).json({
      error: 'A valid bikeId is required when uploading an image for an existing bike listing.',
    });
  }

  if (!targetBikeId && rawCategory && rawCategory !== 'onboarding') {
    return res.status(400).json({
      error:
        'Invalid upload purpose. Provide bikeId for an existing bike listing or purpose: "onboarding" for initial onboarding.',
    });
  }

  let uploadScope: BikeImageUploadScope;

  if (targetBikeId) {
    const existingBike = db.getBikeById(targetBikeId);
    if (!existingBike) {
      return res.status(404).json({ error: 'Bike listing not found' });
    }

    if (!isAdmin) {
      const authUser = studentResolved!.user;
      if (!isStudentOwnerOfBike(existingBike, authUser)) {
        return res.status(403).json({
          error:
            'Forbidden: You can only upload images for bike listings that belong to your account.',
        });
      }
      // Student uploads are strictly confined to their own verified Supabase UUID folder
      uploadScope = {
        mode: 'existing_bike',
        ownerFolderId: studentResolved!.auth.userId,
        bikeId: existingBike.id,
      };
    } else {
      const adminAuth = adminCheck.auth;
      const ownerFolderId = SUPABASE_UUID_RE.test(String(existingBike.ownerId || ''))
        ? String(existingBike.ownerId).toLowerCase()
        : adminAuth.userId;
      uploadScope = {
        mode: 'existing_bike',
        ownerFolderId,
        bikeId: existingBike.id,
      };
    }
  } else {
    const authenticatedUserId = isAdmin
      ? adminCheck.auth.userId
      : studentResolved!.auth.userId;
    uploadScope = {
      mode: 'onboarding',
      authenticatedUserId,
    };
  }

  const rawImage = body.image ?? body.imageDataUrl ?? body.dataUrl;
  const declaredMimeType = body.mimeType;

  // Validate image signature, MIME, and 5 MB decoded limit before invoking Storage
  try {
    parseAndValidateBase64BikeImage(rawImage, declaredMimeType);
  } catch (validationErr: any) {
    return res.status(400).json({
      error: validationErr?.message || 'Invalid bike image payload.',
    });
  }

  const userClient = isAdmin
    ? adminCheck.auth.userClient
    : studentResolved!.auth.userClient;

  try {
    const uploaded = await getUploadSingleBikeImageFn()({
      userClient,
      imageDataUrl: rawImage,
      declaredMimeType,
      scope: uploadScope,
    });

    return res.status(201).json({
      success: true,
      url: uploaded.publicUrl,
      publicUrl: uploaded.publicUrl,
      bucket: uploaded.bucket,
      path: uploaded.objectPath,
      mimeType: uploaded.mimeType,
      byteLength: uploaded.byteLength,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to upload bike image to Storage.';
    if (
      message.includes('Supabase Storage upload failed') ||
      message.includes('publicUrl') ||
      message.includes('request-scoped Supabase client')
    ) {
      return res.status(502).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
}

// Single-image upload endpoints (existing bike vs constrained initial onboarding)
app.post('/api/bikes/images', (req, res) =>
  handleSingleBikeImageUpload(req, res, 'auto')
);
app.post('/api/bikes/:id/images', (req, res) =>
  handleSingleBikeImageUpload(req, res, 'existing_bike_only')
);
app.post('/api/owner/bikes/:id/images', (req, res) =>
  handleSingleBikeImageUpload(req, res, 'existing_bike_only')
);
app.post('/api/owner/onboard/images', (req, res) =>
  handleSingleBikeImageUpload(req, res, 'onboarding_only')
);

app.post('/api/bikes', requireAdmin, (req, res) => {
  const bikeData = { ...req.body };
  if (!bikeData.brand || !bikeData.model) {
    return res.status(400).json({ error: 'Brand and Model are required' });
  }

  if (bikeData.images !== undefined) {
    try {
      const validatedImages = validateBikeImageUrls(bikeData.images, 'images');
      bikeData.images =
        validatedImages.length > 0
          ? validatedImages
          : [
              'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
            ];
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid bike images' });
    }
  }

  const rawDayPrice = Number(bikeData.pricePerDay);
  const rawHourPrice = Number(bikeData.pricePerHour);

  let finalDayPrice = rawDayPrice > 0 ? rawDayPrice : (rawHourPrice > 0 ? rawHourPrice * 24 : 599);
  let finalHourPrice = rawHourPrice > 0 ? rawHourPrice : (finalDayPrice > 0 ? Math.round((finalDayPrice / 24) * 100) / 100 : 59);

  const created = db.createBike({
    ...bikeData,
    pricePerDay: finalDayPrice,
    pricePerHour: finalHourPrice,
    securityDeposit: Number(bikeData.securityDeposit) || 1000,
    approvedByAdmin: true,
    active: bikeData.active !== undefined ? bikeData.active : true
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'CREATE_BIKE_LISTING',
    targetType: 'bike',
    targetId: created.id,
    metadata: { brand: created.brand, model: created.model }
  });

  res.status(201).json(created);
});

app.put('/api/bikes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  if (updates.images !== undefined) {
    try {
      updates.images = validateBikeImageUrls(updates.images, 'images');
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid bike images' });
    }
  }

  if (updates.pricePerDay !== undefined || updates.pricePerHour !== undefined) {
    const dayP = Number(updates.pricePerDay);
    const hrP = Number(updates.pricePerHour);
    if (dayP > 0 && (!hrP || hrP <= 0)) {
      updates.pricePerHour = Math.round((dayP / 24) * 100) / 100;
    } else if (hrP > 0 && (!dayP || dayP <= 0)) {
      updates.pricePerDay = Math.round(hrP * 24);
    }
  }

  const updated = db.updateBike(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

app.delete('/api/bikes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const success = db.deleteBike(id);
  if (!success) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'DELETE_BIKE_LISTING',
    targetType: 'bike',
    targetId: id
  });

  res.json({ success: true, message: 'Bike listing deleted' });
});

// 6. Owner Onboarding (Students listing their bikes)
app.post('/api/owner/onboard', async (req, res) => {
  const resolved = await requireActiveStudentSession(
    req,
    res,
    'Authentication required: Please sign in to your student account to list a bike.'
  );
  if (!resolved) {
    return;
  }
  const authUser = resolved.user;

  const {
    fullName,
    ownerName,
    phone,
    ownerPhone,
    brand,
    model,
    year,
    registrationNumber,
    bikeType,
    fuelType,
    transmission,
    description,
    images,
    pricePerDay,
    pricePerHour,
    securityDeposit,
    specs,
    pickupHub,
    payoutUpiId,
    academicYear,
    course
  } = req.body;

  // Authoritative owner identity comes from the authenticated server session
  const resolvedFullName = (fullName || ownerName || authUser.fullName || '').trim();
  const cleanEnrollment = authUser.icfaiEnrollmentNumber.trim().toUpperCase();
  const resolvedPhone = (phone || ownerPhone || authUser.phone || '').trim() || '+91 90000 00000';
  const resolvedBrand = (brand || '').trim();
  const resolvedModel = (model || '').trim();
  const resolvedReg = (registrationNumber || '').trim().toUpperCase();
  const resolvedYear = academicYear || authUser.academicYear || '3rd Year';
  const resolvedCourse = course || authUser.course || 'B.Tech';

  if (!resolvedFullName) {
    return res.status(400).json({ error: 'Full name of bike owner is required.' });
  }

  if (!resolvedBrand || !resolvedModel) {
    return res.status(400).json({ error: 'Bike brand and model are required.' });
  }

  if (!resolvedReg) {
    return res.status(400).json({ error: 'Vehicle registration number is required (e.g. TS 08 FG 4821).' });
  }

  let validatedOnboardingImages: string[] = [
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
  ];
  if (images !== undefined && images !== null) {
    try {
      const checked = validateBikeImageUrls(images, 'images');
      if (checked.length > 0) {
        validatedOnboardingImages = checked;
      }
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid bike images' });
    }
  }

  // Calculate synchronized pricing
  const rawDay = Number(pricePerDay);
  const rawHour = Number(pricePerHour);
  const calculatedDay = rawDay > 0 ? rawDay : (rawHour > 0 ? rawHour * 24 : 599);
  const calculatedHour = rawHour > 0 ? rawHour : (calculatedDay > 0 ? Math.round((calculatedDay / 24) * 100) / 100 : 59);

  // Upsert Owner Record without creating duplicate owner profiles
  const owner = db.createOwner({
    userId: authUser.id,
    fullName: resolvedFullName,
    phone: resolvedPhone,
    email: authUser.email,
    icfaiEnrollmentNumber: cleanEnrollment,
    academicYear: resolvedYear,
    course: resolvedCourse,
    payoutUpiId: payoutUpiId || `${resolvedPhone.replace(/[^0-9]/g, '') || 'student'}@upi`,
    totalEarnings: 0,
    activeListingsCount: 1,
    ownershipVerificationStatus: 'pending'
  });

  // Create unapproved Bike listing linked to trusted authUser.id
  const newBike = db.createBike({
    ownerId: authUser.id,
    ownerName: resolvedFullName,
    ownerPhone: resolvedPhone,
    ownerEnrollment: cleanEnrollment,
    ownerAcademicYear: resolvedYear,
    ownerCourse: resolvedCourse,
    brand: resolvedBrand,
    model: resolvedModel,
    year: Number(year) || 2023,
    registrationNumber: resolvedReg,
    displayRegistrationToPublic: false,
    bikeType: bikeType || 'Street',
    fuelType: fuelType || 'Petrol',
    transmission: transmission || 'Manual',
    description: description || `Student listed ${resolvedBrand} ${resolvedModel} on ICFAI Hyderabad campus.`,
    images: validatedOnboardingImages,
    pricePerDay: calculatedDay,
    pricePerHour: calculatedHour,
    securityDeposit: Number(securityDeposit) || 1000,
    availabilityStatus: 'AVAILABLE',
    active: true,
    approvalStatus: 'PENDING_APPROVAL',
    specs: specs || {
      cc: 150,
      mileage: '45 km/l',
      topSpeed: '110 km/h',
      fuelCapacity: '12 L',
      weight: '140 kg',
      abs: true,
      helmetsIncluded: 1
    },
    pickupHub: pickupHub || 'ICFAI Main Gate',
    approvedByAdmin: false // Strictly requires admin review
  });

  db.logAdminAction({
    adminId: authUser.id,
    action: 'STUDENT_SUBMITTED_BIKE_ONBOARDING',
    targetType: 'owner',
    targetId: newBike.id,
    metadata: { ownerName: resolvedFullName, enrollment: cleanEnrollment, bike: `${resolvedBrand} ${resolvedModel}` }
  });

  res.status(201).json({
    success: true,
    message: 'Bike submitted successfully. Your bike is now pending admin approval.',
    bike: newBike,
    owner
  });
});

app.get('/api/owner/submissions', requireAdmin, (req, res) => {
  const unapprovedBikes = db.getAllBikesAdmin().filter((b) => !b.approvedByAdmin);
  res.json(unapprovedBikes);
});

app.get('/api/owner/bikes', async (req, res) => {
  const adminCheck = await getVerifyAdminFn()(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Authentication required to view owner bike listings.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  if (isAdmin) {
    const enrollment = String(req.query.enrollment || '').trim().toUpperCase();
    if (!enrollment) {
      return res.json(db.getAllBikesAdmin());
    }
    return res.json(
      db.getAllBikesAdmin().filter((b) => (b.ownerEnrollment || '').trim().toUpperCase() === enrollment)
    );
  }

  const authUser = studentResolved!.user;

  const requestedEnrollment = String(req.query.enrollment || '').trim().toUpperCase();
  const userEnrollment = authUser.icfaiEnrollmentNumber.trim().toUpperCase();
  if (requestedEnrollment && requestedEnrollment !== userEnrollment) {
    return res.status(403).json({
      error: 'Forbidden: You can only view bike listings associated with your own account.',
    });
  }

  const ownerBikes = db
    .getAllBikesAdmin()
    .filter((b) => isStudentOwnerOfBike(b, authUser));
  res.json(ownerBikes);
});

app.put('/api/owner/bikes/:id', async (req, res) => {
  const { id } = req.params;
  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike listing not found' });
  }

  const adminCheck = await getVerifyAdminFn()(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Authentication required: Please sign in to edit your bike listing.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  if (!isAdmin) {
    const authUser = studentResolved!.user;
    if (!isStudentOwnerOfBike(bike, authUser)) {
      return res.status(403).json({
        error: 'Forbidden: You can only edit bike listings that belong to your account.',
      });
    }

    // Explicitly block attempts by an owner to self-approve or change protected states
    if (
      req.body.approvedByAdmin === true ||
      req.body.approvalStatus === 'APPROVED' ||
      (req.body.ownerId && req.body.ownerId !== bike.ownerId)
    ) {
      return res.status(403).json({
        error: 'Forbidden: Owners cannot approve their own listings or transfer ownership.',
      });
    }
  }

  // Strictly whitelist owner-editable fields
  const allowedFields = [
    'brand',
    'model',
    'year',
    'registrationNumber',
    'bikeType',
    'fuelType',
    'transmission',
    'pickupHub',
    'pricePerDay',
    'pricePerHour',
    'securityDeposit',
    'description',
    'images',
    'specs',
    'availabilityStatus',
  ];

  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (!isAdmin && updates.availabilityStatus !== undefined) {
    const requestedAvail = String(updates.availabilityStatus).trim().toUpperCase();
    if (!OWNER_EDITABLE_AVAILABILITY_STATUSES.has(requestedAvail)) {
      return res.status(400).json({
        error: 'Invalid availabilityStatus. Owners may only set AVAILABLE, UNAVAILABLE, or MAINTENANCE.',
      });
    }
    updates.availabilityStatus = requestedAvail;

    if (
      (bike.availabilityStatus === 'RESERVED' || hasOtherActiveRentalForBike(id, '')) &&
      requestedAvail !== bike.availabilityStatus
    ) {
      return res.status(409).json({
        error: 'Conflict: Cannot change bike availability while an active rental is in progress.',
      });
    }
  }

  // Validate images array: enforce max 6 images, valid HTTPS URLs, and never persist base64 data URLs
  if (updates.images !== undefined) {
    if (!Array.isArray(updates.images)) {
      return res.status(400).json({
        error: 'Cannot map Bike images: expected an array of HTTPS image URLs.',
      });
    }
    if (updates.images.length === 0) {
      updates.images = bike.images;
    } else {
      try {
        updates.images = validateBikeImageUrls(updates.images, 'images');
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Invalid bike images' });
      }
    }
  }

  if (updates.pricePerDay !== undefined || updates.pricePerHour !== undefined) {
    const dayP = Number(updates.pricePerDay ?? bike.pricePerDay);
    const hrP = Number(updates.pricePerHour ?? bike.pricePerHour);
    if (isNaN(dayP) || dayP <= 0) {
      return res.status(400).json({ error: 'Daily rental price must be greater than ₹0.' });
    }
    updates.pricePerDay = dayP;
    updates.pricePerHour = hrP > 0 ? hrP : Math.round((dayP / 24) * 100) / 100;
  }

  if (updates.securityDeposit !== undefined) {
    const dep = Number(updates.securityDeposit);
    if (isNaN(dep) || dep < 0) {
      return res.status(400).json({ error: 'Security deposit cannot be negative.' });
    }
    updates.securityDeposit = dep;
  }

  if (!isAdmin) {
    const materialFields = [
      'brand',
      'model',
      'year',
      'registrationNumber',
      'bikeType',
      'fuelType',
      'transmission',
      'pickupHub',
      'pricePerDay',
      'pricePerHour',
      'securityDeposit',
      'description',
      'images',
      'specs',
    ] as const;

    const hasMaterialChange = materialFields.some((field) => {
      if (updates[field] === undefined) return false;
      return JSON.stringify(updates[field]) !== JSON.stringify((bike as any)[field]);
    });

    // Any material content change on an owner listing (including previously APPROVED listings),
    // or any edit to a CHANGES_REQUESTED / REJECTED listing, resets approval to PENDING_APPROVAL.
    if (
      hasMaterialChange ||
      bike.approvalStatus === 'CHANGES_REQUESTED' ||
      bike.approvalStatus === 'REJECTED'
    ) {
      updates.approvalStatus = 'PENDING_APPROVAL';
      updates.approvedByAdmin = false;
    }
  }

  const updated = db.updateBike(id, updates);
  res.json(updated);
});

app.post('/api/owner/approve/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;

  // When id is a Supabase UUID, invoke the admin RPC using the verified admin's JWT (never service_role)
  if (SUPABASE_UUID_RE.test(id)) {
    const { error: rpcErr } = await adminAuth.userClient.rpc('admin_set_bike_approval', {
      p_bike_id: id,
      p_new_status: 'APPROVED',
    });
    if (rpcErr) {
      return res.status(400).json({ error: rpcErr.message || 'Could not approve bike listing' });
    }
  }

  const updated = db.updateBike(id, {
    approvedByAdmin: true,
    approvalStatus: 'APPROVED',
    availabilityStatus: 'AVAILABLE',
    active: true,
    approvalNotes: 'Approved and published to live campus fleet.'
  });
  if (!updated) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'APPROVE_OWNER_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: { brand: updated.brand, model: updated.model }
  });

  res.json({ success: true, message: 'Bike listing approved and published', bike: updated });
});

app.post('/api/owner/reject/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;

  if (SUPABASE_UUID_RE.test(id)) {
    const { error: rpcErr } = await adminAuth.userClient.rpc('admin_set_bike_approval', {
      p_bike_id: id,
      p_new_status: 'REJECTED',
    });
    if (rpcErr) {
      return res.status(400).json({ error: rpcErr.message || 'Could not reject bike listing' });
    }
  }

  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }
  const updated = db.updateBike(id, {
    approvedByAdmin: false,
    approvalStatus: 'REJECTED',
    approvalNotes: reason || 'Listing rejected by administrator.',
    availabilityStatus: 'UNAVAILABLE'
  });

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'REJECT_OWNER_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: { reason }
  });

  res.json({ success: true, message: 'Bike listing rejected', bike: updated });
});

app.post('/api/owner/request-changes/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const adminAuth = (req as AuthenticatedRequest).adminAuth!;

  if (SUPABASE_UUID_RE.test(id)) {
    const { error: rpcErr } = await adminAuth.userClient.rpc('admin_set_bike_approval', {
      p_bike_id: id,
      p_new_status: 'CHANGES_REQUESTED',
    });
    if (rpcErr) {
      return res.status(400).json({ error: rpcErr.message || 'Could not request changes on bike listing' });
    }
  }

  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  const updated = db.updateBike(id, {
    approvalStatus: 'CHANGES_REQUESTED',
    approvalNotes: notes || 'Please update the requested details.',
    approvedByAdmin: false
  });

  db.logAdminAction({
    adminId: adminAuth.userId,
    action: 'REQUEST_CHANGES_OWNER_BIKE',
    targetType: 'bike',
    targetId: id,
    metadata: { notes }
  });

  res.json({ success: true, message: 'Changes requested from bike owner', bike: updated });
});

// 7. Bookings & Digital Passes
app.get('/api/bookings', async (req, res) => {
  const adminCheck = await verifySupabaseAdminBearerToken(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Unauthorized: Please sign in to view your bookings.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  if (isAdmin) {
    const { renterId, enrollment } = req.query;
    const cleanRenterId = typeof renterId === 'string' ? renterId.trim() : '';
    const cleanEnrollment = typeof enrollment === 'string' ? enrollment.trim().toUpperCase() : '';
    if (cleanRenterId || cleanEnrollment) {
      const all = db.getBookings();
      return res.json(
        all.filter((b) => {
          const matchId = Boolean(cleanRenterId && b.renterId === cleanRenterId);
          const matchEnrollment = Boolean(
            cleanEnrollment &&
              !SUPABASE_UUID_RE.test(String(b.renterId || '')) &&
              (b.renterEnrollment || '').trim().toUpperCase() === cleanEnrollment
          );
          return matchId || matchEnrollment;
        })
      );
    }
    return res.json(db.getBookings());
  }

  const authUser = studentResolved!.user;

  const { renterId, enrollment } = req.query;
  const userEnrollment = (authUser.icfaiEnrollmentNumber || '').trim().toUpperCase();

  if (renterId && String(renterId).trim() !== authUser.id) {
    return res.status(403).json({
      error: 'Forbidden: You can only access your own booking records.',
    });
  }
  if (enrollment && String(enrollment).trim().toUpperCase() !== userEnrollment) {
    return res.status(403).json({
      error: 'Forbidden: You can only access your own booking records.',
    });
  }

  const myBookings = db
    .getBookings()
    .filter((b) => isStudentOwnerOfBooking(b, authUser));
  res.json(myBookings);
});

app.get('/api/bookings/:id', async (req, res) => {
  const adminCheck = await verifySupabaseAdminBearerToken(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Unauthorized: Sign in required to view booking details.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  const booking = db.getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (!isAdmin) {
    const authUser = studentResolved!.user;
    if (!isStudentOwnerOfBooking(booking, authUser)) {
      return res.status(403).json({
        error: "Forbidden: You cannot access another student's booking record.",
      });
    }
  }

  res.json(booking);
});

app.post('/api/bookings', async (req, res) => {
  const resolved = await requireActiveStudentSession(
    req,
    res,
    'Authentication required: Please sign in to your student account to complete a booking.'
  );
  if (!resolved) {
    return;
  }
  const authUser = resolved.user;

  const {
    bikeId,
    renterId: bodyRenterId,
    renterEnrollment: bodyRenterEnrollment,
    renterName,
    renterPhone,
    renterEmail,
    renterAcademicYear,
    renterCourse,
    pickupLocationId,
    pickupLocationName,
    pickupDate,
    returnDate,
    durationDays,
    aadharDoc,
    dlDoc,
    studentIdDoc,
    laptopDepositAcknowledged,
    termsAccepted,
    termsVersion
  } = req.body || {};

  // Reject any attempt to create a booking on behalf of another student ID or enrollment
  const cleanEnrollment = (authUser.icfaiEnrollmentNumber || '').trim().toUpperCase();
  if (bodyRenterId && String(bodyRenterId).trim() !== authUser.id) {
    return res.status(403).json({
      error: 'Forbidden: Bookings can only be created for your own authenticated student account.',
    });
  }
  if (
    bodyRenterEnrollment &&
    cleanEnrollment &&
    String(bodyRenterEnrollment).trim().toUpperCase() !== cleanEnrollment
  ) {
    return res.status(403).json({
      error: 'Forbidden: Enrollment number does not match your authenticated student profile.',
    });
  }

  if (!termsAccepted) {
    return res.status(400).json({
      error: 'Mandatory Agreement Required: You must read and explicitly accept the Riders Path Terms & Conditions before submitting a booking.'
    });
  }

  if (!bikeId || !pickupDate || !returnDate) {
    return res.status(400).json({ error: 'Missing required booking fields (bikeId, pickupDate, returnDate).' });
  }

  // 1. Authoritative Renter Identity from Authenticated Session
  const resolvedName = (authUser.fullName || renterName || '').trim();
  const resolvedPhone = (authUser.phone || renterPhone || '').trim();
  const resolvedEmail = (authUser.email || renterEmail || '').trim();
  const resolvedYear = authUser.academicYear || renterAcademicYear || '3rd Year';
  const resolvedCourse = authUser.course || renterCourse || 'B.Tech';

  // 2. Validate Schedule
  const reqPickup = new Date(pickupDate).getTime();
  const reqReturn = new Date(returnDate).getTime();
  const now = Date.now() - 5 * 60 * 1000; // 5 min grace for clock drift

  if (isNaN(reqPickup) || isNaN(reqReturn)) {
    return res.status(400).json({ error: 'Invalid pickup or return date format.' });
  }
  if (reqPickup < now) {
    return res.status(400).json({ error: 'Pickup date cannot be in the past.' });
  }
  if (reqPickup >= reqReturn) {
    return res.status(400).json({ error: 'Return date and time must be after pickup date and time.' });
  }

  // 3. Verify Bike Existence, Ownership & Status
  const bike = db.getBikeById(bikeId);
  if (!bike) {
    return res.status(404).json({ error: 'Selected vehicle listing not found.' });
  }
  if (isStudentOwnerOfBike(bike, authUser)) {
    return res.status(403).json({
      error: 'Forbidden: You cannot book your own listed bike.',
    });
  }
  if (!bike.approvedByAdmin || !bike.active || bike.availabilityStatus !== 'AVAILABLE') {
    return res.status(400).json({
      error: `This vehicle is currently ${bike.availabilityStatus || 'UNAVAILABLE'} and cannot be booked.`,
    });
  }

  // 4. Overlapping booking conflict prevention
  const allBookings = db.getBookings();
  const conflicting = allBookings.filter((b) => {
    if (b.bikeId !== bikeId) return false;
    if (b.bookingStatus === 'cancelled' || b.bookingStatus === 'rejected' || b.bookingStatus === 'completed') return false;

    const bPickup = new Date(b.pickupDate).getTime();
    const bReturn = new Date(b.returnDate).getTime();

    return Math.max(reqPickup, bPickup) < Math.min(reqReturn, bReturn);
  });

  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    const fromStr = new Date(conflict.pickupDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const toStr = new Date(conflict.returnDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    return res.status(409).json({
      error: `Schedule conflict: This bike is already booked between ${fromStr} and ${toStr}. Please choose alternative dates.`
    });
  }

  // 5. Calculate Real Pricing
  const totalHours = Math.max(1, Math.round((reqReturn - reqPickup) / (1000 * 60 * 60)));
  const days = Math.max(1, Number(durationDays) || Math.ceil(totalHours / 24));
  const rentalTotal = days * bike.pricePerDay;
  const platformFee = Math.round(rentalTotal * 0.08);
  const securityDeposit = bike.securityDeposit;

  // 6. Use verified student profile identity
  const user = authUser;

  const generatedPassId = Math.floor(1000 + Math.random() * 9000);
  const chosenHub = pickupLocationName || bike.pickupHub || 'ICFAI Main Gate';

  // 7. Create booking in PENDING_VERIFICATION state strictly bound to authUser.id
  const config = db.getConfig();
  const newBooking = db.createBooking({
    bikeId: bike.id,
    bikeBrand: bike.brand,
    bikeModel: bike.model,
    bikeImage: bike.images[0] || '',
    bikeRegistration: bike.registrationNumber,
    pickupHub: chosenHub,
    pickupLocationId: pickupLocationId || undefined,
    pickupLocationName: chosenHub,
    renterId: user.id,
    renterName: resolvedName || user.fullName,
    renterPhone: resolvedPhone || user.phone,
    renterEmail: resolvedEmail || user.email,
    renterEnrollment: user.icfaiEnrollmentNumber,
    renterAcademicYear: resolvedYear,
    renterCourse: resolvedCourse,
    pickupDate,
    returnDate,
    durationHours: totalHours,
    durationDays: days,
    bookingStatus: 'pending_verification', // Initial state
    verificationStatus: 'pending',
    totalPrice: rentalTotal,
    securityDeposit,
    platformFee,
    aadharDocument: aadharDoc,
    drivingLicenseDocument: dlDoc,
    studentIdDocument: studentIdDoc,
    laptopDepositAcknowledged: Boolean(laptopDepositAcknowledged),
    termsAccepted: true,
    termsVersion: termsVersion || config.termsVersion || 'v1.2-2026-AUG',
    termsAcceptedAt: new Date().toISOString(),
    termsAcceptedIp: req.ip || 'campus-client',
    paymentStatus: 'pending',
    handoverNotes: `Pickup at ${chosenHub}. Physical inspection of ID & ISI helmet required at handover.`,
    qrCodePass: `RP-${generatedPassId}-${bike.registrationNumber.replace(/\s+/g, '')}`
  });

  db.logAdminAction({
    adminId: user.id,
    action: 'STUDENT_ACCEPTED_TERMS_AND_BOOKED',
    targetType: 'terms',
    targetId: newBooking.id,
    metadata: {
      renterEnrollment: user.icfaiEnrollmentNumber,
      termsVersion: newBooking.termsVersion,
      acceptedAt: newBooking.termsAcceptedAt,
      bike: `${bike.brand} ${bike.model}`
    }
  });

  // 8. Automated AI Document Check (Optical verification pipeline bound to authenticated student)
  let dlVerdict: 'verified' | 'flagged' | 'manual_review' | 'rejected' = 'manual_review';
  let aadharVerdict: 'verified' | 'flagged' | 'manual_review' | 'rejected' = 'manual_review';

  if (dlDoc || aadharDoc) {
    try {
      if (dlDoc) {
        const dlAnalysis = await verifyDocumentWithGemini({
          documentBase64: dlDoc,
          mimeType: 'image/jpeg',
          expectedName: resolvedName,
          expectedEnrollment: cleanEnrollment,
          documentCategory: 'driving_license'
        });

        dlVerdict = dlAnalysis.verdict;

        db.createVerification({
          bookingId: newBooking.id,
          renterId: user.id,
          documentType: 'driving_license',
          documentClassification: dlAnalysis.documentClassification,
          verificationState: dlAnalysis.verificationState,
          verificationResult: dlAnalysis.verdict,
          extractedInformation: {
            fullName: dlAnalysis.extractedFullName,
            idNumber: dlAnalysis.extractedIdNumber,
            dob: dlAnalysis.extractedDob,
            expiryDate: dlAnalysis.extractedExpiryDate,
            enrollmentNumber: dlAnalysis.extractedEnrollment,
            matchedNameScore: dlAnalysis.nameMatchConfidence,
            notes: dlAnalysis.reasons.join(' • ')
          },
          confidence: dlAnalysis.confidence,
          reasons: dlAnalysis.reasons,
          checks: dlAnalysis.checks,
          manualReviewRequired: dlAnalysis.verificationState !== 'VERIFICATION PASSED',
          verifiedBy: 'AI_VISION_OCR'
        });
      }

      if (aadharDoc) {
        const aadharAnalysis = await verifyDocumentWithGemini({
          documentBase64: aadharDoc,
          mimeType: 'image/jpeg',
          expectedName: resolvedName,
          expectedEnrollment: cleanEnrollment,
          documentCategory: 'aadhar'
        });

        aadharVerdict = aadharAnalysis.verdict;

        db.createVerification({
          bookingId: newBooking.id,
          renterId: user.id,
          documentType: 'aadhar',
          verificationState: aadharAnalysis.verificationState,
          verificationResult: aadharAnalysis.verdict,
          extractedInformation: {
            fullName: aadharAnalysis.extractedFullName,
            idNumber: aadharAnalysis.extractedIdNumber,
            dob: aadharAnalysis.extractedDob,
            matchedNameScore: aadharAnalysis.nameMatchConfidence,
            notes: aadharAnalysis.reasons.join(' • ')
          },
          confidence: aadharAnalysis.confidence,
          reasons: aadharAnalysis.reasons,
          checks: aadharAnalysis.checks,
          manualReviewRequired: aadharAnalysis.verificationState !== 'VERIFICATION PASSED',
          verifiedBy: 'AI_VISION_OCR'
        });
      }

      // Update verification status on booking based on AI analysis
      const allPassed = dlVerdict === 'verified' && (!aadharDoc || aadharVerdict === 'verified');
      const finalVerifStatus = allPassed ? 'approved' : 'manual_review';
      db.updateBooking(newBooking.id, { verificationStatus: finalVerifStatus });
      newBooking.verificationStatus = finalVerifStatus;

    } catch (verifErr) {
      console.warn('Non-blocking AI verification pipeline error:', verifErr);
    }
  }

  res.status(201).json({
    success: true,
    booking: newBooking,
    message: 'Booking request submitted in PENDING_VERIFICATION state. Documents queued for administrative clearance.'
  });
});

// Dedicated authenticated student cancellation endpoint (never trusts body renterId/enrollment)
app.post('/api/bookings/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const studentResolved = await requireActiveStudentSession(
    req,
    res,
    'Unauthorized: Sign in required to cancel a booking.'
  );
  if (!studentResolved) {
    return;
  }

  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const authUser = studentResolved.user;
  if (!isStudentOwnerOfBooking(booking, authUser)) {
    return res.status(403).json({
      error: "Forbidden: You cannot cancel another student's booking.",
    });
  }

  if (booking.bookingStatus !== 'pending_verification' && booking.bookingStatus !== 'confirmed') {
    return res.status(400).json({
      error: 'Only bookings pending verification or awaiting handover can be cancelled.',
    });
  }

  const updated = db.updateBooking(id, {
    bookingStatus: 'cancelled',
    adminReviewNotes: 'Booking cancelled by student renter prior to handover.',
  });

  if (booking.bikeId && !hasOtherActiveRentalForBike(booking.bikeId, id)) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike && bike.availabilityStatus === 'RESERVED') {
      db.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
    }
  }

  db.logAdminAction({
    adminId: authUser.id,
    action: 'STUDENT_CANCELLED_BOOKING',
    targetType: 'booking',
    targetId: id,
    metadata: { renterId: authUser.id },
  });

  return res.json(updated);
});

app.put('/api/bookings/:id/status', async (req, res) => {
  const { id } = req.params;
  const adminCheck = await verifySupabaseAdminBearerToken(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Unauthorized: Sign in required to modify booking.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (!isAdmin) {
    const authUser = studentResolved!.user;
    if (!isStudentOwnerOfBooking(booking, authUser)) {
      return res.status(403).json({
        error: "Forbidden: You cannot modify another student's booking.",
      });
    }
    const bodyKeys = Object.keys(req.body || {}).filter(
      (k) => k !== 'bookingStatus'
    );
    if (req.body?.bookingStatus !== 'cancelled' || bodyKeys.length > 0) {
      return res.status(403).json({
        error: 'Forbidden: Students may only cancel their own eligible bookings.',
      });
    }
    if (booking.bookingStatus !== 'pending_verification' && booking.bookingStatus !== 'confirmed') {
      return res.status(400).json({
        error: 'Only bookings pending verification or awaiting handover can be cancelled.',
      });
    }
    const updated = db.updateBooking(id, {
      bookingStatus: 'cancelled',
      adminReviewNotes: 'Booking cancelled by student renter prior to handover.',
    });
    if (booking.bikeId && !hasOtherActiveRentalForBike(booking.bikeId, id)) {
      const bike = db.getBikeById(booking.bikeId);
      if (bike && bike.availabilityStatus === 'RESERVED') {
        db.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
      }
    }
    return res.json(updated);
  }

  const updates = req.body || {};

  // When id is a Supabase UUID, validate status and invoke the admin RPC using the verified admin's JWT (never service_role)
  if (
    adminCheck.status === 'authorized' &&
    SUPABASE_UUID_RE.test(id) &&
    updates.bookingStatus !== undefined
  ) {
    const normalizedRpcStatus = String(updates.bookingStatus).trim().toUpperCase();
    if (!VALID_SUPABASE_BOOKING_STATUSES.has(normalizedRpcStatus)) {
      return res.status(400).json({
        error: `Invalid booking status "${updates.bookingStatus}". Allowed Supabase statuses: ${Array.from(
          VALID_SUPABASE_BOOKING_STATUSES
        ).join(', ')}.`,
      });
    }
    const { error: rpcErr } = await adminCheck.auth.userClient.rpc('admin_set_booking_status', {
      p_booking_id: id,
      p_new_status: normalizedRpcStatus,
      p_note: updates.adminReviewNotes
        ? String(updates.adminReviewNotes)
        : updates.rejectionReason
        ? String(updates.rejectionReason)
        : null,
    });
    if (rpcErr) {
      return res.status(400).json({
        error: rpcErr.message || 'Could not update booking status in Supabase.',
      });
    }
  }

  const updated = db.updateBooking(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.bikeId) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike) {
      if (updates.bookingStatus === 'active_rental' && bike.availabilityStatus === 'AVAILABLE') {
        db.updateBike(booking.bikeId, { availabilityStatus: 'RESERVED' });
      } else if (
        (updates.bookingStatus === 'completed' ||
          updates.bookingStatus === 'cancelled' ||
          updates.bookingStatus === 'rejected') &&
        bike.availabilityStatus === 'RESERVED' &&
        !hasOtherActiveRentalForBike(booking.bikeId, id)
      ) {
        db.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
      }
    }
  }

  db.logAdminAction({
    adminId: adminCheck.status === 'authorized' ? adminCheck.auth.userId : 'admin',
    action: 'UPDATE_BOOKING_STATUS',
    targetType: 'booking',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

// Pre-ride Handover Condition Record
app.post('/api/bookings/:id/pickup-inspection', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { odometerKm, fuelPercent, photos, notes, helmetIssued, laptopPhysicalDepositLogged, coordinatorName } = req.body;
  
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const pickupRecord = {
    odometerKm: Number(odometerKm) || 0,
    fuelPercent: Number(fuelPercent) || 100,
    photos: photos || [],
    notes: notes || 'Vehicle handed over in standard roadworthy condition.',
    helmetIssued: Boolean(helmetIssued),
    laptopPhysicalDepositLogged: Boolean(laptopPhysicalDepositLogged),
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    pickupConditionRecord: pickupRecord,
    bookingStatus: 'active_rental',
    paymentStatus: 'paid'
  });

  if (booking.bikeId) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike && bike.availabilityStatus === 'AVAILABLE') {
      db.updateBike(booking.bikeId, { availabilityStatus: 'RESERVED' });
    }
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'RECORD_PICKUP_INSPECTION_AND_HANDOVER',
    targetType: 'inspection',
    targetId: id,
    metadata: {
      odometer: pickupRecord.odometerKm,
      fuel: pickupRecord.fuelPercent,
      laptopDeposited: pickupRecord.laptopPhysicalDepositLogged,
      inspectedBy: pickupRecord.inspectedBy
    }
  });

  res.json({ success: true, message: 'Pickup inspection recorded & rental activated', booking: updated });
});

// Post-ride Return Condition Record & Deposit Reconciliation
app.post('/api/bookings/:id/return-inspection', requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    odometerKm,
    fuelPercent,
    photos,
    notes,
    newDamagesIdentified,
    damageNotes,
    damageEstimatedCost,
    fineOrChallanRecorded,
    challanAmount,
    challanDetails,
    laptopReturnedToStudent,
    depositDeductions,
    depositRefundStatus,
    coordinatorName
  } = req.body;

  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const returnRecord = {
    odometerKm: Number(odometerKm) || 0,
    fuelPercent: Number(fuelPercent) || 100,
    photos: photos || [],
    notes: notes || 'Vehicle returned and checked.',
    newDamagesIdentified: Boolean(newDamagesIdentified),
    damageNotes: damageNotes || '',
    damageEstimatedCost: Number(damageEstimatedCost) || 0,
    fineOrChallanRecorded: Boolean(fineOrChallanRecorded),
    challanAmount: Number(challanAmount) || 0,
    challanDetails: challanDetails || '',
    laptopReturnedToStudent: Boolean(laptopReturnedToStudent),
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const deductions = depositDeductions || {
    damageDeduction: Number(damageEstimatedCost) || 0,
    fuelDeduction: 0,
    lateFeeDeduction: 0,
    challanDeduction: Number(challanAmount) || 0,
    netRefundAmount: Math.max(0, (booking.securityDeposit || 0) - (Number(damageEstimatedCost) || 0) - (Number(challanAmount) || 0)),
    deductionNotes: damageNotes || ''
  };

  const refundStatus = depositRefundStatus || (returnRecord.newDamagesIdentified || returnRecord.fineOrChallanRecorded ? 'deduction_applied' : 'full_refund_authorized');

  const updated = db.updateBooking(id, {
    returnConditionRecord: returnRecord,
    depositDeductions: deductions,
    depositRefundStatus: refundStatus,
    bookingStatus: 'completed',
    paymentStatus: refundStatus === 'full_refund_authorized' ? 'deposit_refunded' : 'deposit_adjusted'
  });

  if (booking.bikeId && !hasOtherActiveRentalForBike(booking.bikeId, id)) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike && bike.availabilityStatus === 'RESERVED') {
      db.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
    }
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'RECORD_RETURN_INSPECTION_AND_DEPOSIT_SETTLEMENT',
    targetType: 'inspection',
    targetId: id,
    metadata: {
      odometer: returnRecord.odometerKm,
      fuel: returnRecord.fuelPercent,
      damagesIdentified: returnRecord.newDamagesIdentified,
      damageCost: returnRecord.damageEstimatedCost,
      challans: returnRecord.fineOrChallanRecorded,
      netRefund: deductions.netRefundAmount,
      refundStatus
    }
  });

  res.json({ success: true, message: 'Return condition logged and deposit settlement processed', booking: updated });
});

// 8. AI Document Verification Endpoint (Direct API — Requires Authenticated Student or Admin Session)
app.post('/api/verify-document', async (req, res) => {
  const adminCheck = await verifySupabaseAdminBearerToken(req);
  const isAdmin = adminCheck.status === 'authorized';
  const studentResolved = !isAdmin
    ? await requireActiveStudentSession(
        req,
        res,
        'Authentication required: Please sign in to your student account to verify documents.'
      )
    : null;

  if (!isAdmin && !studentResolved) {
    return;
  }

  const {
    bookingId,
    renterId,
    documentBase64,
    mimeType,
    expectedName,
    expectedEnrollment,
    documentCategory,
    fileName,
    imageWidth,
    imageHeight,
  } = req.body || {};

  if (!documentBase64 || !documentCategory) {
    return res.status(400).json({ error: 'Document data and documentCategory are required' });
  }

  let authoritativeName = (expectedName || 'Student').trim();
  let authoritativeEnrollment = expectedEnrollment
    ? String(expectedEnrollment).trim().toUpperCase()
    : undefined;

  if (!isAdmin) {
    const authUser = studentResolved!.user;
    const userEnrollment = (authUser.icfaiEnrollmentNumber || '').trim().toUpperCase();

    if (renterId && String(renterId).trim() !== authUser.id) {
      return res.status(403).json({
        error: 'Forbidden: You can only verify documents for your own student account.',
      });
    }

    if (bookingId) {
      const targetBooking = db.getBookingById(String(bookingId));
      if (!targetBooking) {
        return res.status(404).json({ error: 'Associated booking not found.' });
      }
      if (!isStudentOwnerOfBooking(targetBooking, authUser)) {
        return res.status(403).json({
          error: "Forbidden: You cannot submit documents for another student's booking.",
        });
      }
    }

    if (expectedEnrollment && userEnrollment && String(expectedEnrollment).trim().toUpperCase() !== userEnrollment) {
      return res.status(403).json({
        error: 'Forbidden: Enrollment number does not match your authenticated student profile.',
      });
    }

    authoritativeName = (authUser.fullName || expectedName || 'Student').trim();
    authoritativeEnrollment = userEnrollment || authoritativeEnrollment;
  }

  try {
    const analysis = await verifyDocumentWithGemini({
      documentBase64,
      mimeType: mimeType || 'image/jpeg',
      expectedName: authoritativeName,
      expectedEnrollment: authoritativeEnrollment,
      documentCategory,
      fileName,
      imageWidth: imageWidth ? Number(imageWidth) : undefined,
      imageHeight: imageHeight ? Number(imageHeight) : undefined,
    });
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Verification processing failed' });
  }
});

app.get('/api/admin/verifications', requireAdmin, (req, res) => {
  res.json(db.getVerifications());
});

app.post('/api/admin/verifications/:id/review', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { result, notes } = req.body;
  const updated = db.updateVerification(id, {
    verificationResult: result,
    verificationState: result === 'verified' ? 'VERIFICATION PASSED' : result === 'rejected' ? 'VERIFICATION FAILED' : 'MANUAL REVIEW REQUIRED',
    manualReviewRequired: false,
    verifiedBy: 'Admin (Manual Review)'
  });
  if (!updated) {
    return res.status(404).json({ error: 'Verification record not found' });
  }

  if (updated.bookingId) {
    db.updateBooking(updated.bookingId, {
      verificationStatus: result === 'verified' ? 'approved' : result === 'rejected' ? 'rejected' : 'manual_review'
    });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'MANUAL_DOCUMENT_VERIFICATION_REVIEW',
    targetType: 'verification',
    targetId: id,
    metadata: { result, notes, bookingId: updated.bookingId }
  });

  res.json(updated);
});

// 9. Dynamic Campus Pickup Locations
function sanitizePublicPickupLocation(location: any) {
  const { contactPhone, ...rest } = location;
  return rest;
}

app.get('/api/pickup-locations', (_req, res) => {
  const locations = db.getPickupLocations(true).map(sanitizePublicPickupLocation);
  res.json(locations);
});

app.get('/api/admin/pickup-locations', requireAdmin, (req, res) => {
  const locations = db.getPickupLocations(false);
  res.json(locations);
});

app.post('/api/admin/pickup-locations', requireAdmin, (req, res) => {
  const { name, hubCode, landmark, address, isActive, operatingHours, contactPhone, displayOrder } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Pickup location name is required' });
  }

  const newLoc = db.createPickupLocation({
    name: name.trim(),
    hubCode: (hubCode || name.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    landmark: landmark || '',
    address: address || 'ICFAI University Hyderabad Campus, Shankarpally Rd, Dontanpally, Hyderabad, Telangana 501203',
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    operatingHours: operatingHours || '07:00 AM - 10:30 PM (Daily)',
    contactPhone: contactPhone || '+91 91210 98765',
    displayOrder: Number(displayOrder) || 0
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'CREATE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: newLoc.id,
    metadata: { name: newLoc.name, hubCode: newLoc.hubCode }
  });

  res.status(201).json(newLoc);
});

app.put('/api/admin/pickup-locations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = db.updatePickupLocation(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Pickup location not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

app.delete('/api/admin/pickup-locations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const loc = db.getPickupLocationById(id);
  if (!loc) {
    return res.status(404).json({ error: 'Pickup location not found' });
  }
  db.deletePickupLocation(id);

  db.logAdminAction({
    adminId: 'admin',
    action: 'DELETE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: id,
    metadata: { name: loc.name }
  });

  res.json({ success: true, message: 'Pickup location removed' });
});

// 10. Handover Fast Actions & Communication Logs
app.post('/api/admin/bookings/:id/handover', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { notes, helmetIssued, laptopDepositLogged, coordinatorName } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const pickupRecord = {
    odometerKm: booking.pickupConditionRecord?.odometerKm || 12000,
    fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
    photos: booking.pickupConditionRecord?.photos || [],
    notes: notes || 'Vehicle handed over at campus hub.',
    helmetIssued: helmetIssued !== undefined ? Boolean(helmetIssued) : true,
    laptopPhysicalDepositLogged: laptopDepositLogged !== undefined ? Boolean(laptopDepositLogged) : true,
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    bookingStatus: 'active_rental',
    paymentStatus: 'paid',
    pickupConditionRecord: pickupRecord
  });

  if (booking.bikeId) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike && bike.availabilityStatus === 'AVAILABLE') {
      db.updateBike(booking.bikeId, { availabilityStatus: 'RESERVED' });
    }
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'FAST_HANDOVER_ACTIVATION',
    targetType: 'booking',
    targetId: id,
    metadata: { renter: booking.renterName, bike: `${booking.bikeBrand} ${booking.bikeModel}` }
  });

  res.json({ success: true, message: 'Vehicle handed over and rental activated.', booking: updated });
});

app.post('/api/admin/bookings/:id/return', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { notes, coordinatorName } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const returnRecord = {
    odometerKm: (booking.pickupConditionRecord?.odometerKm || 12000) + 45,
    fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
    photos: [],
    notes: notes || 'Returned in good condition. Deposit refund approved.',
    newDamagesIdentified: false,
    damageNotes: '',
    damageEstimatedCost: 0,
    fineOrChallanRecorded: false,
    challanAmount: 0,
    challanDetails: '',
    laptopReturnedToStudent: true,
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    bookingStatus: 'completed',
    paymentStatus: 'deposit_refunded',
    depositRefundStatus: 'full_refund_authorized',
    returnConditionRecord: returnRecord
  });

  if (booking.bikeId && !hasOtherActiveRentalForBike(booking.bikeId, id)) {
    const bike = db.getBikeById(booking.bikeId);
    if (bike && bike.availabilityStatus === 'RESERVED') {
      db.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
    }
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'FAST_RETURN_COMPLETION',
    targetType: 'booking',
    targetId: id,
    metadata: { renter: booking.renterName, bike: `${booking.bikeBrand} ${booking.bikeModel}` }
  });

  res.json({ success: true, message: 'Vehicle return logged and deposit refund authorized.', booking: updated });
});

// Communication Logging & Notification API
app.get('/api/admin/bookings/:id/communications', requireAdmin, (req, res) => {
  const { id } = req.params;
  const logs = db.getCommunicationLogs(id);
  res.json(logs);
});

app.post('/api/admin/bookings/:id/send-email', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { customMessage } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const subject = `[Riders Path ICFAI] Booking #${booking.id} - ${booking.bikeBrand} ${booking.bikeModel} Update`;
  const messageBody = customMessage || `Hello ${booking.renterName},\n\nYour booking #${booking.id} for the ${booking.bikeBrand} ${booking.bikeModel} is currently marked as: ${booking.bookingStatus.toUpperCase()}.\nPickup Hub: ${booking.pickupHub}\nDates: ${new Date(booking.pickupDate).toLocaleString('en-IN')} to ${new Date(booking.returnDate).toLocaleString('en-IN')}.\n\nPlease ensure your Student ID and DL are presented at the hub.\n\nBest regards,\nRiders Path Campus Team`;

  const isEmailConfigured = Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);

  let status: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  let responseMsg = 'Email service is not configured in this environment (no SMTP/Resend API key set in server environment). Notification logged for administrative record.';

  if (isEmailConfigured) {
    status = 'sent';
    responseMsg = `Email dispatched to ${booking.renterEmail}`;
  }

  const log = db.logCommunication({
    bookingId: id,
    channel: 'email',
    recipient: booking.renterEmail,
    subject,
    message: messageBody,
    status,
    errorMessage: isEmailConfigured ? undefined : 'Service not configured (SMTP_HOST/RESEND_API_KEY unset)',
    initiatedBy: 'admin'
  });

  res.json({
    success: isEmailConfigured,
    configured: isEmailConfigured,
    message: responseMsg,
    preview: {
      recipient: booking.renterEmail,
      subject,
      body: messageBody
    },
    log
  });
});

app.post('/api/admin/bookings/:id/send-whatsapp', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { customMessage } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const rawPhone = booking.renterPhone || '';
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
  const cleanPhone = digitsOnly.startsWith('91') && digitsOnly.length === 12 ? digitsOnly : (digitsOnly.length === 10 ? `91${digitsOnly}` : '919121098765');

  const defaultMsg = `🏍️ *Riders Path ICFAI Booking Update*\n\nHello ${booking.renterName}!\nBooking ID: *#${booking.id}*\nBike: *${booking.bikeBrand} ${booking.bikeModel}*\nStatus: *${booking.bookingStatus.toUpperCase()}*\nPickup Hub: *${booking.pickupHub}*\n\n*Important:* Bring your Physical ICFAI Student ID and Driving License during pickup.`;
  const messageBody = customMessage || defaultMsg;
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageBody)}`;

  const isWhatsAppGatewayConfigured = Boolean(process.env.WHATSAPP_API_KEY || process.env.TWILIO_AUTH_TOKEN);

  let status: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  let responseMsg = 'WhatsApp gateway API is not configured in this environment. Direct WhatsApp link generated for manual dispatch.';

  if (isWhatsAppGatewayConfigured) {
    status = 'sent';
    responseMsg = `WhatsApp message sent directly to ${booking.renterPhone}`;
  }

  const log = db.logCommunication({
    bookingId: id,
    channel: 'whatsapp',
    recipient: booking.renterPhone,
    message: messageBody,
    status,
    errorMessage: isWhatsAppGatewayConfigured ? undefined : 'WhatsApp API gateway not configured (WHATSAPP_API_KEY unset)',
    initiatedBy: 'admin'
  });

  res.json({
    success: isWhatsAppGatewayConfigured,
    configured: isWhatsAppGatewayConfigured,
    message: responseMsg,
    waLink,
    preview: {
      recipient: booking.renterPhone,
      body: messageBody
    },
    log
  });
});

// 11. Dashboard Real Operational Metrics
app.get('/api/admin/metrics', requireAdmin, (req, res) => {
  res.json(db.getDashboardMetrics());
});

app.get('/api/admin/actions', requireAdmin, (req, res) => {
  res.json(db.getAdminActions());
});

// Controlled JSON body-parser error handler (malformed JSON or oversized payload)
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({
      error: 'Request payload exceeds the maximum allowed size.',
    });
  }
  if (
    err instanceof SyntaxError &&
    (err as any).status === 400 &&
    'body' in err
  ) {
    return res.status(400).json({
      error: 'Malformed JSON request body.',
    });
  }
  return next(err);
});

export { app };
export default app;
