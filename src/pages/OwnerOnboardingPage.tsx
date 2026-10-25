import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  api,
  MAX_BIKE_IMAGES_PER_LISTING,
  isHttpsBikeImageUrl,
  isPendingLocalDraftImage,
  validateSelectedBikeImageFile,
  readFileAsDataUrl,
  uploadPendingDraftBikeImages,
  assertHttpsBikeImageList,
  saveOnboardingDraftPhotos,
  saveOnboardingListingDraft,
  loadOnboardingListingDraft,
  clearOnboardingListingDraft,
  runSequentialPhotoBatch,
} from '../services/api';
import { PickupLocation } from '../types';
import { hourlyToDaily, dailyToHourly, PRICING_HELPER_TEXT } from '../utils/pricing';
import { validateIcfaiEnrollment } from '../utils/validation';
import { triggerHaptic } from '../utils/haptics';
import { EnrollmentNumberInput } from '../components/EnrollmentNumberInput';
import { VehicleImage } from '../components/VehicleImage';
import {
  Upload,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Star,
  Trash2,
  RefreshCw,
  MapPin,
  Clock,
} from 'lucide-react';

interface OwnerOnboardingPageProps {
  onSuccess: () => void;
  onCancel?: () => void;
  onNavigate: (view: string) => void;
}

