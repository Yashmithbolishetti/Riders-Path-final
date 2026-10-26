import {
  Bike,
  Booking,
  User,
  DocumentVerification,
  DashboardMetrics,
  AdminAction,
  AdminConfig,
  AdminRole,
  AdminUserRecord,
  PickupLocation,
  CommunicationLog,
} from '../types';
import { localDb } from './localDb';
import {
  DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
  DEFAULT_RECOVERY_REDIRECT_URL,
  getSupabaseBrowserClient,
  isNonRecoveryJwtAccessToken,
  saveConfirmationSession,
  syncBrowserSupabaseSession,
} from '../lib/supabase';

const API_BASE = '/api';

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function getAdminHeaders(): HeadersInit {
  const token = getStorageItem('rp_admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getStudentHeaders(): HeadersInit {
  const token = getStorageItem('rp_student_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getAuthHeaders(preferAdmin = false): HeadersInit {
  const adminToken = getStorageItem('rp_admin_token');
  const studentToken = getStorageItem('rp_student_token');
  const token = preferAdmin
    ? adminToken || studentToken
    : studentToken || adminToken;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const MAX_BIKE_IMAGES_PER_LISTING = 6;
export const MAX_BIKE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_BIKE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedBikeImageMimeType = (typeof ALLOWED_BIKE_IMAGE_MIME_TYPES)[number];

export interface BikeImageUploadRequest {
  image: string;
  mimeType?: string;
  bikeId?: string;
  purpose?: 'onboarding';
}

export interface BikeImageUploadResponse {
  success: boolean;
  url: string;
  publicUrl: string;
  bucket: string;
  path: string;
  mimeType: AllowedBikeImageMimeType;
  byteLength: number;
}

export function isHttpsBikeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isPendingLocalDraftImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value.trim());
}

export function validateSelectedBikeImageFile(file: {
  name?: string;
  type?: string;
  size: number;
}): AllowedBikeImageMimeType {
  const rawType = String(file.type || '').trim().toLowerCase();
  const normalizedType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
  if (
    !normalizedType ||
    !(ALLOWED_BIKE_IMAGE_MIME_TYPES as readonly string[]).includes(normalizedType)
  ) {
    throw new Error(
      'Unsupported image format. Please select a JPEG, PNG, or WEBP photo.'
    );
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('Selected image file is empty.');
  }
  if (file.size > MAX_BIKE_IMAGE_BYTES) {
    const nameLabel = file.name ? `"${file.name}"` : 'Selected photo';
    throw new Error(`${nameLabel} exceeds the 5 MB maximum file size limit.`);
  }
  return normalizedType as AllowedBikeImageMimeType;
}

export function validateCustomBikeImageUrl(
  rawUrl: string,
  currentImageCount: number,
  maxImages = MAX_BIKE_IMAGES_PER_LISTING
): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Enter an image URL before adding.');
  }
  if (currentImageCount >= maxImages) {
    throw new Error(`A bike listing can have at most ${maxImages} photos.`);
  }
  if (/^data:/i.test(trimmed)) {
    throw new Error(
      'Base64 data URLs are not allowed. Please enter a valid https:// image URL or upload a photo file.'
    );
  }
  if (!isHttpsBikeImageUrl(trimmed)) {
    throw new Error('Custom image URL must be a valid https:// URL.');
  }
  return trimmed;
}

export function assertHttpsBikeImageList(
  images: unknown,
  maxImages = MAX_BIKE_IMAGES_PER_LISTING
): string[] {
  if (images === undefined || images === null) {
    return [];
  }
  if (!Array.isArray(images)) {
    throw new Error('Bike images must be an array of HTTPS image URLs.');
  }
  if (images.length > maxImages) {
    throw new Error(`A bike listing can have at most ${maxImages} photos.`);
  }
  return images.map((entry, idx) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`Bike image at position ${idx + 1} must be a non-empty HTTPS URL.`);
    }
    const trimmed = entry.trim();
    if (/^data:/i.test(trimmed)) {
      throw new Error(
        `Bike image at position ${idx + 1} is still a local base64 image. Please wait for photo upload to finish or retry the upload.`
      );
    }
    if (!isHttpsBikeImageUrl(trimmed)) {
      throw new Error(
        `Bike image at position ${idx + 1} must be a valid https:// URL.`
      );
    }
    return trimmed;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file. Please try another photo.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read image file. Please try another photo.'));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadPendingDraftBikeImages(
  images: string[],
  uploadSingleFn?: (dataUrl: string) => Promise<string>
): Promise<{
  uploadedImages: string[];
  failedIndex?: number;
  failedDataUrl?: string;
  error?: string;
}> {
  if (images.length > MAX_BIKE_IMAGES_PER_LISTING) {
    return {
      uploadedImages: [...images],
      error: `A bike listing can have at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`,
    };
  }

  const nextImages = [...images];
  const uploader =
    uploadSingleFn ||
    (async (dataUrl: string) => {
      const res = await api.uploadBikeImage(
        { image: dataUrl, purpose: 'onboarding' },
        { authRole: 'student' }
      );
      return res.publicUrl;
    });

  for (let i = 0; i < nextImages.length; i++) {
    const entry = nextImages[i];
    if (isHttpsBikeImageUrl(entry)) {
      continue;
    }
    if (isPendingLocalDraftImage(entry)) {
      try {
        const httpsUrl = await uploader(entry);
        if (!isHttpsBikeImageUrl(httpsUrl)) {
          throw new Error('Server did not return a valid HTTPS URL for the uploaded bike image.');
        }
        nextImages[i] = httpsUrl.trim();
      } catch (err: any) {
        return {
          uploadedImages: nextImages,
          failedIndex: i,
          failedDataUrl: entry,
          error: err?.message || `Failed to upload photo ${i + 1}. Please retry.`,
        };
      }
    } else {
      return {
        uploadedImages: nextImages,
        failedIndex: i,
        error: `Photo ${i + 1} is not a valid HTTPS image URL.`,
      };
    }
  }

  return { uploadedImages: nextImages };
}

