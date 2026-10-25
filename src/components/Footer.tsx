import React from 'react';
import { MapPin, Phone, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string, params?: any) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const handleNav = (view: string) => {
    onNavigate(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="w-full bg-[#EFEEE8] border-t border-[#E5E4DE] text-[#70756F] text-sm mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          {/* Brand & Intermediary Notice */}
          <div className="lg:col-span-5 space-y-4">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                handleNav('home');
              }}
              className="font-display font-bold text-lg text-[#202522] tracking-tight inline-block"
            >
              Riders Path
            </a>
            <p className="text-sm text-[#70756F] leading-relaxed max-w-md">
              Your campus. Your ride. Your path. A student-focused bike rental marketplace connecting eligible ICFAI Hyderabad students with vehicles listed by student owners.
            </p>
            <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-xs space-y-1">
              <p className="font-semibold text-[#202522]">Platform Intermediary Notice</p>
              <p className="text-xs leading-relaxed text-[#70756F]">
                Riders Path operates as a peer-to-peer marketplace connecting student bike owners with eligible student renters. Riders Path does not own or operate the vehicles listed on the platform.
              </p>
            </div>
          </div>

          {/* Marketplace Navigation */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-display font-semibold text-[#202522] text-sm">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => handleNav('home')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('bikes')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Explore Bikes
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('onboard')}
                  className="text-[#29483B] hover:text-[#20392F] font-medium transition-colors"
                >
                  List Your Bike
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('how-it-works')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  How It Works
                </button>
              </li>
            </ul>
          </div>

          {/* Policies & Support */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-display font-semibold text-[#202522] text-sm">Support & Policy</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => handleNav('faq')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  FAQ & Pickup Hubs
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('terms')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Terms & Conditions
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('contact')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Contact Support
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNav('student-dashboard')}
                  className="text-[#70756F] hover:text-[#202522] transition-colors"
                >
                  Student Account
                </button>
              </li>
            </ul>
          </div>

          {/* Campus Coordination */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="font-display font-semibold text-[#202522] text-sm">
              ICFAI Hyderabad Campus
            </h4>
            <ul className="space-y-2.5 text-xs text-[#70756F]">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <span>
                  ICFAI University (IFHE), Shankerpally Road, Donthanapally, Hyderabad 501203
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#29483B] shrink-0" />
                <span className="font-mono tabular-nums">+91 98490 21000</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#29483B] shrink-0" />
                <span className="font-mono">support@riderspath.icfai</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 mt-10 border-t border-[#E5E4DE] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#70756F]">
          <p>© {new Date().getFullYear()} Riders Path · ICFAI Hyderabad Student Mobility</p>
          <div className="flex items-center gap-6">
            <button
              onClick={() => handleNav('terms')}
              className="text-[#70756F] hover:text-[#202522] transition-colors"
            >
              Rental Guidelines
            </button>
            <button
              id="nav-admin-link-btn"
              onClick={() => handleNav('admin')}
              className="text-[#70756F] hover:text-[#202522] font-medium transition-colors"
            >
              Staff & Admin Console
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