export const OwnerOnboardingPage: React.FC<OwnerOnboardingPageProps> = ({
  onSuccess,
  onNavigate,
}) => {
  const { studentUser, isStudentLoggedIn, showToast, setAuthReturnDestination } = useAuth();
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);

  // Earnings Calculator
  const [calcPrice, setCalcPrice] = useState(550);
  const [calcDays, setCalcDays] = useState(14);
  const estimatedEarnings = Math.round(calcPrice * calcDays * 0.92); // 92% to student owner

  // Section A — Bike Basics
  const [brand, setBrand] = useState('Royal Enfield');
  const [model, setModel] = useState('');
  const [bikeType, setBikeType] = useState('Cruiser');
  const [transmission, setTransmission] = useState('Manual');
  const [fuelType, setFuelType] = useState('Petrol');
  const [cc, setCc] = useState<number>(350);
  const [year, setYear] = useState(2023);
  const [registrationNumber, setRegistrationNumber] = useState('');

  // Section B — Pricing & Availability
  const [pricePerDay, setPricePerDay] = useState<number>(550);
  const [pricePerHour, setPricePerHour] = useState<number>(dailyToHourly(550));
  const [securityDeposit, setSecurityDeposit] = useState<number>(1000);
  const [pickupHub, setPickupHub] = useState('ICFAI Main Gate');
  const [availabilityStatus, setAvailabilityStatus] = useState<'AVAILABLE' | 'UNAVAILABLE'>('AVAILABLE');

  // Section C — Bike Condition & Rules
  const [description, setDescription] = useState('');
  const [mileage, setMileage] = useState('35 km/l');
  const [helmetsIncluded, setHelmetsIncluded] = useState<number>(1);
  const [abs, setAbs] = useState<boolean>(true);

  // Section D — Photos
  const [images, setImages] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [draftPhotosPersisted, setDraftPhotosPersisted] = useState(false);
  const [failedPhotoUpload, setFailedPhotoUpload] = useState<{
    dataUrl: string;
    mimeType: string;
    replaceIndex?: number;
  } | null>(null);
  const autoUploadedDraftRef = useRef(false);

  // Section E — Owner Contact / Verification Details
  const [ownerName, setOwnerName] = useState(studentUser?.fullName || '');
  const [ownerEnrollment, setOwnerEnrollment] = useState(
    studentUser?.icfaiEnrollmentNumber || ''
  );
  const [ownerPhone, setOwnerPhone] = useState(studentUser?.phone || '');
  const [ownerEmail, setOwnerEmail] = useState(studentUser?.email || '');
  const [ownerCourse, setOwnerCourse] = useState(
    studentUser?.courseAndBranch || studentUser?.course || 'B.Tech (CSE)'
  );
  const [ownerAcademicYear, setOwnerAcademicYear] = useState(
    studentUser?.academicYear || 'Year 3'
  );
  const [confirmRoadworthy, setConfirmRoadworthy] = useState(false);

  // Field-level errors & submission state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Restore any draft listing data saved before authentication redirect (IndexedDB + legacy sessionStorage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { draft, images: restoredImages } = await loadOnboardingListingDraft();
        if (cancelled) return;
        if (draft) {
          if (draft.brand) setBrand(draft.brand);
          if (draft.model) setModel(draft.model);
          if (draft.bikeType) setBikeType(draft.bikeType);
          if (draft.transmission) setTransmission(draft.transmission);
          if (draft.fuelType) setFuelType(draft.fuelType);
          if (draft.cc) setCc(Number(draft.cc));
          if (draft.year) setYear(Number(draft.year));
          if (draft.registrationNumber) setRegistrationNumber(draft.registrationNumber);
          if (draft.pricePerDay) {
            setPricePerDay(Number(draft.pricePerDay));
            setPricePerHour(dailyToHourly(Number(draft.pricePerDay)));
          }
          if (draft.securityDeposit) setSecurityDeposit(Number(draft.securityDeposit));
          if (draft.pickupHub) setPickupHub(draft.pickupHub);
          if (draft.description) setDescription(draft.description);
        }
        if (restoredImages.length > 0) {
          setImages(restoredImages);
          setDraftPhotosPersisted(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPhotoError(
            err?.message || 'Unable to restore saved draft photos from browser storage.'
          );
          setDraftPhotosPersisted(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (studentUser) {
      setOwnerName((prev) => prev || studentUser.fullName || '');
      setOwnerEnrollment((prev) => prev || studentUser.icfaiEnrollmentNumber || '');
      setOwnerPhone((prev) => prev || studentUser.phone || '');
      setOwnerEmail((prev) => prev || studentUser.email || '');
      if (studentUser.courseAndBranch || studentUser.course) {
        setOwnerCourse(studentUser.courseAndBranch || studentUser.course || 'B.Tech (CSE)');
      }
      if (studentUser.academicYear) {
        setOwnerAcademicYear(studentUser.academicYear);
      }
    }
  }, [studentUser]);

  // Once authenticated, automatically upload any pending local draft images from a logged-out session
  useEffect(() => {
    if (!isStudentLoggedIn || !studentUser) {
      autoUploadedDraftRef.current = false;
      return;
    }
    if (uploadingPhotos || autoUploadedDraftRef.current) return;
    if (!images.some((img) => isPendingLocalDraftImage(img))) return;

    autoUploadedDraftRef.current = true;
    let cancelled = false;

    (async () => {
      setUploadingPhotos(true);
      setPhotoError('');
      try {
        const result = await uploadPendingDraftBikeImages(images);
        if (cancelled) return;
        setImages(result.uploadedImages);
        try {
          await saveOnboardingDraftPhotos(result.uploadedImages);
        } catch {}
        if (result.error) {
          setPhotoError(result.error);
        }
      } finally {
        if (!cancelled) {
          setUploadingPhotos(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isStudentLoggedIn, studentUser, images, uploadingPhotos]);

  const redirectToAuthForListing = async (authView: 'login' | 'signup') => {
    const baseDraft = {
      brand,
      model,
      bikeType,
      transmission,
      fuelType,
      cc,
      year,
      registrationNumber,
      pricePerDay,
      securityDeposit,
      pickupHub,
      description,
    };
    try {
      setPhotoError('');
      await saveOnboardingListingDraft(
        baseDraft,
        images.slice(0, MAX_BIKE_IMAGES_PER_LISTING)
      );
      setDraftPhotosPersisted(images.length > 0);
    } catch (err: any) {
      const msg =
        err?.message ||
        'Could not save your draft photos in browser storage. Please remove a photo or try again.';
      setDraftPhotosPersisted(false);
      setPhotoError(msg);
      setError(msg);
      showToast(msg, 'error');
      triggerHaptic('error');
      return;
    }
    setAuthReturnDestination({
      view: 'onboard',
      reason: 'Sign in or create your student account to submit and manage your bike listing.',
    });
    onNavigate(authView);
  };

  useEffect(() => {
    api
      .getPickupLocations(true)
      .then((locs) => {
        if (locs && locs.length > 0) {
          setPickupLocations(locs);
          setPickupHub(locs[0].name);
        }
      })
      .catch(() => {});
  }, []);

  // Bidirectional Pricing Handlers (Section 6)
  const handleDailyPriceChange = (valStr: string) => {
    if (valStr === '') {
      setPricePerDay(0);
      setPricePerHour(0);
      return;
    }
    const val = Math.max(0, Number(valStr));
    if (isNaN(val) || !isFinite(val)) return;
    setPricePerDay(val);
    setPricePerHour(dailyToHourly(val));
    if (fieldErrors.pricePerDay) {
      setFieldErrors((prev) => ({ ...prev, pricePerDay: '' }));
    }
  };

  const handleHourlyPriceChange = (valStr: string) => {
    if (valStr === '') {
      setPricePerHour(0);
      setPricePerDay(0);
      return;
    }
    const val = Math.max(0, Number(valStr));
    if (isNaN(val) || !isFinite(val)) return;
    setPricePerHour(val);
    setPricePerDay(hourlyToDaily(val));
    if (fieldErrors.pricePerDay) {
      setFieldErrors((prev) => ({ ...prev, pricePerDay: '' }));
    }
  };

  const applyCalculatorRate = () => {
    setPricePerDay(calcPrice);
    setPricePerHour(dailyToHourly(calcPrice));
    showToast(`Applied ₹${calcPrice}/day (₹${dailyToHourly(calcPrice)}/hr) to listing form.`, 'info');
  };

  const uploadSingleOnboardingPhoto = async (
    dataUrl: string,
    mimeType: string,
    replaceIndex?: number,
    options?: { manageUploadingState?: boolean }
  ): Promise<boolean> => {
    const manageUploadingState = options?.manageUploadingState !== false;
    try {
      if (manageUploadingState) {
        setUploadingPhotos(true);
      }
      setPhotoError('');
      setFailedPhotoUpload(null);

      const uploaded = await api.uploadBikeImage(
        {
          image: dataUrl,
          mimeType,
          purpose: 'onboarding',
        },
        { authRole: 'student' }
      );

      if (typeof replaceIndex === 'number') {
        setImages((prev) =>
          prev.map((item, idx) => (idx === replaceIndex ? uploaded.publicUrl : item))
        );
      } else {
        setImages((prev) => {
          if (prev.length >= MAX_BIKE_IMAGES_PER_LISTING) return prev;
          return [...prev, uploaded.publicUrl];
        });
      }
      triggerHaptic('light');
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to upload photo. Please try again.';
      setPhotoError(msg);
      setFailedPhotoUpload({ dataUrl, mimeType, replaceIndex });
      triggerHaptic('error');
      return false;
    } finally {
      if (manageUploadingState) {
        setUploadingPhotos(false);
      }
    }
  };

  const handleRetryPhotoUpload = async () => {
    if (!uploadingPhotos && failedPhotoUpload) {
      if (!isStudentLoggedIn || !studentUser) {
        setPhotoError('Please sign in to upload your bike photos.');
        return;
      }
      await uploadSingleOnboardingPhoto(
        failedPhotoUpload.dataUrl,
        failedPhotoUpload.mimeType,
        failedPhotoUpload.replaceIndex
      );
      return;
    }
    if (!uploadingPhotos && isStudentLoggedIn && studentUser && images.some(isPendingLocalDraftImage)) {
      setUploadingPhotos(true);
      setPhotoError('');
      try {
        const result = await uploadPendingDraftBikeImages(images);
        setImages(result.uploadedImages);
        try {
          await saveOnboardingDraftPhotos(result.uploadedImages);
        } catch {}
        if (result.error) {
          setPhotoError(result.error);
        } else {
          showToast('All pending draft photos uploaded.', 'success');
        }
      } finally {
        setUploadingPhotos(false);
      }
    }
  };

  const processSelectedFile = async (
    file: File,
    currentImageCount: number,
    replaceIndex?: number,
    options?: {
      manageUploadingState?: boolean;
      currentGallery?: string[];
      onGalleryUpdated?: (nextGallery: string[]) => void;
    }
  ): Promise<boolean> => {
    setPhotoError('');
    if (
      replaceIndex === undefined &&
      currentImageCount >= MAX_BIKE_IMAGES_PER_LISTING
    ) {
      setPhotoError(
        `A bike listing can include at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`
      );
      return false;
    }

    let normalizedMime: string;
    try {
      normalizedMime = validateSelectedBikeImageFile(file);
    } catch (err: any) {
      setPhotoError(err?.message || 'Invalid image file.');
      return false;
    }

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (err: any) {
      setPhotoError(
        err?.message || 'Failed to read image file. Please try another photo.'
      );
      return false;
    }

    // Logged-out draft behavior: persist in IndexedDB and never claim saved if storage fails
    if (!isStudentLoggedIn || !studentUser) {
      setFailedPhotoUpload(null);
      const baseGallery = options?.currentGallery ?? images;
      const nextGallery =
        typeof replaceIndex === 'number'
          ? baseGallery.map((item, idx) => (idx === replaceIndex ? dataUrl : item))
          : baseGallery.length < MAX_BIKE_IMAGES_PER_LISTING
          ? [...baseGallery, dataUrl]
          : baseGallery;

      try {
        await saveOnboardingDraftPhotos(nextGallery);
      } catch (err: any) {
        const msg =
          err?.message ||
          'Unable to save draft photo in browser storage. Please sign in before uploading photos.';
        setDraftPhotosPersisted(false);
        setPhotoError(msg);
        showToast(msg, 'error');
        triggerHaptic('error');
        return false;
      }

      setImages(nextGallery);
      setDraftPhotosPersisted(true);
      options?.onGalleryUpdated?.(nextGallery);
      triggerHaptic('light');
      return true;
    }

    return uploadSingleOnboardingPhoto(dataUrl, normalizedMime, replaceIndex, {
      manageUploadingState: options?.manageUploadingState,
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList: File[] = e.target.files ? Array.from<File>(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0 || uploadingPhotos) return;

    const availableSlots = MAX_BIKE_IMAGES_PER_LISTING - images.length;
    if (availableSlots <= 0) {
      setPhotoError(
        `A bike listing can include at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`
      );
      return;
    }

    if (fileList.length > availableSlots) {
      setPhotoError(
        `Only ${availableSlots} more photo(s) can be added (maximum ${MAX_BIKE_IMAGES_PER_LISTING} photos per listing).`
      );
    }

    const filesToProcess = fileList.slice(0, availableSlots);
    let runningCount = images.length;
    let runningGallery = [...images];

    await runSequentialPhotoBatch(
      filesToProcess,
      setUploadingPhotos,
      async (file) => {
        const ok = await processSelectedFile(file, runningCount, undefined, {
          manageUploadingState: false,
          currentGallery: runningGallery,
          onGalleryUpdated: (nextGallery) => {
            runningGallery = nextGallery;
          },
        });
        if (ok) {
          runningCount += 1;
        }
        return ok;
      }
    );
  };

  const handleReplaceImage = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingPhotos) return;
    await processSelectedFile(file, images.length, index, {
      manageUploadingState: true,
      currentGallery: images,
    });
  };

  const setAsCoverImage = async (index: number) => {
    if (index === 0 || uploadingPhotos) return;
    const next = [...images];
    const [selected] = next.splice(index, 1);
    next.unshift(selected);

    if (!isStudentLoggedIn || !studentUser) {
      try {
        await saveOnboardingDraftPhotos(next);
        setDraftPhotosPersisted(true);
      } catch (err: any) {
        const msg =
          err?.message || 'Unable to update draft photo order in browser storage.';
        setDraftPhotosPersisted(false);
        setPhotoError(msg);
        showToast(msg, 'error');
        return;
      }
    }

    setImages(next);
    showToast('Updated cover photo for listing.', 'info');
  };

  const removeImage = async (index: number) => {
    if (uploadingPhotos) return;
    triggerHaptic('warning');
    const next = images.filter((_, i) => i !== index);
    if (!isStudentLoggedIn || !studentUser) {
      try {
        await saveOnboardingDraftPhotos(next);
        setDraftPhotosPersisted(next.length > 0);
      } catch (err: any) {
        const msg =
          err?.message || 'Unable to update draft photos in browser storage.';
        setPhotoError(msg);
      }
    }
    setImages(next);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!model.trim()) {
      errors.model = 'Enter your bike model (e.g. Hunter 350, MT-15, Activa 6G).';
    }
    if (!registrationNumber.trim() || registrationNumber.trim().length < 6) {
      errors.registrationNumber = 'Enter a valid vehicle registration number (e.g. TS 08 FG 4821).';
    }
    if (!pricePerDay || pricePerDay < 150) {
      errors.pricePerDay = 'Daily rental rate must be at least ₹150.';
    }
    if (!securityDeposit || securityDeposit < 500) {
      errors.securityDeposit = 'Security deposit must be at least ₹500.';
    }
    if (!ownerName.trim() || ownerName.trim().length < 2) {
      errors.ownerName = 'Enter the bike owner’s full legal name.';
    }
    const enrollmentCheck = validateIcfaiEnrollment(ownerEnrollment);
    if (!enrollmentCheck.valid) {
      errors.ownerEnrollment = enrollmentCheck.error || 'Enter your ICFAI enrollment number.';
    }
    const phoneDigits = ownerPhone.replace(/[^0-9]/g, '');
    if (!ownerPhone.trim() || phoneDigits.length < 10) {
      errors.ownerPhone = 'Enter a valid 10-digit WhatsApp or mobile number.';
    }
    if (!confirmRoadworthy) {
      errors.confirmRoadworthy =
        'Please confirm that your registration, insurance, and vehicle condition are valid.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Please check the highlighted fields below before submitting.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || uploadingPhotos) return;
    triggerHaptic('medium');

    if (!isStudentLoggedIn || !studentUser) {
      showToast('Please sign in to your student account to submit your bike listing.', 'info');
      await redirectToAuthForListing('login');
      return;
    }

    if (!validateForm()) {
      triggerHaptic('error');
      return;
    }

    const cleanEnrollment = validateIcfaiEnrollment(ownerEnrollment).normalized;

    try {
      setSubmitting(true);
      setError('');

      let finalImages = [...images];
      if (finalImages.some((img) => isPendingLocalDraftImage(img))) {
        setUploadingPhotos(true);
        const draftUploadResult = await uploadPendingDraftBikeImages(finalImages);
        setUploadingPhotos(false);
        setImages(draftUploadResult.uploadedImages);
        if (draftUploadResult.error) {
          setPhotoError(draftUploadResult.error);
          throw new Error(draftUploadResult.error);
        }
        finalImages = draftUploadResult.uploadedImages;
      }

      const validatedHttpsImages =
        finalImages.length > 0 ? assertHttpsBikeImageList(finalImages) : undefined;

      const res = await api.submitOwnerOnboarding({
        fullName: ownerName.trim(),
        ownerName: ownerName.trim(),
        icfaiEnrollmentNumber: cleanEnrollment,
        ownerEnrollment: cleanEnrollment,
        phone: ownerPhone.trim(),
        ownerPhone: ownerPhone.trim(),
        email:
          ownerEmail.trim() ||
          `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
        ownerEmail:
          ownerEmail.trim() ||
          `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
        academicYear: ownerAcademicYear,
        ownerAcademicYear,
        course: ownerCourse,
        ownerCourse,
        brand,
        model: model.trim(),
        year: Number(year) || 2023,
        registrationNumber: registrationNumber.trim().toUpperCase(),
        bikeType,
        fuelType,
        transmission,
        pickupHub,
        availabilityStatus,
        pricePerDay: Number(pricePerDay) || 550,
        pricePerHour:
          Number(pricePerHour) || dailyToHourly(Number(pricePerDay) || 550),
        securityDeposit: Number(securityDeposit) || 1000,
        description:
          description.trim() ||
          `Well-maintained ${brand} ${model.trim()} available for campus pickup at ${pickupHub}.`,
        images: validatedHttpsImages,
        specs: {
          cc: Number(cc) || 150,
          mileage: mileage.trim() || '38 km/l',
          topSpeed: Number(cc) >= 300 ? '130 km/h' : '105 km/h',
          fuelCapacity: fuelType === 'Electric' ? 'Battery Pack' : '12 L',
          weight: Number(cc) >= 300 ? '181 kg' : '138 kg',
          abs,
          helmetsIncluded: Number(helmetsIncluded) || 1,
        },
      });

      await clearOnboardingListingDraft();
      setDraftPhotosPersisted(false);

      triggerHaptic('success');
      setSubmittedSuccess(true);
      showToast(
        res.message || 'Bike submitted for admin review.',
        'success'
      );
      onSuccess();
    } catch (err: any) {
      triggerHaptic('error');
      setError(err.message || 'Failed to submit bike listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hubOptions =
    pickupLocations.length > 0
      ? pickupLocations.map((l) => l.name)
      : [
          'ICFAI Main Gate',
          'Socials Gaming Zone',
          "Kaka's Hotel",
          'IBS Academic Block Hub',
          'Boys Hostel Zone 1',
        ];

  const selectedLocationObj = pickupLocations.find((l) => l.name === pickupHub);

  if (submittedSuccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-14 h-14 rounded-xl bg-[#ECF4F0] border border-[#CBE2D6] flex items-center justify-center text-[#347653] mx-auto">
          <CheckCircle2 className="w-8 h-8 stroke-[2.2]" />
        </div>
        <div className="space-y-2">
          <span className="rp-kicker block">Listing Pending Admin Review</span>
          <h1 className="font-display font-bold text-3xl text-[#202522]">
            Bike Submitted Successfully
          </h1>
          <p className="text-sm text-[#70756F] max-w-md mx-auto leading-relaxed">
            Thank you, {ownerName}. Your {brand} {model} ({registrationNumber.toUpperCase()}) has been queued for admin review. Once approved, it will appear in the public bike catalog.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] max-w-md mx-auto text-left text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#70756F]">Vehicle</span>
            <span className="font-semibold text-[#202522]">{brand} {model} ({year})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#70756F]">Rate &amp; Deposit</span>
            <span className="font-mono font-semibold text-[#29483B] tabular-nums">
              ₹{pricePerDay}/day (₹{pricePerHour}/hr) · ₹{securityDeposit} deposit
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#70756F]">Pickup Location</span>
            <span className="font-medium text-[#202522]">{pickupHub}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#70756F]">Status</span>
            <span className="text-[#9A6B25] font-semibold">Pending Admin Approval</span>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('my-listings')}
            className="rp-btn rp-btn-primary"
          >
            View in My Bike Listings
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmittedSuccess(false);
              setModel('');
              setRegistrationNumber('');
              setImages([]);
              setConfirmRoadworthy(false);
            }}
            className="rp-btn rp-btn-secondary"
          >
            List Another Bike
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Page Hero */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#29483B]">
          <ShieldCheck className="w-4 h-4" />
          <span>Student Bike Owners · ICFAI Hyderabad</span>
        </div>
        <h1 className="rp-page-title">List your bike with the campus community</h1>
        <p className="rp-text-secondary">
          Riders Path connects student bike owners with eligible ICFAI students looking for a ride. Set your daily rate, choose your campus pickup location, and earn while your bike sits parked.
        </p>
      </div>

      {/* Interactive Monthly Earnings Calculator */}
      <div className="p-6 sm:p-8 rp-card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div>
              <span className="rp-kicker block">Owner Earnings Calculator</span>
              <h2 className="font-display font-semibold text-xl text-[#202522] mt-1">
                Estimate Your Monthly Payout
              </h2>
              <p className="text-xs text-[#70756F] mt-1">
                Adjust your daily rental rate and the number of days your bike is available each month.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium text-[#202522] mb-1.5">
                  <span>Daily Rental Rate</span>
                  <span className="text-[#29483B] font-mono font-bold tabular-nums">
                    ₹{calcPrice} / day (₹{dailyToHourly(calcPrice)} / hr)
                  </span>
                </div>
                <input
                  type="range"
                  min="350"
                  max="1200"
                  step="25"
                  value={calcPrice}
                  onChange={(e) => setCalcPrice(Number(e.target.value))}
                  className="w-full accent-[#29483B] cursor-pointer"
                  aria-label="Daily Rental Rate"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-[#202522] mb-1.5">
                  <span>Days Rented Per Month</span>
                  <span className="text-[#29483B] font-mono font-bold tabular-nums">
                    {calcDays} Days
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="28"
                  step="1"
                  value={calcDays}
                  onChange={(e) => setCalcDays(Number(e.target.value))}
                  className="w-full accent-[#29483B] cursor-pointer"
                  aria-label="Days Rented Per Month"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] text-center space-y-3">
            <span className="text-xs text-[#70756F] font-medium block">
              Estimated Net Payout (92% Host Share)
            </span>
            <div className="font-display font-bold text-4xl text-[#29483B] tabular-nums">
              ₹{estimatedEarnings.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Every rental includes document screening, a refundable cash security deposit, and physical laptop collateral at handover.
            </p>
            <button
              type="button"
              onClick={applyCalculatorRate}
              className="rp-btn rp-btn-secondary rp-btn-sm w-full"
            >
              Apply ₹{calcPrice}/day to Listing Form
            </button>
          </div>
        </div>
      </div>

      {/* Bike Listing Form */}
      <div className="p-6 sm:p-8 rp-card space-y-8">
        <div className="border-b border-[#E5E4DE] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-semibold text-xl text-[#202522]">
              Submit Your Bike Listing
            </h2>
            <p className="text-xs text-[#70756F] mt-1">
              All new vehicle listings are reviewed by the admin team before going live in the public catalog.
            </p>
          </div>
          <span className="text-xs text-[#70756F]">
            Fields marked <span className="text-[#B44242]">*</span> are required
          </span>
        </div>

        {(!isStudentLoggedIn || !studentUser) && (
          <div className="p-4 sm:p-5 rounded-xl bg-[#EBF0ED] border border-[#CBE2D6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#202522] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#29483B]" />
                <span>Sign in required to submit a bike listing</span>
              </p>
              <p className="text-xs text-[#70756F]">
                Bike listings are tied to your verified ICFAI student profile so you can manage rates, photos, and availability.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="onboard-gate-login-btn"
                type="button"
                onClick={() => redirectToAuthForListing('login')}
                className="rp-btn rp-btn-primary rp-btn-sm"
              >
                Sign In
              </button>
              <button
                id="onboard-gate-signup-btn"
                type="button"
                onClick={() => redirectToAuthForListing('signup')}
                className="rp-btn rp-btn-secondary rp-btn-sm"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          {/* ================================================================= */}
          {/* SECTION A — BIKE BASICS */}
          {/* ================================================================= */}
          <div className="space-y-4">
            <div className="border-b border-[#E5E4DE] pb-2">
              <h3 className="font-display font-semibold text-sm text-[#202522]">
                Section A — Bike Basics
              </h3>
              <p className="text-xs text-[#70756F]">
                Provide the core make, model, and registration details of your motorcycle or scooter.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="rp-label">
                  Brand <span className="text-[#B44242]">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="rp-select"
                >
                  <option value="Royal Enfield">Royal Enfield</option>
                  <option value="Yamaha">Yamaha</option>
                  <option value="KTM">KTM</option>
                  <option value="Honda">Honda</option>
                  <option value="TVS">TVS</option>
                  <option value="Bajaj">Bajaj</option>
                  <option value="Ather Energy">Ather Energy</option>
                  <option value="Ola">Ola</option>
                  <option value="Hero">Hero</option>
                  <option value="Suzuki">Suzuki</option>
                </select>
              </div>

              <div>
                <label className="rp-label">
                  Bike Model <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    if (fieldErrors.model) setFieldErrors((p) => ({ ...p, model: '' }));
                  }}
                  placeholder="e.g. Hunter 350, MT-15, Activa 6G"
                  className={`rp-input ${fieldErrors.model ? '!border-[#B44242]' : ''}`}
                />
                {fieldErrors.model && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">{fieldErrors.model}</p>
                )}
              </div>

              <div>
                <label className="rp-label">Category / Type</label>
                <select
                  value={bikeType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setBikeType(nextType);
                    if (nextType === 'Electric') {
                      setFuelType('Electric');
                      setTransmission('Automatic');
                    } else if (nextType === 'Scooter') {
                      setTransmission('Automatic');
                    }
                  }}
                  className="rp-select"
                >
                  <option value="Cruiser">Cruiser</option>
                  <option value="Street">Street</option>
                  <option value="Commuter">Commuter</option>
                  <option value="Sport">Sport</option>
                  <option value="Scooter">Scooter</option>
                  <option value="Electric">Electric</option>
                </select>
              </div>

              <div>
                <label className="rp-label">
                  Model Year <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="2015"
                  max="2026"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rp-input tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label">Transmission</label>
                <select
                  value={transmission}
                  onChange={(e) => setTransmission(e.target.value)}
                  className="rp-select"
                >
                  <option value="Manual">Manual</option>
                  <option value="Automatic">Automatic</option>
                </select>
              </div>

              <div>
                <label className="rp-label">Fuel Type</label>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                  className="rp-select"
                >
                  <option value="Petrol">Petrol</option>
                  <option value="Electric">Electric</option>
                </select>
              </div>

              <div>
                <label className="rp-label">Engine Capacity (CC)</label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  value={cc}
                  onChange={(e) => setCc(Number(e.target.value))}
                  placeholder="e.g. 150, 350"
                  className="rp-input tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label">
                  Registration Number <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value.toUpperCase());
                    if (fieldErrors.registrationNumber) {
                      setFieldErrors((p) => ({ ...p, registrationNumber: '' }));
                    }
                  }}
                  placeholder="e.g. TS 07 EK 9210"
                  className={`rp-input font-mono uppercase ${
                    fieldErrors.registrationNumber ? '!border-[#B44242]' : ''
                  }`}
                />
                {fieldErrors.registrationNumber ? (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">
                    {fieldErrors.registrationNumber}
                  </p>
                ) : (
                  <p className="rp-helper">Hidden from public catalog by default; shown on confirmed passes.</p>
                )}
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION B — PRICING & AVAILABILITY */}
          {/* ================================================================= */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E5E4DE] pb-2">
              <div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  Section B — Pricing &amp; Availability
                </h3>
                <p className="text-xs text-[#70756F]">
                  {PRICING_HELPER_TEXT}
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#29483B] bg-[#EBF0ED] px-2.5 py-1 rounded-md border border-[#CBE2D6]">
                1 Day = 24 Hours Auto-Sync
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="rp-label">
                  Daily Price (₹ / day) <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="150"
                  max="3000"
                  value={pricePerDay || ''}
                  onChange={(e) => handleDailyPriceChange(e.target.value)}
                  className={`rp-input font-mono tabular-nums ${
                    fieldErrors.pricePerDay ? '!border-[#B44242]' : ''
                  }`}
                />
                {fieldErrors.pricePerDay && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">
                    {fieldErrors.pricePerDay}
                  </p>
                )}
              </div>

              <div>
                <label className="rp-label">Hourly Price (₹ / hour)</label>
                <input
                  type="number"
                  min="10"
                  max="250"
                  step="0.01"
                  value={pricePerHour || ''}
                  onChange={(e) => handleHourlyPriceChange(e.target.value)}
                  className="rp-input font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label">
                  Refundable Security Deposit (₹) <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="500"
                  max="5000"
                  step="100"
                  value={securityDeposit || ''}
                  onChange={(e) => {
                    setSecurityDeposit(Math.max(0, Number(e.target.value)));
                    if (fieldErrors.securityDeposit) {
                      setFieldErrors((p) => ({ ...p, securityDeposit: '' }));
                    }
                  }}
                  className={`rp-input font-mono tabular-nums ${
                    fieldErrors.securityDeposit ? '!border-[#B44242]' : ''
                  }`}
                />
                {fieldErrors.securityDeposit && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">
                    {fieldErrors.securityDeposit}
                  </p>
                )}
              </div>

              <div>
                <label className="rp-label">Initial Availability</label>
                <select
                  value={availabilityStatus}
                  onChange={(e) => setAvailabilityStatus(e.target.value as any)}
                  className="rp-select"
                >
                  <option value="AVAILABLE">Available Once Approved</option>
                  <option value="UNAVAILABLE">Hold (List as Unavailable)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="rp-label">
                  Campus Pickup Location <span className="text-[#B44242]">*</span>
                </label>
                <select
                  value={pickupHub}
                  onChange={(e) => setPickupHub(e.target.value)}
                  className="rp-select"
                >
                  {hubOptions.map((hub) => (
                    <option key={hub} value={hub}>
                      {hub}
                    </option>
                  ))}
                </select>
              </div>

              {selectedLocationObj && (
                <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] flex flex-col justify-center text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-[#202522]">
                    <MapPin className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>{selectedLocationObj.name}</span>
                    <span className="font-mono text-[10px] text-[#70756F]">
                      ({selectedLocationObj.hubCode})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#70756F]">
                    <Clock className="w-3 h-3" />
                    <span>{selectedLocationObj.operatingHours || '07:00 AM - 10:30 PM'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION C — BIKE CONDITION & RULES */}
          {/* ================================================================= */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="border-b border-[#E5E4DE] pb-2">
              <h3 className="font-display font-semibold text-sm text-[#202522]">
                Section C — Bike Condition &amp; Rules
              </h3>
              <p className="text-xs text-[#70756F]">
                Share fuel efficiency, helmet availability, and any condition or riding notes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="rp-label">Mileage / Range</label>
                <input
                  type="text"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="e.g. 38 km/l or 105 km/charge"
                  className="rp-input"
                />
              </div>

              <div>
                <label className="rp-label">Helmets Provided at Handover</label>
                <select
                  value={helmetsIncluded}
                  onChange={(e) => setHelmetsIncluded(Number(e.target.value))}
                  className="rp-select"
                >
                  <option value={1}>1 ISI Helmet Included</option>
                  <option value={2}>2 ISI Helmets Included</option>
                </select>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] w-full cursor-pointer text-xs font-medium text-[#202522]">
                  <input
                    type="checkbox"
                    checked={abs}
                    onChange={(e) => setAbs(e.target.checked)}
                    className="w-4 h-4 accent-[#29483B] rounded"
                  />
                  <span>Equipped with ABS Braking</span>
                </label>
              </div>
            </div>

            <div>
              <label className="rp-label">Condition Summary &amp; Usage Notes</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe tyre condition, service history, phone mount, or specific handover instructions..."
                className="rp-textarea"
              />
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION D — PHOTOS (COVER + GALLERY) */}
          {/* ================================================================= */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E5E4DE] pb-2">
              <div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  Section D — Bike Photos ({images.length}/{MAX_BIKE_IMAGES_PER_LISTING})
                </h3>
                <p className="text-xs text-[#70756F]">
                  Upload clear photos of your bike (front/side profile, odometer). First photo is used as the cover image.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#70756F]">
                JPG, PNG, WEBP · Max 5MB each · Up to {MAX_BIKE_IMAGES_PER_LISTING} photos
              </span>
            </div>

            {!isStudentLoggedIn &&
              draftPhotosPersisted &&
              !photoError &&
              images.some((img) => isPendingLocalDraftImage(img)) && (
                <div className="p-3 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#29483B] text-xs flex items-center justify-between gap-2">
                  <span>
                    Draft photo(s) saved locally. They will be uploaded securely once you sign in to submit your listing.
                  </span>
                </div>
              )}

            {uploadingPhotos && (
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-[#202522] text-xs flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#29483B] animate-spin shrink-0" />
                <span>Uploading bike photo securely...</span>
              </div>
            )}

            {photoError && (
              <div className="p-3 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
                  <span>{photoError}</span>
                </div>
                {(failedPhotoUpload ||
                  (isStudentLoggedIn &&
                    studentUser &&
                    images.some((img) => isPendingLocalDraftImage(img)))) && (
                  <button
                    type="button"
                    disabled={uploadingPhotos}
                    onClick={handleRetryPhotoUpload}
                    className="px-2.5 py-1 rounded bg-white border border-[#E8C5C5] text-[#8F3030] hover:bg-[#F4DFDF] font-semibold shrink-0"
                  >
                    Retry Upload
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="rounded-xl overflow-hidden border border-[#E5E4DE] bg-white flex flex-col justify-between"
                >
                  <div className="relative aspect-[16/10] bg-[#EFEEE8]">
                    <VehicleImage
                      src={img}
                      alt={`Uploaded bike view ${idx + 1}`}
                      brand={brand}
                      model={model || 'Bike'}
                      bikeType={bikeType}
                      className="w-full h-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#29483B] text-white text-[10px] font-semibold">
                        Cover Photo
                      </span>
                    )}
                    {isPendingLocalDraftImage(img) && (
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-[#202522]/80 text-white text-[10px] font-mono">
                        Draft (Pending Login)
                      </span>
                    )}
                  </div>

                  <div className="p-2 bg-[#F7F6F2] border-t border-[#E5E4DE] flex items-center justify-between gap-1 text-[11px]">
                    {idx !== 0 ? (
                      <button
                        type="button"
                        disabled={uploadingPhotos}
                        onClick={() => setAsCoverImage(idx)}
                        className="inline-flex items-center gap-1 text-[#29483B] hover:underline font-medium disabled:opacity-50"
                      >
                        <Star className="w-3 h-3" />
                        <span>Set Cover</span>
                      </button>
                    ) : (
                      <span className="text-[#70756F] font-medium">Primary</span>
                    )}

                    <div className="flex items-center gap-2">
                      <label
                        className={`inline-flex items-center gap-1 text-[#202522] hover:text-[#29483B] font-medium ${
                          uploadingPhotos ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                        }`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                        <input
                          type="file"
                          disabled={uploadingPhotos}
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleReplaceImage(idx, e)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={uploadingPhotos}
                        onClick={() => removeImage(idx)}
                        className="inline-flex items-center gap-0.5 text-[#B44242] hover:underline font-medium disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {images.length < MAX_BIKE_IMAGES_PER_LISTING && (
                <label
                  className={`border border-dashed border-[#D4D2C8] hover:border-[#29483B] rounded-xl min-h-[148px] flex flex-col items-center justify-center transition-colors text-center p-4 bg-[#F7F6F2] ${
                    uploadingPhotos ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                  }`}
                >
                  <Upload className="w-5 h-5 text-[#29483B] mb-1.5" />
                  <span className="text-xs text-[#202522] font-semibold">
                    {uploadingPhotos
                      ? 'Uploading Photo...'
                      : images.length === 0
                      ? 'Upload Cover Photo'
                      : 'Add Gallery Photo'}
                  </span>
                  <span className="text-[11px] text-[#70756F] mt-0.5">
                    Click to select image(s)
                  </span>
                  <input
                    type="file"
                    disabled={uploadingPhotos}
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              )}
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION E — OWNER CONTACT / VERIFICATION DETAILS */}
          {/* ================================================================= */}
          <div className="space-y-4 pt-4 border-t border-[#E5E4DE]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E5E4DE] pb-2">
              <div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  Section E — Owner Contact &amp; Verification Details
                </h3>
                <p className="text-xs text-[#70756F]">
                  Your student credentials are used by the admin team to verify vehicle ownership.
                </p>
              </div>
              {studentUser && (
                <span className="text-[11px] text-[#347653] font-medium">
                  ✓ Pre-filled from your signed-in student profile
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="rp-label">
                  Owner Full Name <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => {
                    setOwnerName(e.target.value);
                    if (fieldErrors.ownerName) setFieldErrors((p) => ({ ...p, ownerName: '' }));
                  }}
                  placeholder="e.g. Arjun Varma"
                  className={`rp-input ${fieldErrors.ownerName ? '!border-[#B44242]' : ''}`}
                />
                {fieldErrors.ownerName && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">{fieldErrors.ownerName}</p>
                )}
              </div>

              <div>
                <EnrollmentNumberInput
                  id="owner-enrollment-field"
                  value={ownerEnrollment}
                  onChange={(val) => {
                    setOwnerEnrollment(val);
                    if (fieldErrors.ownerEnrollment) {
                      setFieldErrors((p) => ({ ...p, ownerEnrollment: '' }));
                    }
                  }}
                  label="ICFAI Enrollment Number"
                  required
                  error={fieldErrors.ownerEnrollment}
                />
              </div>

              <div>
                <label className="rp-label">
                  WhatsApp / Mobile Number <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={ownerPhone}
                  onChange={(e) => {
                    setOwnerPhone(e.target.value);
                    if (fieldErrors.ownerPhone) setFieldErrors((p) => ({ ...p, ownerPhone: '' }));
                  }}
                  placeholder="+91 98490 12345"
                  className={`rp-input tabular-nums ${
                    fieldErrors.ownerPhone ? '!border-[#B44242]' : ''
                  }`}
                />
                {fieldErrors.ownerPhone && (
                  <p className="text-xs text-[#B44242] mt-1 font-medium">{fieldErrors.ownerPhone}</p>
                )}
              </div>

              <div>
                <label className="rp-label">Student Email</label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="student@icfaiuniversity.in"
                  className="rp-input"
                />
              </div>

              <div>
                <label className="rp-label">Program / Faculty</label>
                <select
                  value={ownerCourse}
                  onChange={(e) => setOwnerCourse(e.target.value)}
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
                  value={ownerAcademicYear}
                  onChange={(e) => setOwnerAcademicYear(e.target.value)}
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

            <div className="pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmRoadworthy}
                  onChange={(e) => {
                    setConfirmRoadworthy(e.target.checked);
                    if (fieldErrors.confirmRoadworthy) {
                      setFieldErrors((p) => ({ ...p, confirmRoadworthy: '' }));
                    }
                  }}
                  className="mt-0.5 w-4 h-4 accent-[#29483B] rounded shrink-0"
                />
                <span className="text-xs text-[#202522] leading-relaxed">
                  <strong>Owner Declaration:</strong> I confirm that this vehicle holds a valid Registration Certificate (RC) and active insurance, is mechanically roadworthy, and that I am an enrolled ICFAI University Hyderabad student authorized to list it.
                </span>
              </label>
              {fieldErrors.confirmRoadworthy && (
                <p className="text-xs text-[#B44242] mt-1.5 font-medium">
                  {fieldErrors.confirmRoadworthy}
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-[#E5E4DE] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#70756F] max-w-md">
              Once submitted, our campus team will verify your listing details and publish your bike to the catalog.
            </p>
            <button
              id="submit-owner-listing-btn"
              type="submit"
              disabled={submitting || uploadingPhotos}
              className="rp-btn rp-btn-primary rp-btn-lg w-full sm:w-auto"
            >
              {uploadingPhotos ? (
                <span>Uploading Bike Photos...</span>
              ) : submitting ? (
                <span>Submitting Bike Listing...</span>
              ) : (
                <>
                  <span>Submit Bike for Admin Review</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
