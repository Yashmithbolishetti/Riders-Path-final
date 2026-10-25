import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIKE_IMAGES_BUCKET,
  buildBikeImageStoragePath,
  DbBikeRow,
  detectBikeImageBinarySignature,
   mapAppAvailabilityToDb,
  mapAppBikeToDbBike,
  mapDbAvailabilityToApp,
  mapDbBikeToAppBike,
  MAX_BIKE_IMAGE_BYTES,
  MAX_BIKE_IMAGES_PER_LISTING,
  parseAndValidateBase64BikeImage,
  uploadSingleBikeImageToSupabase,
  validateBikeImageUrls,
} from './supabase.js';
import type { Bike } from '../src/types.js';

const BASE_DB_ROW: DbBikeRow = {
  id: '11111111-2222-4333-8444-555555555555',
  owner_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  brand: 'Royal Enfield',
  model: 'Hunter 350',
  registration_number: 'TS 08 FG 4821',
  display_registration_to_public: false,
  bike_type: 'Cruiser',
  fuel_type: 'Petrol',
  transmission: 'Manual',
  manufacture_year: 2024,
  description: 'Well-maintained campus cruiser.',
  image_urls: [
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
  ],
  hourly_price: 55,
  daily_price: 550,
  deposit_amount: 1000,
  approval_status: 'APPROVED',
  approval_notes: 'Verified by campus fleet admin.',
  availability_status: 'AVAILABLE',
  is_active: true,
  pickup_location_id: '99999999-8888-4777-8666-555555555555',
  specs: {
    cc: 349,
    mileage: '36 km/l',
    topSpeed: '114 km/h',
    fuelCapacity: '13 L',
    weight: '181 kg',
    abs: true,
    helmetsIncluded: 1,
  },
  created_at: '2026-10-18T10:00:00.000Z',
  updated_at: '2026-10-18T10:00:00.000Z',
  owner: {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Rohan Sharma',
    email: 'rohan@student.icfaiuniversity.in',
    phone: '+91 98765 43210',
    enrollment_number: '23bcs108',
    academic_year: '3rd Year',
    course: 'B.Tech',
  },
  pickup_location: {
    id: '99999999-8888-4777-8666-555555555555',
    name: 'ICFAI Main Gate',
    address: 'Shankarpally Rd',
    is_active: true,
    sort_order: 1,
  },
};

const BASE_APP_BIKE: Omit<Bike, 'id' | 'createdAt'> = {
  ownerId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  ownerName: 'Rohan Sharma',
  ownerPhone: '+91 98765 43210',
  ownerEnrollment: '23BCS108',
  ownerAcademicYear: '3rd Year',
  ownerCourse: 'B.Tech',
  brand: 'Royal Enfield',
  model: 'Hunter 350',
  year: 2024,
  registrationNumber: 'TS 08 FG 4821',
  displayRegistrationToPublic: false,
  bikeType: 'Cruiser',
  fuelType: 'Petrol',
  transmission: 'Manual',
  description: 'Well-maintained campus cruiser.',
  images: [
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
  ],
  pricePerDay: 550,
  pricePerHour: 55,
  securityDeposit: 1000,
  availabilityStatus: 'AVAILABLE',
  approvalStatus: 'APPROVED',
  approvalNotes: 'Verified by campus fleet admin.',
  active: true,
  specs: {
    cc: 349,
    mileage: '36 km/l',
    abs: true,
    helmetsIncluded: 1,
  },
  pickupHub: 'ICFAI Main Gate',
  pickupLocationId: '99999999-8888-4777-8666-555555555555',
  approvedByAdmin: true,
};

test('Status mapping: Supabase RENTED maps to application RESERVED and preserves AVAILABLE, UNAVAILABLE, MAINTENANCE', () => {
  assert.equal(mapDbAvailabilityToApp('RENTED'), 'RESERVED');
  assert.equal(mapDbAvailabilityToApp('AVAILABLE'), 'AVAILABLE');
  assert.equal(mapDbAvailabilityToApp('UNAVAILABLE'), 'UNAVAILABLE');
  assert.equal(mapDbAvailabilityToApp('MAINTENANCE'), 'MAINTENANCE');

  const rentedBike = mapDbBikeToAppBike({
    ...BASE_DB_ROW,
    availability_status: 'RENTED',
  });
  assert.equal(rentedBike.availabilityStatus, 'RESERVED');

  for (const status of ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'] as const) {
    const mapped = mapDbBikeToAppBike({
      ...BASE_DB_ROW,
      availability_status: status,
    });
    assert.equal(mapped.availabilityStatus, status);
  }
});

