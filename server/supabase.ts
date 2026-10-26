import crypto from 'node:crypto';
import {
  createClient,
  SupabaseClient,
  User as SupabaseAuthUser,
} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  AcademicYear,
  AdminRole,
  ApprovalStatus,
  AvailabilityStatus,
  Bike,
  BikeSpecs,
  BikeType,
  CourseName,
  FuelType,
  Transmission,
  User,
  VerificationStatus,
} from '../src/types.js';
import { dailyToHourly } from '../src/utils/pricing.js';
import { db, INITIAL_SUPER_ADMIN_EMAIL } from './db.js';

dotenv.config();

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export interface SupabaseEnvStatus {
  hasUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  isPublicClientReady: boolean;
  isServiceClientReady: boolean;
}

export function getSupabaseEnvStatus(): SupabaseEnvStatus {
  const hasUrl = Boolean(supabaseUrl);
  const hasAnonKey = Boolean(supabaseAnonKey);
  const hasServiceRoleKey = Boolean(supabaseServiceRoleKey);

  return {
    hasUrl,
    hasAnonKey,
    hasServiceRoleKey,
    isPublicClientReady: hasUrl && hasAnonKey,
    isServiceClientReady: hasUrl && hasServiceRoleKey,
  };
}

let serviceClient: SupabaseClient | null = null;

/**
 * Creates a request-scoped Supabase client using the public Anon Key.
 * When an accessToken is provided, requests run under that user's JWT so
 * Row Level Security (RLS) policies and RPC functions evaluate auth.uid().
 */
export function createSupabaseServerClient(accessToken?: string): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cleanToken = (accessToken || '').trim();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
    global: cleanToken
      ? {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
          },
        }
      : undefined,
  });
}

/**
 * Updates a user's password in Supabase Auth using their verified recovery/session accessToken
 * and the public Anon Key (never requires or exposes the service-role key).
 */
export async function updateSupabaseUserPasswordWithAccessToken(
  accessToken: string,
  newPassword: string,
  refreshToken?: string | null
): Promise<{ user: SupabaseAuthUser | null; error: { message: string; status?: number } | null }> {
  const cleanAccessToken = (accessToken || '').trim();
  const cleanRefreshToken = (refreshToken || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      user: null,
      error: { message: 'Supabase authentication is not configured on the server.', status: 500 },
    };
  }

  if (!cleanAccessToken) {
    return {
      user: null,
      error: { message: 'Missing recovery session token.', status: 400 },
    };
  }

  const client = createSupabaseServerClient(cleanAccessToken);
  if (client && cleanRefreshToken) {
    const { data: sessionData, error: sessionErr } = await client.auth.setSession({
      access_token: cleanAccessToken,
      refresh_token: cleanRefreshToken,
    });
    if (!sessionErr && sessionData?.session) {
      const { data: updateData, error: updateErr } = await client.auth.updateUser({
        password: newPassword,
      });
      await client.auth.signOut().catch(() => {});
      if (!updateErr && updateData?.user) {
        return { user: updateData.user, error: null };
      }
      if (updateErr) {
        return {
          user: null,
          error: { message: updateErr.message, status: updateErr.status },
        };
      }
    }
  }

  // Fallback for access_token-only recovery links: call Supabase GoTrue /auth/v1/user directly
  // with the public anon key and the user's verified Bearer access_token.
  try {
    const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${cleanAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        'Could not update your password. The recovery link may have expired.';
      return {
        user: null,
        error: { message, status: response.status },
      };
    }

    const updatedUser: SupabaseAuthUser | null = payload?.user ?? (payload?.id ? payload : null);
    return { user: updatedUser, error: null };
  } catch (err: any) {
    return {
      user: null,
      error: {
        message: err?.message || 'Unable to reach Supabase authentication service.',
        status: 500,
      },
    };
  }
}

/**
 * Returns a privileged server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Must NEVER be imported or exposed in browser code.
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  if (!serviceClient) {
    serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return serviceClient;
}

// ============================================================================
// SUPABASE AUTH BEARER TOKEN VERIFICATION & REQUEST-SCOPED CLIENT HELPERS
// ============================================================================

export interface AuthHeaderCarrier {
  headers?: {
    authorization?: string | string[];
  };
}

/**
 * Safely extracts a Bearer token from an Express-style request object or raw Authorization header.
 * Rejects missing, non-Bearer, or whitespace-containing tokens.
 */
export function extractBearerToken(
  reqOrHeader: AuthHeaderCarrier | string | undefined | null
): string | null {
  if (!reqOrHeader) {
    return null;
  }

  let rawHeader: string | undefined;
  if (typeof reqOrHeader === 'string') {
    rawHeader = reqOrHeader;
  } else if (reqOrHeader.headers) {
    const h = reqOrHeader.headers.authorization;
    rawHeader = Array.isArray(h) ? h[0] : h;
  }

  if (!rawHeader || typeof rawHeader !== 'string') {
    return null;
  }

  const trimmed = rawHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = trimmed.slice(7).trim();
  if (!token || /\s/.test(token)) {
    return null;
  }

  return token;
}

export interface VerifiedSupabaseAuthContext {
  /** Raw verified JWT access token */
  accessToken: string;
  /** Cryptographically verified Supabase Auth user object */
  authUser: SupabaseAuthUser;
  /** Authoritative user UUID from Supabase Auth (never from request body) */
  userId: string;
  /** Normalized email from Supabase Auth */
  email: string | null;
  /** Timestamp when email was confirmed in Supabase Auth, if confirmed */
  emailConfirmedAt: string | null;
  /** Verified administrator role ('super_admin' | 'admin') when authenticated as admin */
  adminRole?: AdminRole;
  /**
   * Request-scoped Supabase client forwarding `Authorization: Bearer <accessToken>`.
   * Use this client for all RLS-governed queries and protected admin RPC calls
   * (`admin_set_bike_approval`, `admin_set_booking_status`) so PostgreSQL evaluates `auth.uid()`.
   */
  userClient: SupabaseClient;
}

