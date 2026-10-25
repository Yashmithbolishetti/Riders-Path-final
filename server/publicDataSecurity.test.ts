import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from './app.js';
import { db } from './db.js';

let server: Server;
let baseUrl = '';
let createdInactiveLocId = '';
let createdActiveLocId = '';
let createdHiddenRegBikeId = '';
let createdPublicRegBikeId = '';

before(async () => {
  const inactiveLoc = db.createPickupLocation({
    name: 'Test Inactive Campus Hub',
    hubCode: 'TIH',
    address: 'Inactive Test Road',
    landmark: 'Test Gate',
    isActive: false,
    operatingHours: '09:00 AM - 05:00 PM',
    contactPhone: '+91 99999 00001',
    displayOrder: 98,
  });
  createdInactiveLocId = inactiveLoc.id;

  const activeLoc = db.createPickupLocation({
    name: 'Test Active Campus Hub',
    hubCode: 'TAH',
    address: 'Active Test Road',
    landmark: 'Main Plaza',
    isActive: true,
    operatingHours: '08:00 AM - 08:00 PM',
    contactPhone: '+91 99999 00002',
    displayOrder: 99,
  });
  createdActiveLocId = activeLoc.id;

  const hiddenRegBike = db.createBike({
    ownerId: '00000000-0000-4000-8000-000000000111',
    ownerName: 'Test Student Host',
    ownerPhone: '+91 98888 77777',
    ownerEnrollment: '22BCS999',
    ownerAcademicYear: '3rd Year',
    ownerCourse: 'B.Tech',
    brand: 'TestBrand',
    model: 'HiddenPlate 250',
    year: 2024,
    registrationNumber: 'TS 08 ZZ 9999',
    displayRegistrationToPublic: false,
    bikeType: 'Street',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Test listing with hidden registration plate.',
    images: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39'],
    pricePerDay: 650,
    pricePerHour: 65,
    securityDeposit: 1200,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    approvalNotes: 'Internal admin approval note — do not expose publicly',
    active: true,
    specs: {
      cc: 250,
      mileage: '35 km/l',
      topSpeed: '130 km/h',
      fuelCapacity: '12 L',
      weight: '150 kg',
      abs: true,
      helmetsIncluded: 1,
    },
    pickupHub: 'ICFAI Main Gate',
    approvedByAdmin: true,
  });
  createdHiddenRegBikeId = hiddenRegBike.id;

  const publicRegBike = db.createBike({
    ownerId: '00000000-0000-4000-8000-000000000222',
    ownerName: 'Public Plate Host',
    ownerPhone: '+91 98888 66666',
    ownerEnrollment: '22BCS998',
    ownerAcademicYear: '4th Year',
    ownerCourse: 'B.Tech',
    brand: 'TestBrand',
    model: 'VisiblePlate 200',
    year: 2024,
    registrationNumber: 'TS 08 AA 1111',
    displayRegistrationToPublic: true,
    bikeType: 'Commuter',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Test listing with visible registration plate.',
    images: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39'],
    pricePerDay: 500,
    pricePerHour: 50,
    securityDeposit: 1000,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    approvalNotes: 'Internal admin note for visible plate bike',
    active: true,
    specs: {
      cc: 200,
      mileage: '40 km/l',
      topSpeed: '115 km/h',
      fuelCapacity: '11 L',
      weight: '140 kg',
      abs: true,
      helmetsIncluded: 1,
    },
    pickupHub: 'ICFAI Main Gate',
    approvedByAdmin: true,
  });
  createdPublicRegBikeId = publicRegBike.id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (createdInactiveLocId) db.deletePickupLocation(createdInactiveLocId);
  if (createdActiveLocId) db.deletePickupLocation(createdActiveLocId);
  if (createdHiddenRegBikeId) db.deleteBike(createdHiddenRegBikeId);
  if (createdPublicRegBikeId) db.deleteBike(createdPublicRegBikeId);

  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/pickup-locations?all=true returns active locations only and omits contactPhone', async () => {
  const res = await fetch(`${baseUrl}/api/pickup-locations?all=true`);
  assert.equal(res.status, 200);
  const locations: any[] = await res.json();

  assert.ok(Array.isArray(locations) && locations.length > 0);
  assert.ok(
    locations.every((loc) => loc.isActive === true),
    'Expected all returned pickup locations to have isActive === true'
  );
  assert.equal(
    locations.some((loc) => loc.id === createdInactiveLocId),
    false,
    'Inactive pickup location must not be returned when ?all=true is passed'
  );

  const activeTestLoc = locations.find((loc) => loc.id === createdActiveLocId);
  assert.ok(activeTestLoc, 'Expected active test location to be present');
  assert.equal(
    'contactPhone' in activeTestLoc,
    false,
    'Public pickup location must not expose contactPhone'
  );
  assert.equal(activeTestLoc.name, 'Test Active Campus Hub');
});

