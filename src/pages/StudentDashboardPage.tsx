import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Booking, Bike, PickupLocation } from '../types';
import {
  api,
  MAX_BIKE_IMAGES_PER_LISTING,
  isHttpsBikeImageUrl,
  validateSelectedBikeImageFile,
  readFileAsDataUrl,
  assertHttpsBikeImageList,
} from '../services/api';
import { EnrollmentNumberInput } from '../components/EnrollmentNumberInput';
import { VehicleImage } from '../components/VehicleImage';
import { hourlyToDaily, dailyToHourly, PRICING_HELPER_TEXT } from '../utils/pricing';
import { validateIcfaiEnrollment } from '../utils/validation';
import {
  User,
  Ticket,
  Calendar,
  MapPin,
  Bike as BikeIcon,
  PlusCircle,
  CheckCircle2,
  Clock,
  QrCode,
  Edit3,
  X,
  AlertCircle,
  Upload,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Star,
  RefreshCw,
} from 'lucide-react';

interface StudentDashboardPageProps {
  onNavigate: (view: string, params?: any) => void;
  onViewBookingPass: (booking: Booking) => void;
  initialSection?: 'profile' | 'bookings' | 'listings' | 'settings';
}

export const StudentDashboardPage: React.FC<StudentDashboardPageProps> = ({
  onNavigate,
  onViewBookingPass,
  initialSection = 'profile',
}) => {
  const {
    studentUser,
    isStudentLoggedIn,
    isLoadingSession,
    updateStudentProfile,
    changeStudentPassword,
    setAuthReturnDestination,
    showToast,
  } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [listedBikes, setListedBikes] = useState<Bike[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  // Inline Profile Editing State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profName, setProfName] = useState('');
  const [profEnrollment, setProfEnrollment] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profCourse, setProfCourse] = useState('B.Tech');
  const [profYear, setProfYear] = useState('3rd Year');
  const [profError, setProfError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Inline Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Owner Bike Editing Modal State
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editDayPrice, setEditDayPrice] = useState<number>(500);
  const [editHourPrice, setEditHourPrice] = useState<number>(21);
  const [editDeposit, setEditDeposit] = useState<number>(1000);
  const [editHub, setEditHub] = useState('');
  const [editAvailability, setEditAvailability] = useState<'AVAILABLE' | 'UNAVAILABLE' | 'MAINTENANCE'>('AVAILABLE');
  const [editDescription, setEditDescription] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editPhotoError, setEditPhotoError] = useState('');
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const [failedEditPhotoUpload, setFailedEditPhotoUpload] = useState<{
    dataUrl: string;
    mimeType: string;
    replaceIndex?: number;
  } | null>(null);
  const [savingBike, setSavingBike] = useState(false);

  const loadStudentData = async () => {
    if (!studentUser) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [allBookings, myBikes, locs] = await Promise.all([
        api.getBookings(studentUser.id, studentUser.icfaiEnrollmentNumber),
        api.getOwnerBikes(studentUser.icfaiEnrollmentNumber),
        api.getPickupLocations(true).catch(() => []),
      ]);
      setBookings(allBookings || []);
      setListedBikes(myBikes || []);
      if (locs && locs.length > 0) setPickupLocations(locs);
    } catch (err) {
      console.error('Failed to fetch student data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [studentUser]);

  useEffect(() => {
    if (initialSection === 'settings') {
      setIsEditingProfile(false);
      setIsChangingPassword(true);
    } else if (initialSection === 'bookings') {
      const el = document.getElementById('student-bookings-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (initialSection === 'listings') {
      const el = document.getElementById('student-listings-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialSection]);

  const handleCancelBooking = async (booking: Booking) => {
    if (cancellingBookingId) return;
    try {
      setCancellingBookingId(booking.id);
      await api.cancelStudentBooking(booking.id, 'Cancelled by student from dashboard');
      showToast(`Booking #${booking.id} cancelled.`, 'info');
      await loadStudentData();
    } catch (err: any) {
      showToast(err.message || 'Could not cancel booking.', 'error');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const openProfileEditor = () => {
    if (!studentUser) return;
    setProfName(studentUser.fullName || '');
    setProfEnrollment(studentUser.icfaiEnrollmentNumber || '');
    setProfPhone(studentUser.phone || '');
    setProfEmail(studentUser.email || '');
    setProfCourse(studentUser.courseAndBranch || studentUser.course || 'B.Tech (CSE)');
    setProfYear(studentUser.academicYear || 'Year 3');
    setProfError('');
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim() || profName.trim().length < 2) {
      setProfError('Enter your full legal name.');
      return;
    }
    const enrollmentCheck = validateIcfaiEnrollment(profEnrollment);
    if (!enrollmentCheck.valid) {
      setProfError(enrollmentCheck.error || 'Enter a valid ICFAI enrollment number.');
      return;
    }
    const digits = profPhone.replace(/[^0-9]/g, '');
    if (!profPhone.trim() || digits.length < 10) {
      setProfError('Enter a valid 10-digit WhatsApp or mobile number.');
      return;
    }

    try {
      setSavingProfile(true);
      setProfError('');
      await updateStudentProfile({
        fullName: profName.trim(),
        enrollment: enrollmentCheck.normalized,
        phone: profPhone.trim(),
        email:
          profEmail.trim() ||
          `${enrollmentCheck.normalized.toLowerCase()}@student.icfaiuniversity.in`,
        academicYear: profYear,
        course: profCourse,
      });
      setIsEditingProfile(false);
    } catch (err: any) {
      setProfError(err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const openEditBikeModal = (bike: Bike) => {
    setEditingBike(bike);
    setEditBrand(bike.brand);
    setEditModel(bike.model);
    setEditDayPrice(bike.pricePerDay || 500);
    setEditHourPrice(bike.pricePerHour || dailyToHourly(bike.pricePerDay || 500));
    setEditDeposit(bike.securityDeposit || 1000);
    setEditHub(bike.pickupHub || 'ICFAI Main Gate');
    setEditAvailability(
      bike.availabilityStatus === 'UNAVAILABLE' || bike.availabilityStatus === 'MAINTENANCE'
        ? bike.availabilityStatus
        : 'AVAILABLE'
    );
    setEditDescription(bike.description || '');
    setEditImages(
      Array.isArray(bike.images)
        ? bike.images
            .filter((img) => isHttpsBikeImageUrl(img))
            .slice(0, MAX_BIKE_IMAGES_PER_LISTING)
        : []
    );
    setEditPhotoError('');
    setUploadingEditPhoto(false);
    setFailedEditPhotoUpload(null);
  };

  const handleEditBikeDayPrice = (valStr: string) => {
    const val = Math.max(0, Number(valStr) || 0);
    setEditDayPrice(val);
    setEditHourPrice(dailyToHourly(val));
  };

  const handleEditBikeHourPrice = (valStr: string) => {
    const val = Math.max(0, Number(valStr) || 0);
    setEditHourPrice(val);
    setEditDayPrice(hourlyToDaily(val));
  };

  const uploadSingleEditBikePhoto = async (
    dataUrl: string,
    mimeType: string,
    replaceIndex?: number
  ) => {
    if (!editingBike) return;
    try {
      setUploadingEditPhoto(true);
      setEditPhotoError('');
      setFailedEditPhotoUpload(null);

      const uploaded = await api.uploadBikeImage(
        {
          image: dataUrl,
          mimeType,
          bikeId: editingBike.id,
        },
        { authRole: 'student' }
      );

      if (typeof replaceIndex === 'number') {
        setEditImages((prev) =>
          prev.map((item, idx) => (idx === replaceIndex ? uploaded.publicUrl : item))
        );
      } else {
        setEditImages((prev) =>
          prev.length < MAX_BIKE_IMAGES_PER_LISTING
            ? [...prev, uploaded.publicUrl]
            : prev
        );
      }
      showToast('Bike photo uploaded.', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Could not upload bike photo. Please try again.';
      setEditPhotoError(msg);
      setFailedEditPhotoUpload({ dataUrl, mimeType, replaceIndex });
      showToast(msg, 'error');
    } finally {
      setUploadingEditPhoto(false);
    }
  };

  const processEditBikeSelectedFile = async (file: File, replaceIndex?: number) => {
    if (!editingBike || uploadingEditPhoto) return;
    setEditPhotoError('');

    if (
      replaceIndex === undefined &&
      editImages.length >= MAX_BIKE_IMAGES_PER_LISTING
    ) {
      const msg = `A bike listing can have at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`;
      setEditPhotoError(msg);
      showToast(msg, 'error');
      return;
    }

    let normalizedMime: string;
    try {
      normalizedMime = validateSelectedBikeImageFile(file);
    } catch (err: any) {
      const msg = err?.message || 'Invalid image file.';
      setEditPhotoError(msg);
      showToast(msg, 'error');
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (err: any) {
      const msg = err?.message || 'Failed to read image file.';
      setEditPhotoError(msg);
      showToast(msg, 'error');
      return;
    }

    await uploadSingleEditBikePhoto(dataUrl, normalizedMime, replaceIndex);
  };

  const handleEditBikeImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processEditBikeSelectedFile(file);
  };

  const handleReplaceEditBikeImage = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processEditBikeSelectedFile(file, index);
  };

  const handleSetEditCoverImage = (index: number) => {
    if (index === 0 || uploadingEditPhoto) return;
    setEditImages((prev) => {
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
    showToast('Updated cover photo.', 'info');
  };

  const handleRetryEditPhotoUpload = async () => {
    if (!failedEditPhotoUpload || uploadingEditPhoto) return;
    await uploadSingleEditBikePhoto(
      failedEditPhotoUpload.dataUrl,
      failedEditPhotoUpload.mimeType,
      failedEditPhotoUpload.replaceIndex
    );
  };

  const handleSaveBikeChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBike || savingBike || uploadingEditPhoto) return;
    try {
      setSavingBike(true);
      setEditPhotoError('');
      const validatedImages = assertHttpsBikeImageList(editImages);
      await api.updateOwnerBike(editingBike.id, {
        brand: editBrand,
        model: editModel.trim(),
        pricePerDay: editDayPrice,
        pricePerHour: editHourPrice,
        securityDeposit: editDeposit,
        pickupHub: editHub,
        availabilityStatus: editAvailability,
        description: editDescription.trim(),
        images: validatedImages,
      });
      showToast('Bike listing updated.', 'success');
      setEditingBike(null);
      await loadStudentData();
    } catch (err: any) {
      showToast(err.message || 'Could not update bike listing', 'error');
    } finally {
      setSavingBike(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError('');

    if (!currentPassword || !newPassword) {
      setPasswordError('Enter both your current password and new password.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('New password must be at least 8 characters and include letters and numbers.');
      return;
    }
    if (confirmNewPassword !== newPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    try {
      setSavingPassword(true);
      await changeStudentPassword(currentPassword, newPassword);
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#29483B] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-[#70756F]">Restoring your student session...</p>
      </div>
    );
  }

  if (!isStudentLoggedIn || !studentUser) {
    const returnView =
      initialSection === 'bookings'
        ? 'my-bookings'
        : initialSection === 'listings'
        ? 'my-listings'
        : initialSection === 'settings'
        ? 'account-settings'
        : 'profile';

    const redirectToAuth = (authView: 'login' | 'signup') => {
      setAuthReturnDestination({
        view: returnView,
        reason: 'Sign in to access your student profile, bookings, and bike listings.',
      });
      onNavigate(authView);
    };

    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-12 h-12 rounded-xl bg-white border border-[#E5E4DE] text-[#29483B] flex items-center justify-center mx-auto">
          <User className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display font-bold text-2xl text-[#202522]">
            Student Sign-In Required
          </h1>
          <p className="text-xs text-[#70756F] leading-relaxed">
            Sign in to your Riders Path student account to manage your profile, bookings, digital ride passes, and listed bikes.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => redirectToAuth('login')}
            className="rp-btn rp-btn-primary rp-btn-lg flex-1"
          >
            Sign In
          </button>
          <button
            onClick={() => redirectToAuth('signup')}
            className="rp-btn rp-btn-secondary rp-btn-lg flex-1"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Student Profile Card */}
      <div className="p-6 sm:p-8 rp-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#29483B] flex items-center justify-center text-white font-display font-bold text-xl shrink-0">
              {studentUser.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-display font-bold text-2xl text-[#202522]">
                  {studentUser.fullName}
                </h1>
                <span className="rp-status rp-status-success">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{studentUser.emailVerified !== false ? 'Email Verified' : 'ICFAI Student'}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#70756F] mt-1">
                <span className="font-mono text-[#202522] font-semibold">
                  {studentUser.icfaiEnrollmentNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {studentUser.courseAndBranch || studentUser.course || 'B.Tech'} (
                  {studentUser.academicYear || '3rd Year'})
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{studentUser.phone}</span>
                {studentUser.email && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{studentUser.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsChangingPassword(false);
                openProfileEditor();
              }}
              className="rp-btn rp-btn-secondary rp-btn-sm"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditingProfile(false);
                setPasswordError('');
                setIsChangingPassword((prev) => !prev);
              }}
              className="rp-btn rp-btn-secondary rp-btn-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bikes')}
              className="rp-btn rp-btn-secondary rp-btn-sm"
            >
              Explore Bikes
            </button>
            <button
              type="button"
              onClick={() => onNavigate('onboard')}
              className="rp-btn rp-btn-primary rp-btn-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>List Your Bike</span>
            </button>
          </div>
        </div>

        {/* Inline Password Change Form */}
        {isChangingPassword && (
          <form
            onSubmit={handlePasswordSubmit}
            className="pt-6 border-t border-[#E5E4DE] space-y-4"
            noValidate
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-[#202522]">
                Change Account Password
              </h3>
              <button
                type="button"
                onClick={() => setIsChangingPassword(false)}
                className="text-xs text-[#70756F] hover:text-[#202522]"
              >
                Cancel
              </button>
            </div>

            {passwordError && (
              <div className="p-3 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="rp-label">Current Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="rp-input !pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#70756F] hover:text-[#202522]"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="rp-label">New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 chars (letters + numbers)"
                  className="rp-input"
                />
              </div>
              <div>
                <label className="rp-label">Confirm New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="rp-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsChangingPassword(false)}
                className="rp-btn rp-btn-secondary rp-btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="rp-btn rp-btn-primary rp-btn-sm"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}

        {/* Inline Profile Editor */}
        {isEditingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="pt-6 border-t border-[#E5E4DE] space-y-4"
            noValidate
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-[#202522]">
                Edit Student Profile
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-xs text-[#70756F] hover:text-[#202522]"
              >
                Cancel
              </button>
            </div>

            {profError && (
              <div className="p-3 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
                <span>{profError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="rp-label">
                  Full Legal Name <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="rp-input"
                />
              </div>

              <EnrollmentNumberInput
                id="dashboard-profile-enrollment"
                value={profEnrollment}
                onChange={(val) => setProfEnrollment(val)}
                label="ICFAI Enrollment Number"
                required
              />

              <div>
                <label className="rp-label">
                  WhatsApp / Mobile Number <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={profPhone}
                  onChange={(e) => setProfPhone(e.target.value)}
                  className="rp-input tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label">Student Email</label>
                <input
                  type="email"
                  value={profEmail}
                  onChange={(e) => setProfEmail(e.target.value)}
                  className="rp-input"
                />
              </div>

              <div>
                <label className="rp-label">Program / Faculty</label>
                <select
                  value={profCourse}
                  onChange={(e) => setProfCourse(e.target.value)}
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
                  value={profYear}
                  onChange={(e) => setProfYear(e.target.value)}
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

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="rp-btn rp-btn-secondary rp-btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="rp-btn rp-btn-primary rp-btn-sm"
              >
                {savingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Bookings & Passes Section */}
      <div id="student-bookings-section" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-[#29483B]" />
            <h2 className="font-display font-semibold text-xl text-[#202522]">
              My Bookings &amp; Ride Passes
            </h2>
          </div>
          <span className="text-xs font-mono text-[#70756F] tabular-nums">
            {bookings.length} Total
          </span>
        </div>

        {loading ? (
          <div className="p-10 rp-card text-center text-xs text-[#70756F]">
            Loading bookings...
          </div>
        ) : bookings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bookings.map((b) => {
              const isConfirmed =
                b.bookingStatus === 'confirmed' ||
                b.bookingStatus === 'active_rental' ||
                b.bookingStatus === 'completed';
              const isRejected =
                b.bookingStatus === 'rejected' || b.bookingStatus === 'cancelled';

              return (
                <div
                  key={b.id}
                  className="p-5 rp-card rp-card-interactive space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-[#70756F]">
                          <span className="font-medium text-[#29483B]">{b.bikeBrand}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{b.id}</span>
                        </div>
                        <h3 className="font-display font-semibold text-lg text-[#202522] mt-0.5">
                          {b.bikeModel}
                        </h3>
                      </div>
                      <span
                        className={`rp-status ${
                          isConfirmed
                            ? 'rp-status-success'
                            : isRejected
                            ? 'rp-status-error'
                            : 'rp-status-warning'
                        }`}
                      >
                        {isConfirmed ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span className="capitalize">
                          {b.bookingStatus.replace('_', ' ')}
                        </span>
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-[#70756F]">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>Pickup: {b.pickupHub}</span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>
                          {new Date(b.pickupDate).toLocaleDateString('en-IN')} to{' '}
                          {new Date(b.returnDate).toLocaleDateString('en-IN')} ({b.durationDays}d)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#E5E4DE] text-xs gap-2">
                    <div>
                      <span className="text-[#70756F] block text-[11px]">
                        Rental + Fee + Deposit
                      </span>
                      <span className="font-display font-bold text-sm text-[#202522] tabular-nums">
                        ₹{b.totalPrice + b.platformFee + b.securityDeposit}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {(b.bookingStatus === 'pending_verification' ||
                        b.bookingStatus === 'confirmed') && (
                        <button
                          type="button"
                          disabled={cancellingBookingId === b.id}
                          onClick={() => handleCancelBooking(b)}
                          className="rp-btn rp-btn-ghost rp-btn-sm text-[#B44242] hover:bg-[#F9EDED]"
                        >
                          <span>
                            {cancellingBookingId === b.id ? 'Cancelling...' : 'Cancel'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onViewBookingPass(b)}
                        className="rp-btn rp-btn-secondary rp-btn-sm text-[#29483B]"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>View Status &amp; Pass</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-10 rp-card text-center space-y-3">
            <Ticket className="w-7 h-7 text-[#70756F] mx-auto" />
            <h3 className="font-display font-semibold text-[#202522] text-sm">
              No Bookings Yet
            </h3>
            <p className="text-xs text-[#70756F] max-w-xs mx-auto">
              Explore available bikes near campus and submit your first booking request.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('bikes')}
              className="rp-btn rp-btn-primary"
            >
              Explore Bikes
            </button>
          </div>
        )}
      </div>

      {/* Listed Bikes Section */}
      <div id="student-listings-section" className="space-y-4 pt-4 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
          <div className="flex items-center gap-2">
            <BikeIcon className="w-5 h-5 text-[#29483B]" />
            <h2 className="font-display font-semibold text-xl text-[#202522]">
              My Listed Bikes
            </h2>
          </div>
          <span className="text-xs font-mono text-[#70756F] tabular-nums">
            {listedBikes.length} Listed
          </span>
        </div>

        {listedBikes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {listedBikes.map((b) => {
              const statusLabel = b.approvedByAdmin
                ? 'Approved & Live'
                : b.approvalStatus === 'CHANGES_REQUESTED'
                ? 'Changes Requested'
                : b.approvalStatus === 'REJECTED'
                ? 'Declined'
                : 'Pending Review';

              return (
                <div key={b.id} className="p-5 rp-card space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-12 rounded-lg overflow-hidden border border-[#E5E4DE] bg-[#EFEEE8] shrink-0">
                          <VehicleImage
                            src={b.images?.[0]}
                            alt={b.model}
                            brand={b.brand}
                            model={b.model}
                            bikeType={b.bikeType}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-[#70756F]">
                            <span className="font-medium text-[#29483B]">{b.brand}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{b.registrationNumber}</span>
                          </div>
                          <h3 className="font-display font-semibold text-base text-[#202522] mt-0.5">
                            {b.model}
                          </h3>
                        </div>
                      </div>

                      <span
                        className={`rp-status ${
                          b.approvedByAdmin
                            ? 'rp-status-success'
                            : b.approvalStatus === 'REJECTED'
                            ? 'rp-status-error'
                            : 'rp-status-warning'
                        }`}
                      >
                        <span>{statusLabel}</span>
                      </span>
                    </div>

                    {b.approvalNotes && !b.approvedByAdmin && (
                      <div className="p-2.5 rounded-lg bg-[#F7F1E6] border border-[#E8D6B9] text-xs text-[#7D551B]">
                        <strong>Admin Note:</strong> {b.approvalNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#70756F] pt-3 border-t border-[#E5E4DE]">
                    <div>
                      <span className="block text-[#202522] font-semibold tabular-nums">
                        ₹{b.pricePerDay}/day (₹{b.pricePerHour}/hr)
                      </span>
                      <span className="text-[11px]">{b.pickupHub}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditBikeModal(b)}
                      className="rp-btn rp-btn-secondary rp-btn-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Listing</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rp-card text-center space-y-2">
            <p className="text-xs text-[#70756F]">
              You haven&apos;t listed any bikes yet. Earn from your motorcycle or scooter while it sits parked on campus.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('onboard')}
              className="text-xs text-[#29483B] hover:text-[#20392F] font-semibold underline underline-offset-4"
            >
              List your bike →
            </button>
          </div>
        )}
      </div>

      {/* Edit Owner Bike Modal */}
      {editingBike && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/45 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E5E4DE] rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DE]">
              <div>
                <h3 className="font-display font-semibold text-base text-[#202522]">
                  Edit Listed Bike · {editingBike.brand} {editingBike.model}
                </h3>
                <p className="text-xs text-[#70756F]">
                  Update pricing, availability, pickup hub, or photos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBike(null)}
                className="p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBikeChanges} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="rp-label">Brand</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="rp-input"
                  />
                </div>
                <div>
                  <label className="rp-label">Model</label>
                  <input
                    type="text"
                    required
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="rp-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="rp-label">Daily Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="150"
                    value={editDayPrice || ''}
                    onChange={(e) => handleEditBikeDayPrice(e.target.value)}
                    className="rp-input font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="rp-label">Hourly Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="10"
                    value={editHourPrice || ''}
                    onChange={(e) => handleEditBikeHourPrice(e.target.value)}
                    className="rp-input font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="rp-label">Security Deposit (₹)</label>
                  <input
                    type="number"
                    min="500"
                    value={editDeposit || ''}
                    onChange={(e) => setEditDeposit(Number(e.target.value))}
                    className="rp-input font-mono tabular-nums"
                  />
                </div>
              </div>
              <p className="rp-helper">{PRICING_HELPER_TEXT}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="rp-label">Campus Pickup Hub</label>
                  <select
                    value={editHub}
                    onChange={(e) => setEditHub(e.target.value)}
                    className="rp-select"
                  >
                    {hubOptions.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="rp-label">Availability Status</label>
                  <select
                    value={editAvailability}
                    onChange={(e) => setEditAvailability(e.target.value as any)}
                    className="rp-select"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="UNAVAILABLE">Temporarily Unavailable</option>
                    <option value="MAINTENANCE">Under Maintenance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="rp-label">Condition &amp; Handover Notes</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="rp-textarea"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="rp-label !mb-0">
                    Photos ({editImages.length}/{MAX_BIKE_IMAGES_PER_LISTING})
                  </label>
                  <span className="text-[11px] font-mono text-[#70756F]">
                    JPG, PNG, WEBP · Max 5MB
                  </span>
                </div>

                {uploadingEditPhoto && (
                  <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-[#202522] text-xs flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#29483B] animate-spin shrink-0" />
                    <span>Uploading photo...</span>
                  </div>
                )}

                {editPhotoError && (
                  <div className="p-2.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-[#B44242] shrink-0" />
                      <span>{editPhotoError}</span>
                    </div>
                    {failedEditPhotoUpload && (
                      <button
                        type="button"
                        disabled={uploadingEditPhoto}
                        onClick={handleRetryEditPhotoUpload}
                        className="px-2 py-1 rounded bg-white border border-[#E8C5C5] text-[#8F3030] hover:bg-[#F4DFDF] font-semibold shrink-0"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {editImages.map((img, i) => (
                    <div
                      key={i}
                      className="rounded-lg overflow-hidden border border-[#E5E4DE] bg-white flex flex-col justify-between"
                    >
                      <div className="relative h-20 bg-[#EFEEE8]">
                        <VehicleImage
                          src={img}
                          alt={editModel}
                          brand={editBrand}
                          model={editModel}
                          className="w-full h-full object-cover"
                        />
                        {i === 0 && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[#29483B] text-white text-[9px] font-semibold">
                            Cover
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 bg-[#F7F6F2] border-t border-[#E5E4DE] flex items-center justify-between gap-1 text-[10px]">
                        {i !== 0 ? (
                          <button
                            type="button"
                            disabled={uploadingEditPhoto}
                            onClick={() => handleSetEditCoverImage(i)}
                            className="inline-flex items-center gap-0.5 text-[#29483B] hover:underline font-medium disabled:opacity-50"
                          >
                            <Star className="w-2.5 h-2.5" />
                            <span>Cover</span>
                          </button>
                        ) : (
                          <span className="text-[#70756F] font-medium">Primary</span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <label
                            className={`inline-flex items-center gap-0.5 text-[#202522] hover:text-[#29483B] font-medium ${
                              uploadingEditPhoto
                                ? 'opacity-50 pointer-events-none'
                                : 'cursor-pointer'
                            }`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Replace</span>
                            <input
                              type="file"
                              disabled={uploadingEditPhoto}
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => handleReplaceEditBikeImage(i, e)}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={uploadingEditPhoto}
                            onClick={() =>
                              setEditImages((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                            className="inline-flex items-center text-[#B44242] hover:underline font-medium disabled:opacity-50"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {editImages.length < MAX_BIKE_IMAGES_PER_LISTING && (
                    <label
                      className={`min-h-[108px] rounded-lg border border-dashed border-[#D4D2C8] hover:border-[#29483B] flex flex-col items-center justify-center text-xs text-[#70756F] bg-[#F7F6F2] ${
                        uploadingEditPhoto
                          ? 'opacity-50 pointer-events-none'
                          : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-4 h-4 text-[#29483B] mb-0.5" />
                      <span className="text-[11px] font-medium">
                        {uploadingEditPhoto ? 'Uploading...' : 'Add Photo'}
                      </span>
                      <input
                        type="file"
                        disabled={uploadingEditPhoto}
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleEditBikeImageUpload}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DE]">
                <button
                  type="button"
                  disabled={savingBike || uploadingEditPhoto}
                  onClick={() => setEditingBike(null)}
                  className="rp-btn rp-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBike || uploadingEditPhoto}
                  className="rp-btn rp-btn-primary"
                >
                  {uploadingEditPhoto
                    ? 'Uploading Photo...'
                    : savingBike
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