/**
 * Extracts a Bearer token from the request/header and verifies it against Supabase Auth
 * using `auth.getUser(token)`.
 *
 * Security guarantees:
 * - Never trusts any user ID, email, or role supplied in a request body or query parameter.
 * - Never falls back to local or custom token verification if Supabase verification fails.
 * - Returns a request-scoped `userClient` bound to the verified JWT for downstream RLS & RPC calls.
 */
export async function verifySupabaseBearerToken(
  reqOrHeader: AuthHeaderCarrier | string | undefined | null
): Promise<VerifiedSupabaseAuthContext | null> {
  const accessToken = extractBearerToken(reqOrHeader);
  if (!accessToken) {
    return null;
  }

  const userClient = createSupabaseServerClient(accessToken);
  if (!userClient) {
    return null;
  }

  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data?.user || !data.user.id) {
    return null;
  }

  return {
    accessToken,
    authUser: data.user,
    userId: data.user.id,
    email: data.user.email ? data.user.email.trim().toLowerCase() : null,
    emailConfirmedAt: data.user.email_confirmed_at ?? null,
    userClient,
  };
}

export type AdminVerificationResult =
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; auth: VerifiedSupabaseAuthContext }
  | { status: 'authorized'; auth: VerifiedSupabaseAuthContext };

/**
 * Verifies a Bearer token against Supabase Auth AND confirms administrator privileges
 * and role ('super_admin' vs 'admin') using both Supabase RPCs (`get_admin_role` / `check_is_admin`)
 * and the authoritative server-side administrator registry.
 *
 * Security guarantees:
 * - Requires a cryptographically verified Supabase Auth user with a confirmed email address.
 * - Immediately rejects any administrator whose access has been revoked.
 * - Strictly enforces that ONLY `yashmithbolishetti01@gmail.com` can hold the `super_admin` role.
 */
export async function verifySupabaseAdminBearerToken(
  reqOrHeader: AuthHeaderCarrier | string | undefined | null,
  customVerifyBearer?: (
    reqOrHeader: AuthHeaderCarrier | string | undefined | null
  ) => Promise<VerifiedSupabaseAuthContext | null>
): Promise<AdminVerificationResult> {
  const verifyFn = customVerifyBearer || verifySupabaseBearerToken;
  const verified = await verifyFn(reqOrHeader);
  if (!verified) {
    return { status: 'unauthenticated' };
  }

  const cleanEmail = verified.email ? verified.email.trim().toLowerCase() : '';
  if (!cleanEmail || !verified.emailConfirmedAt) {
    return { status: 'forbidden', auth: verified };
  }

  // Check if explicitly revoked in server registry
  const localByEmail = db.getAdminByEmail(cleanEmail);
  const localByUid = db.getAdminByUserId(verified.userId);
  if (localByEmail?.status === 'revoked' || localByUid?.status === 'revoked') {
    return { status: 'forbidden', auth: verified };
  }

  // Query Supabase RPCs (get_admin_role and/or check_is_admin) using the verified admin's JWT
  let rpcAuthorized = false;
  let rpcRole: AdminRole | null = null;

  try {
    const { data: roleData, error: roleErr } = await verified.userClient.rpc('get_admin_role');
    if (!roleErr && (roleData === 'super_admin' || roleData === 'admin')) {
      rpcAuthorized = true;
      rpcRole =
        roleData === 'super_admin' && cleanEmail === INITIAL_SUPER_ADMIN_EMAIL
          ? 'super_admin'
          : 'admin';
    }
  } catch {
    // get_admin_role RPC may not be installed yet; fall back to check_is_admin
  }

  if (!rpcAuthorized) {
    try {
      const { data: isAdmin, error: rpcError } = await verified.userClient.rpc('check_is_admin');
      if (!rpcError && isAdmin === true) {
        rpcAuthorized = true;
        rpcRole = cleanEmail === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'admin';
      }
    } catch {
      // Ignore RPC error and evaluate against authoritative server registry
    }
  }

  const boundRecord = db.bindOrVerifyAdminLogin(verified.userId, cleanEmail, {
    allowRpcFallback: rpcAuthorized,
    rpcRole,
  });

  if (!boundRecord || boundRecord.status !== 'active') {
    return { status: 'forbidden', auth: verified };
  }

  const resolvedRole: AdminRole =
    cleanEmail === INITIAL_SUPER_ADMIN_EMAIL && boundRecord.role === 'super_admin'
      ? 'super_admin'
      : 'admin';

  const authorizedAuth: VerifiedSupabaseAuthContext = {
    ...verified,
    email: cleanEmail,
    adminRole: resolvedRole,
  };

  return { status: 'authorized', auth: authorizedAuth };
}

/**
 * Dispatches an administrator account-setup or password-recovery link via Supabase Auth.
 * - Never accepts or stores a plaintext password.
 * - Uses `serviceClient.auth.admin.inviteUserByEmail` when `SUPABASE_SERVICE_ROLE_KEY` is configured on the server
 *   and the user does not yet have a Supabase Auth account, falling back to `resetPasswordForEmail`
 *   so existing Supabase Auth accounts receive a secure password setup/recovery link.
 */
export async function dispatchSupabaseAdminSetupEmail(
  email: string,
  redirectToUrl = 'https://riderspath.vercel.app/reset-password'
): Promise<{
  sent: boolean;
  deliveryMethod: 'supabase_invite' | 'supabase_recovery';
  error?: string;
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanRedirect = (redirectToUrl || 'https://riderspath.vercel.app/reset-password').trim();

  const privClient = getSupabaseServiceClient();
  if (privClient) {
    const { error: inviteErr } = await privClient.auth.admin.inviteUserByEmail(cleanEmail, {
      redirectTo: cleanRedirect,
      data: {
        full_name: cleanEmail === INITIAL_SUPER_ADMIN_EMAIL ? 'Riders Path Super Admin' : 'Riders Path Administrator',
      },
    });
    if (!inviteErr) {
      return {
        sent: true,
        deliveryMethod: 'supabase_invite',
      };
    }
    // If the user is already registered in auth.users, fall through to resetPasswordForEmail
  }

  const anonClient = createSupabaseServerClient();
  if (!anonClient) {
    return {
      sent: false,
      deliveryMethod: 'supabase_recovery',
      error: 'Supabase authentication is not configured on the server.',
    };
  }

  const { error: resetErr } = await anonClient.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: cleanRedirect,
  });

  if (resetErr) {
    return {
      sent: false,
      deliveryMethod: 'supabase_recovery',
      error: resetErr.message || 'Could not dispatch Supabase password setup email.',
    };
  }

  return {
    sent: true,
    deliveryMethod: 'supabase_recovery',
  };
}

