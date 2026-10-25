import React, { useState } from 'react';
import { useAuth, sanitizeReturnView } from '../context/AuthContext';
import { EnrollmentNumberInput } from '../components/EnrollmentNumberInput';
import { validateIcfaiEnrollment } from '../utils/validation';
import { triggerHaptic } from '../utils/haptics';
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { AcademicYear, CourseName } from '../types';

interface SignupPageProps {
  onNavigate: (view: string, params?: any) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate }) => {
  const { signupWithEmail, authReturnDestination, consumeAuthReturnDestination } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [course, setCourse] = useState<CourseName>('B.Tech');
  const [academicYear, setAcademicYear] = useState<AcademicYear>('3rd Year');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Field-level validation errors
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [enrollmentError, setEnrollmentError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    triggerHaptic('medium');

    setNameError('');
    setEmailError('');
    setPhoneError('');
    setEnrollmentError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setTermsError('');
    setGeneralError('');

    let hasError = false;

    if (!fullName.trim() || fullName.trim().length < 2) {
      setNameError('Enter your full legal name as printed on your Student ID.');
      hasError = true;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailError('Enter a valid email address.');
      hasError = true;
    }

    const digits = phone.replace(/[^0-9]/g, '');
    if (!phone.trim() || digits.length < 10) {
      setPhoneError('Enter a valid 10-digit WhatsApp or mobile number.');
      hasError = true;
    }

    const enrollmentCheck = validateIcfaiEnrollment(enrollment);
    if (!enrollmentCheck.valid) {
      setEnrollmentError(enrollmentCheck.error || 'Enter your ICFAI enrollment number.');
      hasError = true;
    }

    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      hasError = true;
    } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setPasswordError('Password must include at least one letter and one number.');
      hasError = true;
    }

    if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match.');
      hasError = true;
    }

    if (!termsAccepted) {
      setTermsError('Please accept the Riders Path terms and campus rider guidelines.');
      hasError = true;
    }

    if (hasError) {
      triggerHaptic('error');
      return;
    }

    try {
      setLoading(true);
      const res = await signupWithEmail({
        fullName: fullName.trim(),
        email: cleanEmail,
        password,
        phone: phone.trim(),
        icfaiEnrollmentNumber: enrollmentCheck.normalized,
        course,
        academicYear,
      });
      triggerHaptic('success');
      if (res.requiresEmailVerification === false) {
        const dest = consumeAuthReturnDestination();
        if (dest && dest.view) {
          onNavigate(sanitizeReturnView(dest.view), dest.bikeId ? { bikeId: dest.bikeId } : undefined);
        } else {
          onNavigate('student-dashboard');
        }
      } else {
        onNavigate('verify-email');
      }
    } catch (err: any) {
      triggerHaptic('error');
      setGeneralError(err.message || 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F7F6F2] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-8 shadow-2xs">
          {/* Header */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-[#29483B] hover:underline focus-ring rounded-xs"
            >
              Riders Path
            </button>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#202522] tracking-tight mt-2">
              Create your student account.
            </h1>
            <p className="text-sm text-[#70756F] mt-1">
              Set up your credentials and ICFAI Hyderabad student profile.
            </p>
          </div>

          {authReturnDestination?.reason && (
            <div className="mb-5 p-3.5 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] text-[#225C43] text-xs font-medium flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
              <span>{authReturnDestination.reason}</span>
            </div>
          )}

          {generalError && (
            <div
              className="mb-5 p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Section 1: Student Profile Details */}
            <div className="space-y-4">
              <div>
                <label htmlFor="signup-fullname-input" className="rp-label">
                  Full Legal Name <span className="text-[#B44242]">*</span>
                </label>
                <input
                  id="signup-fullname-input"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="As shown on your Driving Licence & College ID"
                  className={`rp-input ${nameError ? '!border-[#B44242]' : ''}`}
                />
                {nameError && (
                  <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{nameError}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="signup-email-input" className="rp-label">
                    Email Address <span className="text-[#B44242]">*</span>
                  </label>
                  <input
                    id="signup-email-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="you@student.icfaiuniversity.in"
                    className={`rp-input ${emailError ? '!border-[#B44242]' : ''}`}
                  />
                  {emailError && (
                    <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{emailError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="signup-phone-input" className="rp-label">
                    Mobile / WhatsApp Number <span className="text-[#B44242]">*</span>
                  </label>
                  <input
                    id="signup-phone-input"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (phoneError) setPhoneError('');
                    }}
                    placeholder="+91 98490 12345"
                    className={`rp-input tabular-nums ${phoneError ? '!border-[#B44242]' : ''}`}
                  />
                  {phoneError && (
                    <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{phoneError}</span>
                    </p>
                  )}
                </div>
              </div>

              <EnrollmentNumberInput
                id="signup-enrollment-input"
                value={enrollment}
                onChange={(val) => {
                  setEnrollment(val);
                  if (enrollmentError) setEnrollmentError('');
                }}
                label="ICFAI Enrollment Number"
                required
                showStatusBadge
                showHelpText
                error={enrollmentError}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="signup-course-select" className="rp-label">
                    Course / Program
                  </label>
                  <select
                    id="signup-course-select"
                    value={course}
                    onChange={(e) => setCourse(e.target.value as CourseName)}
                    className="rp-select"
                  >
                    <option value="B.Tech">B.Tech (FST)</option>
                    <option value="BBA">BBA (IBS)</option>
                    <option value="MBA">MBA (IBS)</option>
                    <option value="Law">Law (BA / BBA LLB)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="signup-year-select" className="rp-label">
                    Academic Year
                  </label>
                  <select
                    id="signup-year-select"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                    className="rp-select"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Password Setup */}
            <div className="pt-2 border-t border-[#E5E4DE] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="signup-password-input" className="rp-label">
                  Password <span className="text-[#B44242]">*</span>
                </label>
                <div className="relative">
                  <input
                    id="signup-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Min. 8 chars"
                    className={`rp-input !pr-10 ${passwordError ? '!border-[#B44242]' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError ? (
                  <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordError}</span>
                  </p>
                ) : (
                  <p className="rp-helper">8+ characters with letters and numbers.</p>
                )}
              </div>

              <div>
                <label htmlFor="signup-confirm-password-input" className="rp-label">
                  Confirm Password <span className="text-[#B44242]">*</span>
                </label>
                <div className="relative">
                  <input
                    id="signup-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) setConfirmPasswordError('');
                    }}
                    placeholder="Re-enter password"
                    className={`rp-input !pr-10 ${confirmPasswordError ? '!border-[#B44242]' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-pressed={showConfirmPassword}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPasswordError && (
                  <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{confirmPasswordError}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Section 3: Terms */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  id="signup-terms-checkbox"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (termsError) setTermsError('');
                  }}
                  className="mt-0.5 w-4 h-4 rounded-xs border-[#D4D2C8] text-[#29483B] focus:ring-[#29483B]"
                />
                <span className="text-xs text-[#70756F] leading-relaxed">
                  I confirm I am an ICFAI University Hyderabad student and agree to the{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('terms')}
                    className="font-semibold text-[#202522] underline hover:text-[#29483B]"
                  >
                    Terms &amp; Rental Rules
                  </button>
                  .
                </span>
              </label>
              {termsError && (
                <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium mt-1.5" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{termsError}</span>
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                id="signup-submit-btn"
                type="submit"
                disabled={loading}
                className="rp-btn rp-btn-primary rp-btn-lg w-full"
              >
                {loading ? (
                  <span>Creating Student Account...</span>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-[#E5E4DE] text-center">
            <p className="text-xs text-[#70756F]">
              Already have an account?{' '}
              <button
                id="signup-to-login-link"
                type="button"
                onClick={() => onNavigate('login')}
                className="font-semibold text-[#29483B] hover:underline focus-ring rounded-xs ml-0.5"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
