import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Bike,
  Booking,
  User,
  DocumentVerification,
  BikeOwner,
  AdminAction,
  AdminConfig,
  AdminRole,
  AdminAccountStatus,
  AdminUserRecord,
  DashboardMetrics,
  PickupLocation,
  CommunicationLog,
} from '../src/types.js';

export const INITIAL_SUPER_ADMIN_EMAIL = 'yashmithbolishetti01@gmail.com';

const isVercelServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercelServerless ? path.join('/tmp', 'riderspath-data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const ROOT_DB_FILE = path.join(process.cwd(), 'data', 'database.json');

export interface DatabaseSchema {
  users: User[];
  bikes: Bike[];
  bookings: Booking[];
  verifications: DocumentVerification[];
  owners: BikeOwner[];
  adminUsers: AdminUserRecord[];
  adminActions: AdminAction[];
  pickupLocations: PickupLocation[];
  communicationLogs: CommunicationLog[];
  config: AdminConfig;
}

export function sanitizeUser(user: User): User {
  const {
    passwordHash: _pw,
    verificationCode: _vc,
    verificationCodeExpiresAt: _vce,
    resetPasswordCode: _rc,
    resetPasswordExpiresAt: _rce,
    ...safeUser
  } = user as User & Record<string, unknown>;
  return safeUser;
}

const SEED_ADMIN_USERS: AdminUserRecord[] = [
  {
    id: 'admin-initial-super',
    userId: null,
    email: INITIAL_SUPER_ADMIN_EMAIL,
    role: 'super_admin',
    status: 'invited',
    addedBy: 'system_bootstrap',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

export const SEED_PICKUP_LOCATIONS: PickupLocation[] = [
  {
    id: 'loc-icfai-main-gate',
    name: 'ICFAI Main Gate',
    address: 'ICFAI University Hyderabad, Main Entrance Gate, Shankerpally Road',
    landmark: 'Opposite University Security Post',
    isActive: true,
    displayOrder: 1,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'loc-socials-gaming',
    name: 'Socials Gaming Zone',
    address: 'Socials Gaming Zone Hub, Campus Commercial Strip',
    landmark: 'Near Student Recreation Corner',
    isActive: true,
    displayOrder: 2,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'loc-kakas-hotel',
    name: "Kaka's Hotel",
    address: "Kaka's Hotel Junction, Campus Outer Boulevard",
    landmark: 'Cafeteria & Eatery Corner',
    isActive: true,
    displayOrder: 3,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

const SEED_BIKES: Bike[] = [
  {
    id: 'bike-re-hunter-350',
    ownerId: 'user-icfai-arjun',
    ownerName: 'Arjun Varma',
    ownerPhone: '+91 98490 12345',
    ownerEnrollment: '22BCS084',
    ownerAcademicYear: '3rd Year',
    ownerCourse: 'B.Tech',
    brand: 'Royal Enfield',
    model: 'Hunter 350 Dapper Ash',
    year: 2023,
    registrationNumber: 'TS 08 HG 7721',
    displayRegistrationToPublic: false,
    bikeType: 'Cruiser',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Pristine condition Hunter 350. Smooth clutch, agile for Hyderabad traffic and weekend trips to Gandipet / Vikarabad. Serviced every 3,000 km.',
    images: [
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1558980664-769d59546b3d?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 749,
    pricePerHour: 79,
    securityDeposit: 1500,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 349,
      mileage: '36 km/l',
      topSpeed: '115 km/h',
      fuelCapacity: '13 L',
      weight: '181 kg',
      abs: true,
      helmetsIncluded: 2,
      helmetSize: 'L & M'
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
  },
  {
    id: 'bike-yamaha-mt15',
    ownerId: 'user-icfai-rohit',
    ownerName: 'Rohit Kulkarni',
    ownerPhone: '+91 91210 98765',
    ownerEnrollment: '23BBA042',
    ownerAcademicYear: '2nd Year',
    ownerCourse: 'BBA',
    brand: 'Yamaha',
    model: 'MT-15 V2 Metallic Black',
    year: 2024,
    registrationNumber: 'TS 07 EQ 9012',
    displayRegistrationToPublic: false,
    bikeType: 'Street',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Hyper-responsive naked streetfighter with VVA engine and quick-shifter. Perfect for daily campus commutes and Shankerpally cruising. Comes with phone mount.',
    images: [
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 699,
    pricePerHour: 75,
    securityDeposit: 1200,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 155,
      mileage: '48 km/l',
      topSpeed: '130 km/h',
      fuelCapacity: '10 L',
      weight: '141 kg',
      abs: true,
      helmetsIncluded: 1,
      helmetSize: 'L'
    },
    pickupHub: 'Socials Gaming Zone',
    pickupLocationId: 'loc-socials-gaming',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString()
  },
  {
    id: 'bike-tvs-apache-160',
    ownerId: 'user-icfai-siddharth',
    ownerName: 'Siddharth Rao',
    ownerPhone: '+91 94400 45678',
    ownerEnrollment: '21BLAW019',
    ownerAcademicYear: '4th Year',
    ownerCourse: 'Law',
    brand: 'TVS',
    model: 'Apache RTR 160 4V Special Edition',
    year: 2023,
    registrationNumber: 'TS 09 FJ 3341',
    displayRegistrationToPublic: false,
    bikeType: 'Commuter',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Reliable, powerful, and very fuel efficient with 3 ride modes (Urban, Rain, Sport). Ideal for long study group sessions in Gachibowli or Hitec City.',
    images: [
      'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 549,
    pricePerHour: 59,
    securityDeposit: 1000,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 159,
      mileage: '45 km/l',
      topSpeed: '114 km/h',
      fuelCapacity: '12 L',
      weight: '146 kg',
      abs: true,
      helmetsIncluded: 1,
      helmetSize: 'M'
    },
    pickupHub: "Kaka's Hotel",
    pickupLocationId: 'loc-kakas-hotel',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString()
  },
  {
    id: 'bike-ktm-duke-200',
    ownerId: 'user-icfai-aditya',
    ownerName: 'Aditya Reddy',
    ownerPhone: '+91 97000 88990',
    ownerEnrollment: '22BCS155',
    ownerAcademicYear: '3rd Year',
    ownerCourse: 'B.Tech',
    brand: 'KTM',
    model: 'Duke 200 Electronic Orange',
    year: 2023,
    registrationNumber: 'TS 08 KL 6500',
    displayRegistrationToPublic: false,
    bikeType: 'Sport',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Aggressive acceleration with WP APEX suspension and dual-channel ABS. Handled strictly with care. Renter must have prior geared motorcycle experience.',
    images: [
      'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 849,
    pricePerHour: 89,
    securityDeposit: 2000,
    availabilityStatus: 'RESERVED',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 199,
      mileage: '35 km/l',
      topSpeed: '140 km/h',
      fuelCapacity: '13.4 L',
      weight: '159 kg',
      abs: true,
      helmetsIncluded: 2,
      helmetSize: 'L & XL'
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString()
  },
  {
    id: 'bike-ather-450x',
    ownerId: 'user-icfai-sneha',
    ownerName: 'Sneha Patel',
    ownerPhone: '+91 99890 23456',
    ownerEnrollment: '23BTECH018',
    ownerAcademicYear: '2nd Year',
    ownerCourse: 'B.Tech',
    brand: 'Ather Energy',
    model: 'Ather 450X Gen 3 Space Grey',
    year: 2024,
    registrationNumber: 'TS 09 EV 4102',
    displayRegistrationToPublic: false,
    bikeType: 'Electric',
    fuelType: 'Electric',
    transmission: 'Automatic',
    description: 'Smart EV scooter with Warp Mode, onboard Google Maps navigation, and 105 km true range per charge. Home charging cable included. Perfect eco-friendly ride.',
    images: [
      'https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 499,
    pricePerHour: 49,
    securityDeposit: 800,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 0,
      mileage: '105 km / full charge',
      topSpeed: '90 km/h',
      fuelCapacity: '3.7 kWh',
      weight: '111 kg',
      abs: false,
      helmetsIncluded: 1,
      helmetSize: 'M'
    },
    pickupHub: 'Socials Gaming Zone',
    pickupLocationId: 'loc-socials-gaming',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    id: 'bike-honda-activa-6g',
    ownerId: 'user-icfai-manish',
    ownerName: 'Manish Kumar',
    ownerPhone: '+91 90000 33445',
    ownerEnrollment: '22BBA102',
    ownerAcademicYear: '3rd Year',
    ownerCourse: 'BBA',
    brand: 'Honda',
    model: 'Activa 6G Premium Edition',
    year: 2023,
    registrationNumber: 'TS 08 JP 1904',
    displayRegistrationToPublic: false,
    bikeType: 'Scooter',
    fuelType: 'Petrol',
    transmission: 'Automatic',
    description: 'The easiest, most comfortable automatic scooter on campus. Generous under-seat storage for your backpack and study materials. Very smooth ride.',
    images: [
      'https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 399,
    pricePerHour: 39,
    securityDeposit: 600,
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 110,
      mileage: '55 km/l',
      topSpeed: '85 km/h',
      fuelCapacity: '5.3 L',
      weight: '106 kg',
      abs: false,
      helmetsIncluded: 1,
      helmetSize: 'M'
    },
    pickupHub: "Kaka's Hotel",
    pickupLocationId: 'loc-kakas-hotel',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString()
  },
  {
    id: 'bike-suzuki-gixxer-250',
    ownerId: 'user-icfai-karthik',
    ownerName: 'Karthik Nair',
    ownerPhone: '+91 98850 67890',
    ownerEnrollment: '21BCS012',
    ownerAcademicYear: '4th Year',
    ownerCourse: 'B.Tech',
    brand: 'Suzuki',
    model: 'Gixxer SF 250 MotoGP Edition',
    year: 2023,
    registrationNumber: 'TS 07 TR 8819',
    displayRegistrationToPublic: false,
    bikeType: 'Sport',
    fuelType: 'Petrol',
    transmission: 'Manual',
    description: 'Full-fairing quarter-litre highway machine. Smooth oil-cooled engine with immense mid-range punch. In maintenance check for new brake pads this week.',
    images: [
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: 799,
    pricePerHour: 85,
    securityDeposit: 1800,
    availabilityStatus: 'MAINTENANCE',
    approvalStatus: 'APPROVED',
    active: true,
    specs: {
      cc: 249,
      mileage: '38 km/l',
      topSpeed: '150 km/h',
      fuelCapacity: '12 L',
      weight: '161 kg',
      abs: true,
      helmetsIncluded: 1,
      helmetSize: 'L'
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  }
];

const SEED_USERS: User[] = [
  {
    id: 'user-icfai-arjun',
    fullName: 'Arjun Varma',
    phone: '+91 98490 12345',
    email: 'arjun.varma@student.icfaiuniversity.in',
    emailVerified: true,
    emailVerifiedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    icfaiEnrollmentNumber: '22BCS084',
    academicYear: '3rd Year',
    course: 'B.Tech',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'owner',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'user-icfai-rohit',
    fullName: 'Rohit Kulkarni',
    phone: '+91 91210 98765',
    email: 'rohit.kulkarni@student.icfaiuniversity.in',
    emailVerified: true,
    emailVerifiedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    icfaiEnrollmentNumber: '23BBA042',
    academicYear: '2nd Year',
    course: 'BBA',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'owner',
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString()
  },
  {
    id: 'user-icfai-priya',
    fullName: 'Priya Sharma',
    phone: '+91 93900 11223',
    email: 'priya.sharma@student.icfaiuniversity.in',
    emailVerified: true,
    emailVerifiedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    icfaiEnrollmentNumber: '23BCS108',
    academicYear: '1st Year',
    course: 'B.Tech',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'student',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
  }
];

const SEED_OWNERS: BikeOwner[] = [
  {
    id: 'owner-arjun',
    userId: 'user-icfai-arjun',
    fullName: 'Arjun Varma',
    phone: '+91 98490 12345',
    email: 'arjun.varma@student.icfaiuniversity.in',
    icfaiEnrollmentNumber: '22BCS084',
    payoutUpiId: 'arjunvarma@okhdfcbank',
    totalEarnings: 4500,
    activeListingsCount: 1,
    ownershipVerificationStatus: 'verified',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'owner-rohit',
    userId: 'user-icfai-rohit',
    fullName: 'Rohit Kulkarni',
    phone: '+91 91210 98765',
    email: 'rohit.kulkarni@student.icfaiuniversity.in',
    icfaiEnrollmentNumber: '23BBA042',
    payoutUpiId: 'rohitk@paytm',
    totalEarnings: 3200,
    activeListingsCount: 1,
    ownershipVerificationStatus: 'verified',
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString()
  }
];

const SEED_BOOKINGS: Booking[] = [
  {
    id: 'RP-BKG-8890',
    bikeId: 'bike-ktm-duke-200',
    bikeBrand: 'KTM',
    bikeModel: 'Duke 200 Electronic Orange',
    bikeImage: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
    bikeRegistration: 'TS 08 KL 6500',
    pickupHub: 'FST (Faculty of Science & Tech) Hub',
    renterId: 'user-icfai-priya',
    renterName: 'Priya Sharma',
    renterPhone: '+91 93900 11223',
    renterEmail: 'priya.sharma@student.icfaiuniversity.in',
    renterEnrollment: '23BCS108',
    pickupDate: new Date(Date.now() + 1 * 86400000).toISOString(),
    returnDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    durationHours: 48,
    durationDays: 2,
    bookingStatus: 'confirmed',
    verificationStatus: 'approved',
    totalPrice: 1698,
    securityDeposit: 2000,
    platformFee: 99,
    paymentStatus: 'paid',
    termsAccepted: true,
    termsVersion: 'v1.2-2026-AUG',
    termsAcceptedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    termsAcceptedIp: '10.14.0.84',
    laptopDepositAcknowledged: true,
    pickupConditionRecord: {
      odometerKm: 14220,
      fuelPercent: 75,
      photos: ['https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80'],
      notes: 'Initial inspection clean. Both mirrors intact. ISI helmet L issued. Student Dell laptop deposited in locker.',
      helmetIssued: true,
      laptopPhysicalDepositLogged: true,
      inspectedBy: 'Admin (Campus Hub Coordinator)',
      timestamp: new Date(Date.now() - 1 * 86400000).toISOString()
    },
    depositRefundStatus: 'pending_inspection',
    handoverNotes: 'Helmet provided. Fuel tank at 75%. Physical Dell laptop deposited in campus hub locker.',
    qrCodePass: 'RP-PASS-8890-TS08KL6500',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

const DEFAULT_CONFIG: AdminConfig = {
  campusHubs: [
    'ICFAI Main Gate (Shankerpally Rd)',
    'IBS Academic Block C Hub',
    'FST (Faculty of Science & Tech) Hub',
    'Boys Hostel Zone (Hostel 3/4 Bay)',
    'Girls Hostel Gate 2 Parking',
    'IBS Executive Hub & Cafeteria Junction'
  ],
  defaultSecurityDeposit: 1000,
  platformFeePercent: 8,
  hourlyRentalEnabled: true,
  termsVersion: 'v1.2-2026-AUG',
  termsLastUpdated: '2026-08-24T00:00:00.000Z',
  laptopDepositRequired: true,
  cancellationPolicy: {
    freeCancellationHours: 4,
    cancellationFeePercent: 15,
    refundProcessingDays: 1
  },
  lateReturnPolicy: {
    gracePeriodMinutes: 30,
    hourlyLateFee: 100,
    maxLatePenaltyPerDay: 1200
  },
  speedLimitKmph: 60,
  minBookingNoticeHours: 1
};

class Database {
  private data: DatabaseSchema;
  private inMemoryTestMode = false;
  private testSnapshot: string | null = null;

  constructor() {
    this.data = this.loadData();
  }

  beginTestIsolation(): void {
    if (this.testSnapshot === null) {
      this.testSnapshot = JSON.stringify(this.data);
    }
    this.inMemoryTestMode = true;
  }

  endTestIsolation(): void {
    if (this.testSnapshot !== null) {
      this.data = JSON.parse(this.testSnapshot) as DatabaseSchema;
      this.testSnapshot = null;
    }
    this.inMemoryTestMode = false;
  }

  private migrateUsers(users: User[]): User[] {
    return (users || SEED_USERS).map((u) => {
      const sanitized = sanitizeUser(u);
      return {
        ...sanitized,
        emailVerified: sanitized.emailVerified ?? true,
      };
    });
  }

  private migrateAdminUsers(rawAdmins?: AdminUserRecord[]): AdminUserRecord[] {
    const nowIso = new Date().toISOString();
    const list: AdminUserRecord[] = Array.isArray(rawAdmins) ? [...rawAdmins] : [];
    const normalized: AdminUserRecord[] = [];
    const seenEmails = new Set<string>();

    for (const item of list) {
      if (!item || typeof item.email !== 'string') continue;
      const email = item.email.trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);

      // Strictly enforce that ONLY INITIAL_SUPER_ADMIN_EMAIL can hold 'super_admin'
      const role: AdminRole =
        email === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'admin';
      const status: AdminAccountStatus =
        item.status === 'active' || item.status === 'invited' || item.status === 'revoked'
          ? item.status
          : 'invited';

      normalized.push({
        id: item.id || `admin-${crypto.randomUUID().slice(0, 8)}`,
        userId: typeof item.userId === 'string' && item.userId.trim() ? item.userId.trim() : null,
        email,
        role,
        status: email === INITIAL_SUPER_ADMIN_EMAIL && status === 'revoked' ? 'invited' : status,
        addedBy: item.addedBy || (role === 'super_admin' ? 'system_bootstrap' : INITIAL_SUPER_ADMIN_EMAIL),
        createdAt: item.createdAt || nowIso,
        updatedAt: item.updatedAt || nowIso,
        ...(item.lastLoginAt ? { lastLoginAt: item.lastLoginAt } : {}),
      });
    }

    if (!seenEmails.has(INITIAL_SUPER_ADMIN_EMAIL)) {
      normalized.unshift({
        ...SEED_ADMIN_USERS[0],
      });
    }

    return normalized;
  }

  private sanitizeConfig(rawConfig?: Record<string, unknown>): AdminConfig {
    const merged = {
      ...DEFAULT_CONFIG,
      ...(rawConfig || {}),
    } as AdminConfig & { passwordHash?: unknown };
    delete merged.passwordHash;
    return merged;
  }

  private loadData(): DatabaseSchema {
    try {
      // 1. Check primary DB_FILE (/tmp on Vercel, ./data locally)
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        return {
          users: this.migrateUsers(parsed.users),
          bikes: parsed.bikes || SEED_BIKES,
          bookings: parsed.bookings || SEED_BOOKINGS,
          verifications: parsed.verifications || [],
          owners: parsed.owners || SEED_OWNERS,
          adminUsers: this.migrateAdminUsers(parsed.adminUsers),
          adminActions: parsed.adminActions || [],
          pickupLocations: parsed.pickupLocations && parsed.pickupLocations.length > 0 ? parsed.pickupLocations : SEED_PICKUP_LOCATIONS,
          communicationLogs: parsed.communicationLogs || [],
          config: this.sanitizeConfig(parsed.config),
        };
      }

      // 2. On Vercel / serverless: fallback to ROOT_DB_FILE packaged with deployment
      if (fs.existsSync(ROOT_DB_FILE)) {
        const fileContent = fs.readFileSync(ROOT_DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        const loaded: DatabaseSchema = {
          users: this.migrateUsers(parsed.users),
          bikes: parsed.bikes || SEED_BIKES,
          bookings: parsed.bookings || SEED_BOOKINGS,
          verifications: parsed.verifications || [],
          owners: parsed.owners || SEED_OWNERS,
          adminUsers: this.migrateAdminUsers(parsed.adminUsers),
          adminActions: parsed.adminActions || [],
          pickupLocations: parsed.pickupLocations && parsed.pickupLocations.length > 0 ? parsed.pickupLocations : SEED_PICKUP_LOCATIONS,
          communicationLogs: parsed.communicationLogs || [],
          config: this.sanitizeConfig(parsed.config),
        };
        // Attempt saving to writable DB_FILE location for fast in-container persistence
        this.saveData(loaded);
        return loaded;
      }
    } catch (e) {
      console.error('Error loading database, initializing fresh:', e);
    }

    const initial: DatabaseSchema = {
      users: SEED_USERS,
      bikes: SEED_BIKES,
      bookings: SEED_BOOKINGS,
      verifications: [],
      owners: SEED_OWNERS,
      adminUsers: this.migrateAdminUsers(SEED_ADMIN_USERS),
      adminActions: [
        {
          id: 'action-init',
          adminId: 'system',
          action: 'SYSTEM_BOOTSTRAP',
          targetType: 'auth',
          targetId: 'system',
          metadata: { message: 'Database initialized with ICFAI campus seed data and rental terms code' },
          timestamp: new Date().toISOString()
        }
      ],
      pickupLocations: SEED_PICKUP_LOCATIONS,
      communicationLogs: [],
      config: DEFAULT_CONFIG
    };
    this.saveData(initial);
    return initial;
  }

  private saveData(dataToSave?: DatabaseSchema) {
    if (this.inMemoryTestMode) {
      return;
    }
    const data = dataToSave || this.data;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      // If writing to DATA_DIR failed (e.g. read-only filesystem), fallback to /tmp
      try {
        const fallbackDir = path.join('/tmp', 'riderspath-data');
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        fs.writeFileSync(path.join(fallbackDir, 'database.json'), JSON.stringify(data, null, 2), 'utf-8');
      } catch (fallbackErr) {
        console.warn('Filesystem write fallback failed (in-memory state preserved):', fallbackErr);
      }
    }
  }

  // --- Bikes ---
  getBikes(filter?: {
    status?: string;
    brand?: string;
    bikeType?: string;
    fuelType?: string;
    transmission?: string;
    search?: string;
    onlyActive?: boolean;
    onlyApproved?: boolean;
  }): Bike[] {
    return this.data.bikes.filter((b) => {
      if (filter?.onlyActive !== false && !b.active) return false;
      if (filter?.onlyApproved !== false && !b.approvedByAdmin) return false;
      if (filter?.status && filter.status !== 'ALL' && b.availabilityStatus !== filter.status) return false;
      if (filter?.brand && filter.brand !== 'ALL' && b.brand.toLowerCase() !== filter.brand.toLowerCase()) return false;
      if (filter?.bikeType && filter.bikeType !== 'ALL' && b.bikeType.toLowerCase() !== filter.bikeType.toLowerCase()) return false;
      if (filter?.fuelType && filter.fuelType !== 'ALL' && b.fuelType.toLowerCase() !== filter.fuelType.toLowerCase()) return false;
      if (filter?.transmission && filter.transmission !== 'ALL' && b.transmission.toLowerCase() !== filter.transmission.toLowerCase()) return false;
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matches =
          b.brand.toLowerCase().includes(q) ||
          b.model.toLowerCase().includes(q) ||
          b.pickupHub.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }

  getAllBikesAdmin(): Bike[] {
    return this.data.bikes;
  }

  getBikeById(id: string): Bike | undefined {
    return this.data.bikes.find((b) => b.id === id);
  }

  createBike(bikeData: Omit<Bike, 'id' | 'createdAt'>): Bike {
    const newBike: Bike = {
      ...bikeData,
      id: 'bike-' + crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString()
    };
    this.data.bikes.unshift(newBike);
    this.saveData();
    return newBike;
  }

  updateBike(id: string, updates: Partial<Bike>): Bike | null {
    const index = this.data.bikes.findIndex((b) => b.id === id);
    if (index === -1) return null;
    this.data.bikes[index] = { ...this.data.bikes[index], ...updates };
    this.saveData();
    return this.data.bikes[index];
  }

  deleteBike(id: string): boolean {
    const index = this.data.bikes.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.data.bikes.splice(index, 1);
    this.saveData();
    return true;
  }

  // --- Bookings ---
  getBookings(renterId?: string): Booking[] {
    if (renterId) {
      return this.data.bookings.filter((b) => b.renterId === renterId);
    }
    return this.data.bookings;
  }

  getBookingById(id: string): Booking | undefined {
    return this.data.bookings.find((b) => b.id === id);
  }

  createBooking(bookingData: Omit<Booking, 'id' | 'createdAt'>): Booking {
    const newBooking: Booking = {
      ...bookingData,
      id: 'RP-BKG-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toISOString()
    };
    this.data.bookings.unshift(newBooking);

    // If booking is confirmed, update bike availability status to RESERVED
    if (newBooking.bookingStatus === 'confirmed' || newBooking.bookingStatus === 'active_rental') {
      this.updateBike(newBooking.bikeId, { availabilityStatus: 'RESERVED' });
    }

    this.saveData();
    return newBooking;
  }

  updateBooking(id: string, updates: Partial<Booking>): Booking | null {
    const index = this.data.bookings.findIndex((b) => b.id === id);
    if (index === -1) return null;
    const oldBooking = this.data.bookings[index];
    const updated = { ...oldBooking, ...updates };
    this.data.bookings[index] = updated;

    // Handle availability reflections
    if (updated.bookingStatus === 'completed' || updated.bookingStatus === 'cancelled' || updated.bookingStatus === 'rejected') {
      const bike = this.getBikeById(updated.bikeId);
      if (bike && bike.availabilityStatus === 'RESERVED') {
        this.updateBike(updated.bikeId, { availabilityStatus: 'AVAILABLE' });
      }
    } else if (updated.bookingStatus === 'confirmed' || updated.bookingStatus === 'active_rental') {
      this.updateBike(updated.bikeId, { availabilityStatus: 'RESERVED' });
    }

    this.saveData();
    return updated;
  }

  // --- Users ---
  getUsers(): User[] {
    return this.data.users.map(sanitizeUser);
  }

  getRawUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const clean = email.trim().toLowerCase();
    return this.data.users.find((u) => (u.email || '').trim().toLowerCase() === clean);
  }

  getUserByEnrollment(enrollment: string): User | undefined {
    if (!enrollment) return undefined;
    return this.data.users.find(
      (u) => u.icfaiEnrollmentNumber.trim().toUpperCase() === enrollment.trim().toUpperCase()
    );
  }

  createUser(userData: Omit<User, 'id' | 'createdAt'>): User {
    const existing = this.getUserByEnrollment(userData.icfaiEnrollmentNumber);
    if (existing) {
      return existing;
    }
    const newUser: User = {
      ...userData,
      id: 'user-' + crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString()
    };
    this.data.users.unshift(newUser);
    this.saveData();
    return newUser;
  }

  updateUser(id: string, updates: Partial<User>): User | null {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    this.data.users[index] = {
      ...this.data.users[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveData();
    return this.data.users[index];
  }

  // --- Document Verifications ---
  getVerifications(bookingId?: string): DocumentVerification[] {
    if (bookingId) {
      return this.data.verifications.filter((v) => v.bookingId === bookingId);
    }
    return this.data.verifications;
  }

  createVerification(vData: Omit<DocumentVerification, 'id' | 'createdAt'>): DocumentVerification {
    const newV: DocumentVerification = {
      ...vData,
      id: 'verif-' + crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString()
    };
    this.data.verifications.unshift(newV);
    this.saveData();
    return newV;
  }

  updateVerification(id: string, updates: Partial<DocumentVerification>): DocumentVerification | null {
    const index = this.data.verifications.findIndex((v) => v.id === id);
    if (index === -1) return null;
    this.data.verifications[index] = { ...this.data.verifications[index], ...updates };
    this.saveData();
    return this.data.verifications[index];
  }

  // --- Owners ---
  getOwners(): BikeOwner[] {
    return this.data.owners;
  }

  getOwnerByUserId(userId: string): BikeOwner | undefined {
    return this.data.owners.find((o) => o.userId === userId);
  }

  createOwner(ownerData: Omit<BikeOwner, 'id' | 'createdAt'>): BikeOwner {
    const cleanEnrollment = (ownerData.icfaiEnrollmentNumber || '').trim().toUpperCase();
    const existingIdx = this.data.owners.findIndex(
      (o) =>
        o.userId === ownerData.userId ||
        (cleanEnrollment && (o.icfaiEnrollmentNumber || '').trim().toUpperCase() === cleanEnrollment)
    );
    if (existingIdx !== -1) {
      const existing = this.data.owners[existingIdx];
      const updatedOwner: BikeOwner = {
        ...existing,
        ...ownerData,
        userId: ownerData.userId || existing.userId,
        activeListingsCount: (existing.activeListingsCount || 0) + 1,
      };
      this.data.owners[existingIdx] = updatedOwner;
      this.saveData();
      return updatedOwner;
    }

    const newOwner: BikeOwner = {
      ...ownerData,
      id: 'owner-' + crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString()
    };
    this.data.owners.unshift(newOwner);
    this.saveData();
    return newOwner;
  }

  // --- Admin Actions ---
  logAdminAction(action: Omit<AdminAction, 'id' | 'timestamp'>): AdminAction {
    const newAction: AdminAction = {
      ...action,
      id: 'action-' + crypto.randomUUID().slice(0, 8),
      timestamp: new Date().toISOString()
    };
    this.data.adminActions.unshift(newAction);
    if (this.data.adminActions.length > 200) {
      this.data.adminActions = this.data.adminActions.slice(0, 200);
    }
    this.saveData();
    return newAction;
  }

  getAdminActions(): AdminAction[] {
    return this.data.adminActions;
  }

  // --- Config & Admin Management Registry ---
  getConfig(): AdminConfig {
    return this.sanitizeConfig(this.data.config as unknown as Record<string, unknown>);
  }

  updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    const nextConfig = this.sanitizeConfig({
      ...(this.data.config as unknown as Record<string, unknown>),
      ...(updates as unknown as Record<string, unknown>),
    });
    this.data.config = nextConfig;
    this.saveData();
    return this.data.config;
  }

  private ensureAdminUsersLoaded(): AdminUserRecord[] {
    if (!Array.isArray(this.data.adminUsers) || this.data.adminUsers.length === 0) {
      this.data.adminUsers = this.migrateAdminUsers(SEED_ADMIN_USERS);
    }
    return this.data.adminUsers;
  }

  getAdminUsers(includeRevoked = false): AdminUserRecord[] {
    const admins = this.ensureAdminUsersLoaded();
    return admins
      .filter((a) => includeRevoked || a.status !== 'revoked')
      .map((a): AdminUserRecord => ({
        ...a,
        role: a.email === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'admin',
      }))
      .sort((a, b) => {
        if (a.role === 'super_admin' && b.role !== 'super_admin') return -1;
        if (a.role !== 'super_admin' && b.role === 'super_admin') return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
  }

  getAdminByEmail(email: string): AdminUserRecord | undefined {
    if (!email || typeof email !== 'string') return undefined;
    const clean = email.trim().toLowerCase();
    return this.ensureAdminUsersLoaded().find((a) => a.email === clean);
  }

  getAdminByUserId(userId: string): AdminUserRecord | undefined {
    if (!userId || typeof userId !== 'string') return undefined;
    const clean = userId.trim();
    return this.ensureAdminUsersLoaded().find((a) => a.userId === clean);
  }

  getAdminByIdOrEmail(idOrEmail: string): AdminUserRecord | undefined {
    if (!idOrEmail || typeof idOrEmail !== 'string') return undefined;
    const clean = idOrEmail.trim().toLowerCase();
    return this.ensureAdminUsersLoaded().find(
      (a) =>
        a.id.toLowerCase() === clean ||
        a.email === clean ||
        (a.userId && a.userId.toLowerCase() === clean)
    );
  }

  isSuperAdminBootstrapped(): boolean {
    const superRecord = this.getAdminByEmail(INITIAL_SUPER_ADMIN_EMAIL);
    return Boolean(
      superRecord &&
        superRecord.role === 'super_admin' &&
        superRecord.status === 'active' &&
        typeof superRecord.userId === 'string' &&
        superRecord.userId.trim().length > 0
    );
  }

  bootstrapInitialSuperAdmin(userId: string, email: string): AdminUserRecord {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId) {
      throw new Error('Authenticated Supabase user ID is required to bootstrap the Super Admin.');
    }
    if (cleanEmail !== INITIAL_SUPER_ADMIN_EMAIL) {
      throw new Error(
        `Forbidden: Only ${INITIAL_SUPER_ADMIN_EMAIL} can be bootstrapped as the initial Super Admin.`
      );
    }

    const admins = this.ensureAdminUsersLoaded();
    const idx = admins.findIndex((a) => a.email === INITIAL_SUPER_ADMIN_EMAIL);
    const nowIso = new Date().toISOString();

    if (idx !== -1) {
      const existing = admins[idx];
      if (existing.status === 'active' && existing.userId && existing.userId !== cleanUserId) {
        throw new Error('Conflict: Initial Super Admin has already been bootstrapped.');
      }
      if (existing.status === 'active' && existing.userId === cleanUserId) {
        throw new Error('Conflict: Initial Super Admin has already been bootstrapped.');
      }
      const updated: AdminUserRecord = {
        ...existing,
        userId: cleanUserId,
        email: INITIAL_SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        status: 'active',
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
      admins[idx] = updated;
      this.saveData();
      return updated;
    }

    const created: AdminUserRecord = {
      id: 'admin-initial-super',
      userId: cleanUserId,
      email: INITIAL_SUPER_ADMIN_EMAIL,
      role: 'super_admin',
      status: 'active',
      addedBy: 'system_bootstrap',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
    };
    admins.unshift(created);
    this.saveData();
    return created;
  }

  bindOrVerifyAdminLogin(
    userId: string,
    email: string,
    options?: { allowRpcFallback?: boolean; rpcRole?: AdminRole | null }
  ): AdminUserRecord | null {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUserId = (userId || '').trim();
    if (!cleanEmail || !cleanUserId) {
      return null;
    }

    const admins = this.ensureAdminUsersLoaded();
    const byEmailIdx = admins.findIndex((a) => a.email === cleanEmail);
    const byUidIdx = admins.findIndex((a) => Boolean(a.userId) && a.userId === cleanUserId);
    const nowIso = new Date().toISOString();

    // Reject if the incoming userId is already bound to a revoked record or a different admin email
    if (byUidIdx !== -1) {
      const uidRecord = admins[byUidIdx];
      if (uidRecord.status === 'revoked' || uidRecord.email !== cleanEmail) {
        return null;
      }
    }

    const isSupabaseRpcVerifiedAdmin =
      options?.allowRpcFallback === true &&
      (options.rpcRole === 'super_admin' || options.rpcRole === 'admin');

    if (byEmailIdx !== -1) {
      const record = admins[byEmailIdx];
      if (record.status === 'revoked') {
        return null;
      }
      if (record.email !== cleanEmail) {
        return null;
      }

      // Never allow an arbitrary login to rebind an administrator record to another userId.
      // Only reconcile when Supabase independently verifies the authenticated (userId, email) as an admin,
      // the email matches the existing non-revoked record, and no other record owns cleanUserId.
      if (record.userId && record.userId !== cleanUserId) {
        const canReconcileVerifiedUid =
          isSupabaseRpcVerifiedAdmin &&
          byUidIdx === -1 &&
          record.email === cleanEmail &&
          (record.status === 'active' || record.status === 'invited');
        if (!canReconcileVerifiedUid) {
          return null;
        }
      }

      const authoritativeRole: AdminRole =
        cleanEmail === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'admin';

      const updated: AdminUserRecord = {
        ...record,
        userId: cleanUserId,
        email: cleanEmail,
        role: authoritativeRole,
        status: 'active',
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
      admins[byEmailIdx] = updated;
      this.saveData();
      return updated;
    }

    // If authorized by Supabase RPC (e.g. row exists in private.admin_users in Supabase) and not revoked locally
    if (isSupabaseRpcVerifiedAdmin && byUidIdx === -1) {
      const authoritativeRole: AdminRole =
        cleanEmail === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'admin';
      const synced: AdminUserRecord = {
        id: `admin-${crypto.randomUUID().slice(0, 8)}`,
        userId: cleanUserId,
        email: cleanEmail,
        role: authoritativeRole,
        status: 'active',
        addedBy: authoritativeRole === 'super_admin' ? 'system_bootstrap' : INITIAL_SUPER_ADMIN_EMAIL,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
      admins.push(synced);
      this.saveData();
      return synced;
    }

    return null;
  }

  addAdminUser(
    targetEmail: string,
    actorEmail: string,
    options?: { userId?: string | null; status?: 'active' | 'invited' }
  ): AdminUserRecord {
    const cleanActor = (actorEmail || '').trim().toLowerCase();
    if (cleanActor !== INITIAL_SUPER_ADMIN_EMAIL) {
      throw new Error('Forbidden: Only the Super Admin can add administrators.');
    }

    const cleanTarget = (targetEmail || '').trim().toLowerCase();
    if (!cleanTarget || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTarget)) {
      throw new Error('Enter a valid email address for the new administrator.');
    }

    if (cleanTarget === INITIAL_SUPER_ADMIN_EMAIL) {
      throw new Error(`${INITIAL_SUPER_ADMIN_EMAIL} is already the designated Super Admin.`);
    }

    const admins = this.ensureAdminUsersLoaded();
    const existingIdx = admins.findIndex((a) => a.email === cleanTarget);
    const nowIso = new Date().toISOString();

    if (existingIdx !== -1) {
      const existing = admins[existingIdx];
      if (existing.status !== 'revoked') {
        throw new Error(`An administrator with email ${cleanTarget} already exists.`);
      }
      const reactivated: AdminUserRecord = {
        ...existing,
        userId: options?.userId !== undefined ? options.userId : existing.userId,
        role: 'admin',
        status: options?.status || 'invited',
        addedBy: INITIAL_SUPER_ADMIN_EMAIL,
        updatedAt: nowIso,
      };
      admins[existingIdx] = reactivated;
      this.saveData();
      return reactivated;
    }

    const created: AdminUserRecord = {
      id: `admin-${crypto.randomUUID().slice(0, 8)}`,
      userId: options?.userId ?? null,
      email: cleanTarget,
      role: 'admin',
      status: options?.status || 'invited',
      addedBy: INITIAL_SUPER_ADMIN_EMAIL,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    admins.push(created);
    this.saveData();
    return created;
  }

  revokeAdminUser(targetIdOrEmail: string, actorEmail: string): AdminUserRecord {
    const cleanActor = (actorEmail || '').trim().toLowerCase();
    if (cleanActor !== INITIAL_SUPER_ADMIN_EMAIL) {
      throw new Error('Forbidden: Only the Super Admin can revoke administrator privileges.');
    }

    const target = this.getAdminByIdOrEmail(targetIdOrEmail);
    if (!target || target.status === 'revoked') {
      throw new Error('Administrator account not found.');
    }

    if (target.email === INITIAL_SUPER_ADMIN_EMAIL || target.role === 'super_admin') {
      throw new Error('Forbidden: The initial Super Admin account cannot be revoked.');
    }

    if (target.email === cleanActor) {
      throw new Error('Forbidden: You cannot revoke your own Super Admin privileges.');
    }

    const admins = this.ensureAdminUsersLoaded();
    const idx = admins.findIndex((a) => a.id === target.id);
    const nowIso = new Date().toISOString();
    const revoked: AdminUserRecord = {
      ...admins[idx],
      status: 'revoked',
      updatedAt: nowIso,
    };
    admins[idx] = revoked;
    this.saveData();
    return revoked;
  }

  resetAdminUsersForTesting(records?: AdminUserRecord[]): void {
    this.beginTestIsolation();
    if (this.testSnapshot !== null) {
      const parsed = JSON.parse(this.testSnapshot) as DatabaseSchema;
      this.data.adminActions = Array.isArray(parsed.adminActions)
        ? parsed.adminActions.map((a) => ({ ...a }))
        : [];
    }
    this.data.adminUsers = records
      ? records.map((r) => ({ ...r }))
      : [
          {
            ...SEED_ADMIN_USERS[0],
            userId: null,
            status: 'invited',
          },
        ];
    this.saveData();
  }

  // --- Pickup Locations ---
  getPickupLocations(onlyActive = false): PickupLocation[] {
    let locs = [...(this.data.pickupLocations || [])];
    if (onlyActive) {
      locs = locs.filter((l) => l.isActive);
    }
    return locs.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  getPickupLocationById(id: string): PickupLocation | undefined {
    return (this.data.pickupLocations || []).find((l) => l.id === id);
  }

  createPickupLocation(locationData: Omit<PickupLocation, 'id' | 'createdAt'>): PickupLocation {
    const newLoc: PickupLocation = {
      ...locationData,
      id: 'loc-' + crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString(),
    };
    if (!this.data.pickupLocations) {
      this.data.pickupLocations = [];
    }
    this.data.pickupLocations.push(newLoc);
    this.saveData();
    return newLoc;
  }

  updatePickupLocation(id: string, updates: Partial<PickupLocation>): PickupLocation | null {
    const index = (this.data.pickupLocations || []).findIndex((l) => l.id === id);
    if (index === -1) return null;
    this.data.pickupLocations[index] = { ...this.data.pickupLocations[index], ...updates };
    this.saveData();
    return this.data.pickupLocations[index];
  }

  deletePickupLocation(id: string): boolean {
    const index = (this.data.pickupLocations || []).findIndex((l) => l.id === id);
    if (index === -1) return false;
    this.data.pickupLocations.splice(index, 1);
    this.saveData();
    return true;
  }

  // --- Communication Logs ---
  logCommunication(logData: Omit<CommunicationLog, 'id' | 'timestamp'>): CommunicationLog {
    const newLog: CommunicationLog = {
      ...logData,
      id: 'comm-' + crypto.randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
    };
    if (!this.data.communicationLogs) {
      this.data.communicationLogs = [];
    }
    this.data.communicationLogs.unshift(newLog);
    if (this.data.communicationLogs.length > 500) {
      this.data.communicationLogs = this.data.communicationLogs.slice(0, 500);
    }
    this.saveData();
    return newLog;
  }

  getCommunicationLogs(bookingId?: string): CommunicationLog[] {
    if (bookingId) {
      return (this.data.communicationLogs || []).filter((c) => c.bookingId === bookingId);
    }
    return this.data.communicationLogs || [];
  }

  // --- Live Real Metrics Calculation ---
  getDashboardMetrics(): DashboardMetrics {
    const totalBikes = this.data.bikes.length;
    const availableBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'AVAILABLE' && b.active && b.approvedByAdmin).length;
    const reservedBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'RESERVED').length;
    const maintenanceBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'MAINTENANCE').length;
    const unavailableBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'UNAVAILABLE' || !b.active).length;
    const totalBookings = this.data.bookings.length;
    const activeRentals = this.data.bookings.filter((b) => b.bookingStatus === 'active_rental').length;
    const pendingBookings = this.data.bookings.filter((b) => b.bookingStatus === 'pending_verification' || b.verificationStatus === 'pending').length;
    const completedBookings = this.data.bookings.filter((b) => b.bookingStatus === 'completed').length;
    const totalRegisteredUsers = this.data.users.length;
    const pendingVerifications = this.data.verifications.filter((v) => v.verificationResult === 'manual_review' || v.verificationResult === 'flagged' || v.manualReviewRequired).length;
    const pendingOwnerApprovals = this.data.bikes.filter((b) => !b.approvedByAdmin && b.approvalStatus !== 'REJECTED').length;
    const totalRevenue = this.data.bookings
      .filter((b) => b.paymentStatus === 'paid' || b.paymentStatus === 'deposit_refunded' || b.paymentStatus === 'deposit_adjusted' || b.bookingStatus === 'confirmed' || b.bookingStatus === 'active_rental' || b.bookingStatus === 'completed')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    return {
      totalBikes,
      availableBikes,
      reservedBikes,
      maintenanceBikes,
      unavailableBikes,
      totalBookings,
      activeRentals,
      pendingBookings,
      completedBookings,
      totalRegisteredUsers,
      pendingVerifications,
      pendingOwnerApprovals,
      totalRevenue
    };
  }
}

export const db = new Database();