// ============================================================================
// PROFILE MAPPING ADAPTERS (public.profiles <-> Frontend User)
// ============================================================================

export interface DbProfileRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  enrollment_number: string | null;
  academic_year: string | null;
  course: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProfileUpsertPayload {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  enrollment_number: string;
  academic_year: string | null;
  course: string | null;
}

export interface MapDbProfileOptions {
  role?: 'student' | 'owner';
  verificationStatus?: VerificationStatus;
}

/**
 * Translates a `public.profiles` row and optional verified Supabase Auth user into
 * the existing frontend `User` interface (`src/types.ts`).
 *
 * Enforces identity integrity & role safety:
 * - If `authUser` is provided, `profile.id` MUST match `authUser.id`.
 * - Does not invent fake defaults for required student fields (`full_name`, `phone`, `enrollment_number`).
 * - Can never assign or return `'admin'`; only an explicit `'owner'` option produces `'owner'`,
 *   and all other values (including unsafe runtime values) resolve to `'student'`.
 */
export function mapDbProfileToAppUser(
  profile: DbProfileRow,
  authUser?: Pick<SupabaseAuthUser, 'id' | 'email' | 'email_confirmed_at' | 'last_sign_in_at'> | null,
  options?: MapDbProfileOptions
): User {
  if (!profile || !profile.id) {
    throw new Error('Cannot map profile to User: profile row or profile.id is missing.');
  }

  if (authUser && authUser.id !== profile.id) {
    throw new Error(
      `Identity mismatch: profile.id (${profile.id}) does not match verified authUser.id (${authUser.id}).`
    );
  }

  const fullName = (profile.full_name || '').trim();
  if (!fullName) {
    throw new Error(`Cannot map profile ${profile.id}: full_name is required.`);
  }

  const phone = (profile.phone || '').trim();
  if (!phone) {
    throw new Error(`Cannot map profile ${profile.id}: phone is required.`);
  }

  const enrollmentNumber = (profile.enrollment_number || '').trim().toUpperCase();
  if (!enrollmentNumber) {
    throw new Error(`Cannot map profile ${profile.id}: enrollment_number is required.`);
  }

  const resolvedEmail = (profile.email || authUser?.email || '').trim().toLowerCase();
  const emailConfirmedAt = authUser?.email_confirmed_at ?? undefined;
  const emailVerified = authUser ? Boolean(authUser.email_confirmed_at) : true;

  const verificationStatus: VerificationStatus =
    options?.verificationStatus ?? (emailVerified ? 'verified' : 'pending');

  const safeRole: 'student' | 'owner' = options?.role === 'owner' ? 'owner' : 'student';

  return {
    id: profile.id,
    fullName,
    phone,
    email: resolvedEmail,
    emailVerified,
    emailVerifiedAt: emailConfirmedAt,
    icfaiEnrollmentNumber: enrollmentNumber,
    academicYear: (profile.academic_year as AcademicYear) ?? undefined,
    course: (profile.course as CourseName) ?? undefined,
    courseAndBranch: profile.course ?? undefined,
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus,
    role: safeRole,
    lastLoginAt: authUser?.last_sign_in_at ?? undefined,
    updatedAt: profile.updated_at,
    createdAt: profile.created_at,
  };
}

/**
 * Translates frontend user profile input into a `public.profiles` insert/upsert payload.
 *
 * Security guarantee:
 * - Always binds `id` to `verifiedAuthUserId` (from `auth.getUser(token)`), never from
 *   an unverified client request body.
 */
export function mapAppUserToDbProfile(
  verifiedAuthUserId: string,
  input: {
    fullName: string;
    email?: string | null;
    phone: string;
    icfaiEnrollmentNumber: string;
    academicYear?: string | null;
    course?: string | null;
  }
): DbProfileUpsertPayload {
  const cleanUserId = (verifiedAuthUserId || '').trim();
  if (!cleanUserId) {
    throw new Error('Cannot map User to public.profiles payload: verifiedAuthUserId is required.');
  }

  const fullName = (input.fullName || '').trim();
  if (fullName.length < 2) {
    throw new Error('Cannot map User to public.profiles payload: fullName must be at least 2 characters.');
  }

  const phone = (input.phone || '').trim();
  const phoneDigits = phone.replace(/[^0-9]/g, '');
  if (!phone || phoneDigits.length < 10) {
    throw new Error('Cannot map User to public.profiles payload: a valid 10-digit phone number is required.');
  }

  const enrollmentNumber = (input.icfaiEnrollmentNumber || '').trim().toUpperCase();
  if (!enrollmentNumber || enrollmentNumber.length < 10 || !/^[A-Z0-9]+$/.test(enrollmentNumber)) {
    throw new Error(
      'Cannot map User to public.profiles payload: a valid ICFAI enrollment number (10+ alphanumeric chars) is required.'
    );
  }

  const email = input.email ? input.email.trim().toLowerCase() : null;
  const academicYear = input.academicYear ? input.academicYear.trim() : null;
  const course = input.course ? input.course.trim() : null;

  return {
    id: cleanUserId,
    full_name: fullName,
    email,
    phone,
    enrollment_number: enrollmentNumber,
    academic_year: academicYear,
    course,
  };
}

