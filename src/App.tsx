import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ToastContainer } from './components/Toast';
import { StudentAuthModal } from './components/StudentAuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';

// Public & Marketplace Pages
import { HomePage } from './pages/HomePage';
import { BikesPage } from './pages/BikesPage';
import { BikeDetailsPage } from './pages/BikeDetailsPage';
import { BookingFlowPage } from './pages/BookingFlowPage';
import { BookingStatusPage } from './pages/BookingStatusPage';
import { OwnerOnboardingPage } from './pages/OwnerOnboardingPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { TermsPage } from './pages/TermsPage';
import { FAQPage } from './pages/FAQPage';
import { ContactPage } from './pages/ContactPage';

// Authentication Pages (Part 6A & 6B)
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// Admin Pages
import { AdminLoginPage } from './pages/Admin/AdminLoginPage';
import { AdminLayout } from './pages/Admin/AdminLayout';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { AdminBikes } from './pages/Admin/AdminBikes';
import { AdminBookings } from './pages/Admin/AdminBookings';
import { AdminVerifications } from './pages/Admin/AdminVerifications';
import { AdminOwnerApprovals } from './pages/Admin/AdminOwnerApprovals';
import { AdminUsers } from './pages/Admin/AdminUsers';
import { AdminSettings } from './pages/Admin/AdminSettings';

import { Bike, Booking } from './types';
import {
  captureCurrentConfirmationUrlState,
  captureCurrentRecoveryUrlState,
  clearConfirmationSession,
  clearRecoverySession,
  hasPendingConfirmationSession,
  hasPendingRecoverySession,
  logRecoveryDiagnostic,
  onConfirmationSessionDetected,
  onRecoverySessionDetected,
  scrubSensitiveAuthUrlParams,
} from './lib/supabase';

const SELECTED_BIKE_STORAGE_KEY = 'rp_selected_bike_id';
const ACTIVE_BOOKING_STORAGE_KEY = 'rp_active_booking';

const normalizeAppPathname = (rawPathname?: string | null): string => {
  const path = (rawPathname || '/').trim() || '/';
  if (/\/(reset-password|verify-email|confirm-email)\/?$/i.test(path)) {
    return path.replace(/\/(reset-password|verify-email|confirm-email)\/?$/i, '') || '/';
  }
  return path;
};

const getInitialView = (): string => {
  if (typeof window === 'undefined') return 'home';

  const confirmationState = captureCurrentConfirmationUrlState(window.location);
  if (
    confirmationState.isConfirmEmailRoute ||
    confirmationState.isConfirmationCallback ||
    hasPendingConfirmationSession(window.location)
  ) {
    return 'confirm-email';
  }
  if (confirmationState.isVerifyEmailRoute) {
    return 'verify-email';
  }

  const recoveryState = captureCurrentRecoveryUrlState(window.location);
  if (
    recoveryState.isResetPasswordRoute ||
    recoveryState.isRecoveryCallback ||
    hasPendingRecoverySession(window.location)
  ) {
    logRecoveryDiagnostic('routerInitialViewResetPassword', {
      isRecoveryCallback: recoveryState.isRecoveryCallback,
      isResetPasswordRoute: recoveryState.isResetPasswordRoute,
      hasAccessToken: Boolean(recoveryState.accessToken),
      hasTokenHash: Boolean(recoveryState.tokenHash),
      hasCode: Boolean(recoveryState.code),
      errorCode: recoveryState.errorCode,
    });
    return 'reset-password';
  }
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (hash && !hash.includes('=')) {
    return hash.split('#')[0].split('?')[0].trim() || 'home';
  }
  const lastPath = window.location.pathname.split('/').filter(Boolean).pop();
  if (lastPath === 'admin') return 'admin';
  if (lastPath === 'login') return 'login';
  if (lastPath === 'signup') return 'signup';
  if (lastPath === 'confirm-email') return 'confirm-email';
  if (lastPath === 'verify-email') return 'verify-email';
  if (lastPath === 'reset-password') return 'reset-password';
  if (lastPath === 'forgot-password') return 'forgot-password';
  return 'home';
};

