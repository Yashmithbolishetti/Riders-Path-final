import React from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

interface HowItWorksPageProps {
  onNavigate: (view: string) => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
      {/* Header */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#29483B]">
          <ShieldCheck className="w-4 h-4" />
          <span>ICFAI Hyderabad Campus Guide</span>
        </div>
        <h1 className="rp-page-title">How Riders Path Works</h1>
        <p className="rp-text-secondary">
          A clear step-by-step overview of how eligible ICFAI students rent bikes from peers and how student bike owners earn from parked vehicles.
        </p>
      </div>

      {/* Renter Guide */}
      <div className="space-y-6">
        <div className="border-b border-[#E5E4DE] pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <span className="rp-kicker block">For Student Renters</span>
            <h2 className="rp-section-heading mt-1">Renting a Bike on Campus</h2>
          </div>
          <button
            onClick={() => onNavigate('bikes')}
            className="rp-btn rp-btn-primary rp-btn-sm self-start sm:self-auto"
          >
            <span>Explore Available Bikes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rp-card space-y-3">
            <span className="font-mono text-xs font-semibold text-[#29483B] block">
              01. Step
            </span>
            <h3 className="rp-card-title">Explore Available Bikes</h3>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Browse student-listed motorcycles and scooters filtered by category, daily rate, transmission, and designated campus pickup location.
            </p>
          </div>

          <div className="p-6 rp-card space-y-3">
            <span className="font-mono text-xs font-semibold text-[#29483B] block">
              02. Step
            </span>
            <h3 className="rp-card-title">Submit Verification &amp; Schedule</h3>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Enter your ICFAI enrollment number, choose your pickup and return dates, upload your Driving Licence and Aadhaar card, and accept the rental terms.
            </p>
          </div>

          <div className="p-6 rp-card space-y-3">
            <span className="font-mono text-xs font-semibold text-[#29483B] block">
              03. Step
            </span>
            <h3 className="rp-card-title">Campus Pickup &amp; Collateral Handover</h3>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Once your booking is verified, meet the student owner at the designated pickup location, present your physical ICFAI ID, deposit your working laptop collateral, and collect the keys and helmet.
            </p>
          </div>

          <div className="p-6 rp-card space-y-3">
            <span className="font-mono text-xs font-semibold text-[#29483B] block">
              04. Step
            </span>
            <h3 className="rp-card-title">Return &amp; Deposit Refund</h3>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Return the bike on time at the pickup point. After a quick post-ride condition and fuel check, your laptop collateral and refundable security deposit are returned immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Owner Guide */}
      <div className="space-y-6">
        <div className="border-b border-[#E5E4DE] pb-3">
          <span className="rp-kicker block">For Student Bike Owners</span>
          <h2 className="rp-section-heading mt-1">Listing Your Bike as a Host</h2>
        </div>

        <div className="p-6 sm:p-8 rp-card space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2">
              <span className="font-mono text-xs font-semibold text-[#29483B] block">
                01. Control Your Listing
              </span>
              <h3 className="font-display font-semibold text-[#202522] text-sm">
                Set Your Rate &amp; Pickup Point
              </h3>
              <p className="text-[#70756F] leading-relaxed">
                Choose your daily and hourly rental price, preferred campus pickup location, and vehicle notes.
              </p>
            </div>
            <div className="space-y-2">
              <span className="font-mono text-xs font-semibold text-[#29483B] block">
                02. Verified Campus Peers
              </span>
              <h3 className="font-display font-semibold text-[#202522] text-sm">
                Screened Student Bookings
              </h3>
              <p className="text-[#70756F] leading-relaxed">
                Every booking request includes ICFAI enrollment validation, Driving Licence upload, and admin review before handover.
              </p>
            </div>
            <div className="space-y-2">
              <span className="font-mono text-xs font-semibold text-[#29483B] block">
                03. Protected Handovers
              </span>
              <h3 className="font-display font-semibold text-[#202522] text-sm">
                Collateral &amp; Security Deposit
              </h3>
              <p className="text-[#70756F] leading-relaxed">
                Renters deposit a working laptop and refundable cash security deposit at handover, plus accept full responsibility for any traffic challans.
              </p>
            </div>
          </div>

          <div className="pt-5 border-t border-[#E5E4DE] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-display font-semibold text-[#202522] text-sm">
                Ready to list your bike on campus?
              </h4>
              <p className="text-xs text-[#70756F]">
                Submit your vehicle details in a few minutes for admin approval.
              </p>
            </div>
            <button
              onClick={() => onNavigate('onboard')}
              className="rp-btn rp-btn-primary"
            >
              <span>List Your Bike</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