/**
 * Retrieves or safely synchronizes a student's `public.profiles` row using a request-scoped
 * Supabase client (`userClient`) and the verified `authUser` identity.
 *
 * Security guarantees:
 * - Binds `profiles.id` strictly to `authUser.id` (never trusts a caller-supplied UUID).
 * - Uses `authUser.user_metadata` (or explicit server-validated signup fields) to populate
 *   missing profile fields when a newly verified student's profile row does not yet exist
 *   or was only partially initialized by a trigger.
 */
export async function fetchOrSyncStudentProfile(
  userClient: SupabaseClient,
  authUser: SupabaseAuthUser,
  fallbackInput?: {
    fullName?: string;
    email?: string | null;
    phone?: string;
    icfaiEnrollmentNumber?: string;
    academicYear?: string | null;
    course?: string | null;
  }
): Promise<DbProfileRow | null> {
  if (!authUser?.id) {
    return null;
  }

  const { data: existingProfile, error: selectError } = await userClient
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle<DbProfileRow>();

  if (!selectError && existingProfile) {
    const hasRequiredFields =
      Boolean((existingProfile.full_name || '').trim()) &&
      Boolean((existingProfile.phone || '').trim()) &&
      Boolean((existingProfile.enrollment_number || '').trim());

    if (hasRequiredFields) {
      return existingProfile;
    }
  }

  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
  const resolvedFullName = String(
    fallbackInput?.fullName ||
      existingProfile?.full_name ||
      meta.full_name ||
      meta.fullName ||
      ''
  ).trim();
  const resolvedEmail = String(
    fallbackInput?.email ||
      existingProfile?.email ||
      authUser.email ||
      meta.email ||
      ''
  )
    .trim()
    .toLowerCase();
  const resolvedPhone = String(
    fallbackInput?.phone ||
      existingProfile?.phone ||
      meta.phone ||
      ''
  ).trim();
  const resolvedEnrollment = String(
    fallbackInput?.icfaiEnrollmentNumber ||
      existingProfile?.enrollment_number ||
      meta.enrollment_number ||
      meta.icfaiEnrollmentNumber ||
      ''
  )
    .trim()
    .toUpperCase();
  const resolvedAcademicYear = String(
    fallbackInput?.academicYear ||
      existingProfile?.academic_year ||
      meta.academic_year ||
      meta.academicYear ||
      '1st Year'
  ).trim();
  const resolvedCourse = String(
    fallbackInput?.course ||
      existingProfile?.course ||
      meta.course ||
      'B.Tech'
  ).trim();

  if (!resolvedFullName || !resolvedPhone || !resolvedEnrollment) {
    return existingProfile ?? null;
  }

  let payload: DbProfileUpsertPayload;
  try {
    payload = mapAppUserToDbProfile(authUser.id, {
      fullName: resolvedFullName,
      email: resolvedEmail || null,
      phone: resolvedPhone,
      icfaiEnrollmentNumber: resolvedEnrollment,
      academicYear: resolvedAcademicYear || null,
      course: resolvedCourse || null,
    });
  } catch {
    return existingProfile ?? null;
  }

  const { data: upsertedProfile, error: upsertError } = await userClient
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single<DbProfileRow>();

  if (upsertError || !upsertedProfile) {
    return existingProfile ?? null;
  }

  return upsertedProfile;
}


/**
 * Expected Supabase tables and columns matching the actual live public schema
 * plus the consolidated public.bikes metadata fields:
 * - pickup_location_id
 * - specs
 * - approval_notes
 * - display_registration_to_public
 */
export const EXPECTED_SUPABASE_SCHEMA: Record<string, string[]> = {
  pickup_locations: [
    'id',
    'name',
    'address',
    'is_active',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  bikes: [
    'id',
    'owner_id',
    'brand',
    'model',
    'registration_number',
    'display_registration_to_public',
    'bike_type',
    'fuel_type',
    'transmission',
    'manufacture_year',
    'description',
    'image_urls',
    'hourly_price',
    'daily_price',
    'deposit_amount',
    'approval_status',
    'approval_notes',
    'availability_status',
    'is_active',
    'pickup_location_id',
    'specs',
    'created_at',
    'updated_at',
  ],
  profiles: [
    'id',
    'full_name',
    'email',
    'phone',
    'enrollment_number',
    'academic_year',
    'course',
    'created_at',
    'updated_at',
  ],
  bookings: [
    'id',
    'student_id',
    'bike_id',
    'pickup_location_id',
    'pickup_at',
    'return_at',
    'student_name',
    'student_phone',
    'enrollment_number',
    'academic_year',
    'course',
    'rental_amount',
    'deposit_amount',
    'status',
    'verification_status',
    'admin_note',
    'approved_by',
    'approved_at',
    'created_at',
    'updated_at',
  ],
  booking_status_history: [
    'id',
    'booking_id',
    'old_status',
    'new_status',
    'changed_by',
    'note',
    'created_at',
  ],
  pricing_settings: [
    'id',
    'setting_key',
    'setting_value',
    'updated_by',
    'updated_at',
  ],
  document_verifications: [
    'id',
    'booking_id',
    'user_id',
    'document_type',
    'storage_path',
    'status',
    'reviewer_id',
    'reviewer_note',
    'created_at',
    'updated_at',
  ],
};

// ============================================================================
// DATABASE ROW TYPES & BIKE MAPPING ADAPTERS
// ============================================================================

export interface DbOwnerProfileRelation {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  enrollment_number: string | null;
  academic_year: string | null;
  course: string | null;
}

export interface DbPickupLocationRelation {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface DbBikeRow {
  id: string;
  owner_id: string;
  brand: string;
  model: string;
  registration_number: string | null;
  display_registration_to_public: boolean;
  bike_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  manufacture_year: number | null;
  description: string | null;
  image_urls: string[];
  hourly_price: number | string;
  daily_price: number | string;
  deposit_amount: number | string;
  approval_status: string;
  approval_notes: string | null;
  availability_status: string;
  is_active: boolean;
  pickup_location_id: string | null;
  specs: BikeSpecs | null;
  created_at: string;
  updated_at: string;
  // Optional joined relations when queried via PostgREST select('*, owner:profiles(...), pickup_location:pickup_locations(...)')
  owner?: DbOwnerProfileRelation | null;
  pickup_location?: DbPickupLocationRelation | null;
}

export type DbAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'RENTED' | 'MAINTENANCE';

const VALID_BIKE_APPROVAL_STATUSES = new Set<ApprovalStatus>([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
]);

/**
 * Maps a Supabase `public.bikes.availability_status` value (`AVAILABLE`, `UNAVAILABLE`,
 * `RENTED`, `MAINTENANCE`) to the application `AvailabilityStatus` (`AVAILABLE`,
 * `UNAVAILABLE`, `RESERVED`, `MAINTENANCE`).
 * Rejects unknown or unmapped statuses explicitly.
 */
export function mapDbAvailabilityToApp(rawStatus: unknown): AvailabilityStatus {
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
  switch (status) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'MAINTENANCE':
      return 'MAINTENANCE';
    case 'RENTED':
      return 'RESERVED';
    default:
      throw new Error(
        `Invalid Supabase bike availability_status "${String(
          rawStatus
        )}". Expected AVAILABLE, UNAVAILABLE, RENTED, or MAINTENANCE.`
      );
  }
}

/**
 * Maps an application `AvailabilityStatus` value (`AVAILABLE`, `RESERVED`,
 * `UNAVAILABLE`, `MAINTENANCE`) to the Supabase `public.bikes.availability_status`
 * column value (`AVAILABLE`, `RENTED`, `UNAVAILABLE`, `MAINTENANCE`).
 * Rejects unknown or unmapped statuses explicitly.
 */
export function mapAppAvailabilityToDb(rawStatus: unknown): DbAvailabilityStatus {
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
  switch (status) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'MAINTENANCE':
      return 'MAINTENANCE';
    case 'RESERVED':
      return 'RENTED';
    default:
      throw new Error(
        `Invalid application bike availabilityStatus "${String(
          rawStatus
        )}". Expected AVAILABLE, RESERVED, UNAVAILABLE, or MAINTENANCE.`
      );
  }
}

