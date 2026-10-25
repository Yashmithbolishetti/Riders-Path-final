import React, { useState, useEffect } from 'react';
import { DashboardMetrics, AdminAction, Bike, Booking } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { VehicleImage } from '../../components/VehicleImage';
import {
  Bike as BikeIcon,
  Ticket,
  Users,
  ShieldCheck,
  FileCheck,
  ArrowRight,
  Wrench,
  CheckCircle2,
  Clock,
  Key,
  RotateCcw,
  RefreshCw,
  MapPin,
  AlertTriangle,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const { showToast } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [m, a, allBikes, allBookings] = await Promise.all([
        api.getMetrics(),
        api.getAdminActions(),
        api.getAllBikesAdmin().catch(() => []),
        api.getBookings().catch(() => []),
      ]);
      setMetrics(m);
      setActions(a);
      setBikes(allBikes);
      setBookings(allBookings);
    } catch (err) {
      console.error('Failed to load operational overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Derive accurate real-time counts from loaded records with fallback to metrics
  const totalBikes = bikes.length || metrics?.totalBikes || 0;
  const availableBikes =
    bikes.filter((b) => b.active && b.approvedByAdmin && b.availabilityStatus === 'AVAILABLE')
      .length ??
    metrics?.availableBikes ??
    0;
  const reservedBikes =
    bikes.filter((b) => b.availabilityStatus === 'RESERVED').length ??
    metrics?.reservedBikes ??
    0;
  const maintenanceOrUnavailableBikes = bikes.filter(
    (b) =>
      b.approvedByAdmin &&
      (b.availabilityStatus === 'MAINTENANCE' ||
        b.availabilityStatus === 'UNAVAILABLE' ||
        !b.active)
  );
  const pendingOwnerSubmissions = bikes.filter(
    (b) => !b.approvedByAdmin && b.approvalStatus !== 'REJECTED'
  );

  const pendingBookingsList = bookings.filter(
    (b) => b.bookingStatus === 'pending_verification'
  );
  const confirmedAwaitingHandover = bookings.filter(
    (b) => b.bookingStatus === 'confirmed'
  );
  const activeRentalsList = bookings.filter(
    (b) => b.bookingStatus === 'active_rental'
  );
  const completedBookingsCount = bookings.filter(
    (b) => b.bookingStatus === 'completed'
  ).length;

  const actionableBookings = [
    ...pendingBookingsList,
    ...confirmedAwaitingHandover,
    ...activeRentalsList,
  ].slice(0, 6);

  const handleQuickApproveBooking = async (bookingId: string) => {
    try {
      setBusyId(bookingId);
      await api.updateBookingStatus(bookingId, {
        bookingStatus: 'confirmed',
        verificationStatus: 'approved',
        adminReviewNotes: 'Approved from Admin Overview queue',
      });
      showToast('Booking approved and ready for campus hub handover.', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve booking', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickHandover = async (bookingId: string) => {
    try {
      setBusyId(bookingId);
      await api.adminFastHandover(bookingId, {
        notes: 'Handed over via Admin Overview fast action.',
        coordinatorName: 'Admin Hub Coordinator',
      });
      showToast('Vehicle handover recorded. Rental is now active.', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to record handover', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickReturn = async (bookingId: string) => {
    try {
      setBusyId(bookingId);
      await api.adminFastReturn(bookingId, {
        notes: 'Returned via Admin Overview fast action. Deposit refund authorized.',
        coordinatorName: 'Admin Hub Coordinator',
      });
      showToast('Vehicle return recorded and deposit settled.', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to record return', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickApproveOwnerBike = async (bikeId: string) => {
    try {
      setBusyId(bikeId);
      await api.approveOwnerBike(bikeId);
      showToast('Student host bike approved and published to live catalog.', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve bike', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickRestoreBike = async (bikeId: string) => {
    try {
      setBusyId(bikeId);
      await api.updateBike(bikeId, { availabilityStatus: 'AVAILABLE', active: true });
      showToast('Vehicle marked as Available in campus fleet.', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update vehicle status', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-white border border-[#E5E4DE] p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="h-3 w-28 bg-[#EFEEE8] rounded" />
              <div className="h-7 w-16 bg-[#EFEEE8] rounded" />
              <div className="h-2.5 w-36 bg-[#EFEEE8] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Page Title & Operational Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            Marketplace Operations Overview
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            Live fleet status, student booking queues, document clearances, and campus handover operations.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            className="rp-btn rp-btn-secondary px-3.5 py-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={() => onNavigateTab('bikes')}
            className="rp-btn rp-btn-primary px-4 py-2 text-xs"
          >
            <BikeIcon className="w-3.5 h-3.5" />
            <span>Manage Fleet</span>
          </button>
        </div>
      </div>

      {/* Primary Operational Metric Grid (8 Real Database Counters) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Available Bikes */}
        <button
          type="button"
          onClick={() => onNavigateTab('bikes')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Available Bikes</span>
            <span className="rp-status rp-status-approved text-[10px]">Ready</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {availableBikes}
            </span>
            <span className="text-xs text-[#70756F] font-mono tabular-nums">
              / {totalBikes} total fleet
            </span>
          </div>
          <div className="text-[11px] text-[#29483B] font-medium flex items-center gap-1">
            <span>View fleet inventory</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 2. Active Rentals & Reserved */}
        <button
          type="button"
          onClick={() => onNavigateTab('bookings')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Active Rentals</span>
            <Ticket className="w-4 h-4 text-[#29483B]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {activeRentalsList.length}
            </span>
            <span className="text-xs text-[#7A5318] font-mono tabular-nums">
              · {confirmedAwaitingHandover.length} awaiting pickup
            </span>
          </div>
          <div className="text-[11px] text-[#70756F] flex items-center justify-between">
            <span>{reservedBikes} bikes currently reserved</span>
            <ArrowRight className="w-3 h-3 text-[#29483B] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 3. Pending Bookings */}
        <button
          type="button"
          onClick={() => onNavigateTab('bookings')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Pending Bookings</span>
            <span
              className={`rp-status text-[10px] ${
                pendingBookingsList.length > 0
                  ? 'rp-status-pending'
                  : 'rp-status-neutral'
              }`}
            >
              {pendingBookingsList.length > 0 ? 'Needs Review' : 'Clear'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {pendingBookingsList.length}
            </span>
            <span className="text-xs text-[#70756F] font-mono tabular-nums">
              of {bookings.length} bookings
            </span>
          </div>
          <div className="text-[11px] text-[#29483B] font-medium flex items-center gap-1">
            <span>Review booking requests</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 4. Pending Owner Approvals */}
        <button
          type="button"
          onClick={() => onNavigateTab('approvals')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Owner Submissions</span>
            <span
              className={`rp-status text-[10px] ${
                pendingOwnerSubmissions.length > 0
                  ? 'rp-status-pending'
                  : 'rp-status-neutral'
              }`}
            >
              {pendingOwnerSubmissions.length > 0 ? 'Awaiting Approval' : 'Up to Date'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {pendingOwnerSubmissions.length}
            </span>
            <span className="text-xs text-[#70756F] font-mono">student host listings</span>
          </div>
          <div className="text-[11px] text-[#29483B] font-medium flex items-center gap-1">
            <span>Inspect owner submissions</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 5. Document Verifications */}
        <button
          type="button"
          onClick={() => onNavigateTab('verifications')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Document Queue</span>
            <ShieldCheck className="w-4 h-4 text-[#29483B]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {metrics?.pendingVerifications || 0}
            </span>
            <span className="text-xs text-[#70756F] font-mono">manual reviews</span>
          </div>
          <div className="text-[11px] text-[#70756F] flex items-center justify-between">
            <span>DL & Aadhaar optical checks</span>
            <ArrowRight className="w-3 h-3 text-[#29483B] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 6. Maintenance & Unavailable */}
        <button
          type="button"
          onClick={() => onNavigateTab('bikes')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">
              Maintenance / Offline
            </span>
            <Wrench className="w-4 h-4 text-[#9A6B25]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {maintenanceOrUnavailableBikes.length}
            </span>
            <span className="text-xs text-[#70756F] font-mono">bikes offline</span>
          </div>
          <div className="text-[11px] text-[#70756F] flex items-center justify-between">
            <span>Paused or in service check</span>
            <ArrowRight className="w-3 h-3 text-[#29483B] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 7. Completed Rides & Gross Volume */}
        <button
          type="button"
          onClick={() => onNavigateTab('bookings')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">Gross Rental Volume</span>
            <span className="text-[11px] font-mono text-[#23533A] font-semibold tabular-nums">
              {completedBookingsCount} completed
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#29483B] tabular-nums">
              ₹{(metrics?.totalRevenue || 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="text-[11px] text-[#70756F] flex items-center justify-between">
            <span>Active & completed bookings</span>
            <ArrowRight className="w-3 h-3 text-[#29483B] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 8. Registered Campus Students */}
        <button
          type="button"
          onClick={() => onNavigateTab('users')}
          className="p-5 rounded-xl bg-white border border-[#E5E4DE] hover:border-[#29483B] transition-colors text-left space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#70756F]">ICFAI Student Directory</span>
            <Users className="w-4 h-4 text-[#29483B]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
              {metrics?.totalRegisteredUsers || 0}
            </span>
            <span className="text-xs text-[#23533A] font-mono">verified IDs</span>
          </div>
          <div className="text-[11px] text-[#70756F] flex items-center justify-between">
            <span>Renters & student hosts</span>
            <ArrowRight className="w-3 h-3 text-[#29483B] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>

      {/* Actionable Operational Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Bookings & Handovers Requiring Attention */}
        <div className="lg:col-span-2 bg-white border border-[#E5E4DE] rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E5E4DE] flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold text-base text-[#202522]">
                Bookings & Handovers Queue
              </h2>
              <p className="text-xs text-[#70756F]">
                Reservations awaiting verification, physical key handover, or return inspection.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('bookings')}
              className="rp-btn rp-btn-secondary px-3 py-1.5 text-xs"
            >
              <span>All Bookings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {actionableBookings.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-[#347653] mx-auto" />
              <p className="text-sm font-medium text-[#202522]">
                All booking queues are clear
              </p>
              <p className="text-xs text-[#70756F]">
                No pending verifications, handovers, or active returns require immediate action.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E4DE]">
              {actionableBookings.map((b) => (
                <div
                  key={b.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F7F6F2]/60 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-[#29483B] tabular-nums">
                        #{b.id}
                      </span>
                      <span className="text-xs font-semibold text-[#202522]">
                        {b.bikeBrand} {b.bikeModel}
                      </span>
                      <span
                        className={`rp-status text-[10px] ${
                          b.bookingStatus === 'confirmed'
                            ? 'rp-status-approved'
                            : b.bookingStatus === 'active_rental'
                            ? 'rp-status-pending'
                            : 'rp-status-pending'
                        }`}
                      >
                        {b.bookingStatus === 'pending_verification'
                          ? 'Needs Verification'
                          : b.bookingStatus === 'confirmed'
                          ? 'Ready for Handover'
                          : 'Active Rental'}
                      </span>
                    </div>
                    <div className="text-xs text-[#70756F] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[#202522]">{b.renterName}</span>
                      <span>·</span>
                      <span className="font-mono">{b.renterEnrollment}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#29483B]" />
                        {b.pickupHub}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#70756F] font-mono tabular-nums">
                      {new Date(b.pickupDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      →{' '}
                      {new Date(b.returnDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      · ₹{b.totalPrice + b.platformFee} (+₹{b.securityDeposit} dep.)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {b.bookingStatus === 'pending_verification' && (
                      <button
                        onClick={() => handleQuickApproveBooking(b.id)}
                        disabled={busyId === b.id}
                        className="rp-btn rp-btn-primary px-3 py-1.5 text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{busyId === b.id ? 'Approving...' : 'Approve'}</span>
                      </button>
                    )}

                    {b.bookingStatus === 'confirmed' && (
                      <button
                        onClick={() => handleQuickHandover(b.id)}
                        disabled={busyId === b.id}
                        className="rp-btn rp-btn-primary px-3 py-1.5 text-xs"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>{busyId === b.id ? 'Recording...' : 'Mark Handed Over'}</span>
                      </button>
                    )}

                    {b.bookingStatus === 'active_rental' && (
                      <button
                        onClick={() => handleQuickReturn(b.id)}
                        disabled={busyId === b.id}
                        className="rp-btn rp-btn-primary px-3 py-1.5 text-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{busyId === b.id ? 'Settling...' : 'Mark Returned'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => onNavigateTab('bookings')}
                      className="rp-btn rp-btn-secondary px-3 py-1.5 text-xs"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Pending Owner Submissions & Fleet Maintenance Watchlist */}
        <div className="space-y-6">
          {/* Student Host Submissions */}
          <div className="bg-white border border-[#E5E4DE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E4DE] flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-base text-[#202522]">
                  Owner Submissions
                </h2>
                <p className="text-xs text-[#70756F]">
                  Student bikes awaiting review
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('approvals')}
                className="text-xs font-medium text-[#29483B] hover:underline flex items-center gap-1"
              >
                <span>Review All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {pendingOwnerSubmissions.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <FileCheck className="w-6 h-6 text-[#347653] mx-auto" />
                <p className="text-xs font-medium text-[#202522]">
                  No pending student host listings
                </p>
                <p className="text-[11px] text-[#70756F]">
                  New submissions from the List Your Bike page will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E4DE]">
                {pendingOwnerSubmissions.slice(0, 4).map((bike) => (
                  <div key={bike.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <VehicleImage
                        src={bike.images?.[0]}
                        alt={bike.model}
                        brand={bike.brand}
                        model={bike.model}
                        bikeType={bike.bikeType}
                        className="w-14 h-10 rounded-lg object-cover border border-[#E5E4DE] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-[#202522] block truncate">
                          {bike.brand} {bike.model}
                        </span>
                        <span className="text-[11px] text-[#70756F] block truncate">
                          Host: {bike.ownerName} ({bike.ownerEnrollment})
                        </span>
                        <span className="text-[11px] font-mono text-[#29483B] tabular-nums">
                          ₹{bike.pricePerDay}/day · {bike.pickupHub}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onNavigateTab('approvals')}
                        className="rp-btn rp-btn-secondary px-2.5 py-1 text-xs"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => handleQuickApproveOwnerBike(bike.id)}
                        disabled={busyId === bike.id}
                        className="rp-btn rp-btn-primary px-3 py-1 text-xs"
                      >
                        {busyId === bike.id ? 'Publishing...' : 'Approve & Publish'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Maintenance & Unavailable Bikes */}
          <div className="bg-white border border-[#E5E4DE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E4DE] flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-base text-[#202522]">
                  Maintenance & Offline
                </h2>
                <p className="text-xs text-[#70756F]">
                  Vehicles paused from public booking
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-[#70756F] tabular-nums">
                {maintenanceOrUnavailableBikes.length}
              </span>
            </div>

            {maintenanceOrUnavailableBikes.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-xs font-medium text-[#202522]">
                  100% of approved fleet is active
                </p>
                <p className="text-[11px] text-[#70756F]">
                  No vehicles are currently marked under maintenance.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E4DE]">
                {maintenanceOrUnavailableBikes.slice(0, 4).map((bike) => (
                  <div
                    key={bike.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#202522] truncate">
                          {bike.brand} {bike.model}
                        </span>
                        <span className="rp-status rp-status-pending text-[10px]">
                          {bike.availabilityStatus}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-[#70756F] block mt-0.5">
                        {bike.registrationNumber} · {bike.pickupHub}
                      </span>
                    </div>
                    <button
                      onClick={() => handleQuickRestoreBike(bike.id)}
                      disabled={busyId === bike.id}
                      className="rp-btn rp-btn-secondary px-2.5 py-1 text-xs shrink-0"
                    >
                      {busyId === bike.id ? 'Updating...' : 'Set Available'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Administrative Audit Log */}
      <div className="bg-white border border-[#E5E4DE] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E4DE] flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-base text-[#202522]">
              Recent Operational Activity Log
            </h2>
            <p className="text-xs text-[#70756F]">
              Timestamped audit trail of bookings, handovers, approvals, and configuration changes.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#70756F] tabular-nums">
            Showing latest {Math.min(actions.length, 8)} events
          </span>
        </div>

        {actions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#70756F]">
            No administrative actions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Event / Action</th>
                  <th>Category</th>
                  <th>Target Reference</th>
                  <th>Operator</th>
                  <th className="text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {actions.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="font-mono text-xs font-medium text-[#202522]">
                        {a.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs uppercase font-mono text-[#70756F]">
                        {a.targetType}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-[#29483B] tabular-nums">
                        #{a.targetId.slice(0, 12)}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-[#70756F] font-mono">
                        {a.adminId}
                      </span>
                    </td>
                    <td className="text-right font-mono text-xs text-[#70756F] tabular-nums">
                      {new Date(a.timestamp).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
