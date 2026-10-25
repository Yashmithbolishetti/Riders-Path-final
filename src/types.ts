export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'suspended';
export type AvailabilityStatus = 'AVAILABLE' | 'RESERVED' | 'MAINTENANCE' | 'UNAVAILABLE';
export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
export type FleetLifecycleStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTAL'
  | 'MAINTENANCE'
  | 'UNAVAILABLE'
  | 'REJECTED'
  | 'DEACTIVATED';

export type BookingStatus = 'pending_verification' | 'confirmed' | 'active_rental' | 'completed' | 'cancelled' | 'rejected';
export type VerificationState = 'VERIFICATION PASSED' | 'VERIFICATION FAILED' | 'MANUAL REVIEW REQUIRED';
export type DocumentVerificationResult = 'verified' | 'flagged' | 'rejected' | 'manual_review';
export type DocumentTypeClassification =
  | 'LIKELY_VALID_DOCUMENT'
  | 'LIKELY_DRIVING_LICENCE'
  | 'NOT_DRIVING_LICENCE'
  | 'UNCERTAIN'
  | 'MANUAL_REVIEW'
  | 'MANUAL_REVIEW_REQUIRED';
export type BikeType = 'Street' | 'Sport' | 'Cruiser' | 'Commuter' | 'Scooter' | 'Electric';
export type FuelType = 'Petrol' | 'Electric';
export type Transmission = 'Manual' | 'Automatic';

export type AcademicYear = '1st Year' | '2nd Year' | '3rd Year' | '4th Year' | 'Other';
export type CourseName = 'BBA' | 'B.Tech' | 'Law' | 'MBA' | 'Other';

export interface PickupLocation {
  id: string;
  name: string;
  hubCode?: string;
  address?: string;
  landmark?: string;
  operatingHours?: string;
  contactPhone?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface CommunicationLog {
  id: string;
  bookingId: string;
  channel: 'email' | 'whatsapp';
  type?: 'email' | 'whatsapp';
  recipient: string;
  subject?: string;
  message?: string;
  messagePreview?: string;
  status: 'sent' | 'not_configured' | 'failed';
  errorMessage?: string;
  providerResponse?: string;
  triggeredBy?: string; // admin ID / username
  initiatedBy?: string;
  timestamp: string;
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  icfaiEnrollmentNumber: string; // e.g. 26FMUCHH01XXXX or 23BCS108
  academicYear?: AcademicYear | string;
  course?: CourseName | string;
  courseAndBranch?: string;
  ageConfirmation: boolean;
  drivingLicenseConfirmation: boolean;
  aadharDocument?: string; // base64 or storage url
  drivingLicenseDocument?: string;
  studentIdDocument?: string;
  idCardInformation?: {
    college?: string;
    branch?: string;
    yearOfStudy?: string;
  };
  verificationStatus: VerificationStatus;
  role: 'student' | 'owner' | 'admin';
  lastLoginAt?: string;
  updatedAt?: string;
  createdAt: string;
}

export interface BikeSpecs {
  cc?: number;
  mileage?: string;
  topSpeed?: string;
  fuelCapacity?: string;
  weight?: string;
  abs?: boolean;
  helmetsIncluded?: number;
  helmetSize?: string;
}

export interface Bike {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEnrollment: string;
  ownerAcademicYear?: AcademicYear | string;
  ownerCourse?: CourseName | string;
  brand: string;
  model: string;
  year: number;
  registrationNumber: string; // e.g. TS 08 FG 4821
  displayRegistrationToPublic?: boolean;
  bikeType: BikeType;
  fuelType: FuelType;
  transmission: Transmission;
  description: string;
  images: string[];
  pricePerDay: number;
  pricePerHour?: number;
  securityDeposit: number;
  availabilityStatus: AvailabilityStatus;
  approvalStatus?: ApprovalStatus;
  approvalNotes?: string;
  active: boolean;
  specs: BikeSpecs;
  pickupHub: string;
  pickupLocationId?: string;
  approvedByAdmin: boolean;
  createdAt: string;
}

export interface PickupConditionRecord {
  odometerKm?: number;
  fuelPercent?: number;
  photos: string[];
  notes?: string;
  helmetIssued?: boolean;
  laptopPhysicalDepositLogged?: boolean;
  inspectedBy?: string;
  timestamp?: string;
}

export interface ReturnConditionRecord {
  odometerKm?: number;
  fuelPercent?: number;
  photos: string[];
  notes?: string;
  newDamagesIdentified?: boolean;
  damageNotes?: string;
  damageEstimatedCost?: number;
  fineOrChallanRecorded?: boolean;
  challanAmount?: number;
  challanDetails?: string;
  laptopReturnedToStudent?: boolean;
  inspectedBy?: string;
  timestamp?: string;
}

export interface DepositDeductions {
  damageDeduction?: number;
  fuelDeduction?: number;
  lateFeeDeduction?: number;
  challanDeduction?: number;
  netRefundAmount?: number;
  deductionNotes?: string;
}

export interface TermsAcceptanceRecord {
  userId: string;
  bookingId: string;
  termsVersion: string;
  termsAccepted: boolean;
  termsAcceptedAt: string;
  termsAcceptedIp?: string;
  userAgent?: string;
}

export interface Booking {
  id: string;
  bikeId: string;
  bikeBrand: string;
  bikeModel: string;
  bikeImage: string;
  bikeRegistration?: string;
  pickupHub: string;
  renterId: string;
  renterName: string;
  renterPhone: string;
  renterEmail: string;
  renterEnrollment: string;
  renterAcademicYear?: AcademicYear | string;
  renterCourse?: CourseName | string;
  pickupLocationId?: string;
  pickupLocationName?: string;
  pickupDate: string; // ISO or YYYY-MM-DDTHH:mm
  returnDate: string;
  durationHours: number;
  durationDays: number;
  bookingStatus: BookingStatus;
  verificationStatus: 'pending' | 'approved' | 'rejected' | 'manual_review';
  totalPrice: number;
  securityDeposit: number;
  platformFee: number;
  aadharDocument?: string;
  drivingLicenseDocument?: string;
  studentIdDocument?: string;
  laptopDepositAcknowledged?: boolean;
  paymentStatus: 'pending' | 'paid' | 'deposit_refunded' | 'deposit_adjusted';
  