/**
 * Validates that a bike approval status matches the allowed `ApprovalStatus` values.
 */
export function validateBikeApprovalStatus(
  rawStatus: unknown,
  sourceLabel = 'approval_status'
): ApprovalStatus {
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
  if (!VALID_BIKE_APPROVAL_STATUSES.has(status as ApprovalStatus)) {
    throw new Error(
      `Invalid bike ${sourceLabel} "${String(
        rawStatus
      )}". Expected PENDING_APPROVAL, APPROVED, REJECTED, or CHANGES_REQUESTED.`
    );
  }
  return status as ApprovalStatus;
}

export const BIKE_IMAGES_BUCKET = 'bike-images' as const;
export const MAX_BIKE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)
export const MAX_BIKE_IMAGES_PER_LISTING = 6;
// Upper bound on raw base64 data URL character length for a 5 MB binary payload + data URL prefix
export const MAX_BASE64_IMAGE_INPUT_CHARS = Math.ceil((MAX_BIKE_IMAGE_BYTES * 4) / 3) + 256;

export type AllowedBikeImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedBikeImageExtension = 'jpg' | 'png' | 'webp';

export interface ValidatedBikeImagePayload {
  buffer: Buffer;
  mimeType: AllowedBikeImageMimeType;
  extension: AllowedBikeImageExtension;
  byteLength: number;
}

const STORAGE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_BIKE_ID_SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Inspects actual binary magic bytes of a decoded buffer to verify whether it is
 * a genuine JPEG, PNG, or WebP image. Never trusts filename or declared MIME type alone.
 */