test('GET /api/admin/pickup-locations requires admin authentication', async () => {
  const res = await fetch(`${baseUrl}/api/admin/pickup-locations`);
  assert.equal(res.status, 401);
});

test('GET /api/bikes and GET /api/bikes/:id omit ownerId, approvalNotes, ownerPhone, ownerEnrollment, and mask hidden registrationNumber', async () => {
  const listRes = await fetch(`${baseUrl}/api/bikes`);
  assert.equal(listRes.status, 200);
  const bikes: any[] = await listRes.json();

  const hiddenPlateBike = bikes.find((b) => b.id === createdHiddenRegBikeId);
  assert.ok(hiddenPlateBike, 'Expected approved active test bike in public catalog');

  assert.equal('ownerId' in hiddenPlateBike, false, 'ownerId must be omitted from public bike');
  assert.equal('approvalNotes' in hiddenPlateBike, false, 'approvalNotes must be omitted from public bike');
  assert.equal('ownerPhone' in hiddenPlateBike, false, 'ownerPhone must be omitted from public bike');
  assert.equal('ownerEnrollment' in hiddenPlateBike, false, 'ownerEnrollment must be omitted from public bike');
  assert.equal(hiddenPlateBike.registrationNumber, '', 'Hidden registrationNumber must be masked to empty string');

  // Verify required public UI fields remain intact
  assert.equal(hiddenPlateBike.brand, 'TestBrand');
  assert.equal(hiddenPlateBike.model, 'HiddenPlate 250');
  assert.equal(hiddenPlateBike.ownerName, 'Test Student Host');
  assert.equal(hiddenPlateBike.pricePerDay, 650);
  assert.equal(hiddenPlateBike.securityDeposit, 1200);
  assert.equal(hiddenPlateBike.pickupHub, 'ICFAI Main Gate');

  // Check single-bike detail endpoint for hidden-registration bike
  const detailRes = await fetch(`${baseUrl}/api/bikes/${createdHiddenRegBikeId}`);
  assert.equal(detailRes.status, 200);
  const detailBike: any = await detailRes.json();

  assert.equal('ownerId' in detailBike, false, 'ownerId must be omitted from public bike detail');
  assert.equal('approvalNotes' in detailBike, false, 'approvalNotes must be omitted from public bike detail');
  assert.equal('ownerPhone' in detailBike, false, 'ownerPhone must be omitted from public bike detail');
  assert.equal('ownerEnrollment' in detailBike, false, 'ownerEnrollment must be omitted from public bike detail');
  assert.equal(detailBike.registrationNumber, '', 'Hidden registrationNumber must not be exposed on detail endpoint');

  // Check bike with displayRegistrationToPublic === true preserves registrationNumber while still omitting private owner/admin fields
  const visibleDetailRes = await fetch(`${baseUrl}/api/bikes/${createdPublicRegBikeId}`);
  assert.equal(visibleDetailRes.status, 200);
  const visibleDetailBike: any = await visibleDetailRes.json();
  assert.equal('ownerId' in visibleDetailBike, false);
  assert.equal('approvalNotes' in visibleDetailBike, false);
  assert.equal('ownerPhone' in visibleDetailBike, false);
  assert.equal('ownerEnrollment' in visibleDetailBike, false);
  assert.equal(visibleDetailBike.registrationNumber, 'TS 08 AA 1111');
});
