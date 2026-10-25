import test from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  MAX_BIKE_IMAGES_PER_LISTING,
  MAX_BIKE_IMAGE_BYTES,
  ONBOARDING_DRAFT_SESSION_KEY,
  OnboardingPhotoDraftStorageAdapter,
  isHttpsBikeImageUrl,
  isPendingLocalDraftImage,
  validateSelectedBikeImageFile,
  validateCustomBikeImageUrl,
  assertHttpsBikeImageList,
  uploadPendingDraftBikeImages,
  saveOnboardingDraftPhotos,
  saveOnboardingListingDraft,
  loadOnboardingListingDraft,
  clearOnboardingListingDraft,
  runSequentialPhotoBatch,
} from './api';

const SAMPLE_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function createMockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, val: string): void {
      store.set(key, String(val));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}

test('api.uploadBikeImage selects student vs admin authorization headers and routes correctly', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  const mockStorage = createMockLocalStorage({
    rp_student_token: 'student-jwt-token-123',
    rp_admin_token: 'admin-jwt-token-456',
  });
  (globalThis as any).localStorage = mockStorage;

  const capturedRequests: Array<{
    url: string;
    headers: Record<string, string>;
    body: any;
  }> = [];

  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    capturedRequests.push({
      url: String(url),
      headers: (init?.headers || {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(
      JSON.stringify({
        success: true,
        url: 'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo.jpg',
        publicUrl:
          'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo.jpg',
        bucket: 'bike-images',
        path: 'u1/onboarding/photo.jpg',
        mimeType: 'image/jpeg',
        byteLength: 160,
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }
    );
  };

  try {
    // 1. Student onboarding upload
    const studentOnboardRes = await api.uploadBikeImage(
      {
        image: SAMPLE_JPEG_DATA_URL,
        mimeType: 'image/jpeg',
        purpose: 'onboarding',
      },
      { authRole: 'student' }
    );
    assert.equal(
      studentOnboardRes.publicUrl,
      'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo.jpg'
    );
    assert.equal(capturedRequests[0].url, '/api/owner/onboard/images');
    assert.equal(
      capturedRequests[0].headers.Authorization,
      'Bearer student-jwt-token-123'
    );
    assert.equal(capturedRequests[0].body.purpose, 'onboarding');

    // 2. Student existing bike upload
    await api.uploadBikeImage(
      {
        image: SAMPLE_JPEG_DATA_URL,
        mimeType: 'image/jpeg',
        bikeId: 'bike-101',
      },
      { authRole: 'student' }
    );
    assert.equal(capturedRequests[1].url, '/api/owner/bikes/bike-101/images');
    assert.equal(
      capturedRequests[1].headers.Authorization,
      'Bearer student-jwt-token-123'
    );
    assert.equal(capturedRequests[1].body.bikeId, 'bike-101');

    // 3. Admin existing bike upload
    await api.uploadBikeImage(
      {
        image: SAMPLE_JPEG_DATA_URL,
        mimeType: 'image/jpeg',
        bikeId: 'bike-202',
      },
      { authRole: 'admin' }
    );
    assert.equal(capturedRequests[2].url, '/api/bikes/bike-202/images');
    assert.equal(
      capturedRequests[2].headers.Authorization,
      'Bearer admin-jwt-token-456'
    );
    assert.equal(capturedRequests[2].body.bikeId, 'bike-202');

    // 4. Admin new fleet bike upload (no bikeId yet)
    await api.uploadBikeImage(
      {
        image: SAMPLE_JPEG_DATA_URL,
        mimeType: 'image/jpeg',
      },
      { authRole: 'admin' }
    );
    assert.equal(capturedRequests[3].url, '/api/bikes/images');
    assert.equal(
      capturedRequests[3].headers.Authorization,
      'Bearer admin-jwt-token-456'
    );
    assert.equal(capturedRequests[3].body.purpose, 'onboarding');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test('failed upload does not persist base64 and bike create/update/onboarding APIs reject base64 image payloads', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = createMockLocalStorage({
    rp_student_token: 'student-jwt-token',
    rp_admin_token: 'admin-jwt-token',
  });

  let fetchCount = 0;
  (globalThis as any).fetch = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({ error: 'Supabase Storage upload failed: Bucket not found' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }
    );
  };

  try {
    await assert.rejects(
      () =>
        api.uploadBikeImage(
          { image: SAMPLE_JPEG_DATA_URL, mimeType: 'image/jpeg' },
          { authRole: 'student' }
        ),
      /Supabase Storage upload failed/
    );
    assert.equal(fetchCount, 1);

    // Ensure bike write methods reject base64 before making any network call
    await assert.rejects(
      () =>
        api.submitOwnerOnboarding({
          brand: 'Royal Enfield',
          model: 'Hunter 350',
          images: [SAMPLE_JPEG_DATA_URL],
        }),
      /local base64 image/
    );
    await assert.rejects(
      () =>
        api.updateOwnerBike('bike-1', {
          images: [
            'https://images.unsplash.com/photo-1558981806-ec527fa84c39',
            SAMPLE_JPEG_DATA_URL,
          ],
        }),
      /local base64 image/
    );
    await assert.rejects(
      () =>
        api.createBike({
          brand: 'Yamaha',
          model: 'MT-15',
          images: [SAMPLE_JPEG_DATA_URL],
        }),
      /local base64 image/
    );
    await assert.rejects(
      () =>
        api.updateBike('bike-1', {
          images: [SAMPLE_JPEG_DATA_URL],
        }),
      /local base64 image/
    );
    // None of the 4 rejected calls should have invoked fetch
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test('logged-out onboarding draft images are preserved locally and uploaded sequentially after authentication', async () => {
  const existingCoverHttps =
    'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/cover.jpg';
  const draftPhoto2 = SAMPLE_JPEG_DATA_URL;
  const draftPhoto3 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const initialDraftGallery = [existingCoverHttps, draftPhoto2, draftPhoto3];
  assert.equal(isHttpsBikeImageUrl(initialDraftGallery[0]), true);
  assert.equal(isPendingLocalDraftImage(initialDraftGallery[1]), true);
  assert.equal(isPendingLocalDraftImage(initialDraftGallery[2]), true);

  // Case 1: Second draft photo fails upload -> already-uploaded photo and existing cover are preserved
  let callIndex = 0;
  const partialFailureResult = await uploadPendingDraftBikeImages(
    initialDraftGallery,
    async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return 'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo-2.jpg';
      }
      throw new Error('Temporary network interruption during photo 3 upload');
    }
  );

  assert.equal(partialFailureResult.failedIndex, 2);
  assert.match(
    partialFailureResult.error || '',
    /Temporary network interruption/
  );
  // Cover photo (idx 0) and newly uploaded photo 2 (idx 1) are HTTPS; idx 2 remains pending for retry
  assert.equal(partialFailureResult.uploadedImages[0], existingCoverHttps);
  assert.equal(
    partialFailureResult.uploadedImages[1],
    'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo-2.jpg'
  );
  assert.equal(partialFailureResult.uploadedImages[2], draftPhoto3);

  // Case 2: Retry uploads only the remaining pending local draft image and preserves order
  const retryResult = await uploadPendingDraftBikeImages(
    partialFailureResult.uploadedImages,
    async () =>
      'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo-3.png'
  );

  assert.equal(retryResult.error, undefined);
  assert.deepEqual(retryResult.uploadedImages, [
    existingCoverHttps,
    'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo-3.png'.replace(
      'photo-3.png',
      'photo-2.jpg'
    ),
    'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/photo-3.png',
  ]);
  assert.deepEqual(
    assertHttpsBikeImageList(retryResult.uploadedImages),
    retryResult.uploadedImages
  );
});

test('validateCustomBikeImageUrl and validateSelectedBikeImageFile enforce HTTPS, 6-image limit, MIME types, and 5 MB limit', () => {
  const validUrl = validateCustomBikeImageUrl(
    '  https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200  ',
    2
  );
  assert.equal(
    validUrl,
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200'
  );

  // Reject http://
  assert.throws(
    () =>
      validateCustomBikeImageUrl(
        'http://images.unsplash.com/photo-1558981806-ec527fa84c39',
        0
      ),
    /valid https:\/\/ URL/
  );

  // Reject base64 data URLs in custom URL input
  assert.throws(
    () => validateCustomBikeImageUrl(SAMPLE_JPEG_DATA_URL, 0),
    /Base64 data URLs are not allowed/
  );

  // Reject when 6 images are already present
  assert.throws(
    () =>
      validateCustomBikeImageUrl(
        'https://images.unsplash.com/photo-1558981806-ec527fa84c39',
        MAX_BIKE_IMAGES_PER_LISTING
      ),
    /at most 6 photos/
  );

  // File validation: accept JPEG, PNG, WEBP <= 5 MB
  assert.equal(
    validateSelectedBikeImageFile({
      name: 'hunter.jpg',
      type: 'image/jpeg',
      size: 1024 * 1024,
    }),
    'image/jpeg'
  );
  assert.equal(
    validateSelectedBikeImageFile({
      name: 'activa.webp',
      type: 'image/webp',
      size: MAX_BIKE_IMAGE_BYTES,
    }),
    'image/webp'
  );

  // Reject > 5 MB
  assert.throws(
    () =>
      validateSelectedBikeImageFile({
        name: 'huge.png',
        type: 'image/png',
        size: MAX_BIKE_IMAGE_BYTES + 1,
      }),
    /exceeds the 5 MB maximum file size limit/
  );

  // Reject unsupported MIME type (e.g. SVG / PDF)
  assert.throws(
    () =>
      validateSelectedBikeImageFile({
        name: 'vector.svg',
        type: 'image/svg+xml',
        size: 2048,
      }),
    /Unsupported image format/
  );
});

test('api.getOwnerBikes and api.updateOwnerBike strictly use student token and never fall back to admin token', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  // Simulate admin logged in while student is NOT logged in
  const mockStorage = createMockLocalStorage({
    rp_admin_token: 'admin-jwt-only-999',
  });
  (globalThis as any).localStorage = mockStorage;

  const capturedHeaders: Array<{ url: string; authHeader?: string }> = [];
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const headersObj = (init?.headers || {}) as Record<string, string>;
    capturedHeaders.push({
      url: String(url),
      authHeader: headersObj.Authorization,
    });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await api.getOwnerBikes('23FMUCHH010412');
    assert.equal(capturedHeaders[0].url, '/api/owner/bikes?enrollment=23FMUCHH010412');
    // Must NOT send the admin token when rp_student_token is absent
    assert.equal(capturedHeaders[0].authHeader, undefined);

    await api.updateOwnerBike('bike-101', {
      pricePerDay: 500,
      images: ['https://example.supabase.co/storage/v1/object/public/bike-images/u1/bike-101/p1.jpg'],
    });
    assert.equal(capturedHeaders[1].url, '/api/owner/bikes/bike-101');
    assert.equal(capturedHeaders[1].authHeader, undefined);

    // Now set student token alongside admin token and verify student token is sent
    mockStorage.setItem('rp_student_token', 'student-jwt-verified-777');
    await api.getOwnerBikes('23FMUCHH010412');
    assert.equal(capturedHeaders[2].authHeader, 'Bearer student-jwt-verified-777');

    await api.updateOwnerBike('bike-101', { pricePerDay: 520 });
    assert.equal(capturedHeaders[3].authHeader, 'Bearer student-jwt-verified-777');

    // Genuine admin route still uses rp_admin_token
    await api.getOwnerSubmissions();
    assert.equal(capturedHeaders[4].url, '/api/owner/submissions');
    assert.equal(capturedHeaders[4].authHeader, 'Bearer admin-jwt-only-999');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test('onboarding draft persistence stores photos via IndexedDB adapter, preserves legacy sessionStorage compatibility, and surfaces storage errors', async () => {
  const mockSessionStore = createMockLocalStorage();
  let idbStoredImages: string[] | null = null;
  let simulateQuotaFailure = false;

  const mockPhotoStorage: OnboardingPhotoDraftStorageAdapter = {
    async saveImages(images: string[]) {
      if (simulateQuotaFailure) {
        throw new Error('QuotaExceededError: IndexedDB disk limit reached');
      }
      idbStoredImages = [...images];
    },
    async loadImages() {
      return idbStoredImages ? [...idbStoredImages] : null;
    },
    async clearImages() {
      idbStoredImages = null;
    },
  };

  const photo1 = SAMPLE_JPEG_DATA_URL;
  const photo2 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const photo3 =
    'https://example.supabase.co/storage/v1/object/public/bike-images/u1/onboarding/existing.jpg';

  // 1. Save draft form + photos: form goes to sessionStorage (without bulky base64), photos go to IndexedDB in exact order
  await saveOnboardingListingDraft(
    {
      brand: 'Royal Enfield',
      model: 'Hunter 350',
      pricePerDay: 550,
    },
    [photo1, photo2, photo3],
    {
      sessionStore: mockSessionStore,
      photoStorage: mockPhotoStorage,
    }
  );

  const rawSessionDraft = JSON.parse(
    mockSessionStore.getItem(ONBOARDING_DRAFT_SESSION_KEY) || '{}'
  );
  assert.equal(rawSessionDraft.brand, 'Royal Enfield');
  assert.equal(rawSessionDraft.model, 'Hunter 350');
  assert.equal(rawSessionDraft.images, undefined);
  assert.deepEqual(idbStoredImages, [photo1, photo2, photo3]);

  const loaded = await loadOnboardingListingDraft({
    sessionStore: mockSessionStore,
    photoStorage: mockPhotoStorage,
  });
  assert.equal(loaded.draft?.model, 'Hunter 350');
  assert.deepEqual(loaded.images, [photo1, photo2, photo3]);

  // 2. Rejects > 6 photos
  await assert.rejects(
    () =>
      saveOnboardingDraftPhotos(
        new Array(MAX_BIKE_IMAGES_PER_LISTING + 1).fill(photo1),
        { photoStorage: mockPhotoStorage }
      ),
    /at most 6 photos/
  );

  // 3. When persistence fails, throws a clear error and never silently drops photos
  simulateQuotaFailure = true;
  await assert.rejects(
    () =>
      saveOnboardingListingDraft(
        { brand: 'KTM', model: 'Duke 250' },
        [photo1],
        {
          sessionStore: mockSessionStore,
          photoStorage: mockPhotoStorage,
        }
      ),
    /Unable to save draft photo\(s\) in browser storage/
  );
  simulateQuotaFailure = false;

  // 4. Clear draft cleans both sessionStorage and IndexedDB
  await clearOnboardingListingDraft({
    sessionStore: mockSessionStore,
    photoStorage: mockPhotoStorage,
  });
  assert.equal(mockSessionStore.getItem(ONBOARDING_DRAFT_SESSION_KEY), null);
  assert.equal(idbStoredImages, null);

  // 5. Backward compatibility: legacy sessionStorage draft with embedded images array is restored and migrated
  mockSessionStore.setItem(
    ONBOARDING_DRAFT_SESSION_KEY,
    JSON.stringify({
      brand: 'Yamaha',
      model: 'MT-15',
      images: [photo2, photo1],
    })
  );
  const migrated = await loadOnboardingListingDraft({
    sessionStore: mockSessionStore,
    photoStorage: mockPhotoStorage,
  });
  assert.equal(migrated.draft?.brand, 'Yamaha');
  assert.deepEqual(migrated.images, [photo2, photo1]);
  assert.deepEqual(idbStoredImages, [photo2, photo1]);
});

test('runSequentialPhotoBatch keeps uploadingPhotos true across the entire multi-file upload batch', async () => {
  const stateTransitions: boolean[] = [];
  let currentUploadingState = false;
  const uploadingStateDuringEachFile: boolean[] = [];

  const setUploadingPhotos = (next: boolean) => {
    currentUploadingState = next;
    stateTransitions.push(next);
  };

  const batchResult = await runSequentialPhotoBatch(
    ['file-1.jpg', 'file-2.png', 'file-3.webp'],
    setUploadingPhotos,
    async () => {
      uploadingStateDuringEachFile.push(currentUploadingState);
      return true;
    }
  );

  assert.equal(batchResult.completedCount, 3);
  assert.equal(batchResult.abortedAtIndex, undefined);
  assert.deepEqual(uploadingStateDuringEachFile, [true, true, true]);
  // Toggled true once at batch start and false once at batch end (never flickered false mid-batch)
  assert.deepEqual(stateTransitions, [true, false]);
  assert.equal(currentUploadingState, false);

  // Also verify early abort on failure still keeps uploadingPhotos true until batch exits and resets to false at end
  const failureTransitions: boolean[] = [];
  const abortResult = await runSequentialPhotoBatch(
    ['file-a.jpg', 'file-b.jpg', 'file-c.jpg'],
    (next) => {
      currentUploadingState = next;
      failureTransitions.push(next);
    },
    async (_item, index) => index === 0
  );

  assert.equal(abortResult.completedCount, 1);
  assert.equal(abortResult.abortedAtIndex, 1);
  assert.deepEqual(failureTransitions, [true, false]);
  assert.equal(currentUploadingState, false);
});

