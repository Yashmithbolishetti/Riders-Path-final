import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Menu,
  X,
  LogOut,
  ChevronRight,
  ChevronDown,
  User,
  Ticket,
  Bike as BikeIcon,
  Settings,
  Shield,
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, params?: any) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { studentUser, isStudentLoggedIn, isLoadingSession, logoutStudent } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  const handleNav = (view: string, params?: any) => {
    onNavigate(view, params);
    setIsMobileMenuOpen(false);
    setIsAccountMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = async () => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    await logoutStudent();
    if (
      [
        'student-dashboard',
        'profile',
        'my-bookings',
        'my-listings',
        'account-settings',
        'book',
      ].includes(currentView)
    ) {
      onNavigate('home');
    }
  };

  const navLinkClass = (view: string) =>
    `py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
      currentView === view
        ? 'text-[#202522] border-[#29483B] font-semibold'
        : 'text-[#70756F] border-transparent hover:text-[#202522]'
    }`;

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-150 border-b border-[#E5E4DE] ${
        isScrolled ? 'bg-[#F7F6F2]/95 backdrop-blur-md' : 'bg-[#F7F6F2]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single Clean Brand Wordmark */}
          <a
            id="brand-logo-btn"
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              handleNav('home');
            }}
            className="font-display font-bold text-lg tracking-tight text-[#202522] whitespace-nowrap shrink-0 focus-ring rounded-sm py-1"
          >
            Riders Path
          </a>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary Navigation">
            <button
              id="nav-bikes-btn"
              onClick={() => handleNav('bikes')}
              className={navLinkClass('bikes')}
            >
              Explore Bikes
            </button>
            <button
              id="nav-how-it-works-btn"
              onClick={() => handleNav('how-it-works')}
              className={navLinkClass('how-it-works')}
            >
              How It Works
            </button>
            <button
              id="nav-onboard-btn"
              onClick={() => handleNav('onboard')}
              className={navLinkClass('onboard')}
            >
              List Your Bike
            </button>
            <button
              id="nav-faq-btn"
              onClick={() => handleNav('faq')}
              className={navLinkClass('faq')}
            >
              FAQ
            </button>
            <button
              id="nav-contact-btn"
              onClick={() => handleNav('contact')}
              className={navLinkClass('contact')}
            >
              Contact
            </button>
          </nav>

          {/* Zone 3: Authentication-Aware Account Control */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {isLoadingSession && !studentUser ? (
              <div className="h-9 w-28 rounded-lg bg-[#EFEEE8] animate-pulse" aria-hidden="true" />
            ) : isStudentLoggedIn && studentUser ? (
              <div className="relative" ref={accountMenuRef}>
                <button
                  id="nav-account-menu-btn"
                  type="button"
                  onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  className="rp-btn rp-btn-secondary flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-[#29483B]" />
                  <span className="font-semibold text-[#202522]">
                    {studentUser.fullName.split(' ')[0]}
                  </span>
                  <span aria-hidden="true" className="text-[#70756F]">
                    ·
                  </span>
                  <span className="font-mono text-xs text-[#70756F] tabular-nums">
                    {studentUser.icfaiEnrollmentNumber}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-[#70756F] transition-transform duration-150 ${
                      isAccountMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isAccountMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Student Account Menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-white border border-[#E5E4DE] shadow-lg py-1.5 z-50"
                  >
                    <div className="px-3.5 py-2.5 border-b border-[#E5E4DE]">
                      <p className="text-xs font-semibold text-[#202522] truncate">
                        {studentUser.fullName}
                      </p>
                      <p className="text-[11px] font-mono text-[#70756F] truncate mt-0.5">
                        {studentUser.icfaiEnrollmentNumber}
                        {studentUser.email ? ` · ${studentUser.email}` : ''}
                      </p>
                    </div>

                    <div className="py-1">
                      <button
                        id="account-menu-profile-btn"
                        role="menuitem"
                        type="button"
                        onClick={() => handleNav('profile')}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center gap-2.5 transition-colors"
                      >
                        <User className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>My Profile</span>
                      </button>

                      <button
                        id="account-menu-bookings-btn"
                        role="menuitem"
                        type="button"
                        onClick={() => handleNav('my-bookings')}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center gap-2.5 transition-colors"
                      >
                        <Ticket className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>My Bookings</span>
                      </button>

                      <button
                        id="account-menu-listings-btn"
                        role="menuitem"
                        type="button"
                        onClick={() => handleNav('my-listings')}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center gap-2.5 transition-colors"
                      >
                        <BikeIcon className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>My Bike Listings</span>
                      </button>

                      <button
                        id="account-menu-settings-btn"
                        role="menuitem"
                        type="button"
                        onClick={() => handleNav('account-settings')}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center gap-2.5 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#29483B]" />
                        <span>Account Settings</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-[#E5E4DE]">
                      <button
                        id="student-logout-btn"
                        role="menuitem"
                        type="button"
                        onClick={handleSignOut}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#B44242] hover:bg-[#F9EDED] flex items-center gap-2.5 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="open-student-login-btn"
                  onClick={() => handleNav('login')}
                  className="rp-btn rp-btn-secondary"
                >
                  <span>Sign In</span>
                </button>
                <button
                  id="open-student-signup-btn"
                  onClick={() => handleNav('signup')}
                  className="rp-btn rp-btn-primary"
                >
                  <span>Create Account</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex md:hidden items-center gap-2">
            {isStudentLoggedIn && studentUser && (
              <button
                onClick={() => handleNav('profile')}
                className="px-2.5 py-1.5 rounded-md bg-white border border-[#E5E4DE] text-xs font-mono text-[#202522] whitespace-nowrap"
              >
                {studentUser.icfaiEnrollmentNumber}
              </button>
            )}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2.5 rounded-md bg-white border border-[#E5E4DE] text-[#202522] hover:bg-[#EFEEE8] focus-ring"
              aria-label="Toggle Navigation Menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-[#E5E4DE] px-4 pt-3 pb-6 space-y-1 shadow-md">
          {[
            { view: 'home', label: 'Home' },
            { view: 'bikes', label: 'Explore Bikes' },
            { view: 'onboard', label: 'List Your Bike' },
            { view: 'how-it-works', label: 'How It Works' },
            { view: 'faq', label: 'FAQ' },
            { view: 'terms', label: 'Terms & Conditions' },
            { view: 'contact', label: 'Contact' },
          ].map((item) => (
            <button
              key={item.view}
              onClick={() => handleNav(item.view)}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${
                currentView === item.view
                  ? 'bg-[#EBF0ED] text-[#29483B] font-semibold'
                  : 'text-[#202522] hover:bg-[#F7F6F2]'
              }`}
            >
              <span>{item.label}</span>
              <ChevronRight className="w-4 h-4 text-[#70756F]" />
            </button>
          ))}

          <div className="pt-3 mt-2 border-t border-[#E5E4DE] flex flex-col gap-1.5">
            {isStudentLoggedIn && studentUser ? (
              <>
                <div className="px-3.5 py-2 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] mb-1">
                  <p className="text-xs font-semibold text-[#202522]">{studentUser.fullName}</p>
                  <p className="text-[11px] font-mono text-[#70756F]">
                    {studentUser.icfaiEnrollmentNumber}
                  </p>
                </div>

                <button
                  onClick={() => handleNav('profile')}
                  className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>My Profile</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#70756F]" />
                </button>

                <button
                  onClick={() => handleNav('my-bookings')}
                  className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Ticket className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>My Bookings</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#70756F]" />
                </button>

                <button
                  onClick={() => handleNav('my-listings')}
                  className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <BikeIcon className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>My Bike Listings</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#70756F]" />
                </button>

                <button
                  onClick={() => handleNav('account-settings')}
                  className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-[#202522] hover:bg-[#F7F6F2] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>Account Settings</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#70756F]" />
                </button>

                <button
                  onClick={handleSignOut}
                  className="rp-btn rp-btn-danger w-full mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNav('login')}
                  className="rp-btn rp-btn-secondary w-full"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNav('signup')}
                  className="rp-btn rp-btn-primary w-full"
                >
                  Create Account
                </button>
              </>
            )}

            <button
              onClick={() => handleNav('admin')}
              className="rp-btn rp-btn-secondary w-full mt-1"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
