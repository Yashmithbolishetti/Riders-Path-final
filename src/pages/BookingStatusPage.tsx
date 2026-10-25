import React from 'react';
import { Booking } from '../types';
import {
  CheckCircle2,
  Calendar,
  MapPin,
  ShieldCheck,
  QrCode,
  ArrowRight,
  Info,
  Clock3,
  XCircle,
  Key,
  Printer,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface BookingStatusPageProps {
  booking: Booking;
  onGoToDashboard?: () => void;
  onViewDashboard?: () => void;
  onExploreMore?: () => void;
}

export const BookingStatusPage: React.FC<BookingStatusPageProps> = ({
  booking,
  onGoToDashboard,
  onViewDashboard,
  onExploreMore,
}) => {
  const handleDashboard = () => {
    if (typeof onViewDashboard === 'function') onViewDashboard();
    else if (typeof onGoToDashboard === 'function') onGoToDashboard();
  };

  const handleExplore = () => {
    if (typeof onExploreMore === 'function') onExploreMore();
  };

  const pickupFormatted = new Date(booking.pickupDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const returnFormatted = new Date(booking.returnDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const isPending = booking.bookingStatus === 'pending_verification';
  const isConfirmed = booking.bookingStatus === 'confirmed';
  const isActive = booking.bookingStatus === 'active_rental';
  const isCompleted = booking.bookingStatus === 'completed';
  const isRejected = booking.bookingStatus === 'rejected';
  const isCancelled = booking.bookingStatus === 'cancelled';

  const lifecycleSteps = [
    { key: 'submitted', label: 'Booking Submitted', done: true },
    {
      key: 'review',
      label: 'Under Review',
      done: isConfirmed || isActive || isCompleted,
      active: isPending,
      failed: isRejected,
    },
    {
      key: 'confirmed',
      label: 'Approved / Confirmed',
      done: isConfirmed || isActive || isCompleted,
      active: isConfirmed,
    },
    {
      key: 'active',
      label: 'Active Rental',
      done: isActive || isCompleted,
      active: isActive,
    },
    {
      key: 'completed',
      label: 'Completed & Settled',
      done: isCompleted,
      active: false,
    },
  ];

  const bookingSteps = [
    { num: 1, title: 'Rider & Schedule' },
    { num: 2, title: 'Documents & Eligibility' },
    { num: 3, title: 'Review & Terms' },
    { num: 4, title: 'Confirmation & Pass' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* 4-Step Flow Indicator — Step 4 Active */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs print:hidden">
        {bookingSteps.map((s) => (
          <div
            key={s.num}
            className={`p-2.5 sm:p-3 rounded-lg border flex items-center gap-2 ${
              s.num === 4
                ? 'bg-white border-[#29483B] text-[#202522] shadow-xs'
                : 'bg-[#ECF4F0] border-[#CBE2D6] text-[#24583C]'
            }`}
          >
            <div
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                s.num === 4 ? 'bg-[#29483B] text-white' : 'bg-[#347653] text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="font-medium truncate">{s.title}</span>
          </div>
        ))}
      </div>

      {/* Status Summary Banner for All 6 States */}
      {isPending && (
        <div className="p-6 rounded-xl bg-[#F7F1E6] border border-[#E8D6B9] text-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-[#E8D6B9] flex items-center justify-center text-[#9A6B25] mx-auto">
            <Clock3 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#9A6B25] font-semibold">
              Step 4 of 4 · Under Admin Review
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              Booking Submitted for Verification
            </h1>
            <p className="text-xs text-[#70756F] max-w-md mx-auto leading-relaxed">
              Your booking request and uploaded documents have been received. Once our campus team completes document verification, your ride pass will be activated for pickup at {booking.pickupHub}.
            </p>
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="p-6 rounded-xl bg-[#ECF4F0] border border-[#CBE2D6] text-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-[#CBE2D6] flex items-center justify-center text-[#347653] mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#347653] font-semibold">
              Approved &amp; Confirmed · Ready for Handover
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              Booking Confirmed
            </h1>
            <p className="text-xs text-[#70756F] max-w-md mx-auto leading-relaxed">
              Your verification is approved. Present this ride pass, your physical Driving Licence, ICFAI Student ID, and laptop collateral at {booking.pickupHub} at the scheduled pickup time.
            </p>
          </div>
        </div>
      )}

      {isActive && (
        <div className="p-6 rounded-xl bg-[#EBF0ED] border border-[#CBE2D6] text-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-[#CBE2D6] flex items-center justify-center text-[#29483B] mx-auto">
            <Key className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#29483B] font-semibold">
              Active Rental in Progress
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              Enjoy Your Ride Safely
            </h1>
            <p className="text-xs text-[#70756F] max-w-md mx-auto leading-relaxed">
              Vehicle handed over at {booking.pickupHub}. Please wear your ISI helmet at all times and return the bike by {returnFormatted} with matching fuel level.
            </p>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="p-6 rounded-xl bg-[#ECF4F0] border border-[#CBE2D6] text-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-[#CBE2D6] flex items-center justify-center text-[#347653] mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#347653] font-semibold">
              Rental Completed · Deposit Settled
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              Ride Completed Successfully
            </h1>
            <p className="text-xs text-[#70756F] max-w-md mx-auto leading-relaxed">
              Your post-ride return inspection is complete and your laptop collateral and refundable security deposit have been settled.
            </p>
          </div>
        </div>
      )}

      {(isRejected || isCancelled) && (
        <div className="p-6 rounded-xl bg-[#F9EDED] border border-[#E8C5C5] text-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-[#E8C5C5] flex items-center justify-center text-[#B44242] mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#B44242] font-semibold">
              {isRejected ? 'Booking Not Approved' : 'Booking Cancelled'}
            </span>
            <h1 className="font-display font-bold text-2xl text-[#202522]">
              {isRejected ? 'Verification or Schedule Declined' : 'Booking Cancelled'}
            </h1>
            <p className="text-xs text-[#8F3030] max-w-md mx-auto leading-relaxed">
              {booking.rejectionReason ||
                'This booking is no longer active. You may submit a new booking request with clear document photographs or alternative dates.'}
            </p>
          </div>
        </div>
      )}

      {/* Lifecycle Progress */}
      <div className="p-5 rp-card space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#70756F]">
            Verification &amp; Rental Lifecycle
          </h2>
          <span className="text-xs font-mono text-[#70756F]">
            Doc Status: <strong className="text-[#202522] uppercase">{booking.verificationStatus}</strong>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          {lifecycleSteps.map((s, idx) => (
            <div
              key={s.key}
              className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1.5 ${
                s.failed
                  ? 'bg-[#F9EDED] border-[#E8C5C5] text-[#8F3030]'
                  : s.done
                  ? 'bg-[#ECF4F0] border-[#CBE2D6] text-[#24583C]'
                  : s.active
                  ? 'bg-[#F7F1E6] border-[#E8D6B9] text-[#7D551B]'
                  : 'bg-[#F7F6F2] border-[#E5E4DE] text-[#70756F]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  s.failed
                    ? 'bg-[#B44242] text-white'
                    : s.done
                    ? 'bg-[#347653] text-white'
                    : s.active
                    ? 'bg-[#9A6B25] text-white'
                    : 'bg-[#E5E4DE] text-[#70756F]'
                }`}
              >
                {s.failed ? '×' : s.done ? '✓' : idx + 1}
              </div>
              <span className="text-[11px] font-medium leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Digital Ride Pass Card */}
      <div id="digital-ride-pass-card" className="rp-card overflow-hidden">
        {/* Pass Header */}
        <div className="p-5 bg-[#F7F6F2] border-b border-[#E5E4DE] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-base text-[#202522]">
                Riders Path
              </span>
              <span className="text-[#70756F]">·</span>
              <span className="text-xs font-medium text-[#29483B]">Campus Ride Pass</span>
            </div>
            <p className="text-[11px] text-[#70756F] font-mono mt-0.5">
              Booking Ref: {booking.id}
            </p>
          </div>

          <span
            className={`rp-status ${
              isConfirmed || isActive || isCompleted
                ? 'rp-status-success'
                : isRejected || isCancelled
                ? 'rp-status-error'
                : 'rp-status-warning'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="uppercase">{booking.bookingStatus.replace('_', ' ')}</span>
          </span>
        </div>

        {/* Pass Body */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-5 border-b border-[#E5E4DE]">
            <div>
              <span className="text-xs text-[#70756F] block">Assigned Vehicle</span>
              <h3 className="font-display font-bold text-lg text-[#202522] mt-0.5">
                {booking.bikeBrand} {booking.bikeModel}
              </h3>
              <p className="text-xs font-mono text-[#29483B] mt-0.5">
                Reg: {booking.bikeRegistration || 'Campus Fleet'}
              </p>
            </div>

            <div>
              <span className="text-xs text-[#70756F] block">Student Renter</span>
              <h3 className="font-display font-bold text-lg text-[#202522] mt-0.5">
                {booking.renterName}
              </h3>
              <p className="text-xs font-mono text-[#347653] mt-0.5">
                ICFAI ID: {booking.renterEnrollment}
              </p>
            </div>
          </div>

          {/* Schedule & Pickup Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
              <span className="text-[#70756F] flex items-center gap-1 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-[#29483B]" />
                <span>Pickup Time</span>
              </span>
              <span className="font-semibold text-[#202522] block tabular-nums">
                {pickupFormatted}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
              <span className="text-[#70756F] flex items-center gap-1 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-[#29483B]" />
                <span>Return Time</span>
              </span>
              <span className="font-semibold text-[#202522] block tabular-nums">
                {returnFormatted}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
              <span className="text-[#70756F] flex items-center gap-1 text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-[#29483B]" />
                <span>Campus Hub</span>
              </span>
              <span className="font-semibold text-[#202522] block truncate">
                {booking.pickupHub}
              </span>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#70756F]">
                Rental Rate ({booking.durationDays} {booking.durationDays === 1 ? 'Day' : 'Days'})
              </span>
              <span className="font-mono font-semibold text-[#202522] tabular-nums">
                ₹{booking.totalPrice}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#70756F]">Platform Service Fee (8%)</span>
              <span className="font-mono font-semibold text-[#202522] tabular-nums">
                ₹{booking.platformFee}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#70756F]">Refundable Cash Deposit</span>
              <span className="font-mono font-semibold text-[#347653] tabular-nums">
                ₹{booking.securityDeposit} (Refunded post-inspection)
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#E5E4DE] text-[#202522]">
              <span className="font-medium">Collateral Requirement</span>
              <span className="font-mono font-semibold text-[#29483B]">
                1 Working Laptop at Handover
              </span>
            </div>
          </div>

          {/* Handover & Return Inspection Records (Section 13) */}
          {(booking.pickupConditionRecord || booking.returnConditionRecord) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {booking.pickupConditionRecord && (
                <div className="p-4 rounded-lg bg-[#ECF4F0]/60 border border-[#CBE2D6] space-y-1.5">
                  <span className="font-semibold text-[#24583C] block">
                    ✓ Handover Inspection Logged
                  </span>
                  <div className="text-[#70756F] space-y-0.5 font-mono text-[11px] tabular-nums">
                    <div>
                      Odometer Start: {booking.pickupConditionRecord.odometerKm} km · Fuel:{' '}
                      {booking.pickupConditionRecord.fuelPercent}%
                    </div>
                    <div>
                      ISI Helmet: {booking.pickupConditionRecord.helmetIssued ? 'Issued' : 'No'} ·
                      Laptop Collateral:{' '}
                      {booking.pickupConditionRecord.laptopPhysicalDepositLogged
                        ? 'Received'
                        : 'Pending'}
                    </div>
                    {booking.pickupConditionRecord.notes && (
                      <div className="font-sans text-[#202522]">
                        Note: {booking.pickupConditionRecord.notes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {booking.returnConditionRecord && (
                <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5">
                  <span className="font-semibold text-[#202522] block">
                    ✓ Return &amp; Deposit Settlement
                  </span>
                  <div className="text-[#70756F] space-y-0.5 font-mono text-[11px] tabular-nums">
                    <div>
                      Odometer End: {booking.returnConditionRecord.odometerKm} km · Fuel:{' '}
                      {booking.returnConditionRecord.fuelPercent}%
                    </div>
                    <div>
                      Laptop Returned:{' '}
                      {booking.returnConditionRecord.laptopReturnedToStudent ? 'Yes' : 'Pending'}
                    </div>
                    {booking.depositDeductions && (
                      <div className="text-[#24583C] font-semibold">
                        Net Deposit Refund: ₹{booking.depositDeductions.netRefundAmount}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QR Pass Box */}
          <div className="p-4 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-white border border-[#CBE2D6] flex items-center justify-center text-[#29483B]">
                <QrCode className="w-6 h-6" />
              </div>
              <div className="text-xs">
                <span className="font-semibold text-[#202522] block">
                  Campus Handover Validation Pass
                </span>
                <span className="font-mono text-[11px] text-[#29483B]">
                  {booking.qrCodePass || `RP-PASS-${booking.id.slice(0, 8)}`}
                </span>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="text-[11px] text-[#70756F] block">Renter Contact</span>
              <span className="font-mono text-[#202522] font-semibold tabular-nums">
                {booking.renterPhone}
              </span>
            </div>
          </div>

          {/* Mandatory Physical Checklist */}
          <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2 text-xs">
            <strong className="text-[#202522] flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#29483B]" />
              <span>Mandatory Physical Items Required at Handover:</span>
            </strong>
            <ul className="space-y-1 text-[#70756F] text-xs">
              <li className="flex items-center gap-2">
                <span className="text-[#347653] font-bold">✓</span>
                <span>Original Government Driving Licence (Two-Wheeler)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#347653] font-bold">✓</span>
                <span>Original ICFAI University Student ID Card</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#29483B] font-bold">✓</span>
                <span>Functioning Laptop for Physical Security Deposit</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#347653] font-bold">✓</span>
                <span className="tabular-nums">
                  Total payable at handover: ₹
                  {booking.totalPrice + booking.platformFee + booking.securityDeposit}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F7F6F2] border-t border-[#E5E4DE] text-xs text-[#70756F] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>✓ ISI Helmet provided with vehicle</span>
          <span>✓ Fuel level matched on return</span>
          <span>✓ Odometer logged before departure</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 print:hidden">
        <button
          type="button"
          onClick={handleDashboard}
          className="rp-btn rp-btn-primary rp-btn-lg w-full sm:w-auto"
        >
          <span>View in Student Account</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rp-btn rp-btn-secondary rp-btn-lg w-full sm:w-auto"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save Pass</span>
        </button>
        <button
          type="button"
          onClick={handleExplore}
          className="rp-btn rp-btn-secondary rp-btn-lg w-full sm:w-auto"
        >
          <span>Explore More Bikes</span>
        </button>
      </div>
    </div>
  );
};