test('Status mapping: Application RESERVED maps to Supabase RENTED and preserves AVAILABLE, UNAVAILABLE, MAINTENANCE', () => {
  assert.equal(mapAppAvailabilityToDb('RESERVED'), 'RENTED');
  assert.equal(mapAppAvailabilityToDb('AVAILABLE'), 'AVAILABLE');
  assert.equal(mapAppAvailabilityToDb('UNAVAILABLE'), 'UNAVAILABLE');
  assert.equal(mapAppAvailabilityToDb('MAINTENANCE'), 'MAINTENANCE');

  const reservedPayload = mapAppBikeToDbBike({
    ...BASE_APP_BIKE,
    availabilityStatus: 'RESERVED',
  });
  assert.equal(reservedPayload.availability_status, 'RENTED');

  for (const status of ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'] as const) {
    const payload = mapAppBikeToDbBike({
      ...BASE_APP_BIKE,
      availabilityStatus: status,
    });
    assert.equal(payload.availability_status, status);
  }
});

test('Unknown statuses are explicitly rejected in both mapping directions', () => {
  // Invalid DB availability statuses (including unmapped app status 'RESERVED')
  for (const invalidDbStatus of ['RESERVED', 'ACTIVE_RENTAL', 'BOOKED', 'available', '', null, undefined]) {
    assert.throws(
      () => mapDbAvailabilityToApp(invalidDbStatus),
      /Invalid Supabase bike availability_status/
    );
    assert.throws(
      () =>
        mapDbBikeToAppBike({
          ...BASE_DB_ROW,
          availability_status: invalidDbStatus as any,
        }),
      /Invalid Supabase bike availability_status/
    );
  }

  // Invalid App availability statuses (including unmapped DB status 'RENTED')
  for (const invalidAppStatus of ['RENTED', 'ACTIVE_RENTAL', 'DEACTIVATED', 'available', '', null, undefined]) {
    assert.throws(
      () => mapAppAvailabilityToDb(invalidAppStatus),
      /Invalid application bike availabilityStatus/
    );
    assert.throws(
      () =>
        mapAppBikeToDbBike({
          ...BASE_APP_BIKE,
          availabilityStatus: invalidAppStatus as any,
        }),
      /Invalid application bike availabilityStatus/
    );
  }

  // Invalid approval statuses
  assert.throws(
    () =>
      mapDbBikeToAppBike({
        ...BASE_DB_ROW,
        approval_status: 'UNKNOWN_APPROVAL',
      }),
    /Invalid bike approval_status/
  );

  assert.throws(
    () =>
      mapAppBikeToDbBike({
        ...BASE_APP_BIKE,
        approvalStatus: 'AUTO_APPROVED' as any,
      }),
    /Invalid bike approvalStatus/
  );
});