  // Auditable Terms & Conditions acceptance
  termsAccepted?: boolean;
  termsVersion?: string;
  termsAcceptedAt?: string;
  termsAcceptedIp?: string;

  // Pre-rental and post-rental condition inspection
  pickupConditionRecord?: PickupConditionRecord;
  returnConditionRecord?: ReturnConditionRecord;
  depositRefundStatus?: 'pending_inspection' | 'full_refund_authorized' | 'deduction_applied' | 'refunded';
  depositDeductions?: DepositDeductions;

  handoverNotes?: string;
  qrCodePass?: string;
  adminReviewNotes?: string;
  createdAt: string;
}

export interface DocumentVerification {
  id: string;
  bookingId: string;
  renterId: string;
  userId?: string;
  documentType: 'aadhar' | 'driving_license' | 'student_id';
  documentUrl?: string;
  documentClassification?: DocumentTypeClassification;
  verificationState: VerificationState;
  verificationResult: DocumentVerificationResult;
  extractedInformation: {
    fullName?: string;
    idNumber?: string;
    dob?: string;
    expiryDate?: string;
    enrollmentNumber?: string;
    institution?: string;
    matchedNameScore?: number;
    notes?: string;
  };
  extractedData?: {
    fullName?: string;
    idNumber?: string;
    reasons?: string[];
  };
  confidence: number; // 0 to 100
  confidenceScore?: number;
  reasons: string[];
  checks?: {
    isDrivingLicense?: boolean;
    isReadable?: boolean;
    isComplete?: boolean;
    isNameConsistent?: boolean;
    isLicenseInfoConsistent?: boolean;
    isApparentlyValid?: boolean;
    hasNoStructuralAnomalies?: boolean;
  };
  manualReviewRequired: boolean;
  verifiedBy: string; // 'AI_VISION_OCR' or admin name
  createdAt: string;
}

export interface BikeOwner {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email: string;
  icfaiEnrollmentNumber: string;
  academicYear?: AcademicYear | string;
  course?: CourseName | string;
  payoutUpiId: string;
  totalEarnings: number;
  activeListingsCount: number;
  ownershipVerificationStatus: 'verified' | 'pending' | 'rejected';
  createdAt: string;
}

export type AdminRole = 'super_admin' | 'admin';
export type AdminAccountStatus = 'active' | 'invited' | 'revoked';

export interface AdminUserRecord {
  id: string;
  userId: string | null;
  email: string;
  role: AdminRole;
  status: AdminAccountStatus;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  action: string;
  targetType: 'bike' | 'booking' | 'user' | 'pricing' | 'verification' | 'auth' | 'owner' | 'terms' | 'inspection' | 'config';
  targetId: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface CancellationPolicyConfig {
  freeCancellationHours: number; // e.g. 4 hours before pickup
  cancellationFeePercent: number; // e.g. 15% if cancelled late
  refundProcessingDays: number; // e.g. 1-2 business days
}

export interface LateReturnPolicyConfig {
  gracePeriodMinutes: number; // e.g. 30 mins
  hourlyLateFee: number; // e.g. 100 Rs/hr
  maxLatePenaltyPerDay: number; // e.g. 1200 Rs/day
}

export interface AdminConfig {
  campusHubs: string[];
  defaultSecurityDeposit: number;
  platformFeePercent: number;
  hourlyRentalEnabled: boolean;
  
  // Configurable Terms & Marketplace Policies
  termsVersion: string; // e.g. 'v1.2-2026-AUG'
  termsLastUpdated: string;
  laptopDepositRequired: boolean;
  cancellationPolicy: CancellationPolicyConfig;
  lateReturnPolicy: LateReturnPolicyConfig;
  speedLimitKmph: number;
  minBookingNoticeHours: number;
  trafficFineHandlingFee?: number;
}

export interface DashboardMetrics {
  totalBikes: number;
  availableBikes: number;
  reservedBikes: number;
  maintenanceBikes?: number;
  unavailableBikes?: number;
  activeRentals: number;
  pendingBookings: number;
  totalBookings?: number;
  completedBookings?: number;
  totalRegisteredUsers: number;
  pendingVerifications: number;
  pendingOwnerApprovals: number;
  totalRevenue: number;
}