export function detectBikeImageBinarySignature(
  buffer: Buffer
): { mimeType: AllowedBikeImageMimeType; extension: AllowedBikeImageExtension } | null {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 4) {
    return null;
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // WebP magic bytes: "RIFF" (0..3) + 4-byte size + "WEBP" (8..11)
  if (
    buffer.byteLength >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

function normalizeDeclaredImageMimeType(rawMime: string): AllowedBikeImageMimeType | null {
  const cleaned = rawMime.trim().toLowerCase();
  if (cleaned === 'image/jpeg' || cleaned === 'image/jpg') {
    return 'image/jpeg';
  }
  if (cleaned === 'image/png') {
    return 'image/png';
  }
  if (cleaned === 'image/webp') {
    return 'image/webp';
  }
  return null;
}

/**
 * Parses and validates a single base64 bike image data URL:
 * - Accepts only JPEG, PNG, and WebP.
 * - Rejects empty, non-string, or malformed base64 payloads.
 * - Enforces a strict 5 MB maximum decoded file size.
 * - Verifies actual binary magic bytes and ensures declared MIME type matches the binary signature.
 */
export function parseAndValidateBase64BikeImage(
  rawInput: unknown,
  declaredMimeType?: unknown
): ValidatedBikeImagePayload {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new Error('Bike image data is required and must be a non-empty base64 data URL string.');
  }

  const trimmed = rawInput.trim();
  if (trimmed.length > MAX_BASE64_IMAGE_INPUT_CHARS) {
    throw new Error(
      `Bike image exceeds the 5 MB maximum file size limit (max ${MAX_BIKE_IMAGE_BYTES} bytes).`
    );
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    throw new Error(
      'Invalid bike image format: expected a base64 data URL (data:image/jpeg|png|webp;base64,...).'
    );
  }

  const headerPart = trimmed.slice(0, commaIndex);
  const headerMatch = /^data:([^;,]+);base64$/i.exec(headerPart);
  if (!headerMatch) {
    throw new Error(
      'Invalid bike image format: expected a base64 data URL (data:image/jpeg|png|webp;base64,...).'
    );
  }

  const rawHeaderMime = headerMatch[1].trim();
  const normalizedHeaderMime = normalizeDeclaredImageMimeType(rawHeaderMime);
  if (!normalizedHeaderMime) {
    throw new Error(
      `Unsupported bike image MIME type "${rawHeaderMime}". Only JPEG, PNG, and WebP images are allowed.`
    );
  }

  if (declaredMimeType !== undefined && declaredMimeType !== null && String(declaredMimeType).trim() !== '') {
    const normalizedCallerMime = normalizeDeclaredImageMimeType(String(declaredMimeType));
    if (!normalizedCallerMime) {
      throw new Error(
        `Unsupported declared bike image MIME type "${String(declaredMimeType)}". Only JPEG, PNG, and WebP images are allowed.`
      );
    }
    if (normalizedCallerMime !== normalizedHeaderMime) {
      throw new Error(
        `Bike image MIME type mismatch: declared "${normalizedCallerMime}" does not match data URL header "${normalizedHeaderMime}".`
      );
    }
  }

  const rawBase64Body = trimmed.slice(commaIndex + 1).replace(/[\r\n]/g, '');
  if (!rawBase64Body) {
    throw new Error('Bike image data is empty.');
  }

  if (
    rawBase64Body.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(rawBase64Body)
  ) {
    throw new Error('Malformed base64 bike image data.');
  }

  const buffer = Buffer.from(rawBase64Body, 'base64');
  if (buffer.byteLength === 0) {
    throw new Error('Bike image data is empty.');
  }

  if (buffer.byteLength > MAX_BIKE_IMAGE_BYTES) {
    throw new Error(
      `Bike image exceeds the 5 MB maximum file size limit (received ${buffer.byteLength} bytes, max ${MAX_BIKE_IMAGE_BYTES} bytes).`
    );
  }

  const detectedSignature = detectBikeImageBinarySignature(buffer);
  if (!detectedSignature) {
    throw new Error(
      'Invalid bike image binary signature: file content is not a valid JPEG, PNG, or WebP image.'
    );
  }

  if (detectedSignature.mimeType !== normalizedHeaderMime) {
    throw new Error(
      `Bike image MIME type mismatch: declared "${normalizedHeaderMime}" does not match binary signature "${detectedSignature.mimeType}".`
    );
  }

  return {
    buffer,
    mimeType: detectedSignature.mimeType,
    extension: detectedSignature.extension,
    byteLength: buffer.byteLength,
  };
}

export type BikeImageUploadScope =
  | {
      mode: 'onboarding';
      authenticatedUserId: string;
    }
  | {
      mode: 'existing_bike';
      ownerFolderId: string;
      bikeId: string;
    };

/**
 * Builds a server-controlled Storage object path inside `bike-images` using a new random
 * UUID filename and the verified binary extension. Never uses client-supplied filenames or paths.
 */
export function buildBikeImageStoragePath(
  scope: BikeImageUploadScope,
  extension: AllowedBikeImageExtension
): string {
  if (!scope || typeof scope !== 'object') {
    throw new Error('Invalid bike image upload scope.');
  }

  if (scope.mode === 'onboarding') {
    const cleanUserId = (scope.authenticatedUserId || '').trim().toLowerCase();
    if (!STORAGE_UUID_RE.test(cleanUserId)) {
      throw new Error('Invalid authenticatedUserId for bike image onboarding path: expected a valid UUID.');
    }
    return `${cleanUserId}/onboarding/${crypto.randomUUID()}.${extension}`;
  }

  if (scope.mode === 'existing_bike') {
    const cleanOwnerFolderId = (scope.ownerFolderId || '').trim().toLowerCase();
    if (!STORAGE_UUID_RE.test(cleanOwnerFolderId)) {
      throw new Error('Invalid ownerFolderId for bike image Storage path: expected a valid UUID.');
    }
    const cleanBikeId = (scope.bikeId || '').trim();
    if (!SAFE_BIKE_ID_SEGMENT_RE.test(cleanBikeId)) {
      throw new Error('Invalid bikeId for bike image Storage path.');
    }
    return `${cleanOwnerFolderId}/bikes/${cleanBikeId}/${crypto.randomUUID()}.${extension}`;
  }

  throw new Error('Unsupported bike image upload scope mode.');
}

export interface UploadSingleBikeImageInput {
  userClient: SupabaseClient;
  imageDataUrl: unknown;
  declaredMimeType?: unknown;
  scope: BikeImageUploadScope;
}

export interface UploadSingleBikeImageResult {
  bucket: typeof BIKE_IMAGES_BUCKET;
  objectPath: string;
  mimeType: AllowedBikeImageMimeType;
  byteLength: number;
  publicUrl: string;
}

/**
 * Validates and uploads a single bike photo to the `bike-images` bucket using the
 * caller's request-scoped Supabase client (`upsert: false`, random object name),
 * then validates and returns the HTTPS public URL only after upload succeeds.
 */
export async function uploadSingleBikeImageToSupabase(
  input: UploadSingleBikeImageInput
): Promise<UploadSingleBikeImageResult> {
  if (!input?.userClient?.storage) {
    throw new Error('A valid request-scoped Supabase client is required for bike image upload.');
  }

  const validated = parseAndValidateBase64BikeImage(
    input.imageDataUrl,
    input.declaredMimeType
  );
  const objectPath = buildBikeImageStoragePath(input.scope, validated.extension);

  const storageBucket = input.userClient.storage.from(BIKE_IMAGES_BUCKET);
  const { data: uploadData, error: uploadError } = await storageBucket.upload(
    objectPath,
    validated.buffer,
    {
      contentType: validated.mimeType,
      upsert: false,
      cacheControl: '3600',
    }
  );

  if (uploadError || !uploadData || typeof uploadData.path !== 'string' || !uploadData.path.trim()) {
    throw new Error(
      `Supabase Storage upload failed: ${
        uploadError?.message || 'Storage did not return a valid object path.'
      }`
    );
  }

  const { data: publicUrlData } = storageBucket.getPublicUrl(uploadData.path);
  const rawPublicUrl = publicUrlData?.publicUrl;
  const [validatedPublicUrl] = validateBikeImageUrls([rawPublicUrl], 'publicUrl');

  return {
    bucket: BIKE_IMAGES_BUCKET,
    objectPath: uploadData.path,
    mimeType: validated.mimeType,
    byteLength: validated.byteLength,
    publicUrl: validatedPublicUrl,
  };
}

/**
 * Validates bike image URLs at the Supabase and API listing boundaries:
 * - Enforces a maximum of 6 images per bike listing.
 * - Rejects base64 data URLs (`data:...` or `...;base64,...`) with an explicit error.
 * - Accepts only valid `https://` URLs.
 */
export function validateBikeImageUrls(images: unknown, fieldName = 'images'): string[] {
  if (images === undefined || images === null) {
    return [];
  }
  if (!Array.isArray(images)) {
    throw new Error(`Cannot map Bike ${fieldName}: expected an array of HTTPS image URLs.`);
  }
  if (images.length > MAX_BIKE_IMAGES_PER_LISTING) {
    throw new Error(
      `Cannot map Bike ${fieldName}: a maximum of ${MAX_BIKE_IMAGES_PER_LISTING} images is allowed per listing (received ${images.length}).`
    );
  }

  return images.map((item, idx) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`Cannot map Bike ${fieldName}[${idx}]: image URL must be a non-empty string.`);
    }
    const trimmed = item.trim();
    if (/^data:/i.test(trimmed) || /;base64,/i.test(trimmed)) {
      throw new Error(
        `Cannot map Bike ${fieldName}[${idx}]: base64 data URLs are not allowed in Supabase image_urls. Upload images to Storage and provide HTTPS URLs.`
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(
        `Cannot map Bike ${fieldName}[${idx}]: invalid URL "${trimmed.slice(
          0,
          48
        )}". Only valid HTTPS image URLs are allowed.`
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        `Cannot map Bike ${fieldName}[${idx}]: unsupported protocol "${parsed.protocol}". Only HTTPS image URLs are allowed.`
      );
    }

    return trimmed;
  });
}