export const ONBOARDING_DRAFT_SESSION_KEY = 'rp_owner_listing_draft';
export const ONBOARDING_DRAFT_IDB_NAME = 'rp_owner_onboarding_db';
export const ONBOARDING_DRAFT_IDB_STORE = 'draft_photos';
export const ONBOARDING_DRAFT_IDB_KEY = 'rp_owner_listing_draft_images';

export interface OnboardingPhotoDraftStorageAdapter {
  saveImages(images: string[]): Promise<void>;
  loadImages(): Promise<string[] | null>;
  clearImages(): Promise<void>;
}

export interface OnboardingDraftPersistenceOptions {
  photoStorage?: OnboardingPhotoDraftStorageAdapter;
  sessionStore?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function getDefaultSessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage;
    }
  } catch {}
  return null;
}

function openOnboardingDraftIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idbFactory =
      (typeof window !== 'undefined' && window.indexedDB) ||
      (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!idbFactory) {
      reject(
        new Error(
          'Browser storage (IndexedDB) is unavailable. Please sign in before uploading bike photos.'
        )
      );
      return;
    }

    try {
      const request = idbFactory.open(ONBOARDING_DRAFT_IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ONBOARDING_DRAFT_IDB_STORE)) {
          db.createObjectStore(ONBOARDING_DRAFT_IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ||
            new Error('Failed to open browser IndexedDB storage for draft photos.')
        );
    } catch (err) {
      reject(err);
    }
  });
}

export const browserIndexedDbPhotoDraftAdapter: OnboardingPhotoDraftStorageAdapter = {
  async saveImages(images: string[]): Promise<void> {
    if (images.length === 0) {
      await browserIndexedDbPhotoDraftAdapter.clearImages();
      return;
    }
    const db = await openOnboardingDraftIndexedDb();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(ONBOARDING_DRAFT_IDB_STORE, 'readwrite');
        const store = tx.objectStore(ONBOARDING_DRAFT_IDB_STORE);
        store.put([...images], ONBOARDING_DRAFT_IDB_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const err =
            tx.error || new Error('Failed to save draft photos in browser storage.');
          db.close();
          reject(err);
        };
        tx.onabort = () => {
          const err =
            tx.error || new Error('Browser storage transaction was aborted.');
          db.close();
          reject(err);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  },

  async loadImages(): Promise<string[] | null> {
    let db: IDBDatabase;
    try {
      db = await openOnboardingDraftIndexedDb();
    } catch {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(ONBOARDING_DRAFT_IDB_STORE, 'readonly');
        const store = tx.objectStore(ONBOARDING_DRAFT_IDB_STORE);
        const req = store.get(ONBOARDING_DRAFT_IDB_KEY);
        req.onsuccess = () => {
          const val = req.result;
          db.close();
          resolve(Array.isArray(val) ? val : null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  },

  async clearImages(): Promise<void> {
    let db: IDBDatabase;
    try {
      db = await openOnboardingDraftIndexedDb();
    } catch {
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(ONBOARDING_DRAFT_IDB_STORE, 'readwrite');
        const store = tx.objectStore(ONBOARDING_DRAFT_IDB_STORE);
        store.delete(ONBOARDING_DRAFT_IDB_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  },
};

export function validateOnboardingDraftImages(
  images: unknown,
  maxImages = MAX_BIKE_IMAGES_PER_LISTING
): string[] {
  if (images === undefined || images === null) {
    return [];
  }
  if (!Array.isArray(images)) {
    throw new Error('Draft bike photos must be an array.');
  }
  if (images.length > maxImages) {
    throw new Error(`A bike listing can include at most ${maxImages} photos.`);
  }
  return images.map((entry, idx) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`Draft photo at position ${idx + 1} is empty or invalid.`);
    }
    const trimmed = entry.trim();
    if (!isHttpsBikeImageUrl(trimmed) && !isPendingLocalDraftImage(trimmed)) {
      throw new Error(
        `Draft photo at position ${idx + 1} must be a valid https:// URL or JPEG/PNG/WEBP draft image.`
      );
    }
    return trimmed;
  });
}

export function sanitizeStoredOnboardingDraftImages(
  images: unknown,
  maxImages = MAX_BIKE_IMAGES_PER_LISTING
): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter(
      (item): item is string =>
        typeof item === 'string' &&
        (isHttpsBikeImageUrl(item) || isPendingLocalDraftImage(item))
    )
    .map((item) => item.trim())
    .slice(0, maxImages);
}

export async function saveOnboardingDraftPhotos(
  images: string[],
  options?: OnboardingDraftPersistenceOptions
): Promise<string[]> {
  const validated = validateOnboardingDraftImages(images, MAX_BIKE_IMAGES_PER_LISTING);
  const adapter = options?.photoStorage || browserIndexedDbPhotoDraftAdapter;
  try {
    await adapter.saveImages(validated);
    return validated;
  } catch (err: any) {
    const detail = err?.message ? ` (${err.message})` : '';
    throw new Error(
      `Unable to save draft photo(s) in browser storage${detail}. Please sign in first or free up browser storage.`
    );
  }
}

export async function saveOnboardingListingDraft(
  draftFields: Record<string, unknown>,
  images: string[],
  options?: OnboardingDraftPersistenceOptions
): Promise<void> {
  const validatedImages = validateOnboardingDraftImages(
    images,
    MAX_BIKE_IMAGES_PER_LISTING
  );
  const sessionStore =
    options?.sessionStore !== undefined
      ? options.sessionStore
      : getDefaultSessionStorage();

  // Persist photos in IndexedDB first so we never claim a draft was saved if photo storage fails
  await saveOnboardingDraftPhotos(validatedImages, options);

  // Store lightweight form metadata in sessionStorage without bulky base64 payloads
  const cleanDraftFields = { ...draftFields };
  delete cleanDraftFields.images;

  if (!sessionStore) {
    throw new Error('Browser sessionStorage is unavailable to save your listing draft.');
  }
  try {
    sessionStore.setItem(
      ONBOARDING_DRAFT_SESSION_KEY,
      JSON.stringify(cleanDraftFields)
    );
  } catch (err: any) {
    const detail = err?.message ? ` (${err.message})` : '';
    throw new Error(
      `Unable to save listing draft details in browser storage${detail}.`
    );
  }
}

export async function loadOnboardingListingDraft(
  options?: OnboardingDraftPersistenceOptions
): Promise<{
  draft: Record<string, any> | null;
  images: string[];
}> {
  const sessionStore =
    options?.sessionStore !== undefined
      ? options.sessionStore
      : getDefaultSessionStorage();
  const adapter = options?.photoStorage || browserIndexedDbPhotoDraftAdapter;

  let parsedDraft: Record<string, any> | null = null;
  if (sessionStore) {
    try {
      const raw = sessionStore.getItem(ONBOARDING_DRAFT_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          parsedDraft = parsed;
        }
      }
    } catch {}
  }

  let idbImages: string[] | null = null;
  try {
    idbImages = await adapter.loadImages();
  } catch {
    idbImages = null;
  }

  const sanitizedIdbImages = sanitizeStoredOnboardingDraftImages(
    idbImages,
    MAX_BIKE_IMAGES_PER_LISTING
  );
  if (sanitizedIdbImages.length > 0) {
    return {
      draft: parsedDraft,
      images: sanitizedIdbImages,
    };
  }

  // Backward compatibility: restore images stored inside legacy rp_owner_listing_draft sessionStorage
  const legacyImages = sanitizeStoredOnboardingDraftImages(
    parsedDraft?.images,
    MAX_BIKE_IMAGES_PER_LISTING
  );
  if (legacyImages.length > 0) {
    // Best-effort migration into IndexedDB and cleanup of bulky legacy sessionStorage images
    try {
      await adapter.saveImages(legacyImages);
      if (sessionStore && parsedDraft) {
        const { images: _legacyImgs, ...restDraft } = parsedDraft;
        sessionStore.setItem(
          ONBOARDING_DRAFT_SESSION_KEY,
          JSON.stringify(restDraft)
        );
      }
    } catch {}
  }

  return {
    draft: parsedDraft,
    images: legacyImages,
  };
}

export async function clearOnboardingListingDraft(
  options?: OnboardingDraftPersistenceOptions
): Promise<void> {
  const sessionStore =
    options?.sessionStore !== undefined
      ? options.sessionStore
      : getDefaultSessionStorage();
  const adapter = options?.photoStorage || browserIndexedDbPhotoDraftAdapter;

  if (sessionStore) {
    try {
      sessionStore.removeItem(ONBOARDING_DRAFT_SESSION_KEY);
    } catch {}
  }
  try {
    await adapter.clearImages();
  } catch {}
}

export async function runSequentialPhotoBatch<T>(
  items: T[],
  setUploadingPhotos: (uploading: boolean) => void,
  processItem: (item: T, index: number) => Promise<boolean>
): Promise<{ completedCount: number; abortedAtIndex?: number }> {
  if (items.length === 0) {
    return { completedCount: 0 };
  }
  setUploadingPhotos(true);
  try {
    let completedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const ok = await processItem(items[i], i);
      if (!ok) {
        return { completedCount, abortedAtIndex: i };
      }
      completedCount += 1;
    }
    return { completedCount };
  } finally {
    setUploadingPhotos(false);
  }
}

