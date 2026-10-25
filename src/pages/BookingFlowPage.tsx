import React, { useState, useEffect } from 'react';
import { Bike, Booking, PickupLocation, VerificationState } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { EnrollmentNumberInput } from '../components/EnrollmentNumberInput';
import { VehicleImage } from '../components/VehicleImage';
import { validateIcfaiEnrollment } from '../utils/validation';
import {
  Calendar,
  Clock,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Lock,
  Check,
  Laptop,
  AlertTriangle,
  Info,
  RefreshCw,
  X,
  Scale,
  Trash2,
  Edit3,
} from 'lucide-react';

interface BookingFlowPageProps {
  bike?: Bike;
  bikeId?: string;
  onCancel?: () => void;
  onBack?: () => void;
  onNavigate?: (view: string, params?: any) => void;
  onBookingComplete?: (booking: Booking) => void;
  onBookingSuccess?: (booking: Booking) => void;
}

export const BookingFlowPage: React.FC<BookingFlowPageProps> = ({
  bike: initialBike,
  bikeId,
  onCancel,
  onBack,
  onNavigate,
  onBookingComplete,
  onBookingSuccess,
}) => {
  const {
    studentUser,
    isStudentLoggedIn,
    isLoadingSession,
    showToast,
    updateStudentProfile,
    setAuthReturnDestination,
  } = useAuth();
  const [currentBike, setCurrentBike] = useState<Bike | null>(initialBike || null);
  const [bikeLoading, setBikeLoading] = useState<boolean>(Boolean(bikeId || initialBike?.id));
  const [bikeLoadError, setBikeLoadError] = useState<string>('');
  const [config, setConfig] = useState<any>(null);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // 4-Step Flow (Part 4 Architecture):
  // Step 1 = Rider & Schedule
  // Step 2 = Documents & Verification (Uploads + Eligibility Declarations)
  // Step 3 = Review & Terms
  // Step 4 = Confirmation & Pass (handled on submission / BookingStatusPage)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Rider Profile & Schedule
  const [fullName, setFullName] = useState(studentUser?.fullName || '');
  const [enrollment, setEnrollment] = useState(studentUser?.icfaiEnrollmentNumber || '');
  const [phone, setPhone] = useState(studentUser?.phone || '');
  const [email, setEmail] = useState(studentUser?.email || '');
  const [course, setCourse] = useState(
    studentUser?.courseAndBranch || studentUser?.course || 'B.Tech (CSE)'
  );
  const [academicYear, setAcademicYear] = useState(studentUser?.academicYear || 'Year 3');
  const [selectedHubName, setSelectedHubName] = useState<string>(
    initialBike?.pickupHub || 'ICFAI Main Gate'
  );

  // Field-level errors for Step 1
  const [nameError, setNameError] = useState('');
  const [enrollmentError, setEnrollmentError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Rental Schedule
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [pickupDate, setPickupDate] = useState(`${todayStr}T10:00`);
  const [returnDate, setReturnDate] = useState(`${tomorrowStr}T10:00`);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [scheduleConflictError, setScheduleConflictError] = useState('');

  // Step 2: Documents & Eligibility Declarations
  const [dlDoc, setDlDoc] = useState<string>('');
  const [dlFileName, setDlFileName] = useState<string>('');
  const [aadharDoc, setAadharDoc] = useState<string>('');
  const [aadharFileName, setAadharFileName] = useState<string>('');
  const [studentIdDoc, setStudentIdDoc] = useState<string>('');
  const [studentIdFileName, setStudentIdFileName] = useState<string>('');
  const [aiVerifying, setAiVerifying] = useState(false);
  const [dlAiAnalysis, setDlAiAnalysis] = useState<{
    verificationState: VerificationState;
    confidence: number;
    reasons: string[];
    checks: any;
    extractedFullName?: string;
    extractedIdNumber?: string;
    disclaimer?: string;
  } | null>(null);
  const [overrideManualReview, setOverrideManualReview] = useState(false);

  // 5 Required Eligibility & Collateral Declarations
  const [declaredAge18, setDeclaredAge18] = useState(false);
  const [declaredDL, setDeclaredDL] = useState(false);
  const [declaredAadhaar, setDeclaredAadhaar] = useState(false);
  const [declaredStudentId, setDeclaredStudentId] = useState(false);
  const [declaredLaptopDeposit, setDeclaredLaptopDeposit] = useState(false);

  // Step 3: Review & Terms
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [confirmTerms, setConfirmTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
    api
      .getPickupLocations(true)
      .then((locs) => {
        if (locs && locs.length > 0) {
          setPickupLocations(locs);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (studentUser) {
      if (!fullName) setFullName(studentUser.fullName || '');
      if (!enrollment) setEnrollment(studentUser.icfaiEnrollmentNumber || '');
      if (!phone) setPhone(studentUser.phone || '');
      if (!email) setEmail(studentUser.email || '');
      if (studentUser.courseAndBranch || studentUser.course) {
        setCourse(studentUser.courseAndBranch || studentUser.course || 'B.Tech (CSE)');
      }
      if (studentUser.academicYear) {
        setAcademicYear(studentUser.academicYear);
      }
    }
  }, [studentUser]);

  // Always fetch the latest bike details & availability from the backend
  useEffect(() => {
    const targetId = bikeId || initialBike?.id;
    if (!targetId) {
      setBikeLoading(false);
      return;
    }
    setBikeLoading(true);
    setBikeLoadError('');
    api
      .getBikeById(targetId)
      .then((data) => {
        setCurrentBike(data);
        if (data?.pickupHub) setSelectedHubName(data.pickupHub);
      })
      .catch((err) => {
        console.error(err);
        if (!initialBike) {
          setBikeLoadError('This vehicle listing could not be found or is no longer active.');
        }
      })
      .finally(() => setBikeLoading(false));
  }, [bikeId, initialBike?.id]);

  const handleCancel = () => {
    if (typeof onCancel === 'function') onCancel();
    else if (typeof onBack === 'function') onBack();
  };

  const handleComplete = (booking: Booking) => {
    if (typeof onBookingComplete === 'function') onBookingComplete(booking);
    if (typeof onBookingSuccess === 'function') onBookingSuccess(booking);
  };

  const bike =
    currentBike ||
    ({
      id: bikeId || 'unknown',
      brand: 'Campus Bike',
      model: 'Rental Ride',
      bikeType: 'Motorcycle',
      pricePerDay: 500,
      pricePerHour: 21,
      securityDeposit: 1000,
      availabilityStatus: 'AVAILABLE',
      pickupHub: 'ICFAI Main Gate',
      ownerName: 'Student Host',
      ownerEnrollment: 'ICFAI',
      images: [],
    } as unknown as Bike);

  // Duration & Pricing Calculation
  const pickupTime = new Date(pickupDate).getTime();
  const returnTime = new Date(returnDate).getTime();
  const isValidDateRange = !isNaN(pickupTime) && !isNaN(returnTime) && returnTime > pickupTime;
  const diffHours = isValidDateRange
    ? Math.max(1, Math.round((returnTime - pickupTime) / (1000 * 60 * 60)))
    : 24;
  const diffDays = Math.max(1, Math.ceil(diffHours / 24));

  const rentalTotal = diffDays * (bike.pricePerDay || 500);
  const platformFee = Math.round(rentalTotal * 0.08);
  const securityDeposit = bike.securityDeposit || 1000;
  const totalPayableAtHandover = rentalTotal + platformFee + securityDeposit;

  // Quick Duration Preset Helper
  const applyDurationPreset = (days: number) => {
    const start = new Date(pickupDate);
    if (isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formattedEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(
      end.getDate()
    )}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
    setReturnDate(formattedEnd);
    setScheduleConflictError('');
  };

  // Check schedule conflict with backend
  const checkScheduleConflict = async (): Promise<boolean> => {
    try {
      setCheckingAvailability(true);
      setScheduleConflictError('');
      const res = await api.checkBikeAvailability(bike.id, pickupDate, returnDate);
      if (!res.available) {
        setScheduleConflictError(
          res.reason || 'This bike is already reserved for the selected dates.'
        );
        return false;
      }
      return true;
    } catch (err: any) {
      setScheduleConflictError(err.message || 'Could not verify vehicle schedule.');
      return false;
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Step 1 -> Step 2
  const handleStep1Next = async () => {
    setNameError('');
    setEnrollmentError('');
    setPhoneError('');
    setError('');

    let hasFieldError = false;

    if (!fullName.trim() || fullName.trim().length < 2) {
      setNameError('Enter your full legal name as shown on your Driving Licence and College ID.');
      hasFieldError = true;
    }

    const enrollmentCheck = validateIcfaiEnrollment(enrollment);
    if (!enrollmentCheck.valid) {
      setEnrollmentError(enrollmentCheck.error || 'Enter your ICFAI enrollment number.');
      hasFieldError = true;
    }

    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (!phone.trim() || phoneDigits.length < 10) {
      setPhoneError('Enter a valid 10-digit WhatsApp or mobile number for handover coordination.');
      hasFieldError = true;
    }

    if (hasFieldError) {
      return;
    }

    const pTime = new Date(pickupDate).getTime();
    const rTime = new Date(returnDate).getTime();
    const nowTime = Date.now() - 5 * 60 * 1000;

    if (isNaN(pTime) || isNaN(rTime)) {
      setError('Select valid pickup and return dates and times.');
      return;
    }
    if (pTime < nowTime) {
      setError('Pickup date and time cannot be in the past.');
      return;
    }
    if (pTime >= rTime) {
      setError('Return date and time must be after pickup date and time.');
      return;
    }

    const isAvailable = await checkScheduleConflict();
    if (!isAvailable) {
      return;
    }

    // Save/sync student profile quietly when authenticated so future bookings are pre-filled
    if (studentUser && isStudentLoggedIn) {
      updateStudentProfile({
        fullName: fullName.trim(),
        enrollment: enrollmentCheck.normalized,
        phone: phone.trim(),
        email:
          email.trim() ||
          `${enrollmentCheck.normalized.toLowerCase()}@student.icfaiuniversity.in`,
        academicYear,
        course,
      }).catch(() => {});
    }

    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to get image dimensions from base64 data URL
  const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
  };

  // Document Upload Handler (Step 2)
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    category: 'driving_license' | 'aadhar' | 'student_id'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
      setError('Unsupported file format. Please upload a JPG, PNG, or WEBP image.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(`"${file.name}" exceeds the 10MB file size limit. Please choose a smaller photo.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setError('');

      if (category === 'driving_license') {
        setDlDoc(base64);
        setDlFileName(file.name);
        setOverrideManualReview(false);

        try {
          setAiVerifying(true);
          const dims = await getImageDimensions(base64);
          const result = await api.verifyDocumentDirect({
            documentBase64: base64,
            mimeType: file.type || 'image/jpeg',
            expectedName: fullName.trim(),
            expectedEnrollment: enrollment.trim().toUpperCase(),
            documentCategory: 'driving_license',
            fileName: file.name,
            imageWidth: dims.width,
            imageHeight: dims.height,
          });

          setDlAiAnalysis({
            verificationState: result.verificationState,
            confidence: result.confidence,
            reasons: result.reasons || [],
            checks: result.checks || {},
            extractedFullName: result.extractedFullName,
            extractedIdNumber: result.extractedIdNumber,
            disclaimer: result.disclaimer,
          });

          if (result.verificationState === 'VERIFICATION PASSED') {
            showToast('Preliminary Driving Licence check passed.', 'success');
          } else if (result.verificationState === 'VERIFICATION FAILED') {
            showToast('Needs clearer Driving Licence photo or manual review.', 'error');
          } else {
            showToast('Driving Licence queued for manual admin review.', 'info');
          }
        } catch {
          // Conservative fallback: NEVER fabricate a fake 94% genuine licence pass
          setDlAiAnalysis({
            verificationState: 'MANUAL REVIEW REQUIRED',
            confidence: 60,
            reasons: [
              'Automated screening could not be completed at this moment.',
              'Your Driving Licence image has been queued for manual administrator review.',
              'Original physical Driving Licence must be presented at bike handover.',
            ],
            checks: {
              isDrivingLicense: true,
              isReadable: true,
              isComplete: true,
              isNameConsistent: true,
              isLicenseInfoConsistent: true,
              isApparentlyValid: true,
              hasNoStructuralAnomalies: true,
            },
            disclaimer:
              'Preliminary automated screening only. Final document verification is performed by the admin team and at physical bike handover.',
          });
        } finally {
          setAiVerifying(false);
        }
      } else if (category === 'aadhar') {
        setAadharDoc(base64);
        setAadharFileName(file.name);
      } else if (category === 'student_id') {
        setStudentIdDoc(base64);
        setStudentIdFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const allDeclarationsChecked =
    declaredAge18 &&
    declaredDL &&
    declaredAadhaar &&
    declaredStudentId &&
    declaredLaptopDeposit;

  const toggleAllDeclarations = () => {
    const next = !allDeclarationsChecked;
    setDeclaredAge18(next);
    setDeclaredDL(next);
    setDeclaredAadhaar(next);
    setDeclaredStudentId(next);
    setDeclaredLaptopDeposit(next);
  };

  // Step 2 -> Step 3
  const handleStep2Next = () => {
    if (!dlDoc) {
      setError('Please upload a clear front photo of your Government Driving Licence.');
      return;
    }
    if (
      dlAiAnalysis?.verificationState === 'VERIFICATION FAILED' &&
      !overrideManualReview
    ) {
      setError(
        'Your Driving Licence image did not pass preliminary screening. Please replace it with a clear photo of your physical Driving Licence card, or check the box to request manual admin review.'
      );
      return;
    }
    if (!aadharDoc) {
      setError('Please upload a clear front photo of your Aadhaar Card for identity verification.');
      return;
    }
    if (!allDeclarationsChecked) {
      setError(
        'Please confirm all 5 mandatory eligibility and collateral declarations to continue.'
      );
      return;
    }
    setError('');
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 3 -> Final Submission
  const handleFinalSubmit = async () => {
    if (submitting) return;
    if (!confirmAccurate || !confirmTerms) {
      setError(
        'Please confirm information accuracy and accept the Riders Path Terms & Conditions before submitting.'
      );
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const termsVer = config?.termsVersion || 'v1.2-2026-AUG';
      const cleanEnrollment = validateIcfaiEnrollment(enrollment).normalized;
      const selectedHubObj = pickupLocations.find((l) => l.name === selectedHubName);

      const result = await api.createBooking({
        bikeId: bike.id,
        renterName: fullName.trim(),
        renterPhone: phone.trim(),
        renterEmail:
          email.trim() || `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
        renterEnrollment: cleanEnrollment,
        renterAcademicYear: academicYear,
        renterCourse: course,
        pickupLocationId: selectedHubObj?.id,
        pickupLocationName: selectedHubName || bike.pickupHub,
        pickupDate: new Date(pickupDate).toISOString(),
        returnDate: new Date(returnDate).toISOString(),
        durationHours: diffHours,
        durationDays: diffDays,
        aadharDoc,
        dlDoc,
        studentIdDoc: studentIdDoc || undefined,
        laptopDepositAcknowledged: declaredLaptopDeposit,
        termsAccepted: true,
        termsVersion: termsVer,
      });

      showToast('Booking request submitted for verification.', 'success');
      handleComplete(result.booking);
    } catch (err: any) {
      setError(err.message || 'Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Rider & Schedule' },
    { num: 2, title: 'Documents & Eligibility' },
    { num: 3, title: 'Review & Terms' },
    { num: 4, title: 'Confirmation & Pass' },
  ];

  const hubOptions =
    pickupLocations.length > 0
      ? pickupLocations.map((l) => l.name)
      : [
          bike.pickupHub || 'ICFAI Main Gate',
          'Socials Gaming Zone',
          "Kaka's Hotel",
          'IBS Academic Block Hub',
          'Boys Hostel Zone 1',
        ];

  const activeHubDetails = pickupLocations.find((l) => l.name === selectedHubName);

  // Conservative user-friendly label for AI Screening State
  const getScreeningBadgeLabel = (state: VerificationState) => {
    if (state === 'VERIFICATION PASSED') return 'Preliminary Check Passed';
    if (state === 'VERIFICATION FAILED') return 'Needs Clearer Upload';
    return 'Manual Review Required';
  };

  if (bikeLoading || isLoadingSession) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#29483B] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-[#70756F]">Verifying vehicle availability &amp; session...</p>
      </div>
    );
  }

  if (bikeLoadError || !currentBike) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-5">
        <div className="p-6 rp-card space-y-3">
          <AlertTriangle className="w-8 h-8 text-[#9A6B25] mx-auto" />
          <h1 className="font-display font-bold text-xl text-[#202522]">
            Vehicle Listing Not Found
          </h1>
          <p className="text-xs text-[#70756F] leading-relaxed">
            {bikeLoadError || 'The requested bike is no longer listed in the active campus catalog.'}
          </p>
          <button
            type="button"
            onClick={() => (onNavigate ? onNavigate('bikes') : handleCancel())}
            className="rp-btn rp-btn-primary w-full"
          >
            Return to Explore Bikes
          </button>
        </div>
      </div>
    );
  }

  // Stop booking if visitor is signed out and preserve return destination
  if (!isStudentLoggedIn || !studentUser) {
    const redirectToAuth = (authView: 'login' | 'signup') => {
      setAuthReturnDestination({
        view: 'book',
        bikeId: bike.id,
        bikeName: `${bike.brand} ${bike.model}`,
        reason: `Sign in or create your student account to book ${bike.brand} ${bike.model}.`,
      });
      if (onNavigate) {
        onNavigate(authView, { bikeId: bike.id });
      }
    };

    return (
      <div className="max-w-lg mx-auto px-4 py-16 space-y-6">
        <div className="p-6 sm:p-8 rp-card space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#EBF0ED] border border-[#CBE2D6] text-[#29483B] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <span className="rp-kicker block">Protected Campus Booking</span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              Sign in to book {bike.brand} {bike.model}
            </h1>
            <p className="text-xs text-[#70756F] leading-relaxed max-w-md mx-auto">
              Riders Path bookings are linked to verified ICFAI Hyderabad student accounts. Sign in or create an account and we will bring you right back to complete this booking.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] flex items-center justify-between text-xs text-left">
            <div>
              <span className="font-semibold text-[#202522] block">
                {bike.brand} {bike.model}
              </span>
              <span className="text-[#70756F]">Pickup: {bike.pickupHub}</span>
            </div>
            <span className="font-mono font-semibold text-[#29483B] tabular-nums">
              ₹{bike.pricePerDay}/day
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              id="booking-gate-login-btn"
              type="button"
              onClick={() => redirectToAuth('login')}
              className="rp-btn rp-btn-primary rp-btn-lg flex-1"
            >
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="booking-gate-signup-btn"
              type="button"
              onClick={() => redirectToAuth('signup')}
              className="rp-btn rp-btn-secondary rp-btn-lg flex-1"
            >
              <span>Create Account</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="text-xs text-[#70756F] hover:text-[#202522] font-medium"
          >
            ← Back to Bike Details
          </button>
        </div>
      </div>
    );
  }

  // Stop booking if bike became unavailable while the visitor was signing in
  if (
    currentBike.availabilityStatus !== 'AVAILABLE' ||
    currentBike.approvedByAdmin === false ||
    currentBike.active === false
  ) {
    const statusReason =
      currentBike.availabilityStatus === 'RESERVED'
        ? 'Another student recently reserved this vehicle, so it is currently unavailable for new bookings.'
        : currentBike.availabilityStatus === 'MAINTENANCE'
        ? 'This vehicle is currently undergoing scheduled maintenance and cannot be booked at this time.'
        : 'This vehicle listing is currently unavailable for booking.';

    return (
      <div className="max-w-lg mx-auto px-4 py-16 space-y-6">
        <div className="p-6 sm:p-8 rp-card space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F7F1E6] border border-[#E8D6B9] text-[#9A6B25] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#9A6B25] font-semibold block">
              Vehicle Status: {currentBike.availabilityStatus}
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              {currentBike.brand} {currentBike.model} is no longer available
            </h1>
            <p className="text-xs text-[#70756F] leading-relaxed max-w-md mx-auto">
              {statusReason} No booking has been created. Please explore other available campus bikes.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate('bikes') : handleCancel())}
              className="rp-btn rp-btn-primary rp-btn-lg flex-1"
            >
              <span>Explore Available Bikes</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rp-btn rp-btn-secondary rp-btn-lg"
            >
              <span>Back to Details</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Navigation & Status */}
      <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-4">
        <button
          type="button"
          onClick={handleCancel}
          className="rp-btn rp-btn-secondary rp-btn-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Bike Details</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-[#29483B] font-medium">
          <Lock className="w-3.5 h-3.5" />
          <span>Step {currentStep} of 4 · Campus Booking Request</span>
        </div>
      </div>

      {/* Selected Bike Summary Header */}
      <div className="p-4 rp-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-20 h-14 rounded-lg overflow-hidden border border-[#E5E4DE] bg-[#EFEEE8] shrink-0">
            <VehicleImage
              src={bike.images?.[0]}
              alt={bike.model}
              brand={bike.brand}
              model={bike.model}
              bikeType={bike.bikeType}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#70756F]">
              <span className="font-medium text-[#29483B]">{bike.brand}</span>
              <span aria-hidden="true">·</span>
              <span>{bike.bikeType}</span>
              <span aria-hidden="true">·</span>
              <span>{bike.transmission}</span>
            </div>
            <h3 className="font-display font-semibold text-[#202522] text-base">{bike.model}</h3>
            <p className="text-xs text-[#70756F] flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-[#29483B]" />
              <span>Pickup: {selectedHubName}</span>
            </p>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2.5 sm:pt-0 border-[#E5E4DE]">
          <span className="text-[11px] text-[#70756F]">Rental Rate &amp; Deposit</span>
          <div className="text-right">
            <span className="font-display font-bold text-base text-[#202522] tabular-nums">
              ₹{bike.pricePerDay}
              <span className="text-xs text-[#70756F] font-normal"> / day</span>
            </span>
            <span className="block text-[11px] font-mono text-[#70756F] tabular-nums">
              ₹{bike.pricePerHour}/hr · ₹{securityDeposit} deposit
            </span>
          </div>
        </div>
      </div>

      {/* 4-Step Progress Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {stepsList.map((s) => (
          <div
            key={s.num}
            className={`p-2.5 sm:p-3 rounded-lg border flex items-center gap-2 transition-all ${
              currentStep === s.num
                ? 'bg-white border-[#29483B] text-[#202522] shadow-xs'
                : currentStep > s.num
                ? 'bg-[#ECF4F0] border-[#CBE2D6] text-[#24583C]'
                : 'bg-[#EFEEE8]/60 border-[#E5E4DE] text-[#70756F]'
            }`}
          >
            <div
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0 tabular-nums ${
                currentStep === s.num
                  ? 'bg-[#29483B] text-white'
                  : currentStep > s.num
                  ? 'bg-[#347653] text-white'
                  : 'bg-[#E5E4DE] text-[#70756F]'
              }`}
            >
              {currentStep > s.num ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s.num}
            </div>
            <span className="font-medium truncate">{s.title}</span>
          </div>
        ))}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: RIDER & SCHEDULE */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="p-6 sm:p-8 rp-card space-y-8">
          {/* Part 1A: Student Rider Details */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E5E4DE] pb-3">
              <div>
                <h2 className="font-display font-semibold text-lg text-[#202522]">
                  01. Student Rider Credentials
                </h2>
                <p className="text-xs text-[#70756F]">
                  Enter your ICFAI Hyderabad details. These must match the documents presented at pickup.
                </p>
              </div>
              {studentUser && (
                <span className="text-[11px] text-[#347653] font-medium">
                  ✓ Pre-filled from your signed-in profile
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="rp-label">
                  Full Legal Name (as on Driving Licence &amp; ID){' '}
                  <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="e.g. Rahul Sharma"
                  className={`rp-input ${nameError ? '!border-[#B44242]' : ''}`}
                />
                {nameError && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">{nameError}</p>
                )}
              </div>

              <EnrollmentNumberInput
                id="booking-renter-enrollment"
                value={enrollment}
                onChange={(val) => {
                  setEnrollment(val);
                  if (enrollmentError) setEnrollmentError('');
                }}
                label="ICFAI Enrollment Number"
                required
                showHelpText
                showStatusBadge
                error={enrollmentError}
              />

              <div>
                <label className="rp-label">
                  WhatsApp / Mobile Number <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  placeholder="+91 98765 43210"
                  className={`rp-input tabular-nums ${phoneError ? '!border-[#B44242]' : ''}`}
                />
                {phoneError && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">{phoneError}</p>
                )}
              </div>

              <div>
                <label className="rp-label">Student Email ID</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@icfaiuniversity.in"
                  className="rp-input"
                />
              </div>

              <div>
                <label className="rp-label">Program / Faculty</label>
                <select
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="rp-select"
                >
                  <option value="B.Tech (CSE)">FST · B.Tech (CSE / AI)</option>
                  <option value="BBA">IBS · BBA</option>
                  <option value="MBA">IBS · MBA</option>
                  <option value="BA LLB">ICFAI Law School · BA/BBA LLB</option>
                  <option value="B.Sc / BCA">FST · B.Sc / BCA</option>
                </select>
              </div>

              <div>
                <label className="rp-label">Academic Year</label>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="rp-select"
                >
                  <option value="Year 1">Year 1</option>
                  <option value="Year 2">Year 2</option>
                  <option value="Year 3">Year 3</option>
                  <option value="Year 4">Year 4</option>
                  <option value="Year 5 / PG">Year 5 / Postgraduate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Part 1B: Rental Schedule & Pickup Location */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E4DE] pb-3">
              <div>
                <h2 className="font-display font-semibold text-lg text-[#202522]">
                  02. Rental Schedule &amp; Pickup Hub
                </h2>
                <p className="text-xs text-[#70756F]">
                  Select your pickup and return dates. Availability is verified against existing reservations.
                </p>
              </div>

              {/* Quick Duration Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#70756F] mr-1">Quick Duration:</span>
                {[
                  { label: '1 Day', days: 1 },
                  { label: '2 Days', days: 2 },
                  { label: '3 Days', days: 3 },
                  { label: '7 Days', days: 7 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => applyDurationPreset(preset.days)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      diffDays === preset.days
                        ? 'bg-[#29483B] text-white border-[#29483B]'
                        : 'bg-[#F7F6F2] text-[#202522] border-[#E5E4DE] hover:border-[#29483B]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="rp-label flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#29483B]" />
                  <span>Pickup Date &amp; Time <span className="text-[#B44242]">*</span></span>
                </label>
                <input
                  type="datetime-local"
                  min={todayStr}
                  value={pickupDate}
                  onChange={(e) => {
                    setPickupDate(e.target.value);
                    setScheduleConflictError('');
                  }}
                  className="rp-input tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#29483B]" />
                  <span>Return Date &amp; Time <span className="text-[#B44242]">*</span></span>
                </label>
                <input
                  type="datetime-local"
                  min={pickupDate.slice(0, 10)}
                  value={returnDate}
                  onChange={(e) => {
                    setReturnDate(e.target.value);
                    setScheduleConflictError('');
                  }}
                  className="rp-input tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#29483B]" />
                  <span>Campus Pickup Hub <span className="text-[#B44242]">*</span></span>
                </label>
                <select
                  value={selectedHubName}
                  onChange={(e) => setSelectedHubName(e.target.value)}
                  className="rp-select"
                >
                  {hubOptions.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {activeHubDetails && (
                  <p className="rp-helper">
                    Hours: {activeHubDetails.operatingHours || '07:00 AM - 10:30 PM'}
                  </p>
                )}
              </div>
            </div>

            {scheduleConflictError && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-[#B44242] shrink-0" />
                <span>{scheduleConflictError}</span>
              </div>
            )}

            {/* Live Price Summary Card */}
            <div className="p-5 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3">
              <div className="flex items-center justify-between text-xs text-[#70756F]">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#29483B]" />
                  <span>Calculated Duration</span>
                </span>
                <span className="font-mono font-semibold text-[#202522] tabular-nums">
                  {diffDays} Day(s) ({diffHours} Total Hours)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[#70756F]">
                <span>
                  Rental Subtotal (₹{bike.pricePerDay} / day × {diffDays} days)
                </span>
                <span className="font-mono font-medium text-[#202522] tabular-nums">
                  ₹{rentalTotal}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[#70756F]">
                <span>Platform Service &amp; Verification Fee (8%)</span>
                <span className="font-mono font-medium text-[#202522] tabular-nums">
                  ₹{platformFee}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[#24583C] pt-2.5 border-t border-[#E5E4DE]">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-[#347653]" />
                  <span>Refundable Cash Security Deposit</span>
                </span>
                <span className="font-mono font-semibold tabular-nums">₹{securityDeposit}</span>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-[#E5E4DE] text-xs flex items-start gap-2.5">
                <Laptop className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <strong className="text-[#202522] block font-semibold">
                    Physical Laptop Collateral Required at Handover
                  </strong>
                  <p className="text-[#70756F] leading-relaxed text-[11px]">
                    Student renters deposit a working laptop as physical collateral alongside the ₹{securityDeposit} refundable cash deposit at key handover.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-semibold text-[#202522] pt-2.5 border-t border-[#E5E4DE]">
                <span>Total Payable at Handover</span>
                <span className="font-display font-bold text-[#29483B] text-lg font-mono tabular-nums">
                  ₹{totalPayableAtHandover}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="step1-next-btn"
              type="button"
              onClick={handleStep1Next}
              disabled={checkingAvailability}
              className="rp-btn rp-btn-primary rp-btn-lg"
            >
              {checkingAvailability ? (
                <span>Checking Vehicle Schedule...</span>
              ) : (
                <>
                  <span>Continue to Documents &amp; Eligibility</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: DOCUMENTS & ELIGIBILITY VERIFICATION */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="p-6 sm:p-8 rp-card space-y-8">
          {/* Part 2A: Document Uploads */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E5E4DE] pb-3">
              <div>
                <h2 className="font-display font-semibold text-lg text-[#202522]">
                  01. Upload Verification Documents
                </h2>
                <p className="text-xs text-[#70756F]">
                  Upload clear, well-lit photographs of your original documents. Screenshots or unrelated images will not pass screening.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#70756F]">
                JPG, PNG, WEBP · Max 10MB
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Driving Licence Upload (Required) */}
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#202522]">
                      Driving Licence (Front) <span className="text-[#B44242]">*</span>
                    </span>
                    <span className="rp-status rp-status-neutral !py-0.5 !px-1.5 !text-[10px]">
                      Required
                    </span>
                  </div>
                  <p className="text-[11px] text-[#70756F]">
                    Valid Indian Two-Wheeler Driving Licence showing name, licence number, and validity.
                  </p>
                </div>

                {dlDoc ? (
                  <div className="space-y-2">
                    <div className="relative h-36 rounded-lg overflow-hidden border border-[#E5E4DE] bg-white">
                      <img
                        src={dlDoc}
                        alt="Driving Licence Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2">
                        <span
                          className={`rp-status !py-0.5 !px-2 !text-[10px] ${
                            dlAiAnalysis?.verificationState === 'VERIFICATION FAILED'
                              ? 'rp-status-error'
                              : dlAiAnalysis?.verificationState === 'VERIFICATION PASSED'
                              ? 'rp-status-success'
                              : 'rp-status-warning'
                          }`}
                        >
                          {dlAiAnalysis
                            ? getScreeningBadgeLabel(dlAiAnalysis.verificationState)
                            : 'Attached'}
                        </span>
                      </div>
                    </div>
                    {dlFileName && (
                      <p className="text-[11px] font-mono text-[#70756F] truncate">{dlFileName}</p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <label className="inline-flex items-center gap-1 text-[#29483B] hover:underline font-medium cursor-pointer">
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'driving_license')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setDlDoc('');
                          setDlFileName('');
                          setDlAiAnalysis(null);
                        }}
                        className="inline-flex items-center gap-1 text-[#B44242] hover:underline font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border border-dashed border-[#D4D2C8] hover:border-[#29483B] rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-colors text-center space-y-1.5 bg-white min-h-[144px]">
                    <Upload className="w-5 h-5 text-[#29483B]" />
                    <span className="text-xs text-[#202522] font-semibold">
                      Upload Driving Licence
                    </span>
                    <span className="text-[11px] text-[#70756F]">
                      Clear photo of physical card
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'driving_license')}
                    />
                  </label>
                )}
              </div>

              {/* 2. Aadhaar Card Upload (Required) */}
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#202522]">
                      Aadhaar / Govt ID <span className="text-[#B44242]">*</span>
                    </span>
                    <span className="rp-status rp-status-neutral !py-0.5 !px-1.5 !text-[10px]">
                      Required
                    </span>
                  </div>
                  <p className="text-[11px] text-[#70756F]">
                    Used strictly for student identity verification by authorized staff.
                  </p>
                </div>

                {aadharDoc ? (
                  <div className="space-y-2">
                    <div className="relative h-36 rounded-lg overflow-hidden border border-[#E5E4DE] bg-white">
                      <img
                        src={aadharDoc}
                        alt="Aadhaar Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2">
                        <span className="rp-status rp-status-success !py-0.5 !px-2 !text-[10px]">
                          Attached
                        </span>
                      </div>
                    </div>
                    {aadharFileName && (
                      <p className="text-[11px] font-mono text-[#70756F] truncate">
                        {aadharFileName}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <label className="inline-flex items-center gap-1 text-[#29483B] hover:underline font-medium cursor-pointer">
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'aadhar')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAadharDoc('');
                          setAadharFileName('');
                        }}
                        className="inline-flex items-center gap-1 text-[#B44242] hover:underline font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border border-dashed border-[#D4D2C8] hover:border-[#29483B] rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-colors text-center space-y-1.5 bg-white min-h-[144px]">
                    <Upload className="w-5 h-5 text-[#29483B]" />
                    <span className="text-xs text-[#202522] font-semibold">
                      Upload Aadhaar Card
                    </span>
                    <span className="text-[11px] text-[#70756F]">
                      Front side with name &amp; photo
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'aadhar')}
                    />
                  </label>
                )}
              </div>

              {/* 3. ICFAI Student ID Upload (Optional upload, mandatory at pickup) */}
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#202522]">
                      ICFAI Student ID Card
                    </span>
                    <span className="text-[10px] font-mono text-[#70756F]">Optional Upload</span>
                  </div>
                  <p className="text-[11px] text-[#70756F]">
                    Upload now for faster approval, or present your physical card at pickup.
                  </p>
                </div>

                {studentIdDoc ? (
                  <div className="space-y-2">
                    <div className="relative h-36 rounded-lg overflow-hidden border border-[#E5E4DE] bg-white">
                      <img
                        src={studentIdDoc}
                        alt="ICFAI Student ID Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2">
                        <span className="rp-status rp-status-success !py-0.5 !px-2 !text-[10px]">
                          Attached
                        </span>
                      </div>
                    </div>
                    {studentIdFileName && (
                      <p className="text-[11px] font-mono text-[#70756F] truncate">
                        {studentIdFileName}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <label className="inline-flex items-center gap-1 text-[#29483B] hover:underline font-medium cursor-pointer">
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'student_id')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentIdDoc('');
                          setStudentIdFileName('');
                        }}
                        className="inline-flex items-center gap-1 text-[#B44242] hover:underline font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border border-dashed border-[#D4D2C8] hover:border-[#29483B] rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-colors text-center space-y-1.5 bg-white min-h-[144px]">
                    <Upload className="w-5 h-5 text-[#70756F]" />
                    <span className="text-xs text-[#202522] font-medium">
                      Upload College ID (Optional)
                    </span>
                    <span className="text-[11px] text-[#70756F]">
                      Physical card required at handover
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'student_id')}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* AI / Preliminary Document Screening Result Panel */}
            {aiVerifying && (
              <div className="p-4 rounded-xl bg-[#F7F1E6] border border-[#E8D6B9] flex items-center gap-3 text-xs text-[#7D551B]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#9A6B25] shrink-0" />
                <span>
                  Running preliminary legibility and Driving Licence indicator screening...
                </span>
              </div>
            )}

            {dlAiAnalysis && !aiVerifying && (
              <div
                className={`p-5 rounded-xl border space-y-3.5 ${
                  dlAiAnalysis.verificationState === 'VERIFICATION FAILED'
                    ? 'bg-[#F9EDED] border-[#E8C5C5]'
                    : dlAiAnalysis.verificationState === 'VERIFICATION PASSED'
                    ? 'bg-[#ECF4F0]/70 border-[#CBE2D6]'
                    : 'bg-[#F7F6F2] border-[#E5E4DE]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E4DE] pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#202522]">
                      Driving Licence Preliminary Screening:
                    </span>
                    <span
                      className={`rp-status ${
                        dlAiAnalysis.verificationState === 'VERIFICATION PASSED'
                          ? 'rp-status-success'
                          : dlAiAnalysis.verificationState === 'VERIFICATION FAILED'
                          ? 'rp-status-error'
                          : 'rp-status-warning'
                      }`}
                    >
                      {getScreeningBadgeLabel(dlAiAnalysis.verificationState)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#70756F]">Optical Confidence:</span>
                    <span className="font-mono font-bold text-[#202522] tabular-nums">
                      {dlAiAnalysis.confidence}%
                    </span>
                  </div>
                </div>

                {(dlAiAnalysis.extractedFullName || dlAiAnalysis.extractedIdNumber) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-white border border-[#E5E4DE] text-xs">
                    <div>
                      <span className="text-[11px] text-[#70756F] block">Detected Holder Name</span>
                      <span className="font-semibold text-[#202522]">
                        {dlAiAnalysis.extractedFullName || 'Pending manual check'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#70756F] block">Detected Licence No.</span>
                      <span className="font-mono font-semibold text-[#29483B]">
                        {dlAiAnalysis.extractedIdNumber || 'Pending manual check'}
                      </span>
                    </div>
                  </div>
                )}

                {dlAiAnalysis.reasons.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-xs text-[#202522]">
                    {dlAiAnalysis.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                )}

                {dlAiAnalysis.verificationState === 'VERIFICATION FAILED' && (
                  <div className="pt-2 border-t border-[#E8C5C5] space-y-2">
                    <p className="text-xs font-medium text-[#8F3030]">
                      We strongly recommend replacing this image with a clear photo of your original physical Driving Licence card.
                    </p>
                    <label className="flex items-center gap-2.5 text-xs text-[#202522] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={overrideManualReview}
                        onChange={(e) => setOverrideManualReview(e.target.checked)}
                        className="w-4 h-4 accent-[#29483B] rounded"
                      />
                      <span>
                        Submit this document for manual administrator inspection anyway
                      </span>
                    </label>
                  </div>
                )}

                <p className="text-[11px] text-[#70756F]">
                  {dlAiAnalysis.disclaimer ||
                    'Preliminary automated screening only. Final document verification is performed by the admin team and at physical bike handover.'}
                </p>
              </div>
            )}
          </div>

          {/* Part 2B: Mandatory Eligibility & Collateral Declarations */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E4DE] pb-3">
              <div>
                <h2 className="font-display font-semibold text-lg text-[#202522]">
                  02. Eligibility &amp; Collateral Confirmations
                </h2>
                <p className="text-xs text-[#70756F]">
                  Confirm all five marketplace requirements before reviewing your booking.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAllDeclarations}
                className="rp-btn rp-btn-secondary rp-btn-sm self-start sm:self-auto"
              >
                {allDeclarationsChecked ? 'Uncheck All' : 'Confirm All 5 Declarations'}
              </button>
            </div>

            <div className="space-y-2.5 p-5 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] text-xs text-[#202522]">
              <label className="flex items-start gap-3 p-3 rounded-lg bg-white hover:border-[#29483B]/40 cursor-pointer select-none transition-colors border border-[#E5E4DE]">
                <input
                  type="checkbox"
                  checked={declaredAge18}
                  onChange={(e) => setDeclaredAge18(e.target.checked)}
                  className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="leading-relaxed">
                  <strong>Age Confirmation:</strong> I confirm that I am 18 years of age or older.
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white hover:border-[#29483B]/40 cursor-pointer select-none transition-colors border border-[#E5E4DE]">
                <input
                  type="checkbox"
                  checked={declaredDL}
                  onChange={(e) => setDeclaredDL(e.target.checked)}
                  className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="leading-relaxed">
                  <strong>Driving Licence Confirmation:</strong> I confirm that I hold a valid Indian Driving Licence and agree to present the physical card at handover.
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white hover:border-[#29483B]/40 cursor-pointer select-none transition-colors border border-[#E5E4DE]">
                <input
                  type="checkbox"
                  checked={declaredAadhaar}
                  onChange={(e) => setDeclaredAadhaar(e.target.checked)}
                  className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="leading-relaxed">
                  <strong>Aadhaar Document:</strong> I agree to provide my Aadhaar card for student identity verification on Riders Path.
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white hover:border-[#29483B]/40 cursor-pointer select-none transition-colors border border-[#E5E4DE]">
                <input
                  type="checkbox"
                  checked={declaredStudentId}
                  onChange={(e) => setDeclaredStudentId(e.target.checked)}
                  className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="leading-relaxed">
                  <strong>Student Identification:</strong> I agree to present my physical ICFAI University Student ID card during bike handover at {selectedHubName}.
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white hover:border-[#29483B]/40 cursor-pointer select-none transition-colors border border-[#E5E4DE]">
                <input
                  type="checkbox"
                  checked={declaredLaptopDeposit}
                  onChange={(e) => setDeclaredLaptopDeposit(e.target.checked)}
                  className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="leading-relaxed">
                  <strong>Laptop Security Deposit:</strong> I understand and accept that a functioning laptop is required as physical collateral during the rental period alongside the ₹{securityDeposit} refundable deposit.
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="rp-btn rp-btn-secondary"
            >
              Back to Rider &amp; Schedule
            </button>
            <button
              id="step2-next-btn"
              type="button"
              onClick={handleStep2Next}
              disabled={aiVerifying}
              className="rp-btn rp-btn-primary rp-btn-lg"
            >
              <span>Continue to Review &amp; Terms</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: REVIEW & TERMS */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div className="p-6 sm:p-8 rp-card space-y-6">
          <div className="space-y-1 border-b border-[#E5E4DE] pb-4">
            <h2 className="font-display font-semibold text-xl text-[#202522]">
              03. Review Booking &amp; Accept Terms
            </h2>
            <p className="text-xs text-[#70756F]">
              Verify your schedule, pricing breakdown, uploaded documents, and rental terms before submitting.
            </p>
          </div>

          <div className="space-y-4">
            {/* Summary Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#70756F] text-[11px] font-medium">
                    Student Renter
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#29483B] hover:underline font-medium"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>
                <span className="font-semibold text-[#202522] text-sm block">{fullName}</span>
                <div className="space-y-0.5 text-[#70756F]">
                  <span className="text-[#29483B] font-mono font-medium block">
                    ICFAI ID: {enrollment}
                  </span>
                  <span className="block">
                    {course} · {academicYear}
                  </span>
                  <span className="block tabular-nums">{phone}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#70756F] text-[11px] font-medium">
                    Selected Bike &amp; Hub
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#29483B] hover:underline font-medium"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Change Hub</span>
                  </button>
                </div>
                <span className="font-semibold text-[#202522] text-sm block">
                  {bike.brand} {bike.model} ({bike.year || 2023})
                </span>
                <div className="space-y-0.5 text-[#70756F]">
                  <span className="text-[#29483B] font-medium block">
                    Pickup Hub: {selectedHubName}
                  </span>
                  <span className="block">
                    {bike.bikeType} · {bike.transmission} · {bike.specs?.cc || 150} cc
                  </span>
                  <span className="block">Host: {bike.ownerName}</span>
                </div>
              </div>
            </div>

            {/* Schedule & Financial Breakdown */}
            <div className="p-5 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[#E5E4DE]">
                <div>
                  <span className="text-[#70756F] block text-[11px]">Scheduled Pickup</span>
                  <span className="font-semibold text-[#202522] tabular-nums">
                    {new Date(pickupDate).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[#70756F] block text-[11px]">Scheduled Return</span>
                  <span className="font-semibold text-[#202522] tabular-nums">
                    {new Date(returnDate).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[#70756F]">
                <span>Rental Duration</span>
                <span className="font-mono font-semibold text-[#202522] tabular-nums">
                  {diffDays} Day(s) ({diffHours} Total Hours)
                </span>
              </div>

              <div className="flex items-center justify-between text-[#70756F]">
                <span>
                  Rental Rate (₹{bike.pricePerDay} × {diffDays} days)
                </span>
                <span className="font-mono text-[#202522] tabular-nums">₹{rentalTotal}</span>
              </div>

              <div className="flex items-center justify-between text-[#70756F]">
                <span>Platform Service Fee (8%)</span>
                <span className="font-mono text-[#202522] tabular-nums">₹{platformFee}</span>
              </div>

              <div className="flex items-center justify-between text-[#24583C]">
                <span>Refundable Cash Security Deposit</span>
                <span className="font-mono font-semibold tabular-nums">₹{securityDeposit}</span>
              </div>

              <div className="flex items-center justify-between text-[#7D551B]">
                <span>Physical Collateral Required at Handover</span>
                <span className="font-mono font-semibold">1 Working Laptop</span>
              </div>

              <div className="flex items-center justify-between text-sm font-semibold text-[#202522] pt-2.5 border-t border-[#E5E4DE]">
                <span>Total Payable at Handover</span>
                <span className="font-display font-bold text-[#29483B] text-lg font-mono tabular-nums">
                  ₹{totalPayableAtHandover}
                </span>
              </div>
            </div>

            {/* Attached Documents Summary */}
            <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap text-[#202522]">
                <span className="text-[#70756F]">Uploaded Documents:</span>
                <span className="font-medium text-[#24583C]">✓ Driving Licence</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#24583C]">✓ Aadhaar Card</span>
                {studentIdDoc && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[#24583C]">✓ ICFAI Student ID</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                {dlAiAnalysis && (
                  <span
                    className={`rp-status !py-0.5 !px-2 !text-[10px] ${
                      dlAiAnalysis.verificationState === 'VERIFICATION PASSED'
                        ? 'rp-status-success'
                        : 'rp-status-warning'
                    }`}
                  >
                    {getScreeningBadgeLabel(dlAiAnalysis.verificationState)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-[11px] text-[#29483B] hover:underline font-medium"
                >
                  Manage Uploads
                </button>
              </div>
            </div>

            {/* Terms & Conditions Agreement Box */}
            <div className="p-5 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DE]">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[#29483B]" />
                  <span className="font-semibold text-[#202522]">
                    Rental Agreement &amp; Platform Terms
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#70756F]">
                  {config?.termsVersion || 'v1.2-2026-AUG'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#29483B] hover:text-[#20392F] font-semibold underline underline-offset-4 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Read Full Terms &amp; Conditions</span>
                </button>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-[#E5E4DE]">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmAccurate}
                    onChange={(e) => setConfirmAccurate(e.target.checked)}
                    className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                  />
                  <span className="text-[#202522] text-xs leading-relaxed">
                    <strong>Information Accuracy:</strong> I confirm that all personal details, driving licence credentials, and student verification documents provided by me are accurate and belong to me.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="terms-acceptance-checkbox"
                    checked={confirmTerms}
                    onChange={(e) => setConfirmTerms(e.target.checked)}
                    className="mt-0.5 accent-[#29483B] w-4 h-4 rounded cursor-pointer shrink-0"
                  />
                  <span className="text-[#202522] text-xs leading-relaxed">
                    <strong>Terms &amp; Conditions Acceptance:</strong> I have read and agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTermsModal(true);
                      }}
                      className="text-[#29483B] underline hover:text-[#20392F] font-semibold"
                    >
                      Riders Path Terms &amp; Conditions ({config?.termsVersion || 'v1.2-2026-AUG'})
                    </button>
                    , including responsibility for traffic challans, laptop collateral deposit at handover, and returning the vehicle in its pre-ride condition.
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="rp-btn rp-btn-secondary"
            >
              Back to Documents
            </button>
            <button
              id="submit-booking-btn"
              type="button"
              onClick={handleFinalSubmit}
              disabled={submitting || !confirmAccurate || !confirmTerms}
              className="rp-btn rp-btn-primary rp-btn-lg"
            >
              {submitting ? (
                <span>Submitting Booking Request...</span>
              ) : (
                <>
                  <span>Submit Booking Request</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Interactive Full Terms & Conditions Modal */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E5E4DE] rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-5 border-b border-[#E5E4DE] flex items-center justify-between bg-[#F7F6F2]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-[#202522] text-base">
                    Riders Path Terms &amp; Conditions
                  </h3>
                  <p className="text-xs text-[#70756F]">
                    Version: {config?.termsVersion || 'v1.2-2026-AUG'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-2 rounded-lg text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                aria-label="Close terms modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#202522] leading-relaxed">
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-[11px] text-[#70756F]">
                <strong className="text-[#202522] block mb-1">Informational Notice:</strong>
                These Terms and Conditions outline the operational rules for using Riders Path within the ICFAI Hyderabad campus community. Riders Path acts as an intermediary connecting student bike owners with eligible student renters and does not own the listed vehicles.
              </div>

              <div className="space-y-4">
                <section className="space-y-1">
                  <h4 className="font-semibold text-[#202522] text-sm">
                    1. Platform Role &amp; Intermediary Model
                  </h4>
                  <p className="text-[#70756F]">
                    Riders Path operates as a student marketplace connecting student bike owners with eligible student renters. Riders Path does not own or operate the vehicles listed on the platform.
                  </p>
                </section>

                <section className="space-y-1">
                  <h4 className="font-semibold text-[#202522] text-sm">
                    2. Renter Eligibility &amp; Verification
                  </h4>
                  <p className="text-[#70756F]">
                    Renters must be 18+ years old, hold a valid Indian Driving Licence, provide an Aadhaar document, and present a valid ICFAI University Student ID card at pickup.
                  </p>
                </section>

                <section className="space-y-1">
                  <h4 className="font-semibold text-[#202522] text-sm">
                    3. Laptop Collateral &amp; Security Deposit
                  </h4>
                  <p className="text-[#70756F]">
                    Renters must provide a working laptop as physical collateral alongside the refundable security deposit upon vehicle handover. Both are returned after the post-ride inspection.
                  </p>
                </section>

                <section className="space-y-1">
                  <h4 className="font-semibold text-[#202522] text-sm">
                    4. Traffic Fines, Challans &amp; Conduct
                  </h4>
                  <p className="text-[#70756F]">
                    The renter is solely responsible for all traffic fines, speeding violations, or e-challans incurred during the rental window. Sub-renting, triple riding, and impaired riding are strictly prohibited.
                  </p>
                </section>
              </div>
            </div>

            <div className="p-4 border-t border-[#E5E4DE] bg-[#F7F6F2] flex items-center justify-between">
              <span className="text-xs text-[#70756F] font-mono">
                Version: {config?.termsVersion || 'v1.2-2026-AUG'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirmTerms(true);
                  setShowTermsModal(false);
                }}
                className="rp-btn rp-btn-primary"
              >
                <Check className="w-4 h-4" />
                <span>Accept &amp; Close</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
