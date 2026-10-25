import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import {
  app,
  resetBikeImageUploadTestDeps,
  ResolvedStudentSession,
  setBikeImageUploadTestDeps,
} from './app.js';
import { db } from './db.js';
import { MAX_BIKE_IMAGE_BYTES, uploadSingleBikeImageToSupabase } from './supabase.js';

const STUDENT_OWNER_UUID = '11111111-2222-4333-8444-aaaaaaaaaaaa';
const OTHER_STUDENT_UUID = '22222222-3333-4444-8555-bbbbbbbbbbbb';
const ADMIN_UUID = '99999999-8888-4777-8666-cccccccccccc';

const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]).toString('base64')}`;

const VALID_PNG_DATA_URL = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]).toString('base64')}`;

const VALID_WEBP_DATA_URL = `data:image/webp;base64,${Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]).toString('base64')}`;

function createMockStorageClient(options?: {
  shouldFailUpload?: boolean;
  publicUrlScheme?: 'https' | 'http';
  onUpload?: (bucket: string, path: string, buffer: Buffer, uploadOpts: any) => void;
}) {
  return {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, buffer: Buffer, uploadOpts: any) {
            options?.onUpload?.(bucket, path, buffer, uploadOpts);
            if (options?.shouldFailUpload) {
              return { data: null, error: { message: 'Storage bucket bike-images does not exist' } };
            }
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            const scheme = options?.publicUrlScheme ?? 'https';
            return {
              data: {
                publicUrl: `${scheme}://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
        };
      },
    },
  } as any;
}

function makeStudentSession(
  userId: string,
  enrollment: string,
  overrides?: {
    emailVerified?: boolean;
    emailConfirmedAt?: string | null;
    verificationStatus?: 'verified' | 'pending' | 'suspended';
    userClient?: any;
  }
): ResolvedStudentSession {
  const emailConfirmedAt =
    overrides?.emailConfirmedAt !== undefined
      ? overrides.emailConfirmedAt
      : '2026-10-18T10:00:00.000Z';
  const emailVerified = overrides?.emailVerified ?? true;
  const verificationStatus = overrides?.verificationStatus ?? 'verified';
  const userClient = overrides?.userClient ?? createMockStorageClient();

  return {
    auth: {
      accessToken: 'student-jwt-token',
      authUser: { id: userId, email: `${enrollment.toLowerCase()}@student.icfaiuniversity.in` } as any,
      userId,
      email: `${enrollment.toLowerCase()}@student.icfaiuniversity.in`,
      emailConfirmedAt,
      userClient,
    },
    profile: {
      id: userId,
      email: `${enrollment.toLowerCase()}@student.icfaiuniversity.in`,
      full_name: 'Student Test User',
      phone: '+91 98490 12345',
      enrollment_number: enrollment,
      academic_year: '3rd Year',
      course: 'B.Tech',
      created_at: '2026-10-18T10:00:00.000Z',
      updated_at: '2026-10-18T10:00:00.000Z',
    },
    user: {
      id: userId,
      fullName: 'Student Test User',
      phone: '+91 98490 12345',
      email: `${enrollment.toLowerCase()}@student.icfaiuniversity.in`,
      icfaiEnrollmentNumber: enrollment,
      academicYear: '3rd Year',
      course: 'B.Tech',
      ageConfirmation: true,
      drivingLicenseConfirmation: true,
      verificationStatus,
      emailVerified,
      role: 'owner',
      createdAt: '2026-10-18T10:00:00.000Z',
    },
  };
}

async function withTestServer(run: (baseUrl: string) => Promise<void>) {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

afterEach(() => {
  resetBikeImageUploadTestDeps();
});

test('POST /api/bikes/images rejects unauthenticated, unverified-email, and suspended student sessions', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Missing Authorization header -> 401
    const noTokenRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(noTokenRes.status, 401);

    // 2. Unverified email student -> 403
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({ status: 'unauthenticated' }),
      resolveStudent: async () =>
        makeStudentSession(STUDENT_OWNER_UUID, '22BCS084', {
          emailVerified: false,
          emailConfirmedAt: null,
        }),
    });

    const unverifiedRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer student-jwt',
      },
      body: JSON.stringify({ image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(unverifiedRes.status, 403);
    const unverifiedBody = await unverifiedRes.json();
    assert.equal(unverifiedBody.requiresEmailVerification, true);

    // 3. Suspended student -> 403
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({ status: 'unauthenticated' }),
      resolveStudent: async () =>
        makeStudentSession(STUDENT_OWNER_UUID, '22BCS084', {
          verificationStatus: 'suspended',
        }),
    });

    const suspendedRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer student-jwt',
      },
      body: JSON.stringify({ image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(suspendedRes.status, 403);
  });
});

test('POST /api/bikes/images enforces ownership on existing bikes, prevents IDOR, and supports constrained onboarding flow', async () => {
  // Seed bike 'bike-re-hunter-350' belongs to enrollment '22BCS084'
  const targetBikeId = 'bike-re-hunter-350';
  const targetBike = db.getBikeById(targetBikeId);
  assert.ok(targetBike, 'Expected seed bike bike-re-hunter-350 to exist');

  await withTestServer(async (baseUrl) => {
    // 1. Non-owner student (enrollment 23BCS999) attempting to upload to targetBikeId -> 403 Forbidden
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({ status: 'unauthenticated' }),
      resolveStudent: async () => makeStudentSession(OTHER_STUDENT_UUID, '23BCS999'),
    });

    const forbiddenRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer other-student-jwt',
      },
      body: JSON.stringify({ bikeId: targetBikeId, image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(forbiddenRes.status, 403);

    // 2. Nonexistent bikeId -> 404 Not Found
    const notFoundRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer other-student-jwt',
      },
      body: JSON.stringify({ bikeId: 'bike-does-not-exist', image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(notFoundRes.status, 404);

    // 3. Verified owner (enrollment 22BCS084) uploading to their own bike -> 201 Created
    const uploadedPaths: string[] = [];
    const ownerStorageClient = createMockStorageClient({
      onUpload: (_bucket, path, _buf, opts) => {
        uploadedPaths.push(path);
        assert.equal(opts.upsert, false);
      },
    });

    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({ status: 'unauthenticated' }),
      resolveStudent: async () =>
        makeStudentSession(STUDENT_OWNER_UUID, '22BCS084', {
          userClient: ownerStorageClient,
        }),
      uploadSingleBikeImage: uploadSingleBikeImageToSupabase,
    });

    const ownerExistingRes = await fetch(`${baseUrl}/api/bikes/${targetBikeId}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({ image: VALID_WEBP_DATA_URL }),
    });
    assert.equal(ownerExistingRes.status, 201);
    const ownerExistingBody = await ownerExistingRes.json();
    assert.equal(ownerExistingBody.success, true);
    assert.equal(ownerExistingBody.bucket, 'bike-images');
    assert.equal(ownerExistingBody.mimeType, 'image/webp');
    assert.match(
      ownerExistingBody.path,
      new RegExp(`^${STUDENT_OWNER_UUID}/bikes/${targetBikeId}/[0-9a-f-]{36}\\.webp$`)
    );
    assert.match(ownerExistingBody.url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/bike-images\//);

    // 4. Constrained onboarding flow uses <authenticatedUserId>/onboarding/<uuid>.<ext> and rejects bikeId on /api/owner/onboard/images
    const onboardWithBikeIdRes = await fetch(`${baseUrl}/api/owner/onboard/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({ bikeId: targetBikeId, image: VALID_PNG_DATA_URL }),
    });
    assert.equal(onboardWithBikeIdRes.status, 400);

    const onboardRes = await fetch(`${baseUrl}/api/owner/onboard/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({ image: VALID_PNG_DATA_URL }),
    });
    assert.equal(onboardRes.status, 201);
    const onboardBody = await onboardRes.json();
    assert.match(
      onboardBody.path,
      new RegExp(`^${STUDENT_OWNER_UUID}/onboarding/[0-9a-f-]{36}\\.png$`)
    );

    // 5. Rejects client-supplied ownerId, userId, folder, path, bucket, images array, or private documentCategory
    for (const badBody of [
      { image: VALID_JPEG_DATA_URL, ownerId: OTHER_STUDENT_UUID },
      { image: VALID_JPEG_DATA_URL, userId: OTHER_STUDENT_UUID },
      { image: VALID_JPEG_DATA_URL, folder: `${OTHER_STUDENT_UUID}/onboarding` },
      { image: VALID_JPEG_DATA_URL, path: `${OTHER_STUDENT_UUID}/hack.jpg` },
      { image: VALID_JPEG_DATA_URL, bucket: 'private-docs' },
      { images: [VALID_JPEG_DATA_URL] },
      { image: VALID_JPEG_DATA_URL, documentCategory: 'aadhar' },
      { image: VALID_JPEG_DATA_URL, category: 'driving_license' },
      { image: VALID_JPEG_DATA_URL, purpose: 'pickup_inspection' },
    ]) {
      const res = await fetch(`${baseUrl}/api/bikes/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer owner-jwt',
        },
        body: JSON.stringify(badBody),
      });
      assert.equal(res.status, 400);
    }
  });
});

test('POST /api/bikes/images allows authorized admin and handles invalid binary/MIME, oversized images, malformed JSON, and Storage failures', async () => {
  await withTestServer(async (baseUrl) => {
    const adminStorageClient = createMockStorageClient();
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({
        status: 'authorized',
        auth: {
          accessToken: 'admin-jwt',
          authUser: { id: ADMIN_UUID, email: 'admin@icfai.in' } as any,
          userId: ADMIN_UUID,
          email: 'admin@icfai.in',
          emailConfirmedAt: '2026-10-18T10:00:00.000Z',
          userClient: adminStorageClient,
        },
      }),
      uploadSingleBikeImage: uploadSingleBikeImageToSupabase,
    });

    // 1. Admin can upload to any existing bike listing
    const adminRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: JSON.stringify({
        bikeId: 'bike-ktm-duke-200',
        image: VALID_JPEG_DATA_URL,
      }),
    });
    assert.equal(adminRes.status, 201);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.mimeType, 'image/jpeg');

    // 2. Spoofed MIME (SVG disguised as image/jpeg) -> 400
    const spoofedSvg = `data:image/jpeg;base64,${Buffer.from('<svg></svg>').toString('base64')}`;
    const spoofedRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: JSON.stringify({ image: spoofedSvg }),
    });
    assert.equal(spoofedRes.status, 400);

    // 3. Oversized (>5 MB) decoded image -> 400
    const oversizedBuf = Buffer.alloc(MAX_BIKE_IMAGE_BYTES + 16, 0);
    oversizedBuf[0] = 0xff;
    oversizedBuf[1] = 0xd8;
    oversizedBuf[2] = 0xff;
    const oversizedRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: JSON.stringify({
        image: `data:image/jpeg;base64,${oversizedBuf.toString('base64')}`,
      }),
    });
    assert.equal(oversizedRes.status, 400);

    // 4. Malformed JSON body -> 400 controlled JSON error
    const malformedJsonRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: '{"image": "unterminated',
    });
    assert.equal(malformedJsonRes.status, 400);
    const malformedJsonBody = await malformedJsonRes.json();
    assert.match(malformedJsonBody.error, /Malformed JSON/);

    // 5. Mocked Storage upload failure -> 502 Bad Gateway
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({
        status: 'authorized',
        auth: {
          accessToken: 'admin-jwt',
          authUser: { id: ADMIN_UUID, email: 'admin@icfai.in' } as any,
          userId: ADMIN_UUID,
          email: 'admin@icfai.in',
          emailConfirmedAt: '2026-10-18T10:00:00.000Z',
          userClient: createMockStorageClient({ shouldFailUpload: true }),
        },
      }),
      uploadSingleBikeImage: uploadSingleBikeImageToSupabase,
    });

    const storageFailRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: JSON.stringify({ image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(storageFailRes.status, 502);

    // 6. Mocked Storage returning non-HTTPS URL -> 502 Bad Gateway
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({
        status: 'authorized',
        auth: {
          accessToken: 'admin-jwt',
          authUser: { id: ADMIN_UUID, email: 'admin@icfai.in' } as any,
          userId: ADMIN_UUID,
          email: 'admin@icfai.in',
          emailConfirmedAt: '2026-10-18T10:00:00.000Z',
          userClient: createMockStorageClient({ publicUrlScheme: 'http' }),
        },
      }),
      uploadSingleBikeImage: uploadSingleBikeImageToSupabase,
    });

    const badUrlRes = await fetch(`${baseUrl}/api/bikes/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-jwt',
      },
      body: JSON.stringify({ image: VALID_JPEG_DATA_URL }),
    });
    assert.equal(badUrlRes.status, 502);
  });
});