async function handleAuthResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json();
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    const err: any = new Error(data.error || defaultMessage);
    err.isAppError = true;
    err.status = res.status;
    if (data.requiresEmailVerification) err.requiresEmailVerification = true;
    if (data.email) err.email = data.email;
    if (data.retryAfterSeconds) err.retryAfterSeconds = Number(data.retryAfterSeconds);
    throw err;
  }
  throw new Error(defaultMessage);
}

/**
 * Executes an authentication network request without falling back to localDb.
 * Re-throws backend application errors directly and translates network failures
 * into a clear user-facing error message.
 */
async function executeAuthNetworkRequest<T>(
  networkFn: () => Promise<T>,
  networkErrorMessage = 'Unable to reach the authentication server. Please check your connection and try again.'
): Promise<T> {
  try {
    return await networkFn();
  } catch (err: any) {
    if (err?.isAppError) {
      throw err;
    }
    throw new Error(err?.message || networkErrorMessage);
  }
}

/**
 * Executes a network API request for non-authentication catalog/booking operations.
 */
async function tryNetworkOrFallback<T>(networkFn: () => Promise<T>, fallbackFn: () => T | Promise<T>): Promise<T> {
  try {
    const result = await networkFn();
    return result;
  } catch (err: any) {
    if (err?.isAppError) {
      throw err;
    }
    // Graceful fallback for static GitHub Pages and offline execution
    return await fallbackFn();
  }
}