test('Nullable relationships: mapDbBikeToAppBike succeeds when owner and pickup_location are null or absent without inventing private fields', () => {
  const rowWithoutRelations: DbBikeRow = {
    ...BASE_DB_ROW,
    pickup_location_id: null,
    owner: null,
    pickup_location: null,
  };

  const mapped = mapDbBikeToAppBike(rowWithoutRelations);

  // Preserves authoritative owner_id for authorization checks
  assert.equal(mapped.ownerId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

  // Does not invent ownerName, ownerPhone, ownerEnrollment, or pickupLocationId
  assert.equal(mapped.ownerName, '');
  assert.equal(mapped.ownerPhone, '');
  assert.equal(mapped.ownerEnrollment, '');
  assert.equal(mapped.ownerAcademicYear, undefined);
  assert.equal(mapped.ownerCourse, undefined);
  assert.equal(mapped.pickupHub, '');
  assert.equal(mapped.pickupLocationId, undefined);

  // Also test when owner and pickup_location properties are completely omitted
  const { owner: _o, pickup_location: _p, ...rowWithOmittedRelations } = rowWithoutRelations;
  const mappedOmitted = mapDbBikeToAppBike(rowWithOmittedRelations);
  assert.equal(mappedOmitted.ownerId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(mappedOmitted.ownerPhone, '');
  assert.equal(mappedOmitted.ownerEnrollment, '');
  assert.equal(mappedOmitted.pickupLocationId, undefined);
});

test('Nullable relationships: partial owner profile and unjoined pickup_location_id are handled safely', () => {
  const mappedPartialOwner = mapDbBikeToAppBike({
    ...BASE_DB_ROW,
    owner: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      full_name: 'Public Host Name',
      email: null,
      phone: null,
      enrollment_number: null,
      academic_year: null,
      course: null,
    },
    pickup_location: null,
  });

  assert.equal(mappedPartialOwner.ownerId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(mappedPartialOwner.ownerName, 'Public Host Name');
  assert.equal(mappedPartialOwner.ownerPhone, '');
  assert.equal(mappedPartialOwner.ownerEnrollment, '');
  assert.equal(mappedPartialOwner.pickupHub, '');
  assert.equal(mappedPartialOwner.pickupLocationId, '99999999-8888-4777-8666-555555555555');

  // Authorized owner/admin path with full joined relations populates all owner & hub fields
  const mappedFull = mapDbBikeToAppBike(BASE_DB_ROW);
  assert.equal(mappedFull.ownerId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(mappedFull.ownerName, 'Rohan Sharma');
  assert.equal(mappedFull.ownerPhone, '+91 98765 43210');
  assert.equal(mappedFull.ownerEnrollment, '23BCS108');
  assert.equal(mappedFull.ownerAcademicYear, '3rd Year');
  assert.equal(mappedFull.ownerCourse, 'B.Tech');
  assert.equal(mappedFull.pickupHub, 'ICFAI Main Gate');
  assert.equal(mappedFull.pickupLocationId, '99999999-8888-4777-8666-555555555555');
});

test('Image mapping: rejects base64 data URLs, non-HTTPS URLs, and >6 images while preserving up to 6 valid HTTPS URLs', () => {
  const sampleBase64Jpeg =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const sampleBase64Png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Rejects base64 in mapAppBikeToDbBike (both published and draft)
  assert.throws(
    () =>
      mapAppBikeToDbBike({
        ...BASE_APP_BIKE,
        images: [sampleBase64Jpeg],
      }),
    /base64 data URLs are not allowed in Supabase image_urls/
  );

  assert.throws(
    () =>
      mapAppBikeToDbBike(
        {
          ...BASE_APP_BIKE,
          images: [sampleBase64Png],
        },
        { isDraft: true }
      ),
    /base64 data URLs are not allowed in Supabase image_urls/
  );

  // Rejects base64 in mapDbBikeToAppBike
  assert.throws(
    () =>
      mapDbBikeToAppBike({
        ...BASE_DB_ROW,
        image_urls: [sampleBase64Jpeg],
      }),
    /base64 data URLs are not allowed in Supabase image_urls/
  );

  // Rejects insecure http:// or blob: URLs
  assert.throws(
    () => validateBikeImageUrls(['http://example.com/bike.jpg']),
    /Only HTTPS image URLs are allowed/
  );
  assert.throws(
    () => validateBikeImageUrls(['blob:https://example.com/1234']),
    /Only HTTPS image URLs are allowed/
  );

  // Enforces maximum of 6 images per listing
  const sixUrls = Array.from(
    { length: MAX_BIKE_IMAGES_PER_LISTING },
    (_, i) => `https://images.unsplash.com/photo-${i + 1}?auto=format`
  );
  assert.equal(validateBikeImageUrls(sixUrls).length, 6);

  const sevenUrls = [...sixUrls, 'https://images.unsplash.com/photo-7?auto=format'];
  assert.throws(
    () => validateBikeImageUrls(sevenUrls),
    /a maximum of 6 images is allowed per listing/
  );
  assert.throws(
    () =>
      mapAppBikeToDbBike({
        ...BASE_APP_BIKE,
        images: sevenUrls,
      }),
    /a maximum of 6 images is allowed per listing/
  );

  // Preserves valid HTTPS URLs (Supabase Storage & external HTTPS)
  const validUrls = [
    'https://xyzcompany.supabase.co/storage/v1/object/public/bike-images/owners/aaaa/bike-1.webp',
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
  ];
  const dbPayload = mapAppBikeToDbBike({
    ...BASE_APP_BIKE,
    images: validUrls,
  });
  assert.deepEqual(dbPayload.image_urls, validUrls);

  const appBike = mapDbBikeToAppBike({
    ...BASE_DB_ROW,
    image_urls: validUrls,
  });
  assert.deepEqual(appBike.images, validUrls);
});

test('Binary image parsing: accepts valid JPEG, PNG, and WebP signatures and rejects spoofed MIME types, malformed base64, empty, and >5MB images', () => {
  const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const validPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const validWebpBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // chunk size
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 "
  ]);

  const jpegDataUrl = `data:image/jpeg;base64,${validJpegBytes.toString('base64')}`;
  const jpgAliasDataUrl = `data:image/jpg;base64,${validJpegBytes.toString('base64')}`;
  const pngDataUrl = `data:image/png;base64,${validPngBytes.toString('base64')}`;
  const webpDataUrl = `data:image/webp;base64,${validWebpBytes.toString('base64')}`;

  const parsedJpeg = parseAndValidateBase64BikeImage(jpegDataUrl);
  assert.equal(parsedJpeg.mimeType, 'image/jpeg');
  assert.equal(parsedJpeg.extension, 'jpg');
  assert.equal(parsedJpeg.byteLength, validJpegBytes.length);

  const parsedJpgAlias = parseAndValidateBase64BikeImage(jpgAliasDataUrl, 'image/jpg');
  assert.equal(parsedJpgAlias.mimeType, 'image/jpeg');
  assert.equal(parsedJpgAlias.extension, 'jpg');

  const parsedPng = parseAndValidateBase64BikeImage(pngDataUrl);
  assert.equal(parsedPng.mimeType, 'image/png');
  assert.equal(parsedPng.extension, 'png');
  assert.equal(parsedPng.byteLength, validPngBytes.length);

  const parsedWebp = parseAndValidateBase64BikeImage(webpDataUrl);
  assert.equal(parsedWebp.mimeType, 'image/webp');
  assert.equal(parsedWebp.extension, 'webp');
  assert.equal(parsedWebp.byteLength, validWebpBytes.length);

  // Rejects SVG / HTML spoofed as image/jpeg
  const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(detectBikeImageBinarySignature(svgPayload), null);
  assert.throws(
    () => parseAndValidateBase64BikeImage(`data:image/jpeg;base64,${svgPayload.toString('base64')}`),
    /Invalid bike image binary signature/
  );

  // Rejects PNG bytes spoofed with a JPEG MIME header
  assert.throws(
    () => parseAndValidateBase64BikeImage(`data:image/jpeg;base64,${validPngBytes.toString('base64')}`),
    /MIME type mismatch/
  );

  // Rejects caller declaredMimeType mismatching header
  assert.throws(
    () => parseAndValidateBase64BikeImage(jpegDataUrl, 'image/png'),
    /MIME type mismatch/
  );

  // Rejects unsupported MIME types (SVG, GIF)
  assert.throws(
    () => parseAndValidateBase64BikeImage(`data:image/svg+xml;base64,${svgPayload.toString('base64')}`),
    /Unsupported bike image MIME type/
  );
  assert.throws(
    () => parseAndValidateBase64BikeImage(`data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`),
    /Unsupported bike image MIME type/
  );

  // Rejects empty and malformed base64
  assert.throws(() => parseAndValidateBase64BikeImage(''), /required/);
  assert.throws(() => parseAndValidateBase64BikeImage('data:image/jpeg;base64,'), /empty/);
  assert.throws(
    () => parseAndValidateBase64BikeImage('data:image/jpeg;base64,not_valid_base64!!!'),
    /Malformed base64/
  );
  assert.throws(
    () => parseAndValidateBase64BikeImage('data:image/jpeg;base64,abc'),
    /Malformed base64/
  );

  // Rejects decoded payload exceeding 5 MB (5,242,880 bytes)
  const oversizedBuffer = Buffer.alloc(MAX_BIKE_IMAGE_BYTES + 1, 0);
  oversizedBuffer[0] = 0xff;
  oversizedBuffer[1] = 0xd8;
  oversizedBuffer[2] = 0xff;
  const oversizedDataUrl = `data:image/jpeg;base64,${oversizedBuffer.toString('base64')}`;
  assert.throws(
    () => parseAndValidateBase64BikeImage(oversizedDataUrl),
    /exceeds the 5 MB maximum file size limit/
  );
});

test('Storage path & upload helper: generates safe random paths, enforces upsert: false, and validates returned HTTPS URLs', async () => {
  const ownerUuid = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
  const onboardingPath = buildBikeImageStoragePath(
    { mode: 'onboarding', authenticatedUserId: ownerUuid },
    'webp'
  );
  assert.match(
    onboardingPath,
    /^aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/onboarding\/[0-9a-f-]{36}\.webp$/
  );

  const existingBikePath = buildBikeImageStoragePath(
    { mode: 'existing_bike', ownerFolderId: ownerUuid, bikeId: 'bike-re-hunter-350' },
    'jpg'
  );
  assert.match(
    existingBikePath,
    /^aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/bikes\/bike-re-hunter-350\/[0-9a-f-]{36}\.jpg$/
  );

  // Rejects non-UUID ownerFolderId or path traversal in bikeId
  assert.throws(
    () =>
      buildBikeImageStoragePath(
        { mode: 'onboarding', authenticatedUserId: '../other-user' },
        'jpg'
      ),
    /expected a valid UUID/
  );
  assert.throws(
    () =>
      buildBikeImageStoragePath(
        { mode: 'existing_bike', ownerFolderId: ownerUuid, bikeId: '../secret/path' },
        'jpg'
      ),
    /Invalid bikeId/
  );

  const validPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngDataUrl = `data:image/png;base64,${validPngBytes.toString('base64')}`;

  let capturedBucket = '';
  let capturedPath = '';
  let capturedOptions: any = null;

  const mockSuccessClient: any = {
    storage: {
      from(bucket: string) {
        capturedBucket = bucket;
        return {
          async upload(path: string, _buffer: Buffer, options: any) {
            capturedPath = path;
            capturedOptions = options;
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
        };
      },
    },
  };

  const result = await uploadSingleBikeImageToSupabase({
    userClient: mockSuccessClient,
    imageDataUrl: pngDataUrl,
    scope: { mode: 'onboarding', authenticatedUserId: ownerUuid },
  });

  assert.equal(capturedBucket, BIKE_IMAGES_BUCKET);
  assert.equal(capturedOptions.upsert, false);
  assert.equal(capturedOptions.contentType, 'image/png');
  assert.equal(result.objectPath, capturedPath);
  assert.equal(
    result.publicUrl,
    `https://example.supabase.co/storage/v1/object/public/bike-images/${capturedPath}`
  );

  // Rejects when Storage upload fails
  const mockFailureClient: any = {
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: { message: 'Bucket not found' } };
          },
          getPublicUrl() {
            throw new Error('getPublicUrl must not be called when upload fails');
          },
        };
      },
    },
  };

  await assert.rejects(
    () =>
      uploadSingleBikeImageToSupabase({
        userClient: mockFailureClient,
        imageDataUrl: pngDataUrl,
        scope: { mode: 'onboarding', authenticatedUserId: ownerUuid },
      }),
    /Supabase Storage upload failed: Bucket not found/
  );

  // Rejects when Storage returns an insecure/invalid URL
  const mockInsecureUrlClient: any = {
    storage: {
      from() {
        return {
          async upload(path: string) {
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `http://insecure.supabase.co/storage/v1/object/public/bike-images/${path}`,
              },
            };
          },
        };
      },
    },
  };

  await assert.rejects(
    () =>
      uploadSingleBikeImageToSupabase({
        userClient: mockInsecureUrlClient,
        imageDataUrl: pngDataUrl,
        scope: { mode: 'onboarding', authenticatedUserId: ownerUuid },
      }),
    /Only HTTPS image URLs are allowed/
  );
});

