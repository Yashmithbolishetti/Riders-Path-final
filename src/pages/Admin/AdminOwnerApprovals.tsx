import React, { useState, useEffect } from 'react';
import { Bike } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { VehicleImage } from '../../components/VehicleImage';
import { dailyToHourly } from '../../utils/pricing';
import {
  CheckCircle2,
  Eye,
  MessageSquare,
  X,
  RefreshCw,
  MapPin,
  Phone,
  User,
  XCircle,
} from 'lucide-react';

export const AdminOwnerApprovals: React.FC = () => {
  const { showToast } = useAuth();
  const [allBikes, setAllBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<
    'PENDING' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED'
  >('PENDING');
  const [inspectingBike, setInspectingBike] = useState<Bike | null>(null);

  // Request Changes Modal
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changesBikeId, setChangesBikeId] = useState('');
  const [changesNotes, setChangesNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reject Modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectBikeId, setRejectBikeId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const [all, unapproved] = await Promise.all([
        api.getAllBikesAdmin().catch(() => []),
        api.getOwnerSubmissions().catch(() => []),
      ]);
      // Merge ensuring all unapproved submissions are present
      const map = new Map<string, Bike>();
      all.forEach((b) => map.set(b.id, b));
      unapproved.forEach((b) => map.set(b.id, b));
      setAllBikes(Array.from(map.values()));
    } catch (err) {
      console.error(err);
      showToast('Failed to load owner submissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(true);
      await api.approveOwnerBike(id);
      showToast('Student host bike approved & published to campus marketplace!', 'success');
      await fetchSubmissions();
      setInspectingBike(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve bike', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectBikeId(id);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await api.rejectOwnerBike(
        rejectBikeId,
        rejectReason.trim() || 'Rejected during administrative listing review.'
      );
      showToast('Listing rejected and audit feedback recorded.', 'info');
      setShowRejectModal(false);
      await fetchSubmissions();
      setInspectingBike(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to reject bike', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openChangesModal = (id: string) => {
    setChangesBikeId(id);
    setChangesNotes('');
    setShowChangesModal(true);
  };

  const handleConfirmRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changesNotes.trim()) {
      showToast('Please enter feedback notes for the student host.', 'error');
      return;
    }
    try {
      setActionLoading(true);
      await api.requestOwnerChanges(changesBikeId, changesNotes.trim());
      showToast('Changes requested from student host.', 'success');
      setShowChangesModal(false);
      await fetchSubmissions();
      setInspectingBike(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to request changes', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingList = allBikes.filter(
    (b) =>
      !b.approvedByAdmin &&
      b.approvalStatus !== 'CHANGES_REQUESTED' &&
      b.approvalStatus !== 'REJECTED'
  );
  const changesRequestedList = allBikes.filter(
    (b) => !b.approvedByAdmin && b.approvalStatus === 'CHANGES_REQUESTED'
  );
  const rejectedList = allBikes.filter(
    (b) => !b.approvedByAdmin && b.approvalStatus === 'REJECTED'
  );
  const approvedHostList = allBikes.filter((b) => b.approvedByAdmin);

  const displayedBikes =
    filterTab === 'PENDING'
      ? pendingList
      : filterTab === 'CHANGES_REQUESTED'
      ? changesRequestedList
      : filterTab === 'REJECTED'
      ? rejectedList
      : approvedHostList;

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            Owner Submissions & Host Listings
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            Review bikes submitted by ICFAI student owners. Approved listings publish directly to the live catalog.
          </p>
        </div>
        <button
          onClick={fetchSubmissions}
          className="rp-btn rp-btn-secondary px-3.5 py-2 text-xs self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
        {[
          {
            id: 'PENDING' as const,
            label: `Pending Approval (${pendingList.length})`,
          },
          {
            id: 'CHANGES_REQUESTED' as const,
            label: `Changes Requested (${changesRequestedList.length})`,
          },
          {
            id: 'APPROVED' as const,
            label: `Published Host Bikes (${approvedHostList.length})`,
          },
          {
            id: 'REJECTED' as const,
            label: `Rejected (${rejectedList.length})`,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
              filterTab === tab.id
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522] hover:bg-[#F7F6F2]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 rounded-xl bg-white border border-[#E5E4DE] text-center text-xs text-[#70756F]">
          Loading student owner submissions...
        </div>
      ) : displayedBikes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayedBikes.map((bike) => {
            const hourlyRate =
              bike.pricePerHour || dailyToHourly(bike.pricePerDay);
            const academicInfo = [bike.ownerAcademicYear, bike.ownerCourse]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={bike.id}
                className="p-6 rounded-xl bg-white border border-[#E5E4DE] space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#70756F]">
                        {bike.brand} · {bike.year} · {bike.bikeType}
                      </span>
                      <h3 className="font-display font-bold text-xl text-[#202522] mt-0.5">
                        {bike.model}
                      </h3>
                      <p className="text-xs font-mono text-[#29483B] font-medium mt-0.5">
                        Reg: {bike.registrationNumber}
                      </p>
                    </div>

                    <span
                      className={`rp-status text-[10px] shrink-0 ${
                        bike.approvedByAdmin
                          ? 'rp-status-approved'
                          : bike.approvalStatus === 'REJECTED'
                          ? 'rp-status-rejected'
                          : 'rp-status-pending'
                      }`}
                    >
                      {bike.approvedByAdmin
                        ? 'Approved & Live'
                        : bike.approvalStatus === 'CHANGES_REQUESTED'
                        ? 'Changes Requested'
                        : bike.approvalStatus === 'REJECTED'
                        ? 'Rejected'
                        : 'Pending Review'}
                    </span>
                  </div>

                  {/* Host & Pricing Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
                      <span className="text-[#70756F] text-[10px] block uppercase font-mono">
                        Student Host
                      </span>
                      <span className="font-semibold text-[#202522] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#29483B]" />
                        {bike.ownerName || 'Student Host'}
                      </span>
                      <span className="font-mono text-[#29483B] text-[11px] font-medium block">
                        ID: {bike.ownerEnrollment || '26FMUCHH01XXXX'}
                      </span>
                      {academicInfo && (
                        <span className="text-[#70756F] text-[11px] block">
                          {academicInfo}
                        </span>
                      )}
                      <span className="text-[#70756F] text-[11px] flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" />
                        {bike.ownerPhone}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
                      <span className="text-[#70756F] text-[10px] block uppercase font-mono">
                        Pickup Hub & Proposed Rates
                      </span>
                      <span className="font-semibold text-[#202522] flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#29483B] shrink-0" />
                        <span className="truncate">{bike.pickupHub}</span>
                      </span>
                      <span className="font-mono text-[#23533A] font-semibold text-xs block tabular-nums">
                        ₹{bike.pricePerDay}/day · ₹{hourlyRate}/hr
                      </span>
                      <span className="text-[#70756F] text-[11px] block font-mono tabular-nums">
                        ₹{bike.securityDeposit} security deposit
                      </span>
                      <span className="text-[#70756F] text-[11px] block">
                        {bike.transmission} · {bike.fuelType}
                      </span>
                    </div>
                  </div>

                  {/* Admin Feedback Notes if present */}
                  {bike.approvalNotes && (
                    <div className="p-3 rounded-lg bg-[#FDF6EA] border border-[#9A6B25]/25 text-xs text-[#7A5318]">
                      <strong className="font-semibold block text-[11px] uppercase font-mono mb-0.5">
                        Admin Review Notes:
                      </strong>
                      <span>{bike.approvalNotes}</span>
                    </div>
                  )}

                  {/* Vehicle Photo Preview */}
                  <div className="h-40 rounded-lg overflow-hidden bg-[#EFEEE8] border border-[#E5E4DE] relative">
                    <VehicleImage
                      src={bike.images?.[0]}
                      alt={`${bike.brand} ${bike.model}`}
                      brand={bike.brand}
                      model={bike.model}
                      bikeType={bike.bikeType}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setInspectingBike(bike)}
                      className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-lg bg-white/95 border border-[#E5E4DE] text-[#202522] text-xs font-medium flex items-center gap-1.5 hover:bg-white shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#29483B]" />
                      <span>Inspect Full Details</span>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#E5E4DE]">
                  <button
                    type="button"
                    onClick={() => openChangesModal(bike.id)}
                    className="rp-btn rp-btn-secondary px-3 py-2 text-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#29483B]" />
                    <span>Request Changes</span>
                  </button>

                  {bike.approvalStatus !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => openRejectModal(bike.id)}
                      className="rp-btn rp-btn-danger px-3.5 py-2 text-xs"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}

                  {!bike.approvedByAdmin && (
                    <button
                      type="button"
                      onClick={() => handleApprove(bike.id)}
                      disabled={actionLoading}
                      className="rp-btn rp-btn-primary px-4 py-2 text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Publish</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-14 rounded-xl bg-white border border-[#E5E4DE] text-center space-y-2.5">
          <CheckCircle2 className="w-8 h-8 text-[#347653] mx-auto" />
          <h3 className="font-display font-semibold text-base text-[#202522]">
            {filterTab === 'PENDING'
              ? 'No Pending Student Host Submissions'
              : `No Listings in ${filterTab.replace('_', ' ')}`}
          </h3>
          <p className="text-xs text-[#70756F] max-w-md mx-auto">
            {filterTab === 'PENDING'
              ? 'All student-submitted bikes have been reviewed. When a student submits a bike via List Your Bike, it will appear here for approval.'
              : 'Switch tabs above to view other student host listings.'}
          </p>
        </div>
      )}

      {/* Inspect Full Submission Modal */}
      {inspectingBike && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-7 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-[#29483B] font-semibold">
                  {inspectingBike.brand} · {inspectingBike.year} ·{' '}
                  {inspectingBike.bikeType}
                </span>
                <h3 className="font-display font-bold text-xl text-[#202522]">
                  {inspectingBike.model} ({inspectingBike.registrationNumber})
                </h3>
              </div>
              <button
                onClick={() => setInspectingBike(null)}
                className="p-2 rounded-lg bg-[#F7F6F2] text-[#70756F] hover:text-[#202522]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2">
                <h4 className="font-semibold text-[#29483B] text-xs uppercase font-mono">
                  Student Host Profile
                </h4>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Name:</strong>{' '}
                  {inspectingBike.ownerName}
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">ICFAI ID:</strong>{' '}
                  <span className="font-mono text-[#29483B] font-semibold">
                    {inspectingBike.ownerEnrollment}
                  </span>
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Phone:</strong>{' '}
                  <span className="font-mono">{inspectingBike.ownerPhone}</span>
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Academic Year:</strong>{' '}
                  {inspectingBike.ownerAcademicYear || 'Verified ICFAI Student'}
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Course / Dept:</strong>{' '}
                  {inspectingBike.ownerCourse || 'ICFAI Campus'}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2">
                <h4 className="font-semibold text-[#23533A] text-xs uppercase font-mono">
                  Rental & Technical Specs
                </h4>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Registration No:</strong>{' '}
                  <span className="font-mono">
                    {inspectingBike.registrationNumber}
                  </span>
                </p>
                <p className="text-[#202522] tabular-nums">
                  <strong className="text-[#70756F]">Daily Rate:</strong> ₹
                  {inspectingBike.pricePerDay}/day
                </p>
                <p className="text-[#202522] tabular-nums">
                  <strong className="text-[#70756F]">Hourly Rate:</strong> ₹
                  {inspectingBike.pricePerHour ||
                    dailyToHourly(inspectingBike.pricePerDay)}
                  /hr
                </p>
                <p className="text-[#202522] tabular-nums">
                  <strong className="text-[#70756F]">Security Deposit:</strong> ₹
                  {inspectingBike.securityDeposit}
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Pickup Hub:</strong>{' '}
                  {inspectingBike.pickupHub}
                </p>
                <p className="text-[#202522]">
                  <strong className="text-[#70756F]">Specs:</strong>{' '}
                  {inspectingBike.specs?.cc
                    ? `${inspectingBike.specs.cc}cc · `
                    : ''}
                  {inspectingBike.specs?.mileage || '40 km/l'} ·{' '}
                  {inspectingBike.transmission}
                </p>
              </div>
            </div>

            {inspectingBike.description && (
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-xs text-[#202522]">
                <strong className="text-[#70756F] block text-[10px] uppercase font-mono mb-1">
                  Host Description:
                </strong>
                {inspectingBike.description}
              </div>
            )}

            {/* Uploaded Photos */}
            {inspectingBike.images && inspectingBike.images.length > 0 && (
              <div>
                <h4 className="font-semibold text-[#202522] text-xs mb-2">
                  Uploaded Vehicle Photos ({inspectingBike.images.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {inspectingBike.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="h-28 rounded-lg overflow-hidden bg-[#EFEEE8] border border-[#E5E4DE]"
                    >
                      <VehicleImage
                        src={img}
                        alt={`${inspectingBike.model} ${idx + 1}`}
                        brand={inspectingBike.brand}
                        model={inspectingBike.model}
                        bikeType={inspectingBike.bikeType}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#E5E4DE] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = inspectingBike.id;
                  setInspectingBike(null);
                  openChangesModal(id);
                }}
                className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
              >
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = inspectingBike.id;
                  setInspectingBike(null);
                  openRejectModal(id);
                }}
                className="rp-btn rp-btn-danger px-4 py-2 text-xs"
              >
                Reject Listing
              </button>
              {!inspectingBike.approvedByAdmin && (
                <button
                  type="button"
                  onClick={() => handleApprove(inspectingBike.id)}
                  disabled={actionLoading}
                  className="rp-btn rp-btn-primary px-6 py-2 text-xs"
                >
                  Approve & Publish to Fleet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Changes Modal */}
      {showChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-4 shadow-xl">
            <h3 className="font-display font-semibold text-base text-[#202522]">
              Request Changes from Student Host
            </h3>
            <p className="text-xs text-[#70756F]">
              Specify what the student host needs to update before the vehicle can be published (e.g., clearer registration number, updated photos, or pickup hub confirmation).
            </p>

            <form onSubmit={handleConfirmRequestChanges} className="space-y-4">
              <textarea
                required
                rows={4}
                value={changesNotes}
                onChange={(e) => setChangesNotes(e.target.value)}
                placeholder="e.g. Please provide a clear photo of the vehicle registration plate and confirm daily availability at ICFAI Main Gate."
                className="rp-textarea text-xs"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangesModal(false)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rp-btn rp-btn-primary px-5 py-2 text-xs"
                >
                  {actionLoading ? 'Sending...' : 'Save Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-4 shadow-xl">
            <h3 className="font-display font-semibold text-base text-[#202522]">
              Reject Student Host Submission
            </h3>
            <p className="text-xs text-[#70756F]">
              Provide a clear reason for rejecting this listing for the administrative audit trail.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Incomplete registration details or vehicle does not meet campus safety requirements."
                className="rp-textarea text-xs"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rp-btn rp-btn-danger px-5 py-2 text-xs"
                >
                  {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