export const api = {
  // --- Config ---
  async getConfig(): Promise<AdminConfig> {
    return tryNetworkOrFallback(
      async () => {
        const res = await fetch(`${API_BASE}/config`);
        if (!res.ok) throw new Error('Network config error');
        return res.json();
      },
      () => localDb.getConfig()
    );
  },

  async updateConfig(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updates),
      });
      return handleAuthResponse<AdminConfig>(res, 'Failed to update platform configuration');
    });
  },

  // --- Admin Auth, Initial Super-Admin Bootstrap & Admin Management (no localDb fallback) ---
  async adminLogin(
    email: string,
    password?: string
  ): Promise<{
    success: boolean;
    token: string;
    role: AdminRole;
    isSuperAdmin: boolean;
    email: string;
    userId: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (email || '').trim().toLowerCase(),
          password: password || '',
        }),
      });
      return handleAuthResponse(res, 'Admin login failed');
    });
  },

  async adminLogout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/admin/logout`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('rp_admin_token');
    localStorage.removeItem('rp_admin_role');
    localStorage.removeItem('rp_admin_email');
  },

  async adminVerifySession(): Promise<{
    authenticated: boolean;
    role: AdminRole;
    isSuperAdmin: boolean;
    email: string | null;
    userId: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/me`, {
        headers: getAdminHeaders(),
      });
      return handleAuthResponse(res, 'Admin session expired');
    });
  },

  async adminChangePassword(oldPassword: string, newPassword: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/change-password`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      await handleAuthResponse(res, 'Password update failed');
    });
  },

  async adminGetBootstrapStatus(): Promise<{
    initialSuperAdminEmail: string;
    isBootstrapped: boolean;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bootstrap/status`);
      return handleAuthResponse(res, 'Failed to check Super Admin bootstrap status');
    });
  },

  async adminSendBootstrapSetupLink(
    email: string,
    redirectTo = DEFAULT_RECOVERY_REDIRECT_URL
  ): Promise<{
    success: boolean;
    email: string;
    deliveryMethod: string;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bootstrap/send-setup-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (email || '').trim().toLowerCase(),
          redirectTo,
        }),
      });
      return handleAuthResponse(res, 'Could not send Super Admin setup link');
    });
  },

  async adminBootstrapSuperAdmin(payload: {
    email?: string;
    password?: string;
    bearerToken?: string;
  }): Promise<{
    success: boolean;
    token: string;
    role: AdminRole;
    isSuperAdmin: boolean;
    email: string;
    userId: string;
    admin: AdminUserRecord;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (payload.bearerToken) {
        headers.Authorization = `Bearer ${payload.bearerToken}`;
      }
      const res = await fetch(`${API_BASE}/admin/bootstrap`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...(payload.email ? { email: payload.email.trim().toLowerCase() } : {}),
          ...(payload.password ? { password: payload.password } : {}),
        }),
      });
      return handleAuthResponse(res, 'Could not bootstrap initial Super Admin');
    });
  },

  async adminListAdmins(): Promise<{
    admins: AdminUserRecord[];
    currentAdminRole: AdminRole;
    isSuperAdmin: boolean;
    initialSuperAdminEmail: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/admins`, {
        headers: getAdminHeaders(),
      });
      return handleAuthResponse(res, 'Failed to load administrator roster');
    });
  },

  async adminAddAdmin(
    email: string,
    redirectTo = DEFAULT_RECOVERY_REDIRECT_URL
  ): Promise<{
    success: boolean;
    admin: AdminUserRecord;
    invitationSent: boolean;
    deliveryMethod: string;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/admins`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          email: (email || '').trim().toLowerCase(),
          redirectTo,
        }),
      });
      return handleAuthResponse(res, 'Failed to add administrator');
    });
  },

  async adminResendInvite(
    idOrEmail: string,
    redirectTo = DEFAULT_RECOVERY_REDIRECT_URL
  ): Promise<{
    success: boolean;
    email: string;
    invitationSent: boolean;
    deliveryMethod: string;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(
        `${API_BASE}/admin/admins/${encodeURIComponent(idOrEmail)}/resend-invite`,
        {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ redirectTo }),
        }
      );
      return handleAuthResponse(res, 'Failed to resend administrator setup link');
    });
  },

  async adminRevokeAdmin(idOrEmail: string): Promise<{
    success: boolean;
    revokedAdmin: AdminUserRecord;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(
        `${API_BASE}/admin/admins/${encodeURIComponent(idOrEmail)}`,
        {
          method: 'DELETE',
          headers: getAdminHeaders(),
        }
      );
      return handleAuthResponse(res, 'Failed to revoke administrator privileges');
    });
  },

  // --- Complete Student Auth (/api/auth/* — no localDb fallback) ---
  async authSignup(payload: {
    fullName: string;
    email: string;
    password: string;
    phone: string;
    icfaiEnrollmentNumber: string;
    academicYear?: string;
    course?: string;
    redirectTo?: string;
  }): Promise<{
    success: boolean;
    requiresEmailVerification: boolean;
    email: string;
    emailDeliveryMode: 'live' | 'sandbox';
    token?: string;
    refreshToken?: string;
    message: string;
    user: User;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          redirectTo: payload.redirectTo || DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL,
        }),
      });
      return handleAuthResponse(res, 'Could not create student account');
    });
  },

  async authVerifyEmail(
    email: string,
    code: string
  ): Promise<{
    success: boolean;
    alreadyVerified?: boolean;
    token: string;
    refreshToken?: string;
    user: User;
    message?: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      return handleAuthResponse(res, 'Email verification failed');
    });
  },

  async authVerifyEmailConfirmation(payload: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenHash?: string | null;
    code?: string | null;
    type?: string | null;
  }): Promise<{
    success: boolean;
    alreadyVerified?: boolean;
    token: string;
    refreshToken?: string;
    user: User;
    message?: string;
  }> {
    const client = getSupabaseBrowserClient();
    let accessToken = payload.accessToken || null;
    let refreshToken = payload.refreshToken || null;
    let code = payload.code || null;

    if (!accessToken && code && client) {
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (!error && data?.session?.access_token) {
          accessToken = data.session.access_token;
          refreshToken = data.session.refresh_token || refreshToken;
          code = null;
        }
      } catch {
        // Fall through to server verification endpoint
      }
    }

    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          refreshToken,
          tokenHash: payload.tokenHash || null,
          code,
          type: payload.type || 'signup',
        }),
      });
      return handleAuthResponse(
        res,
        'This email confirmation link is invalid or has expired. Please request a new confirmation email.'
      );
    });
  },

  async authResendVerification(
    email: string,
    redirectTo: string = DEFAULT_EMAIL_CONFIRMATION_REDIRECT_URL
  ): Promise<{
    success: boolean;
    alreadyVerified?: boolean;
    email: string;
    emailDeliveryMode: 'live' | 'sandbox';
    cooldownSeconds?: number;
    message: string;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      });
      return handleAuthResponse(res, 'Could not resend confirmation email');
    });
  },

  async authLogin(
    email: string,
    password: string
  ): Promise<{
    success: boolean;
    token: string;
    refreshToken?: string;
    user: User;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return handleAuthResponse(res, 'Student sign in failed');
    });
  },

  async authForgotPassword(
    email: string,
    redirectTo: string = DEFAULT_RECOVERY_REDIRECT_URL
  ): Promise<{
    success: boolean;
    email: string;
    emailDeliveryMode: 'live' | 'sandbox';
    message: string;
  }> {
    const cleanEmail = email.trim().toLowerCase();
    const client = getSupabaseBrowserClient();
    if (client) {
      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (error) {
        const lowerMsg = (error.message || '').toLowerCase();
        if (
          error.status === 429 ||
          lowerMsg.includes('rate limit') ||
          lowerMsg.includes('security purposes') ||
          lowerMsg.includes('too many')
        ) {
          throw new Error(
            'Please wait a minute before requesting another password reset email.'
          );
        }
        throw new Error(error.message || 'Could not request password reset');
      }
      return {
        success: true,
        email: cleanEmail,
        emailDeliveryMode: 'live',
        message: `If an account is registered with ${cleanEmail}, a password reset link has been sent.`,
      };
    }

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, redirectTo }),
      });
      return await handleAuthResponse(res, 'Could not request password reset');
    } catch (err: any) {
      if (err?.isAppError) {
        throw err;
      }
      throw new Error(
        err?.message ||
          'Unable to reach the authentication server. Please check your connection and try again.'
      );
    }
  },

  async authVerifyRecovery(payload: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenHash?: string | null;
    code?: string | null;
    type?: string | null;
  }): Promise<{
    valid: boolean;
    accessToken: string;
    refreshToken: string | null;
    email: string | null;
  }> {
    const client = getSupabaseBrowserClient();
    const rawType = (payload.type || '').trim().toLowerCase();

    // If a PKCE code was returned in the URL, exchange it once via the browser client first
    let accessToken = payload.accessToken || null;
    let refreshToken = payload.refreshToken || null;
    let code = payload.code || null;

    if (!accessToken && code && client) {
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (!error && data?.session?.access_token) {
          accessToken = data.session.access_token;
          refreshToken = data.session.refresh_token || null;
          code = null;
        }
      } catch {
        // Fall through to server verification endpoint
      }
    }

    if (
      rawType === 'signup' ||
      rawType === 'email' ||
      rawType === 'email_change' ||
      (accessToken && isNonRecoveryJwtAccessToken(accessToken))
    ) {
      saveConfirmationSession({
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        tokenHash: payload.tokenHash || null,
        code: code || null,
        type: 'signup',
        email: null,
        error: null,
        errorCode: null,
        errorDescription: null,
      });
      const redirectErr = new Error(
        'This link is an email confirmation link, not a password reset link.'
      ) as Error & { isEmailConfirmationRedirect?: boolean };
      redirectErr.isEmailConfirmationRedirect = true;
      throw redirectErr;
    }

    if (client) {
      if (payload.tokenHash && !accessToken) {
        const otpType = payload.type === 'invite' ? 'invite' : 'recovery';
        const { data, error } = await client.auth.verifyOtp({
          token_hash: payload.tokenHash,
          type: otpType,
        });
        if (error || !data.session?.access_token) {
          throw new Error(
            error?.message ||
              'This password reset link is invalid or has expired. Please request a new reset email.'
          );
        }
        return {
          valid: true,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token || null,
          email: data.user?.email || null,
        };
      }

      if (accessToken && refreshToken) {
        const { data, error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error || !data.user) {
          throw new Error(
            error?.message ||
              'This password reset link is invalid or has expired. Please request a new reset email.'
          );
        }
        return {
          valid: true,
          accessToken: data.session?.access_token || accessToken,
          refreshToken: data.session?.refresh_token || refreshToken,
          email: data.user.email || null,
        };
      }

      if (accessToken) {
        const { data, error } = await client.auth.getUser(accessToken);
        if (error || !data?.user) {
          throw new Error(
            error?.message ||
              'This password reset link is invalid or has expired. Please request a new reset email.'
          );
        }
        return {
          valid: true,
          accessToken,
          refreshToken: refreshToken || null,
          email: data.user.email || null,
        };
      }

      const { data: sessionData } = await client.auth.getSession();
      if (sessionData.session?.access_token) {
        if (isNonRecoveryJwtAccessToken(sessionData.session.access_token)) {
          const redirectErr = new Error(
            'This link is an email confirmation link, not a password reset link.'
          ) as Error & { isEmailConfirmationRedirect?: boolean };
          redirectErr.isEmailConfirmationRedirect = true;
          throw redirectErr;
        }
        return {
          valid: true,
          accessToken: sessionData.session.access_token,
          refreshToken: sessionData.session.refresh_token || null,
          email: sessionData.session.user?.email || null,
        };
      }
    }

    try {
      const res = await fetch(`${API_BASE}/auth/verify-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          refreshToken,
          tokenHash: payload.tokenHash || null,
          code,
          type: payload.type || 'recovery',
        }),
      });
      const verified = await handleAuthResponse<{
        valid: boolean;
        accessToken: string;
        refreshToken: string | null;
        email: string | null;
      }>(
        res,
        'This password reset link is invalid or has expired. Please request a new reset email.'
      );
      if (verified.accessToken && verified.refreshToken) {
        await syncBrowserSupabaseSession(verified.accessToken, verified.refreshToken);
      }
      return verified;
    } catch (err: any) {
      if (err?.isAppError) {
        throw err;
      }
      throw new Error(
        err?.message ||
          'This password reset link is invalid or has expired. Please request a new reset email.'
      );
    }
  },

  async authResetPasswordWithRecovery(payload: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenHash?: string | null;
    newPassword: string;
  }): Promise<{
    success: boolean;
    message: string;
    user?: User;
  }> {
    const client = getSupabaseBrowserClient();
    if (client) {
      if (!payload.accessToken && payload.tokenHash) {
        const { error: otpErr } = await client.auth.verifyOtp({
          token_hash: payload.tokenHash,
          type: 'recovery',
        });
        if (otpErr) {
          throw new Error(
            otpErr.message ||
              'This password reset link is invalid or has expired. Please request a new reset email.'
          );
        }
      } else if (payload.accessToken && payload.refreshToken) {
        const { error: sessionErr } = await client.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });
        if (sessionErr) {
          throw new Error(
            sessionErr.message ||
              'This password reset link is invalid or has expired. Please request a new reset email.'
          );
        }
      }

      const { data: sessionCheck } = await client.auth.getSession();
      if (sessionCheck?.session?.access_token) {
        const { error: updateErr } = await client.auth.updateUser({
          password: payload.newPassword,
        });
        if (updateErr) {
          const lowerErr = (updateErr.message || '').toLowerCase();
          if (lowerErr.includes('different') || lowerErr.includes('same_password')) {
            throw new Error('New password must be different from your current password.');
          }
          throw new Error(updateErr.message || 'Password reset failed');
        }
        return {
          success: true,
          message: 'Your password has been reset successfully. You can now sign in with your new password.',
        };
      }
    }

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: payload.accessToken || undefined,
          refreshToken: payload.refreshToken || undefined,
          tokenHash: payload.tokenHash || undefined,
          newPassword: payload.newPassword,
        }),
      });
      return await handleAuthResponse(res, 'Password reset failed');
    } catch (err: any) {
      if (err?.isAppError) {
        throw err;
      }
      throw new Error(
        err?.message ||
          'Unable to reach the authentication server. Please check your connection and try again.'
      );
    }
  },

  async authResetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{
    success: boolean;
    message: string;
    user: User;
  }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      return handleAuthResponse(res, 'Password reset failed');
    });
  },

  async authMe(): Promise<{ authenticated: boolean; user: User }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getStudentHeaders(),
      });
      return handleAuthResponse(res, 'Session expired');
    });
  },

  async authLogout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getStudentHeaders(),
      });
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('rp_student_token');
    localStorage.removeItem('rp_student_user');
    try {
      sessionStorage.removeItem('rp_active_booking');
    } catch {}
  },

  async authUpdateProfile(
    _userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      icfaiEnrollmentNumber?: string;
      academicYear?: string;
      course?: string;
    }
  ): Promise<{ success: boolean; user: User }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: getStudentHeaders(),
        body: JSON.stringify(updates),
      });
      return handleAuthResponse(res, 'Could not update profile');
    });
  },

  async authChangePassword(
    _userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: getStudentHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return handleAuthResponse(res, 'Could not change password');
    });
  },

  // --- Legacy Student Profile Login (Disabled on backend with HTTP 410 Gone) ---
  async studentLogin(payload: {
    fullName: string;
    email?: string;
    phone?: string;
    icfaiEnrollmentNumber: string;
    academicYear?: string;
    course?: string;
  }): Promise<{ user: User; token: string }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return handleAuthResponse(res, 'Legacy passwordless login has been disabled');
    });
  },

  async getUsers(): Promise<User[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/users`, { headers: getAdminHeaders() });
      return handleAuthResponse<User[]>(res, 'Failed to fetch users');
    });
  },

  async updateUserStatus(userId: string, verificationStatus: string): Promise<User> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/users/${userId}/status`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ verificationStatus }),
      });
      return handleAuthResponse<User>(res, 'Failed to update user status');
    });
  },

  // --- Bikes ---
  async getBikes(filters?: {
    status?: string;
    brand?: string;
    bikeType?: string;
    fuelType?: string;
    transmission?: string;
    search?: string;
  }): Promise<Bike[]> {
    return tryNetworkOrFallback(
      async () => {
        const params = new URLSearchParams();
        if (filters?.status) params.set('status', filters.status);
        if (filters?.brand) params.set('brand', filters.brand);
        if (filters?.bikeType) params.set('bikeType', filters.bikeType);
        if (filters?.fuelType) params.set('fuelType', filters.fuelType);
        if (filters?.transmission) params.set('transmission', filters.transmission);
        if (filters?.search) params.set('search', filters.search);

        const res = await fetch(`${API_BASE}/bikes?${params.toString()}`);
        return handleAuthResponse<Bike[]>(res, 'Failed to fetch bikes');
      },
      () => localDb.getBikes(filters)
    );
  },

  async getAllBikesAdmin(): Promise<Bike[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bikes/all`, { headers: getAdminHeaders() });
      return handleAuthResponse<Bike[]>(res, 'Failed to fetch all bikes');
    });
  },

  async getBikeById(id: string): Promise<Bike> {
    return tryNetworkOrFallback(
      async () => {
        const res = await fetch(`${API_BASE}/bikes/${id}`, {
          headers: getAuthHeaders(false),
        });
        return handleAuthResponse<Bike>(res, 'Bike not found');
      },
      () => {
        const bike = localDb.getBikeById(id);
        if (!bike || !bike.approvedByAdmin || !bike.active) {
          throw new Error('Bike not found');
        }
        return bike;
      }
    );
  },

  async checkBikeAvailability(
    bikeId: string,
    pickupDate: string,
    returnDate: string
  ): Promise<{ available: boolean; reason?: string; conflicts?: Array<{ pickupDate: string; returnDate: string }> }> {
    return executeAuthNetworkRequest(async () => {
      const params = new URLSearchParams({ pickupDate, returnDate });
      const res = await fetch(`${API_BASE}/bikes/${bikeId}/availability?${params.toString()}`);
      return handleAuthResponse(res, 'Failed to check availability');
    });
  },

  async uploadBikeImage(
    payload: BikeImageUploadRequest,
    options?: { authRole?: 'student' | 'admin' }
  ): Promise<BikeImageUploadResponse> {
    return executeAuthNetworkRequest(async () => {
      const image = typeof payload?.image === 'string' ? payload.image.trim() : '';
      if (!image) {
        throw new Error('A base64 data URL image payload is required for upload.');
      }

      const authRole = options?.authRole ?? 'student';
      const headers =
        authRole === 'admin' ? getAdminHeaders() : getStudentHeaders();

      const trimmedBikeId =
        typeof payload.bikeId === 'string' ? payload.bikeId.trim() : '';

      const endpoint = trimmedBikeId
        ? authRole === 'admin'
          ? `${API_BASE}/bikes/${encodeURIComponent(trimmedBikeId)}/images`
          : `${API_BASE}/owner/bikes/${encodeURIComponent(trimmedBikeId)}/images`
        : authRole === 'admin'
        ? `${API_BASE}/bikes/images`
        : `${API_BASE}/owner/onboard/images`;

      const requestBody: Record<string, unknown> = {
        image,
      };
      if (payload.mimeType) {
        requestBody.mimeType = payload.mimeType;
      }
      if (trimmedBikeId) {
        requestBody.bikeId = trimmedBikeId;
      } else {
        requestBody.purpose = payload.purpose || 'onboarding';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const data = await handleAuthResponse<BikeImageUploadResponse>(
        res,
        'Failed to upload bike image'
      );

      const resolvedUrl = (data?.publicUrl || data?.url || '').trim();
      if (!isHttpsBikeImageUrl(resolvedUrl)) {
        throw new Error(
          'Upload response did not include a valid https:// bike image URL.'
        );
      }

      return {
        ...data,
        url: resolvedUrl,
        publicUrl: resolvedUrl,
      };
    }, 'Unable to upload bike photo right now. Please check your connection and try again.');
  },

  async createBike(bikeData: Partial<Bike>): Promise<Bike> {
    return executeAuthNetworkRequest(async () => {
      const sanitizedPayload: Partial<Bike> = { ...bikeData };
      if (sanitizedPayload.images !== undefined) {
        sanitizedPayload.images = assertHttpsBikeImageList(sanitizedPayload.images);
      }
      const res = await fetch(`${API_BASE}/bikes`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(sanitizedPayload),
      });
      return handleAuthResponse<Bike>(res, 'Failed to create bike');
    });
  },

  async updateBike(id: string, updates: Partial<Bike>): Promise<Bike> {
    return executeAuthNetworkRequest(async () => {
      const sanitizedUpdates: Partial<Bike> = { ...updates };
      if (sanitizedUpdates.images !== undefined) {
        sanitizedUpdates.images = assertHttpsBikeImageList(sanitizedUpdates.images);
      }
      const res = await fetch(`${API_BASE}/bikes/${id}`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(sanitizedUpdates),
      });
      return handleAuthResponse<Bike>(res, 'Failed to update bike');
    });
  },

  async deleteBike(id: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bikes/${id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      await handleAuthResponse(res, 'Failed to delete bike');
    });
  },

  // --- Owner Onboarding ---
  async submitOwnerOnboarding(payload: any): Promise<{ success: boolean; message: string; bike: Bike }> {
    return executeAuthNetworkRequest(async () => {
      const sanitizedPayload = { ...payload };
      if (sanitizedPayload.images !== undefined) {
        sanitizedPayload.images = assertHttpsBikeImageList(sanitizedPayload.images);
      }
      const res = await fetch(`${API_BASE}/owner/onboard`, {
        method: 'POST',
        headers: getStudentHeaders(),
        body: JSON.stringify(sanitizedPayload),
      });
      return handleAuthResponse<{ success: boolean; message: string; bike: Bike }>(
        res,
        'Failed to submit bike for listing'
      );
    });
  },

  async getOwnerSubmissions(): Promise<Bike[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/owner/submissions`, { headers: getAdminHeaders() });
      return handleAuthResponse<Bike[]>(res, 'Failed to fetch owner submissions');
    });
  },

  async getOwnerBikes(enrollment: string): Promise<Bike[]> {
    const clean = (enrollment || '').trim().toUpperCase();
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/owner/bikes?enrollment=${encodeURIComponent(clean)}`, {
        headers: getStudentHeaders(),
      });
      return handleAuthResponse<Bike[]>(res, 'Failed to fetch owner bikes');
    });
  },

  async updateOwnerBike(bikeId: string, updates: Partial<Bike>): Promise<Bike> {
    return executeAuthNetworkRequest(async () => {
      const sanitizedUpdates: Partial<Bike> = { ...updates };
      if (sanitizedUpdates.images !== undefined) {
        sanitizedUpdates.images = assertHttpsBikeImageList(sanitizedUpdates.images);
      }
      const res = await fetch(`${API_BASE}/owner/bikes/${bikeId}`, {
        method: 'PUT',
        headers: getStudentHeaders(),
        body: JSON.stringify(sanitizedUpdates),
      });
      return handleAuthResponse<Bike>(res, 'Failed to update bike listing');
    });
  },

  async approveOwnerBike(bikeId: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/owner/approve/${bikeId}`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      await handleAuthResponse(res, 'Failed to approve bike');
    });
  },

  async rejectOwnerBike(bikeId: string, reason?: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/owner/reject/${bikeId}`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ reason }),
      });
      await handleAuthResponse(res, 'Failed to reject bike');
    });
  },

  async requestOwnerChanges(bikeId: string, notes: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/owner/request-changes/${bikeId}`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ notes }),
      });
      await handleAuthResponse(res, 'Failed to request changes');
    });
  },

  // --- Pickup Locations ---
  async getPickupLocations(_activeOnly = true): Promise<PickupLocation[]> {
    return tryNetworkOrFallback(
      async () => {
        const res = await fetch(`${API_BASE}/pickup-locations`);
        if (!res.ok) throw new Error('Failed to fetch pickup locations');
        return res.json();
      },
      () => localDb.getPickupLocations(true)
    );
  },

  async adminGetPickupLocations(): Promise<PickupLocation[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/pickup-locations`, { headers: getAdminHeaders() });
      return handleAuthResponse<PickupLocation[]>(res, 'Failed to fetch admin pickup locations');
    });
  },

  async adminCreatePickupLocation(locationData: Partial<PickupLocation>): Promise<PickupLocation> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/pickup-locations`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(locationData),
      });
      return handleAuthResponse<PickupLocation>(res, 'Failed to create pickup location');
    });
  },

  async adminUpdatePickupLocation(id: string, updates: Partial<PickupLocation>): Promise<PickupLocation> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/pickup-locations/${id}`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updates),
      });
      return handleAuthResponse<PickupLocation>(res, 'Failed to update pickup location');
    });
  },

  async adminDeletePickupLocation(id: string): Promise<void> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/pickup-locations/${id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      await handleAuthResponse(res, 'Failed to delete pickup location');
    });
  },

  // --- Fast Handover and Return Actions ---
  async adminFastHandover(id: string, data?: { notes?: string; coordinatorName?: string }): Promise<{ success: boolean; booking: Booking }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bookings/${id}/handover`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(data || {}),
      });
      return handleAuthResponse<{ success: boolean; booking: Booking }>(res, 'Failed to process handover');
    });
  },

  async adminFastReturn(id: string, data?: { notes?: string; coordinatorName?: string }): Promise<{ success: boolean; booking: Booking }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bookings/${id}/return`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(data || {}),
      });
      return handleAuthResponse<{ success: boolean; booking: Booking }>(res, 'Failed to process return');
    });
  },

  // --- Communications ---
  async getBookingCommunications(bookingId: string): Promise<CommunicationLog[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bookings/${bookingId}/communications`, {
        headers: getAdminHeaders(),
      });
      return handleAuthResponse<CommunicationLog[]>(res, 'Failed to fetch communications');
    });
  },

  async sendBookingEmail(bookingId: string, customMessage?: string): Promise<{ success: boolean; configured: boolean; message: string; preview: any; log: CommunicationLog }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bookings/${bookingId}/send-email`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ customMessage }),
      });
      return handleAuthResponse(res, 'Failed to send email');
    });
  },

  async sendBookingWhatsApp(bookingId: string, customMessage?: string): Promise<{ success: boolean; configured: boolean; message: string; waLink?: string; preview: any; log: CommunicationLog }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/bookings/${bookingId}/send-whatsapp`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ customMessage }),
      });
      return handleAuthResponse(res, 'Failed to send WhatsApp message');
    });
  },

  // --- Bookings (Strictly authenticated; never fall back to localStorage) ---
  async getBookings(renterId?: string, enrollment?: string): Promise<Booking[]> {
    const isStudentQuery = Boolean(renterId || enrollment);
    return executeAuthNetworkRequest(async () => {
      const params = new URLSearchParams();
      if (renterId) params.set('renterId', renterId);
      if (enrollment) params.set('enrollment', enrollment);

      const queryString = params.toString();
      const res = await fetch(`${API_BASE}/bookings${queryString ? `?${queryString}` : ''}`, {
        headers: getAuthHeaders(!isStudentQuery),
      });
      return handleAuthResponse<Booking[]>(res, 'Failed to fetch bookings');
    });
  },

  async getBookingById(id: string): Promise<Booking> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings/${id}`, {
        headers: getAuthHeaders(false),
      });
      return handleAuthResponse<Booking>(res, 'Booking not found');
    });
  },

  async createBooking(payload: any): Promise<{ success: boolean; booking: Booking; message: string }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: getStudentHeaders(),
        body: JSON.stringify(payload),
      });
      return handleAuthResponse<{
        success: boolean;
        booking: Booking;
        message: string;
      }>(res, 'Booking creation failed');
    });
  },

  async cancelStudentBooking(id: string, reason?: string): Promise<Booking> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings/${id}/cancel`, {
        method: 'POST',
        headers: getStudentHeaders(),
        body: JSON.stringify({ reason }),
      });
      const data = await handleAuthResponse<any>(res, 'Could not cancel booking');
      return data?.booking || data;
    });
  },

  async updateBookingStatus(id: string, updates: Partial<Booking>): Promise<Booking> {
    const isStudentCancelOnly =
      updates.bookingStatus === 'cancelled' && Object.keys(updates).length === 1;
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings/${id}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(!isStudentCancelOnly),
        body: JSON.stringify(updates),
      });
      return handleAuthResponse<Booking>(res, 'Failed to update booking status');
    });
  },

  async recordPickupInspection(id: string, payload: any): Promise<{ success: boolean; booking: Booking }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings/${id}/pickup-inspection`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });
      return handleAuthResponse<{ success: boolean; booking: Booking }>(
        res,
        'Failed to record pickup inspection'
      );
    });
  },

  async recordReturnInspection(id: string, payload: any): Promise<{ success: boolean; booking: Booking }> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/bookings/${id}/return-inspection`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });
      return handleAuthResponse<{ success: boolean; booking: Booking }>(
        res,
        'Failed to record return inspection'
      );
    });
  },

  // --- AI Verification (Requires Authenticated Session) ---
  async verifyDocumentDirect(payload: {
    bookingId?: string;
    renterId?: string;
    documentBase64: string;
    mimeType?: string;
    expectedName: string;
    expectedEnrollment?: string;
    documentCategory: 'aadhar' | 'driving_license' | 'student_id';
    fileName?: string;
    imageWidth?: number;
    imageHeight?: number;
  }): Promise<any> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/verify-document`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify(payload),
      });
      return handleAuthResponse<any>(res, 'Document verification failed');
    });
  },

  async getVerifications(): Promise<DocumentVerification[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/verifications`, { headers: getAdminHeaders() });
      return handleAuthResponse<DocumentVerification[]>(res, 'Failed to fetch verifications');
    });
  },

  async reviewVerification(id: string, result: string, notes?: string): Promise<DocumentVerification> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/verifications/${id}/review`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ result, notes }),
      });
      return handleAuthResponse<DocumentVerification>(res, 'Failed to review verification');
    });
  },

  // --- Admin Metrics & Actions ---
  async getMetrics(): Promise<DashboardMetrics> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/metrics`, { headers: getAdminHeaders() });
      return handleAuthResponse<DashboardMetrics>(res, 'Failed to fetch dashboard metrics');
    });
  },

  async getAdminActions(): Promise<AdminAction[]> {
    return executeAuthNetworkRequest(async () => {
      const res = await fetch(`${API_BASE}/admin/actions`, { headers: getAdminHeaders() });
      return handleAuthResponse<AdminAction[]>(res, 'Failed to fetch admin audit logs');
    });
  },
};