export interface DbBikeInsertPayload {
  owner_id: string;
  brand: string;
  model: string;
  registration_number: string | null;
  display_registration_to_public: boolean;
  bike_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  manufacture_year: number | null;
  description: string | null;
  image_urls: string[];
  hourly_price: number;
  daily_price: number;
  deposit_amount: number;
  approval_status: ApprovalStatus;
  approval_notes: string | null;
  availability_status: DbAvailabilityStatus;
  is_active: boolean;
  pickup_location_id: string | null;
  specs: BikeSpecs;
}

export interface MapDbBikeContext {
  ownerProfile?: DbOwnerProfileRelation | null;
  pickupLocation?: DbPickupLocationRelation | null;
}

/**
 * Translates a database `public.bikes` row (plus optional joined `profiles` and
 * `pickup_locations` relations) into the application's `Bike` type (`src/types.ts`).
 *
 * Relationship & privacy guarantees:
 * - Does not crash when `owner` or `pickup_location` relations are absent or null
 *   (e.g., on public listing queries where `public.profiles` is not joined).
 * - Preserves `row.owner_id` (or `owner.id`) for authorization checks.
 * - Never invents fake owner phone numbers, enrollment numbers, or pickup-location IDs.
 * - Maps Supabase `RENTED` -> application `RESERVED` and rejects unknown statuses.
 * - Rejects base64 data URLs in `image_urls`.
 */
export function mapDbBikeToAppBike(row: DbBikeRow, context?: MapDbBikeContext): Bike {
  if (!row || !row.id) {
    throw new Error('Cannot map bike: database row or row.id is missing.');
  }

  const owner = context?.ownerProfile ?? row.owner ?? null;
  const location = context?.pickupLocation ?? row.pickup_location ?? null;

  const ownerId = (row.owner_id || owner?.id || '').trim();
  if (!ownerId) {
    throw new Error(`Cannot map bike ${row.id}: owner_id is required.`);
  }

  if (row.manufacture_year === null || row.manufacture_year === undefined) {
    throw new Error(`Cannot map bike ${row.id}: manufacture_year is null in database but Bike.year is required.`);
  }

  if (!row.registration_number) {
    throw new Error(`Cannot map bike ${row.id}: registration_number is null in database but Bike.registrationNumber is required.`);
  }

  if (!row.bike_type || !row.fuel_type || !row.transmission) {
    throw new Error(
      `Cannot map bike ${row.id}: bike_type, fuel_type, and transmission are required by the application Bike interface.`
    );
  }

  const dailyPrice = Number(row.daily_price);
  const hourlyPrice = Number(row.hourly_price);
  const depositAmount = Number(row.deposit_amount);

  if (!Number.isFinite(dailyPrice) || dailyPrice <= 0) {
    throw new Error(`Cannot map bike ${row.id}: daily_price in database must be a positive number.`);
  }
  if (!Number.isFinite(hourlyPrice) || hourlyPrice <= 0) {
    throw new Error(`Cannot map bike ${row.id}: hourly_price in database must be a positive number.`);
  }
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    throw new Error(`Cannot map bike ${row.id}: deposit_amount in database cannot be negative.`);
  }

  const normalizedApprovalStatus = validateBikeApprovalStatus(
    row.approval_status,
    'approval_status'
  );
  const normalizedAvailabilityStatus = mapDbAvailabilityToApp(row.availability_status);
  const validatedImages = validateBikeImageUrls(row.image_urls, 'image_urls');
  const approvedByAdmin = normalizedApprovalStatus === 'APPROVED';

  const ownerName = (owner?.full_name || '').trim();
  const ownerPhone = (owner?.phone || '').trim();
  const ownerEnrollment = (owner?.enrollment_number || '').trim().toUpperCase();
  const ownerAcademicYear = owner?.academic_year ? owner.academic_year.trim() : undefined;
  const ownerCourse = owner?.course ? owner.course.trim() : undefined;

  const pickupHub = (location?.name || '').trim();
  const pickupLocationId = (row.pickup_location_id || location?.id || '').trim() || undefined;

  return {
    id: row.id,
    ownerId,
    ownerName,
    ownerPhone,
    ownerEnrollment,
    ownerAcademicYear,
    ownerCourse,
    brand: row.brand,
    model: row.model,
    year: Number(row.manufacture_year),
    registrationNumber: row.registration_number,
    displayRegistrationToPublic: Boolean(row.display_registration_to_public),
    bikeType: row.bike_type as BikeType,
    fuelType: row.fuel_type as FuelType,
    transmission: row.transmission as Transmission,
    description: row.description ?? '',
    images: validatedImages,
    pricePerDay: dailyPrice,
    pricePerHour: hourlyPrice,
    securityDeposit: depositAmount,
    availabilityStatus: normalizedAvailabilityStatus,
    approvalStatus: normalizedApprovalStatus,
    approvalNotes: row.approval_notes ?? undefined,
    active: Boolean(row.is_active),
    specs: row.specs ?? {},
    pickupHub,
    pickupLocationId,
    approvedByAdmin,
    createdAt: row.created_at,
  };
}

