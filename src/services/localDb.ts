import {
  Bike,
  Booking,
  User,
  DocumentVerification,
  DashboardMetrics,
  AdminAction,
  AdminConfig,
  PickupLocation,
  CommunicationLog,
  BikeOwner,
} from '../types';

const STORAGE_KEY = 'riderspath_client_db_v2';

export interface DatabaseState {
  users: User[];
  bikes: Bike[];
  bookings: Booking[];
  verifications: DocumentVerification[];
  owners: BikeOwner[];
  adminActions: AdminAction[];
  pickupLocations: PickupLocation[];
  communicationLogs: CommunicationLog[];
  config: AdminConfig;
}

const DEFAULT_CONFIG: AdminConfig = {
  campusHubs: [
    'ICFAI Main Gate (Shankerpally Rd)',
    'Socials Gaming Zone',
    "Kaka's Hotel",
    'IBS Academic Block C Hub',
    'FST (Faculty of Science & Tech) Hub',
    'Boys Hostel Zone',
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
    refundProcessingDays: 1,
  },
  lateReturnPolicy: {
    gracePeriodMinutes: 30,
    hourlyLateFee: 100,
    maxLatePenaltyPerDay: 1200,
  },
  speedLimitKmph: 60,
  minBookingNoticeHours: 1,
};

const SEED_PICKUP_LOCATIONS: PickupLocation[] = [
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
      'https://images.unsplash.com/photo-1558980664-769d59546b3d?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'L & M',
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'L',
    },
    pickupHub: 'Socials Gaming Zone',
    pickupLocationId: 'loc-socials-gaming',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'M',
    },
    pickupHub: "Kaka's Hotel",
    pickupLocationId: 'loc-kakas-hotel',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'L & XL',
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'M',
    },
    pickupHub: 'Socials Gaming Zone',
    pickupLocationId: 'loc-socials-gaming',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'M',
    },
    pickupHub: "Kaka's Hotel",
    pickupLocationId: 'loc-kakas-hotel',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
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
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
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
      helmetSize: 'L',
    },
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    approvedByAdmin: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

