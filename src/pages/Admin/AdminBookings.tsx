import React, { useState, useEffect } from 'react';
import { Booking, CommunicationLog } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Search,
  Mail,
  MessageSquare,
  Send,
  Key,
  RotateCcw,
  ExternalLink,
  History,
  X,
  CheckCircle2,
  XCircle,
  MapPin,
  RefreshCw,
  FileText,
  Laptop,
} from 'lucide-react';

export const AdminBookings: React.FC = () => {
  const { showToast } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Handover Modal State
  const [handoverBooking, setHandoverBooking] = useState<Booking | null>(null);
  const [handoverOdo, setHandoverOdo] = useState(12000);
  const [handoverFuel, setHandoverFuel] = useState(85);
  const [helmetIssued, setHelmetIssued] = useState(true);
  const [laptopDeposited, setLaptopDeposited] = useState(true);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [coordinatorName, setCoordinatorName] = useState('Admin Hub Coordinator');
  const [handoverLoading, setHandoverLoading] = useState(false);

  // Return Modal State
  const [returnBooking, setReturnBooking] = useState<Booking | null>(null);
  const [returnOdo, setReturnOdo] = useState(12050);
  const [returnFuel, setReturnFuel] = useState(80);
  const [hasDamage, setHasDamage] = useState(false);
  const [damageCost, setDamageCost] = useState(0);
  const [damageNotes, setDamageNotes] = useState('');
  const [hasChallan, setHasChallan] = useState(false);
  const [challanAmount, setChallanAmount] = useState(0);
  const [laptopReturned, setLaptopReturned] = useState(true);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);

  // Communication Modal State
  const [commBooking, setCommBooking] = useState<Booking | null>(null);
  const [commLogs, setCommLogs] = useState<CommunicationLog[]>([]);
  const [commMessage, setCommMessage] = useState('');
  const [commSending, setCommSending] = useState(false);
  const [commTab, setCommTab] = useState<'email' | 'whatsapp'>('whatsapp');
  const [lastActionResult, setLastActionResult] = useState<any>(null);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const data = await api.getBookings();
      setBookings(data);
    } catch (err) {
      console.error(err);
      showToast('Failed to load bookings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: any, notes?: string) => {
    try {
      const updates: Partial<Booking> = {
        bookingStatus: newStatus,
        adminReviewNotes: notes || `Status updated to ${newStatus} by admin`,
        ...(newStatus === 'confirmed' ? { verificationStatus: 'approved' } : {}),
        ...(newStatus === 'rejected' ? { verificationStatus: 'rejected' } : {}),
      };
      await api.updateBookingStatus(id, updates);
      showToast(`Booking marked as ${newStatus.replace('_', ' ')}`, 'success');
      fetchBookings();
      if (selectedBooking && selectedBooking.id === id) {
        setSelectedBooking((prev) => (prev ? { ...prev, ...updates } : null));
      }
    } catch (err: any) {
      showToast('Failed to update booking status', 'error');
    }
  };

  const openHandoverModal = (b: Booking) => {
    setHandoverBooking(b);
    setHandoverOdo(b.pickupConditionRecord?.odometerKm || 12000);
    setHandoverFuel(b.pickupConditionRecord?.fuelPercent || 85);
    setHelmetIssued(true);
    setLaptopDeposited(true);
    setHandoverNotes('Vehicle verified in good order and handed over at campus hub.');
    setCoordinatorName('Admin Hub Coordinator');
  };

  const handleConfirmHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverBooking) return;
    try {
      setHandoverLoading(true);
      await api.recordPickupInspection(handoverBooking.id, {
        odometerKm: Number(handoverOdo),
        fuelPercent: Number(handoverFuel),
        photos: [],
        notes: handoverNotes,
        helmetIssued,
        laptopPhysicalDepositLogged: laptopDeposited,
        inspectedBy: coordinatorName,
        coordinatorName,
      });

      showToast('Ride handover recorded! Rental is now active.', 'success');
      setHandoverBooking(null);
      fetchBookings();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete handover', 'error');
    } finally {
      setHandoverLoading(false);
    }
  };

  const openReturnModal = (b: Booking) => {
    setReturnBooking(b);
    const prevOdo = b.pickupConditionRecord?.odometerKm || 12000;
    setReturnOdo(prevOdo + 45);
    setReturnFuel(b.pickupConditionRecord?.fuelPercent || 80);
    setHasDamage(false);
    setDamageCost(0);
    setDamageNotes('');
    setHasChallan(false);
    setChallanAmount(0);
    setLaptopReturned(true);
    setReturnNotes('Vehicle returned safely. Physical laptop returned to student.');
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnBooking) return;
    try {
      setReturnLoading(true);
      await api.recordReturnInspection(returnBooking.id, {
        odometerKm: Number(returnOdo),
        fuelPercent: Number(returnFuel),
        photos: [],
        notes: returnNotes,
        newDamagesIdentified: hasDamage,
        damageNotes: hasDamage ? damageNotes : '',
        damageEstimatedCost: hasDamage ? Number(damageCost) : 0,
        fineOrChallanRecorded: hasChallan,
        challanAmount: hasChallan ? Number(challanAmount) : 0,
        challanDetails: hasChallan
          ? 'Traffic challan reported during rental duration.'
          : '',
        laptopReturnedToStudent: laptopReturned,
        inspectedBy: coordinatorName || 'Admin Hub Coordinator',
        coordinatorName: coordinatorName || 'Admin Hub Coordinator',
      });

      showToast('Vehicle return logged & deposit refund settled.', 'success');
      setReturnBooking(null);
      fetchBookings();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete return', 'error');
    } finally {
      setReturnLoading(false);
    }
  };

  const openCommModal = async (b: Booking) => {
    setCommBooking(b);
    setCommMessage('');
    setLastActionResult(null);
    try {
      const logs = await api.getBookingCommunications(b.id);
      setCommLogs(logs);
    } catch (err) {
      setCommLogs([]);
    }
  };

  const handleSendEmail = async () => {
    if (!commBooking) return;
    try {
      setCommSending(true);
      const res = await api.sendBookingEmail(
        commBooking.id,
        commMessage || undefined
      );
      setLastActionResult(res);
      if (res.log) {
        setCommLogs((prev) => [res.log, ...prev]);
      }
      showToast(
        res.configured
          ? 'Email dispatched to student!'
          : 'Email notification logged for administrative audit record.',
        res.configured ? 'success' : 'info'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to send email', 'error');
    } finally {
      setCommSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!commBooking) return;
    try {
      setCommSending(true);
      const res = await api.sendBookingWhatsApp(
        commBooking.id,
        commMessage || undefined
      );
      setLastActionResult(res);
      if (res.log) {
        setCommLogs((prev) => [res.log, ...prev]);
      }
      showToast(
        res.configured
          ? 'WhatsApp message dispatched!'
          : 'Direct WhatsApp dispatch link prepared.',
        res.configured ? 'success' : 'info'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to prepare WhatsApp message', 'error');
    } finally {
      setCommSending(false);
    }
  };

  const filteredBookings = (bookings || []).filter((b) => {
    if (!b) return false;
    if (statusFilter !== 'ALL' && b.bookingStatus !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (b.renterName || '').toLowerCase().includes(q) ||
        (b.renterEnrollment || '').toLowerCase().includes(q) ||
        (b.bikeBrand || '').toLowerCase().includes(q) ||
        (b.bikeModel || '').toLowerCase().includes(q) ||
        (b.bikeRegistration && b.bikeRegistration.toLowerCase().includes(q)) ||
        (b.pickupHub || '').toLowerCase().includes(q) ||
        (b.id || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const statusTabs = [
    { id: 'ALL', label: `All (${bookings.length})` },
    {
      id: 'pending_verification',
      label: `Pending Review (${
        bookings.filter((b) => b.bookingStatus === 'pending_verification').length
      })`,
    },
    {
      id: 'confirmed',
      label: `Confirmed (${
        bookings.filter((b) => b.bookingStatus === 'confirmed').length
      })`,
    },
    {
      id: 'active_rental',
      label: `Active Rentals (${
        bookings.filter((b) => b.bookingStatus === 'active_rental').length
      })`,
    },
    {
      id: 'completed',
      label: `Completed (${
        bookings.filter((b) => b.bookingStatus === 'completed').length
      })`,
    },
    {
      id: 'cancelled',
      label: `Cancelled (${
        bookings.filter((b) => b.bookingStatus === 'cancelled').length
      })`,
    },
    {
      id: 'rejected',
      label: `Rejected (${
        bookings.filter((b) => b.bookingStatus === 'rejected').length
      })`,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            Bookings & Handovers
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            Manage student reservations, document clearances, physical key handovers, return inspections, and student communications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#70756F] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking ID, student, bike..."
              aria-label="Search bookings"
              className="rp-input pl-9 py-2 text-xs w-full sm:w-64"
            />
          </div>
          <button
            onClick={fetchBookings}
            className="rp-btn rp-btn-secondary px-3.5 py-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
        {statusTabs.map((st) => (
          <button
            key={st.id}
            onClick={() => setStatusFilter(st.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
              statusFilter === st.id
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522] hover:bg-[#F7F6F2]'
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Bookings Table */}
      <div className="rp-table-container">
        <div className="overflow-x-auto">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Booking & Vehicle</th>
                <th>Student Renter</th>
                <th>Pickup Hub & Schedule</th>
                <th>Amount & Deposit</th>
                <th>Documents</th>
                <th>Booking Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    Loading campus booking records...
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    No bookings found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => {
                  const academicMeta = [b.renterAcademicYear, b.renterCourse]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr key={b.id}>
                      <td>
                        <div>
                          <span className="font-mono text-xs font-semibold text-[#29483B] block tabular-nums">
                            #{b.id}
                          </span>
                          <span className="font-semibold text-[#202522] block mt-0.5">
                            {b.bikeBrand} {b.bikeModel}
                          </span>
                          <span className="font-mono text-[11px] text-[#70756F] block">
                            {b.bikeRegistration || 'Campus Fleet'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div>
                          <span className="font-medium text-[#202522] block">
                            {b.renterName}
                          </span>
                          <span className="font-mono text-[11px] text-[#29483B] block font-semibold">
                            {b.renterEnrollment}
                          </span>
                          {academicMeta && (
                            <span className="text-[11px] text-[#70756F] block">
                              {academicMeta}
                            </span>
                          )}
                          <span className="text-[11px] text-[#70756F] font-mono">
                            {b.renterPhone}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="space-y-0.5">
                          <span className="font-medium text-[#202522] inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#29483B] shrink-0" />
                            <span>{b.pickupHub}</span>
                          </span>
                          <span className="text-[11px] text-[#70756F] block font-mono tabular-nums">
                            {new Date(b.pickupDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })}{' '}
                            →{' '}
                            {new Date(b.returnDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                          <span className="text-[11px] text-[#70756F] font-mono tabular-nums block">
                            {b.durationDays}d ({b.durationHours}h)
                          </span>
                        </div>
                      </td>

                      <td className="tabular-nums font-mono">
                        <div>
                          <span className="font-bold text-[#202522] block">
                            ₹{b.totalPrice + b.platformFee}
                          </span>
                          <span className="text-[11px] text-[#23533A] block">
                            ₹{b.securityDeposit} cash dep.
                          </span>
                          <span className="text-[10px] text-[#70756F] block">
                            + 1 Laptop deposit
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`rp-status text-[10px] ${
                            b.verificationStatus === 'approved'
                              ? 'rp-status-approved'
                              : b.verificationStatus === 'rejected'
                              ? 'rp-status-rejected'
                              : 'rp-status-pending'
                          }`}
                        >
                          {b.verificationStatus === 'approved'
                            ? 'Verified'
                            : b.verificationStatus === 'rejected'
                            ? 'Rejected'
                            : 'Review Req.'}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`rp-status text-[10px] uppercase ${
                            b.bookingStatus === 'confirmed' ||
                            b.bookingStatus === 'completed'
                              ? 'rp-status-approved'
                              : b.bookingStatus === 'active_rental' ||
                                b.bookingStatus === 'pending_verification'
                              ? 'rp-status-pending'
                              : 'rp-status-rejected'
                          }`}
                        >
                          {b.bookingStatus.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedBooking(b)}
                            className="rp-btn rp-btn-secondary px-2.5 py-1.5 text-xs"
                            title="Inspect Documents & Full Details"
                          >
                            Inspect
                          </button>

                          <button
                            onClick={() => openCommModal(b)}
                            className="p-1.5 rounded-lg bg-[#F7F6F2] hover:bg-[#EFEEE8] border border-[#E5E4DE] text-[#29483B] transition-colors"
                            title="Student Communication (Email / WhatsApp)"
                            aria-label={`Contact student ${b.renterName}`}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {b.bookingStatus === 'pending_verification' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                                className="rp-btn rp-btn-primary px-2.5 py-1.5 text-xs"
                                title="Approve Documents & Confirm Booking"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(b.id, 'rejected')}
                                className="rp-btn rp-btn-danger px-2.5 py-1.5 text-xs"
                                title="Reject Booking"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {b.bookingStatus === 'confirmed' && (
                            <button
                              onClick={() => openHandoverModal(b)}
                              className="rp-btn rp-btn-primary px-2.5 py-1.5 text-xs"
                              title="Record Pre-Ride Inspection & Handover Keys"
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span>Handover</span>
                            </button>
                          )}

                          {b.bookingStatus === 'active_rental' && (
                            <button
                              onClick={() => openReturnModal(b)}
                              className="rp-btn rp-btn-primary px-2.5 py-1.5 text-xs"
                              title="Record Return Inspection & Settle Deposit"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Return</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking & Document Clearance Inspection Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-7 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <div>
                <span className="text-[11px] font-mono uppercase text-[#29483B] font-semibold">
                  Booking #{selectedBooking.id} · Clearance & Handover File
                </span>
                <h3 className="font-display font-bold text-xl text-[#202522]">
                  {selectedBooking.bikeBrand} {selectedBooking.bikeModel} (
                  {selectedBooking.bikeRegistration || 'Campus Fleet'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                aria-label="Close booking inspection modal"
                className="p-1.5 rounded-lg text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Renter & Schedule Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5">
                <span className="text-[#70756F] block text-[10px] uppercase font-mono">
                  Student Renter Profile
                </span>
                <span className="font-semibold text-[#202522] block text-sm">
                  {selectedBooking.renterName}
                </span>
                <span className="text-[#29483B] font-mono text-xs block font-semibold">
                  ICFAI ID: {selectedBooking.renterEnrollment}
                </span>
                {(selectedBooking.renterAcademicYear ||
                  selectedBooking.renterCourse) && (
                  <span className="text-[#70756F] text-xs block">
                    {[
                      selectedBooking.renterAcademicYear,
                      selectedBooking.renterCourse,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                <span className="text-[#70756F] font-mono text-xs block">
                  {selectedBooking.renterPhone}
                </span>
                <span className="text-[#70756F] text-xs block truncate">
                  {selectedBooking.renterEmail}
                </span>
              </div>

              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1.5">
                <span className="text-[#70756F] block text-[10px] uppercase font-mono">
                  Pickup Hub & Schedule
                </span>
                <span className="font-semibold text-[#202522] block text-sm">
                  {selectedBooking.pickupHub}
                </span>
                <span className="text-[#70756F] text-xs block font-mono tabular-nums">
                  Pickup: {new Date(selectedBooking.pickupDate).toLocaleString('en-IN')}
                </span>
                <span className="text-[#70756F] text-xs block font-mono tabular-nums">
                  Return: {new Date(selectedBooking.returnDate).toLocaleString('en-IN')}
                </span>
                <span className="text-[#29483B] font-mono text-xs font-semibold block tabular-nums">
                  Duration: {selectedBooking.durationDays} Days (
                  {selectedBooking.durationHours} Hours)
                </span>
              </div>
            </div>

            {/* Uploaded Verification Documents */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-[#202522] block">
                Submitted Verification Documents
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-[#70756F] font-medium block">
                    Driving Licence
                  </span>
                  {selectedBooking.drivingLicenseDocument ? (
                    <div className="h-36 rounded-lg overflow-hidden bg-[#F7F6F2] border border-[#E5E4DE]">
                      <img
                        src={selectedBooking.drivingLicenseDocument}
                        alt="Driving Licence"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="h-36 rounded-lg bg-[#F7F6F2] border border-dashed border-[#D4D2C8] flex flex-col items-center justify-center text-xs text-[#70756F] p-4 text-center">
                      <FileText className="w-5 h-5 mb-1 text-[#70756F]" />
                      <span>Verified at hub / No image attached</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-[#70756F] font-medium block">
                    Aadhaar / Identity Card
                  </span>
                  {selectedBooking.aadharDocument ? (
                    <div className="h-36 rounded-lg overflow-hidden bg-[#F7F6F2] border border-[#E5E4DE]">
                      <img
                        src={selectedBooking.aadharDocument}
                        alt="Aadhaar Document"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="h-36 rounded-lg bg-[#F7F6F2] border border-dashed border-[#D4D2C8] flex flex-col items-center justify-center text-xs text-[#70756F] p-4 text-center">
                      <FileText className="w-5 h-5 mb-1 text-[#70756F]" />
                      <span>Verified at hub / No image attached</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pre-ride / Post-ride Inspection Records if logged */}
            {(selectedBooking.pickupConditionRecord ||
              selectedBooking.returnConditionRecord) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {selectedBooking.pickupConditionRecord && (
                  <div className="p-3.5 rounded-lg bg-[#EAF3EE]/60 border border-[#347653]/25 space-y-1">
                    <span className="font-mono text-[10px] uppercase font-semibold text-[#23533A] block">
                      Pickup Handover Log
                    </span>
                    <p className="text-[#202522] font-mono tabular-nums">
                      Odometer: {selectedBooking.pickupConditionRecord.odometerKm} km ·
                      Fuel: {selectedBooking.pickupConditionRecord.fuelPercent}%
                    </p>
                    <p className="text-[#70756F]">
                      Helmet Issued:{' '}
                      {selectedBooking.pickupConditionRecord.helmetIssued
                        ? 'Yes'
                        : 'No'}{' '}
                      · Laptop Vaulted:{' '}
                      {selectedBooking.pickupConditionRecord
                        .laptopPhysicalDepositLogged
                        ? 'Yes'
                        : 'No'}
                    </p>
                    {selectedBooking.pickupConditionRecord.notes && (
                      <p className="text-[#70756F] text-[11px]">
                        {selectedBooking.pickupConditionRecord.notes}
                      </p>
                    )}
                  </div>
                )}

                {selectedBooking.returnConditionRecord && (
                  <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
                    <span className="font-mono text-[10px] uppercase font-semibold text-[#202522] block">
                      Return Inspection Log
                    </span>
                    <p className="text-[#202522] font-mono tabular-nums">
                      Odometer: {selectedBooking.returnConditionRecord.odometerKm} km ·
                      Fuel: {selectedBooking.returnConditionRecord.fuelPercent}%
                    </p>
                    <p className="text-[#70756F]">
                      Laptop Returned:{' '}
                      {selectedBooking.returnConditionRecord.laptopReturnedToStudent
                        ? 'Yes'
                        : 'No'}{' '}
                      · Damages:{' '}
                      {selectedBooking.returnConditionRecord.newDamagesIdentified
                        ? `₹${selectedBooking.returnConditionRecord.damageEstimatedCost}`
                        : 'None'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Terms & Financials Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#347653]" />
                  <div>
                    <span className="text-[#202522] font-medium block">
                      Terms & Conditions
                    </span>
                    <span className="text-[11px] text-[#70756F] font-mono">
                      {selectedBooking.termsVersion || 'v1.2-2026-AUG'}
                    </span>
                  </div>
                </div>
                <span className="rp-status rp-status-approved text-[10px]">
                  Accepted
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] flex items-center justify-between">
                <div>
                  <span className="text-[#70756F] block text-[11px]">
                    Rental + Platform Fee
                  </span>
                  <span className="font-mono font-bold text-[#202522] tabular-nums">
                    ₹{selectedBooking.totalPrice + selectedBooking.platformFee}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#70756F] block text-[11px]">
                    Security Collateral
                  </span>
                  <span className="font-mono font-semibold text-[#23533A] tabular-nums">
                    ₹{selectedBooking.securityDeposit} + Laptop
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E5E4DE]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBooking;
                    setSelectedBooking(null);
                    openCommModal(b);
                  }}
                  className="rp-btn rp-btn-secondary px-3 py-2 text-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#29483B]" />
                  <span>Contact Student</span>
                </button>

                {(selectedBooking.bookingStatus === 'pending_verification' ||
                  selectedBooking.bookingStatus === 'confirmed') && (
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateStatus(
                        selectedBooking.id,
                        'cancelled',
                        'Booking cancelled by administrator'
                      )
                    }
                    className="rp-btn rp-btn-secondary px-3 py-2 text-xs text-[#8C2D2D]"
                  >
                    Cancel Booking
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedBooking.bookingStatus === 'pending_verification' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(selectedBooking.id, 'rejected')}
                      className="rp-btn rp-btn-danger px-3.5 py-2 text-xs"
                    >
                      Reject Request
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedBooking.id, 'confirmed')
                      }
                      className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                    >
                      Approve & Confirm
                    </button>
                  </>
                )}

                {selectedBooking.bookingStatus === 'confirmed' && (
                  <button
                    onClick={() => {
                      const b = selectedBooking;
                      setSelectedBooking(null);
                      openHandoverModal(b);
                    }}
                    className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Open Handover Checklist</span>
                  </button>
                )}

                {selectedBooking.bookingStatus === 'active_rental' && (
                  <button
                    onClick={() => {
                      const b = selectedBooking;
                      setSelectedBooking(null);
                      openReturnModal(b);
                    }}
                    className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Open Return Checklist</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Handover Modal */}
      {handoverBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base text-[#202522]">
                    Vehicle Handover & Pre-Ride Inspection
                  </h3>
                  <p className="text-xs text-[#70756F]">
                    Booking #{handoverBooking.id} · {handoverBooking.bikeBrand}{' '}
                    {handoverBooking.bikeModel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHandoverBooking(null)}
                className="text-[#70756F] hover:text-[#202522]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmHandover} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
                <p className="text-[#202522] font-semibold">
                  {handoverBooking.renterName} ({handoverBooking.renterEnrollment})
                </p>
                <p className="text-[#70756F]">Hub: {handoverBooking.pickupHub}</p>
                <p className="text-[#29483B] font-mono font-medium tabular-nums">
                  Required Security: ₹{handoverBooking.securityDeposit} Cash + 1 Working Laptop
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rp-label">Odometer Start (km)</label>
                  <input
                    type="number"
                    required
                    value={handoverOdo}
                    onChange={(e) => setHandoverOdo(Number(e.target.value))}
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="rp-label">Fuel Level (%)</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    required
                    value={handoverFuel}
                    onChange={(e) => setHandoverFuel(Number(e.target.value))}
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-[#E5E4DE]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={helmetIssued}
                    onChange={(e) => setHelmetIssued(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#29483B]"
                  />
                  <span className="text-[#202522]">
                    ISI Helmet issued to student renter
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={laptopDeposited}
                    onChange={(e) => setLaptopDeposited(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#29483B]"
                  />
                  <span className="text-[#202522]">
                    Physical working laptop received & logged in hub custody
                  </span>
                </label>
              </div>

              <div>
                <label className="rp-label">Hub Coordinator Name</label>
                <input
                  type="text"
                  value={coordinatorName}
                  onChange={(e) => setCoordinatorName(e.target.value)}
                  className="rp-input text-xs"
                />
              </div>

              <div>
                <label className="rp-label">Pre-Ride Condition Notes</label>
                <textarea
                  rows={2}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="rp-textarea text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#E5E4DE]">
                <button
                  type="button"
                  onClick={() => setHandoverBooking(null)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={handoverLoading}
                  className="rp-btn rp-btn-primary px-5 py-2 text-xs"
                >
                  {handoverLoading
                    ? 'Activating...'
                    : 'Activate Rental & Release Keys'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return & Deposit Settlement Modal */}
      {returnBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#EAF3EE] border border-[#347653]/25 flex items-center justify-center text-[#23533A]">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base text-[#202522]">
                    Vehicle Return & Deposit Settlement
                  </h3>
                  <p className="text-xs text-[#70756F]">
                    Booking #{returnBooking.id} · {returnBooking.bikeBrand}{' '}
                    {returnBooking.bikeModel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnBooking(null)}
                className="text-[#70756F] hover:text-[#202522]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rp-label">Return Odometer (km)</label>
                  <input
                    type="number"
                    required
                    value={returnOdo}
                    onChange={(e) => setReturnOdo(Number(e.target.value))}
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="rp-label">Fuel Level (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={returnFuel}
                    onChange={(e) => setReturnFuel(Number(e.target.value))}
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-[#E5E4DE]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={laptopReturned}
                    onChange={(e) => setLaptopReturned(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#29483B]"
                  />
                  <span className="text-[#202522]">
                    Physical laptop returned safely to student renter
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDamage}
                    onChange={(e) => setHasDamage(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#B44242]"
                  />
                  <span className="text-[#202522]">
                    New vehicle damages identified upon return
                  </span>
                </label>

                {hasDamage && (
                  <div className="pl-6 space-y-2 animate-in fade-in">
                    <div>
                      <label className="rp-label">
                        Estimated Damage Deductible (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={returnBooking.securityDeposit}
                        value={damageCost}
                        onChange={(e) => setDamageCost(Number(e.target.value))}
                        className="rp-input text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="rp-label">Damage Description</label>
                      <input
                        type="text"
                        value={damageNotes}
                        onChange={(e) => setDamageNotes(e.target.value)}
                        placeholder="e.g. Scratched right rear panel"
                        className="rp-input text-xs"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasChallan}
                    onChange={(e) => setHasChallan(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#B44242]"
                  />
                  <span className="text-[#202522]">
                    Traffic fine / police challan recorded
                  </span>
                </label>

                {hasChallan && (
                  <div className="pl-6 space-y-2 animate-in fade-in">
                    <label className="rp-label">Challan Penalty Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={challanAmount}
                      onChange={(e) => setChallanAmount(Number(e.target.value))}
                      className="rp-input text-xs font-mono tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Settlement Summary */}
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] flex items-center justify-between">
                <div>
                  <span className="text-[#70756F] block text-[11px]">
                    Original Cash Deposit
                  </span>
                  <span className="font-mono font-bold text-[#202522] tabular-nums">
                    ₹{returnBooking.securityDeposit}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#70756F] block text-[11px]">
                    Net Refund Authorized
                  </span>
                  <span className="font-mono font-bold text-[#23533A] text-sm tabular-nums">
                    ₹
                    {Math.max(
                      0,
                      returnBooking.securityDeposit -
                        (hasDamage ? damageCost : 0) -
                        (hasChallan ? challanAmount : 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#E5E4DE]">
                <button
                  type="button"
                  onClick={() => setReturnBooking(null)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnLoading}
                  className="rp-btn rp-btn-primary px-5 py-2 text-xs"
                >
                  {returnLoading
                    ? 'Settling...'
                    : 'Complete Return & Settle Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Communication & Audit Modal */}
      {commBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base text-[#202522]">
                    Student Communication & Audit Log
                  </h3>
                  <p className="text-xs text-[#70756F]">
                    Booking #{commBooking.id} · {commBooking.renterName} (
                    {commBooking.renterEnrollment})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCommBooking(null)}
                className="text-[#70756F] hover:text-[#202522]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE]">
                <span className="text-[#70756F] text-[10px] block uppercase font-mono">
                  Renter Email
                </span>
                <span className="font-mono text-[#202522] break-all">
                  {commBooking.renterEmail}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE]">
                <span className="text-[#70756F] text-[10px] block uppercase font-mono">
                  Renter Phone / WhatsApp
                </span>
                <span className="font-mono text-[#202522]">
                  {commBooking.renterPhone}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#202522]">
                  Compose Notification Message (Optional)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCommTab('whatsapp')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      commTab === 'whatsapp'
                        ? 'bg-[#29483B] text-white'
                        : 'bg-[#F7F6F2] text-[#70756F] border border-[#E5E4DE]'
                    }`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommTab('email')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      commTab === 'email'
                        ? 'bg-[#29483B] text-white'
                        : 'bg-[#F7F6F2] text-[#70756F] border border-[#E5E4DE]'
                    }`}
                  >
                    Email
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={commMessage}
                onChange={(e) => setCommMessage(e.target.value)}
                placeholder="Enter custom notification message or leave blank to use standard booking update template..."
                className="rp-textarea text-xs"
              />

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#70756F]">
                  {commTab === 'whatsapp'
                    ? 'Generates a direct wa.me dispatch link & logs to audit history.'
                    : 'Sends via configured email provider or records in audit log.'}
                </span>

                {commTab === 'whatsapp' ? (
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={commSending}
                    className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{commSending ? 'Preparing...' : 'Prepare WhatsApp'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={commSending}
                    className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{commSending ? 'Dispatching...' : 'Send Email'}</span>
                  </button>
                )}
              </div>

              {lastActionResult && (
                <div
                  className={`p-3.5 rounded-lg text-xs space-y-1.5 border ${
                    lastActionResult.configured
                      ? 'bg-[#EAF3EE] border-[#347653]/25 text-[#23533A]'
                      : 'bg-[#F7F6F2] border-[#E5E4DE] text-[#202522]'
                  }`}
                >
                  <p className="font-medium">{lastActionResult.message}</p>
                  {lastActionResult.waLink && (
                    <a
                      href={lastActionResult.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#29483B] underline font-mono text-xs font-semibold"
                    >
                      <span>Open WhatsApp Web Dispatch</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Recorded Communication Audit Log */}
            <div className="space-y-3 pt-3 border-t border-[#E5E4DE]">
              <h4 className="text-xs font-semibold text-[#202522] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#70756F]" />
                <span>Communication History ({commLogs.length})</span>
              </h4>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {commLogs.length === 0 ? (
                  <p className="text-[#70756F] text-xs py-3 text-center">
                    No communications logged for this booking yet.
                  </p>
                ) : (
                  commLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#202522] uppercase text-[10px] font-mono flex items-center gap-1.5">
                          {log.channel === 'whatsapp' ? (
                            <MessageSquare className="w-3 h-3 text-[#347653]" />
                          ) : (
                            <Mail className="w-3 h-3 text-[#29483B]" />
                          )}
                          {log.channel} → {log.recipient}
                        </span>
                        <span
                          className={`rp-status text-[10px] ${
                            log.status === 'sent'
                              ? 'rp-status-approved'
                              : 'rp-status-neutral'
                          }`}
                        >
                          {log.status === 'not_configured'
                            ? 'Logged (Manual)'
                            : log.status}
                        </span>
                      </div>
                      <p className="text-[#70756F] text-[11px] whitespace-pre-wrap">
                        {log.message}
                      </p>
                      <span className="text-[10px] text-[#70756F] font-mono block tabular-nums">
                        {new Date(log.timestamp).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