test('Bike listing write routes enforce max 6 images, reject base64 data URLs, and preserve valid HTTPS URLs', async () => {
  await withTestServer(async (baseUrl) => {
    setBikeImageUploadTestDeps({
      verifyAdmin: async () => ({ status: 'unauthenticated' }),
      resolveStudent: async () => makeStudentSession(STUDENT_OWNER_UUID, '22BCS084'),
    });

    // 1. PUT /api/owner/bikes/:id rejects base64 data URLs
    const base64UpdateRes = await fetch(`${baseUrl}/api/owner/bikes/bike-re-hunter-350`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({ images: [VALID_JPEG_DATA_URL] }),
    });
    assert.equal(base64UpdateRes.status, 400);

    // 2. PUT /api/owner/bikes/:id rejects >6 images
    const sevenHttpsUrls = Array.from(
      { length: 7 },
      (_, i) => `https://images.unsplash.com/photo-${i + 1}?auto=format`
    );
    const tooManyRes = await fetch(`${baseUrl}/api/owner/bikes/bike-re-hunter-350`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({ images: sevenHttpsUrls }),
    });
    assert.equal(tooManyRes.status, 400);

    // 3. POST /api/owner/onboard rejects base64 data URLs and >6 images
    const onboardBase64Res = await fetch(`${baseUrl}/api/owner/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner-jwt',
      },
      body: JSON.stringify({
        brand: 'Yamaha',
        model: 'MT-15',
        registrationNumber: 'TS 08 AB 1234',
        pricePerDay: 550,
        images: [VALID_PNG_DATA_URL],
      }),
    });
    assert.equal(onboardBase64Res.status, 400);
  });
});