export interface MapAppBikeOptions {
  /**
   * When true, allows nullable draft fields (such as pickupLocationId) to remain null
   * prior to publication. Defaults to false (strict publication validation).
   */
  isDraft?: boolean;
}

/**
 * Translates an application `Bike` object (or creation payload) into a `public.bikes`
 * database insert/update payload.
 *
 * Enforces strict validation:
 * - Requires an existing `ownerId` (never invents an owner or assigns admin).
 * - Requires a valid `pickupLocationId` when publishing (`isDraft !== true`).
 * - Validates `pricePerDay > 0` and uses `dailyToHourly(pricePerDay)` when `pricePerHour`
 *   is not explicitly provided, rejecting invalid prices instead of substituting defaults.
 * - Maps application `RESERVED` -> Supabase `RENTED` and rejects unknown statuses.
 * - Rejects base64 data URLs in `images` and preserves valid HTTPS image URLs.
 */
export function mapAppBikeToDbBike(
  bike: Omit<Bike, 'id' | 'createdAt'> & { id?: string },
  options?: MapAppBikeOptions
): DbBikeInsertPayload {
  const isDraft = Boolean(options?.isDraft);

  const ownerId = (bike.ownerId || '').trim();
  if (!ownerId) {
    throw new Error('Cannot map Bike to database payload: ownerId (UUID referencing profiles.id) is required.');
  }

  const brand = (bike.brand || '').trim();
  const model = (bike.model || '').trim();
  if (!brand || !model) {
    throw new Error('Cannot map Bike to database payload: brand and model are required.');
  }

  const dailyPrice = Number(bike.pricePerDay);
  if (!Number.isFinite(dailyPrice) || dailyPrice <= 0) {
    throw new Error('Cannot map Bike to database payload: pricePerDay must be a valid number greater than 0.');
  }

  const rawHourlyPrice =
    bike.pricePerHour !== undefined && bike.pricePerHour !== null
      ? Number(bike.pricePerHour)
      : dailyToHourly(dailyPrice);

  if (!Number.isFinite(rawHourlyPrice) || rawHourlyPrice <= 0) {
    throw new Error('Cannot map Bike to database payload: pricePerHour must be a valid number greater than 0.');
  }

  const depositAmount = Number(bike.securityDeposit);
  if (
    bike.securityDeposit === undefined ||
    bike.securityDeposit === null ||
    !Number.isFinite(depositAmount) ||
    depositAmount < 0
  ) {
    throw new Error('Cannot map Bike to database payload: securityDeposit must be a valid non-negative number.');
  }

  const pickupLocationId = (bike.pickupLocationId || '').trim() || null;
  if (!isDraft && !pickupLocationId) {
    throw new Error('Cannot map Bike to database payload: a valid pickupLocationId is required when publishing a bike.');
  }

  const registrationNumber = (bike.registrationNumber || '').trim() || null;
  const manufactureYear =
    bike.year !== undefined && bike.year !== null && Number.isFinite(Number(bike.year))
      ? Number(bike.year)
      : null;

  const validatedImages = validateBikeImageUrls(bike.images, 'images');

  if (!isDraft) {
    if (!registrationNumber) {
      throw new Error('Cannot map Bike to database payload: registrationNumber is required when publishing a bike.');
    }
    if (!manufactureYear || manufactureYear < 1990 || manufactureYear > new Date().getFullYear() + 1) {
      throw new Error('Cannot map Bike to database payload: a valid manufacture year is required when publishing a bike.');
    }
    if (!bike.bikeType || !bike.fuelType || !bike.transmission) {
      throw new Error('Cannot map Bike to database payload: bikeType, fuelType, and transmission are required when publishing a bike.');
    }
    if (validatedImages.length === 0) {
      throw new Error('Cannot map Bike to database payload: at least one bike image is required when publishing a bike.');
    }
  }

  const rawApprovalStatus =
    bike.approvalStatus ?? (bike.approvedByAdmin ? 'APPROVED' : 'PENDING_APPROVAL');
  const approvalStatus = validateBikeApprovalStatus(rawApprovalStatus, 'approvalStatus');
  const availabilityStatus = mapAppAvailabilityToDb(bike.availabilityStatus);

  const approvalNotes =
    bike.approvalNotes !== undefined && bike.approvalNotes !== null && bike.approvalNotes.trim() !== ''
      ? bike.approvalNotes.trim()
      : null;

  return {
    owner_id: ownerId,
    brand,
    model,
    registration_number: registrationNumber,
    display_registration_to_public: Boolean(bike.displayRegistrationToPublic),
    bike_type: bike.bikeType || null,
    fuel_type: bike.fuelType || null,
    transmission: bike.transmission || null,
    manufacture_year: manufactureYear,
    description: bike.description ?? null,
    image_urls: validatedImages,
    hourly_price: rawHourlyPrice,
    daily_price: dailyPrice,
    deposit_amount: depositAmount,
    approval_status: approvalStatus,
    approval_notes: approvalNotes,
    availability_status: availabilityStatus,
    is_active: Boolean(bike.active),
    pickup_location_id: pickupLocationId,
    specs: bike.specs ?? {},
  };
}