const SEED_USERS: User[] = [
  {
    id: 'user-icfai-arjun',
    fullName: 'Arjun Varma',
    phone: '+91 98490 12345',
    email: 'arjun.varma@student.icfaiuniversity.in',
    icfaiEnrollmentNumber: '22BCS084',
    academicYear: '3rd Year',
    course: 'B.Tech',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'owner',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'user-icfai-rohit',
    fullName: 'Rohit Kulkarni',
    phone: '+91 91210 98765',
    email: 'rohit.kulkarni@student.icfaiuniversity.in',
    icfaiEnrollmentNumber: '23BBA042',
    academicYear: '2nd Year',
    course: 'BBA',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'owner',
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 'user-icfai-priya',
    fullName: 'Priya Sharma',
    phone: '+91 93900 11223',
    email: 'priya.sharma@student.icfaiuniversity.in',
    icfaiEnrollmentNumber: '23BCS108',
    academicYear: '1st Year',
    course: 'B.Tech',
    ageConfirmation: true,
    drivingLicenseConfirmation: true,
    verificationStatus: 'verified',
    role: 'student',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
];

const SEED_BOOKINGS: Booking[] = [
  {
    id: 'RP-BKG-8890',
    bikeId: 'bike-ktm-duke-200',
    bikeBrand: 'KTM',
    bikeModel: 'Duke 200 Electronic Orange',
    bikeImage: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
    bikeRegistration: 'TS 08 KL 6500',
    pickupHub: 'ICFAI Main Gate',
    pickupLocationId: 'loc-icfai-main-gate',
    renterId: 'user-icfai-priya',
    renterName: 'Priya Sharma',
    renterPhone: '+91 93900 11223',
    renterEmail: 'priya.sharma@student.icfaiuniversity.in',
    renterEnrollment: '23BCS108',
    renterAcademicYear: '1st Year',
    renterCourse: 'B.Tech',
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
    laptopDepositAcknowledged: true,
    pickupConditionRecord: {
      odometerKm: 14220,
      fuelPercent: 75,
      photos: [
        'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
      ],
      notes: 'Initial inspection clean. Both mirrors intact. ISI helmet L issued. Student Dell laptop deposited in locker.',
      helmetIssued: true,
      laptopPhysicalDepositLogged: true,
      inspectedBy: 'Admin (Campus Hub Coordinator)',
      timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    depositRefundStatus: 'pending_inspection',
    handoverNotes: 'Helmet provided. Fuel tank at 75%. Physical Dell laptop deposited in campus hub locker.',
    qrCodePass: 'RP-PASS-8890-TS08KL6500',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

const SEED_ACTIONS: AdminAction[] = [
  {
    id: 'action-init',
    adminId: 'system',
    action: 'SYSTEM_BOOTSTRAP',
    targetType: 'auth',
    targetId: 'system',
    metadata: { message: 'Database initialized with ICFAI campus seed data and rental terms code' },
    timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'action-hub-init',
    adminId: 'admin',
    action: 'CONFIGURE_CAMPUS_HUBS',
    targetType: 'config',
    targetId: 'hubs',
    metadata: { activeHubs: 3 },
    timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

class LocalDatabase {
  private data: DatabaseState;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.bikes && parsed.bikes.length > 0) {
          return {
            users: parsed.users || SEED_USERS,
            bikes: parsed.bikes,
            bookings: parsed.bookings || SEED_BOOKINGS,
            verifications: parsed.verifications || [],
            owners: parsed.owners || [],
            adminActions: parsed.adminActions || SEED_ACTIONS,
            pickupLocations: parsed.pickupLocations && parsed.pickupLocations.length > 0 ? parsed.pickupLocations : SEED_PICKUP_LOCATIONS,
            communicationLogs: parsed.communicationLogs || [],
            config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
          };
        }
      }
    } catch (e) {
      console.warn('LocalDB load error, initializing fresh:', e);
    }

    const initial: DatabaseState = {
      users: SEED_USERS,
      bikes: SEED_BIKES,
      bookings: SEED_BOOKINGS,
      verifications: [],
      owners: [],
      adminActions: SEED_ACTIONS,
      pickupLocations: SEED_PICKUP_LOCATIONS,
      communicationLogs: [],
      config: DEFAULT_CONFIG,
    };
    this.save(initial);
    return initial;
  }

  private save(dataToSave?: DatabaseState) {
    try {
      this.data = dataToSave || this.data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('LocalDB save error:', e);
    }
  }

  // --- Config ---
  getConfig(): AdminConfig {
    return this.data.config;
  }

  updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    this.data.config = { ...this.data.config, ...updates };
    this.logAdminAction('UPDATE_CONFIG', 'config', 'config', updates);
    this.save();
    return this.data.config;
  }

  // --- User Sanitization (Authentication is handled strictly by Supabase Auth via backend routes) ---
  private sanitizeUser(user: User): User {
    const {
      passwordHash: _pw,
      verificationCode: _vc,
      verificationCodeExpiresAt: _vce,
      resetPasswordCode: _rc,
      resetPasswordExpiresAt: _rce,
      ...safe
    } = user as User & Record<string, unknown>;
    return safe;
  }

  getUsers(): User[] {
    return this.data.users.map((u) => this.sanitizeUser(u));
  }

  updateUserStatus(id: string, verificationStatus: string): User {
    const user = this.data.users.find((u) => u.id === id);
    if (user) {
      user.verificationStatus = verificationStatus as any;
      this.save();
      return this.sanitizeUser(user);
    }
    throw new Error('User not found');
  }

  // --- Bikes ---
  private sanitizePublicBike(bike: Bike): Bike {
    const { ownerId, approvalNotes, ownerPhone, ownerEnrollment, ...rest } = bike;
    return {
      ...(rest as Bike),
      ownerName: bike.ownerName || 'Verified ICFAI Host',
      registrationNumber: bike.displayRegistrationToPublic ? bike.registrationNumber : '',
    };
  }

  getBikes(filter?: {
    status?: string;
    brand?: string;
    bikeType?: string;
    fuelType?: string;
    transmission?: string;
    search?: string;
  }): Bike[] {
    return this.data.bikes
      .filter((b) => {
        if (!b.active) return false;
        if (!b.approvedByAdmin) return false;
        if (filter?.status && filter.status !== 'ALL' && b.availabilityStatus !== filter.status) return false;
        if (filter?.brand && filter.brand !== 'ALL' && b.brand.toLowerCase() !== filter.brand.toLowerCase()) return false;
        if (filter?.bikeType && filter.bikeType !== 'ALL' && b.bikeType.toLowerCase() !== filter.bikeType.toLowerCase()) return false;
        if (filter?.fuelType && filter.fuelType !== 'ALL' && b.fuelType.toLowerCase() !== filter.fuelType.toLowerCase()) return false;
        if (filter?.transmission && filter.transmission !== 'ALL' && b.transmission.toLowerCase() !== filter.transmission.toLowerCase()) return false;
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          return (
            b.brand.toLowerCase().includes(q) ||
            b.model.toLowerCase().includes(q) ||
            b.description.toLowerCase().includes(q) ||
            b.pickupHub.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((b) => this.sanitizePublicBike(b));
  }

  getAllBikesAdmin(): Bike[] {
    return this.data.bikes;
  }

  getBikeById(id: string): Bike | undefined {
    const found = this.data.bikes.find((b) => b.id === id);
    if (!found || !found.active || !found.approvedByAdmin) {
      return undefined;
    }
    return this.sanitizePublicBike(found);
  }

  createBike(bikeData: Partial<Bike>): Bike {
    const rawDayPrice = Number(bikeData.pricePerDay);
    const rawHourPrice = Number(bikeData.pricePerHour);
    const finalDayPrice = rawDayPrice > 0 ? rawDayPrice : (rawHourPrice > 0 ? rawHourPrice * 24 : 599);
    const finalHourPrice = rawHourPrice > 0 ? rawHourPrice : Math.round((finalDayPrice / 24) * 100) / 100;

    const newBike: Bike = {
      id: `bike-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerId: bikeData.ownerId || 'admin',
      ownerName: bikeData.ownerName || 'Admin Staff',
      ownerPhone: bikeData.ownerPhone || '+91 98490 21000',
      ownerEnrollment: bikeData.ownerEnrollment || '26FMUCHH01XXXX',
      ownerAcademicYear: bikeData.ownerAcademicYear || 'Year 3',
      ownerCourse: bikeData.ownerCourse || 'B.Tech',
      brand: bikeData.brand || 'Generic',
      model: bikeData.model || 'Model',
      year: bikeData.year || 2023,
      registrationNumber: bikeData.registrationNumber || 'TS 08 EX 0000',
      displayRegistrationToPublic: false,
      bikeType: bikeData.bikeType || 'Street',
      fuelType: bikeData.fuelType || 'Petrol',
      transmission: bikeData.transmission || 'Manual',
      description: bikeData.description || 'Campus student ride.',
      images: Array.isArray(bikeData.images) && bikeData.images.length > 0 ? bikeData.images : [
        'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
      ],
      pricePerDay: finalDayPrice,
      pricePerHour: finalHourPrice,
      securityDeposit: Number(bikeData.securityDeposit) || 1000,
      availabilityStatus: bikeData.availabilityStatus || 'AVAILABLE',
      approvalStatus: bikeData.approvalStatus || 'APPROVED',
      active: bikeData.active !== undefined ? bikeData.active : true,
      specs: bikeData.specs || {
        cc: 150,
        mileage: '45 km/l',
        topSpeed: '110 km/h',
        fuelCapacity: '12 L',
        weight: '140 kg',
        abs: true,
        helmetsIncluded: 1,
      },
      pickupHub: bikeData.pickupHub || 'ICFAI Main Gate',
      approvedByAdmin: bikeData.approvedByAdmin !== undefined ? bikeData.approvedByAdmin : true,
      createdAt: new Date().toISOString(),
    };

    this.data.bikes.unshift(newBike);
    this.logAdminAction('CREATE_BIKE', 'bike', newBike.id, { brand: newBike.brand, model: newBike.model });
    this.save();
    return newBike;
  }

  updateBike(id: string, updates: Partial<Bike>): Bike {
    const idx = this.data.bikes.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bike not found');

    const updated = { ...this.data.bikes[idx], ...updates };
    if (updates.pricePerDay !== undefined || updates.pricePerHour !== undefined) {
      const dayP = Number(updated.pricePerDay);
      const hrP = Number(updated.pricePerHour);
      if (dayP > 0 && (!hrP || hrP <= 0)) {
        updated.pricePerHour = Math.round((dayP / 24) * 100) / 100;
      } else if (hrP > 0 && (!dayP || dayP <= 0)) {
        updated.pricePerDay = Math.round(hrP * 24);
      }
    }

    this.data.bikes[idx] = updated;
    this.logAdminAction('UPDATE_BIKE', 'bike', id, updates);
    this.save();
    return updated;
  }

  deleteBike(id: string): void {
    const idx = this.data.bikes.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.data.bikes.splice(idx, 1);
      this.logAdminAction('DELETE_BIKE', 'bike', id);
      this.save();
    }
  }

  // --- Pickup Locations ---
  getPickupLocations(activeOnly = true): PickupLocation[] {
    const locs = this.data.pickupLocations || SEED_PICKUP_LOCATIONS;
    if (activeOnly) {
      return locs
        .filter((l) => l.isActive)
        .map(({ contactPhone, ...rest }) => rest as PickupLocation);
    }
    return locs;
  }

  createPickupLocation(data: Partial<PickupLocation>): PickupLocation {
    const newLoc: PickupLocation = {
      id: `loc-${Date.now()}`,
      name: data.name || 'Campus Hub',
      hubCode: data.hubCode || 'HUB',
      address: data.address || 'ICFAI University Hyderabad Campus, Shankerpally Rd',
      landmark: data.landmark || '',
      isActive: data.isActive !== undefined ? data.isActive : true,
      operatingHours: data.operatingHours || '07:00 AM - 10:30 PM (Daily)',
      contactPhone: data.contactPhone || '+91 91210 98765',
      displayOrder: Number(data.displayOrder) || (this.data.pickupLocations.length + 1),
      createdAt: new Date().toISOString(),
    };
    this.data.pickupLocations.push(newLoc);
    this.logAdminAction('CREATE_LOCATION', 'config', newLoc.id, { name: newLoc.name });
    this.save();
    return newLoc;
  }

  updatePickupLocation(id: string, updates: Partial<PickupLocation>): PickupLocation {
    const idx = this.data.pickupLocations.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error('Location not found');
    const updated = { ...this.data.pickupLocations[idx], ...updates };
    this.data.pickupLocations[idx] = updated;
    this.logAdminAction('UPDATE_LOCATION', 'config', id, updates);
    this.save();
    return updated;
  }

  deletePickupLocation(id: string): void {
    const idx = this.data.pickupLocations.findIndex((l) => l.id === id);
    if (idx !== -1) {
      this.data.pickupLocations.splice(idx, 1);
      this.logAdminAction('DELETE_LOCATION', 'config', id);
      this.save();
    }
  }

  // --- Bookings ---
  getBookings(renterId?: string, enrollment?: string): Booking[] {
    if (renterId) {
      return this.data.bookings.filter((b) => b.renterId === renterId);
    }
    if (enrollment) {
      return this.data.bookings.filter(
        (b) => b.renterEnrollment.toUpperCase() === enrollment.toUpperCase()
      );
    }
    return this.data.bookings;
  }

  getBookingById(id: string): Booking | undefined {
    return this.data.bookings.find((b) => b.id === id);
  }

  createBooking(payload: any): Booking {
    const bike = this.getBikeById(payload.bikeId);
    if (!bike) throw new Error('Selected bike not found');
    if (bike.availabilityStatus !== 'AVAILABLE') {
      throw new Error(`This vehicle is currently marked as ${bike.availabilityStatus}.`);
    }

    const reqPickup = new Date(payload.pickupDate).getTime();
    const reqReturn = new Date(payload.returnDate).getTime();
    if (isNaN(reqPickup) || isNaN(reqReturn) || reqPickup >= reqReturn) {
      throw new Error('Return date and time must be after pickup date and time.');
    }

    const conflicting = this.data.bookings.filter((b) => {
      if (b.bikeId !== bike.id) return false;
      if (
        b.bookingStatus === 'cancelled' ||
        b.bookingStatus === 'rejected' ||
        b.bookingStatus === 'completed'
      ) {
        return false;
      }
      const bPickup = new Date(b.pickupDate).getTime();
      const bReturn = new Date(b.returnDate).getTime();
      return Math.max(reqPickup, bPickup) < Math.min(reqReturn, bReturn);
    });

    if (conflicting.length > 0) {
      throw new Error(
        'Schedule conflict: This bike is already booked for an overlapping time window. Please choose alternative dates.'
      );
    }

    const totalHours = Math.max(1, Math.round((reqReturn - reqPickup) / (1000 * 60 * 60)));
    const days = Math.max(1, Number(payload.durationDays) || Math.ceil(totalHours / 24));
    const rentalTotal = days * bike.pricePerDay;

    const passId = Math.floor(1000 + Math.random() * 9000);
    const newBooking: Booking = {
      id: `RP-BKG-${passId}`,
      bikeId: bike.id,
      bikeBrand: bike.brand,
      bikeModel: bike.model,
      bikeImage: bike.images[0] || '',
      bikeRegistration: bike.registrationNumber,
      pickupHub: payload.pickupLocationName || bike.pickupHub || 'ICFAI Main Gate',
      pickupLocationId: payload.pickupLocationId,
      pickupLocationName: payload.pickupLocationName,
      renterId: payload.renterId || `user-${Date.now()}`,
      renterName: payload.renterName,
      renterPhone: payload.renterPhone,
      renterEmail: payload.renterEmail,
      renterEnrollment: payload.renterEnrollment,
      renterAcademicYear: payload.renterAcademicYear,
      renterCourse: payload.renterCourse,
      pickupDate: payload.pickupDate,
      returnDate: payload.returnDate,
      durationHours: totalHours,
      durationDays: days,
      bookingStatus: 'pending_verification',
      verificationStatus: 'pending',
      totalPrice: rentalTotal,
      securityDeposit: bike.securityDeposit,
      platformFee: Math.round(rentalTotal * 0.08),
      aadharDocument: payload.aadharDoc,
      drivingLicenseDocument: payload.dlDoc,
      studentIdDocument: payload.studentIdDoc,
      laptopDepositAcknowledged: Boolean(payload.laptopDepositAcknowledged),
      paymentStatus: 'pending',
      termsAccepted: true,
      termsVersion: payload.termsVersion || this.data.config.termsVersion,
      termsAcceptedAt: new Date().toISOString(),
      qrCodePass: `RP-${passId}-${bike.registrationNumber.replace(/\s+/g, '')}`,
      createdAt: new Date().toISOString(),
    };

    this.data.bookings.unshift(newBooking);
    this.logAdminAction('CREATE_BOOKING', 'booking', newBooking.id, {
      renter: newBooking.renterName,
      bike: `${newBooking.bikeBrand} ${newBooking.bikeModel}`,
    });
    this.save();
    return newBooking;
  }

  updateBooking(id: string, updates: Partial<Booking>): Booking {
    const idx = this.data.bookings.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Booking not found');
    const booking = this.data.bookings[idx];
    const updated = { ...booking, ...updates };
    this.data.bookings[idx] = updated;

    if (booking.bikeId) {
      const bike = this.getBikeById(booking.bikeId);
      if (bike) {
        if (updates.bookingStatus === 'active_rental' && bike.availabilityStatus === 'AVAILABLE') {
          this.updateBike(booking.bikeId, { availabilityStatus: 'RESERVED' });
        } else if (
          (updates.bookingStatus === 'completed' ||
            updates.bookingStatus === 'cancelled' ||
            updates.bookingStatus === 'rejected') &&
          bike.availabilityStatus === 'RESERVED'
        ) {
          this.updateBike(booking.bikeId, { availabilityStatus: 'AVAILABLE' });
        }
      }
    }

    this.save();
    return updated;
  }

  // --- Handover Fast Actions ---
  adminFastHandover(id: string, data?: { notes?: string; coordinatorName?: string }): Booking {
    const booking = this.getBookingById(id);
    if (!booking) throw new Error('Booking not found');

    const updated = this.updateBooking(id, {
      bookingStatus: 'active_rental',
      paymentStatus: 'paid',
      pickupConditionRecord: {
        odometerKm: booking.pickupConditionRecord?.odometerKm || 12000,
        fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
        photos: [],
        notes: data?.notes || 'Vehicle handed over at campus hub.',
        helmetIssued: true,
        laptopPhysicalDepositLogged: true,
        inspectedBy: data?.coordinatorName || 'Admin Hub Coordinator',
        timestamp: new Date().toISOString(),
      },
    });

    this.logAdminAction('FAST_HANDOVER', 'booking', id, { renter: booking.renterName });
    return updated;
  }

  adminFastReturn(id: string, data?: { notes?: string; coordinatorName?: string }): Booking {
    const booking = this.getBookingById(id);
    if (!booking) throw new Error('Booking not found');

    const updated = this.updateBooking(id, {
      bookingStatus: 'completed',
      paymentStatus: 'deposit_refunded',
      depositRefundStatus: 'full_refund_authorized',
      returnConditionRecord: {
        odometerKm: (booking.pickupConditionRecord?.odometerKm || 12000) + 45,
        fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
        photos: [],
        notes: data?.notes || 'Returned in good condition. Deposit refund approved.',
        newDamagesIdentified: false,
        damageNotes: '',
        damageEstimatedCost: 0,
        fineOrChallanRecorded: false,
        challanAmount: 0,
        challanDetails: '',
        laptopReturnedToStudent: true,
        inspectedBy: data?.coordinatorName || 'Admin Hub Coordinator',
        timestamp: new Date().toISOString(),
      },
    });

    this.logAdminAction('FAST_RETURN', 'booking', id, { renter: booking.renterName });
    return updated;
  }

  // --- Communications ---
  getCommunications(bookingId: string): CommunicationLog[] {
    return this.data.communicationLogs.filter((c) => c.bookingId === bookingId);
  }

  logCommunication(log: Omit<CommunicationLog, 'id' | 'timestamp'>): CommunicationLog {
    const fullLog: CommunicationLog = {
      ...log,
      id: `comm-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    this.data.communicationLogs.unshift(fullLog);
    this.save();
    return fullLog;
  }

  // --- Metrics ---
  getMetrics(): DashboardMetrics {
    const totalBikes = this.data.bikes.length;
    const availableBikes = this.data.bikes.filter((b) => b.active && b.approvedByAdmin && b.availabilityStatus === 'AVAILABLE').length;
    const reservedBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'RESERVED').length;
    const maintenanceBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'MAINTENANCE').length;
    const unavailableBikes = this.data.bikes.filter((b) => b.availabilityStatus === 'UNAVAILABLE' || !b.active).length;
    const totalBookings = this.data.bookings.length;
    const activeRentals = this.data.bookings.filter((b) => b.bookingStatus === 'active_rental').length;
    const pendingBookings = this.data.bookings.filter((b) => b.bookingStatus === 'pending_verification').length;
    const completedBookings = this.data.bookings.filter((b) => b.bookingStatus === 'completed').length;
    const totalRegisteredUsers = this.data.users.length;
    const pendingVerifications = this.data.verifications.filter((v) => v.manualReviewRequired || v.verificationResult === 'manual_review' || v.verificationResult === 'flagged').length;
    const pendingOwnerApprovals = this.data.bikes.filter((b) => !b.approvedByAdmin && b.approvalStatus !== 'REJECTED').length;
    const totalRevenue = this.data.bookings
      .filter((b) => b.bookingStatus === 'completed' || b.bookingStatus === 'confirmed' || b.bookingStatus === 'active_rental')
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
      totalRevenue,
    };
  }

  getAdminActions(): AdminAction[] {
    return this.data.adminActions || [];
  }

  private logAdminAction(
    action: string,
    targetType: 'bike' | 'booking' | 'user' | 'verification' | 'pricing' | 'terms' | 'inspection' | 'auth' | 'owner' | 'config',
    targetId: string,
    metadata?: any
  ) {
    const act: AdminAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      adminId: 'admin',
      action,
      targetType,
      targetId,
      metadata,
      timestamp: new Date().toISOString(),
    };
    this.data.adminActions.unshift(act);
    this.save();
  }
}

export const localDb = new LocalDatabase();