const MainApp: React.FC = () => {
  const {
    isAdminLoggedIn,
    isStudentLoggedIn,
    studentUser,
    setAuthReturnDestination,
  } = useAuth();

  // Navigation state with initial URL hash detection + sessionStorage persistence
  const [currentView, setCurrentView] = useState<string>(getInitialView);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SELECTED_BIKE_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [activeBooking, setActiveBooking] = useState<Booking | null>(() => {
    try {
      const saved = sessionStorage.getItem(ACTIVE_BOOKING_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Admin Sub-Tab
  const [adminTab, setAdminTab] = useState<string>('dashboard');

  // Clean up raw Supabase confirmation/recovery tokens/errors in the address bar once captured
  // and ensure any pending callback session stays on its dedicated view even if
  // GoTrueClient resets window.location.hash to "".
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const confirmationState = captureCurrentConfirmationUrlState(window.location);
    if (
      confirmationState.isConfirmationCallback ||
      confirmationState.isConfirmEmailRoute ||
      confirmationState.isVerifyEmailRoute
    ) {
      const targetView =
        currentView === 'verify-email' &&
        !confirmationState.confirmationUrl &&
        !confirmationState.isConfirmEmailRoute
          ? 'verify-email'
          : 'confirm-email';
      if (currentView !== 'confirm-email' && currentView !== 'verify-email') {
        setCurrentView(targetView);
      }
      const targetHash =
        (currentView === 'verify-email' || targetView === 'verify-email') &&
        !confirmationState.isConfirmationCallback &&
        !confirmationState.isConfirmEmailRoute
          ? '#verify-email'
          : '#confirm-email';
      scrubSensitiveAuthUrlParams(targetHash);
      return;
    }

    const recoveryState = captureCurrentRecoveryUrlState(window.location);
    if (recoveryState.isRecoveryCallback || recoveryState.isResetPasswordRoute) {
      if (currentView !== 'reset-password') {
        setCurrentView('reset-password');
      }
      const normalizedPath = normalizeAppPathname(window.location.pathname);
      if (
        window.history?.replaceState &&
        (window.location.hash !== '#reset-password' || window.location.pathname !== normalizedPath)
      ) {
        window.history.replaceState(null, '', `${normalizedPath}#reset-password`);
      }
    }
  }, [currentView]);

  // Listen for confirmation and recovery session detection
  useEffect(() => {
    const unsubscribeConfirmation = onConfirmationSessionDetected(() => {
      scrubSensitiveAuthUrlParams('#confirm-email');
      setCurrentView('confirm-email');
    });

    const unsubscribeRecovery = onRecoverySessionDetected(() => {
      if (hasPendingConfirmationSession()) {
        return;
      }
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const normalizedPath = normalizeAppPathname(window.location.pathname);
        if (window.location.hash !== '#reset-password' || window.location.pathname !== normalizedPath) {
          window.history.replaceState(null, '', `${normalizedPath}#reset-password`);
        }
      }
      setCurrentView('reset-password');
    });

    return () => {
      unsubscribeConfirmation();
      unsubscribeRecovery();
    };
  }, []);

  // Sync hash routing so back/forward and refresh maintain the exact view,
  // while protecting against GoTrueClient clearing window.location.hash to "" (`#`).
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
      const confirmationState = captureCurrentConfirmationUrlState(window.location);

      if (
        confirmationState.isConfirmationCallback ||
        confirmationState.isConfirmEmailRoute ||
        confirmationState.isVerifyEmailRoute
      ) {
        if (
          !rawHash ||
          rawHash === 'confirm-email' ||
          rawHash === 'verify-email' ||
          rawHash === 'reset-password' ||
          rawHash.includes('=')
        ) {
          const targetView =
            rawHash === 'verify-email' && !confirmationState.isConfirmationCallback
              ? 'verify-email'
              : 'confirm-email';
          scrubSensitiveAuthUrlParams(
            targetView === 'verify-email' ? '#verify-email' : '#confirm-email'
          );
          if (currentView !== targetView) {
            setCurrentView(targetView);
          }
          return;
        }
      }

      const recoveryState = captureCurrentRecoveryUrlState(window.location);

      if (recoveryState.isRecoveryCallback || recoveryState.isResetPasswordRoute) {
        // If GoTrueClient cleared the hash to "" (`https://ridersspath.ai.studio/#`),
        // or the hash still has raw recovery parameters, keep the user on #reset-password.
        if (!rawHash || rawHash === 'reset-password' || rawHash.includes('=')) {
          const normalizedPath = normalizeAppPathname(window.location.pathname);
          if (
            window.history?.replaceState &&
            (window.location.hash !== '#reset-password' || window.location.pathname !== normalizedPath)
          ) {
            window.history.replaceState(null, '', `${normalizedPath}#reset-password`);
          }
          if (currentView !== 'reset-password') {
            setCurrentView('reset-password');
          }
          return;
        }
      }

      if (rawHash && !rawHash.includes('=') && rawHash !== currentView) {
        setCurrentView(rawHash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentView]);

  const persistSelectedBike = (id: string | null) => {
    setSelectedBikeId(id);
    try {
      if (id) sessionStorage.setItem(SELECTED_BIKE_STORAGE_KEY, id);
      else sessionStorage.removeItem(SELECTED_BIKE_STORAGE_KEY);
    } catch {}
  };

  const persistActiveBooking = (booking: Booking | null) => {
    setActiveBooking(booking);
    try {
      if (booking) sessionStorage.setItem(ACTIVE_BOOKING_STORAGE_KEY, JSON.stringify(booking));
      else sessionStorage.removeItem(ACTIVE_BOOKING_STORAGE_KEY);
    } catch {}
  };

  useEffect(() => {
    if (!activeBooking) return;
    if (!isStudentLoggedIn || !studentUser) {
      if (!isAdminLoggedIn) {
        persistActiveBooking(null);
      }
      return;
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const matchesUserId = activeBooking.renterId === studentUser.id;
    const matchesEnrollment =
      !uuidRe.test(String(activeBooking.renterId || '')) &&
      Boolean(activeBooking.renterEnrollment && studentUser.icfaiEnrollmentNumber) &&
      activeBooking.renterEnrollment.trim().toUpperCase() ===
        studentUser.icfaiEnrollmentNumber.trim().toUpperCase();
    if (!matchesUserId && !matchesEnrollment && !isAdminLoggedIn) {
      persistActiveBooking(null);
    }
  }, [activeBooking, isStudentLoggedIn, studentUser, isAdminLoggedIn]);

  const handleNavigate = (view: string, params?: { bikeId?: string; booking?: Booking }) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view !== 'verify-email' && view !== 'confirm-email') {
      clearConfirmationSession();
    }
    if (view !== 'reset-password') {
      clearRecoverySession();
    }
    if (params?.bikeId) persistSelectedBike(params.bikeId);
    if (params?.booking) persistActiveBooking(params.booking);
    if (window.location.hash !== `#${view}`) {
      window.location.hash = `#${view}`;
    }
    setCurrentView(view);
  };

  const handleSelectBike = (bikeId: string | Bike) => {
    const id = typeof bikeId === 'string' ? bikeId : bikeId.id;
    persistSelectedBike(id);
    handleNavigate('bike-details', { bikeId: id });
  };

  // Part 6B Section 2: Protect Booking
  const handleStartBooking = (bike: Bike) => {
    persistSelectedBike(bike.id);
    if (!isStudentLoggedIn || !studentUser) {
      setAuthReturnDestination({
        view: 'book',
        bikeId: bike.id,
        bikeName: `${bike.brand} ${bike.model}`,
        reason: `Sign in or create your student account to book ${bike.brand} ${bike.model}.`,
      });
      handleNavigate('login', { bikeId: bike.id });
      return;
    }
    handleNavigate('book', { bikeId: bike.id });
  };

  const handleBookingComplete = (booking: Booking) => {
    persistActiveBooking(booking);
    handleNavigate('booking-status', { booking });
  };

  const renderContent = () => {
    // Admin Views
    if (currentView === 'admin') {
      if (!isAdminLoggedIn) {
        return (
          <AdminLoginPage
            onSuccess={() => setCurrentView('admin')}
            onCancel={() => handleNavigate('home')}
          />
        );
      }

      return (
        <AdminLayout
          currentTab={adminTab}
          onSelectTab={(tab) => setAdminTab(tab)}
          onExitAdmin={() => handleNavigate('home')}
        >
          {adminTab === 'dashboard' && <AdminDashboard onNavigateTab={(t) => setAdminTab(t)} />}
          {adminTab === 'bikes' && <AdminBikes />}
          {adminTab === 'bookings' && <AdminBookings />}
          {adminTab === 'verifications' && <AdminVerifications />}
          {adminTab === 'approvals' && <AdminOwnerApprovals />}
          {adminTab === 'locations' && <AdminSettings initialSection="locations" />}
          {adminTab === 'users' && <AdminUsers />}
          {adminTab === 'admins' && <AdminSettings initialSection="admins" />}
          {adminTab === 'settings' && <AdminSettings initialSection="settings" />}
        </AdminLayout>
      );
    }

    if (currentView === 'admin-login') {
      return (
        <AdminLoginPage
          onSuccess={() => handleNavigate('admin')}
          onCancel={() => handleNavigate('home')}
        />
      );
    }

    // Student Authentication & Marketplace Views
    switch (currentView) {
      case 'login':
        return <LoginPage onNavigate={(v, p) => handleNavigate(v, p)} />;

      case 'signup':
        return <SignupPage onNavigate={(v, p) => handleNavigate(v, p)} />;

      case 'confirm-email':
        return <ConfirmEmailPage onNavigate={(v, p) => handleNavigate(v, p)} routeHash="#confirm-email" />;

      case 'verify-email':
        return <VerifyEmailPage onNavigate={(v, p) => handleNavigate(v, p)} />;

      case 'forgot-password':
        return <ForgotPasswordPage onNavigate={(v, p) => handleNavigate(v, p)} />;

      case 'reset-password':
        return <ResetPasswordPage onNavigate={(v, p) => handleNavigate(v, p)} />;

      case 'bikes':
        return <BikesPage onSelectBike={handleSelectBike} onBookBike={handleStartBooking} />;

      case 'bike-details':
        return selectedBikeId ? (
          <BikeDetailsPage
            bikeId={selectedBikeId}
            onBack={() => handleNavigate('bikes')}
            onBookNow={handleStartBooking}
          />
        ) : (
          <BikesPage onSelectBike={handleSelectBike} onBookBike={handleStartBooking} />
        );

      case 'book':
        return selectedBikeId ? (
          <BookingFlowPage
            bikeId={selectedBikeId}
            onBack={() => handleNavigate('bike-details', { bikeId: selectedBikeId })}
            onNavigate={(v, p) => handleNavigate(v, p)}
            onBookingSuccess={handleBookingComplete}
          />
        ) : (
          <BikesPage onSelectBike={handleSelectBike} onBookBike={handleStartBooking} />
        );

      case 'booking-status':
        return activeBooking && (isStudentLoggedIn || isAdminLoggedIn) ? (
          <BookingStatusPage
            booking={activeBooking}
            onExploreMore={() => handleNavigate('bikes')}
            onViewDashboard={() => handleNavigate('my-bookings')}
          />
        ) : (
          <BikesPage onSelectBike={handleSelectBike} onBookBike={handleStartBooking} />
        );

      case 'onboard':
        return (
          <OwnerOnboardingPage
            onSuccess={() => {}}
            onCancel={() => handleNavigate('home')}
            onNavigate={(v) => handleNavigate(v)}
          />
        );

      case 'student-dashboard':
      case 'profile':
        return (
          <StudentDashboardPage
            initialSection="profile"
            onNavigate={(v, p) => handleNavigate(v, p)}
            onViewBookingPass={(b) => handleNavigate('booking-status', { booking: b })}
          />
        );

      case 'my-bookings':
        return (
          <StudentDashboardPage
            initialSection="bookings"
            onNavigate={(v, p) => handleNavigate(v, p)}
            onViewBookingPass={(b) => handleNavigate('booking-status', { booking: b })}
          />
        );

      case 'my-listings':
        return (
          <StudentDashboardPage
            initialSection="listings"
            onNavigate={(v, p) => handleNavigate(v, p)}
            onViewBookingPass={(b) => handleNavigate('booking-status', { booking: b })}
          />
        );

      case 'account-settings':
        return (
          <StudentDashboardPage
            initialSection="settings"
            onNavigate={(v, p) => handleNavigate(v, p)}
            onViewBookingPass={(b) => handleNavigate('booking-status', { booking: b })}
          />
        );

      case 'how-it-works':
        return <HowItWorksPage onNavigate={(v) => handleNavigate(v)} />;

      case 'terms':
        return <TermsPage />;

      case 'faq':
        return <FAQPage />;

      case 'contact':
        return <ContactPage />;

      case 'home':
      default:
        return (
          <HomePage
            onNavigate={(v, p) => handleNavigate(v, p)}
            onSelectBike={handleSelectBike}
            onBookBike={handleStartBooking}
          />
        );
    }
  };

  const isAdminView = currentView === 'admin' || currentView === 'admin-login';

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#202522] selection:bg-[#29483B] selection:text-white font-sans antialiased">
      {/* Accessible Skip Link for Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#29483B] focus:text-white focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {!isAdminView && (
        <Navbar currentView={currentView} onNavigate={(v, p) => handleNavigate(v, p)} />
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className={isAdminView ? 'flex-1 flex flex-col outline-none' : 'flex-1 pb-16 outline-none'}
      >
        {renderContent()}
      </main>

      {!isAdminView && <Footer onNavigate={(v, p) => handleNavigate(v, p)} />}

      <StudentAuthModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
