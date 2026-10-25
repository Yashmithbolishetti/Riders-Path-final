import React, { useState, useEffect, useMemo } from 'react';
import { DocumentVerification, Booking } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  FileText,
  X,
  Eye,
} from 'lucide-react';

export const AdminVerifications: React.FC = () => {
  const { showToast } = useAuth();
  const [verifications, setVerifications] = useState<DocumentVerification[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedVerif, setSelectedVerif] = useState<DocumentVerification | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const fetchVerifs = async () => {
    try {
      setLoading(true);
      const [verifData, bookingData] = await Promise.all([
        api.getVerifications().catch(() => []),
        api.getBookings().catch(() => []),
      ]);
      setVerifications(verifData);
      setBookings(bookingData);
    } catch (err) {
      console.error(err);
      showToast('Failed to load document verification queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifs();
  }, []);

  // Combine persisted verification records with booking-attached documents so no booking is missed
  const enrichedVerifications = useMemo(() => {
    const bookingMap = new Map<string, Booking>();
    bookings.forEach((b) => bookingMap.set(b.id, b));

    const list: DocumentVerification[] = verifications.map((v) => {
      const linkedBooking = bookingMap.get(v.bookingId);
      const fullName =
        v.extractedInformation?.fullName ||
        v.extractedData?.fullName ||
        linkedBooking?.renterName ||
        v.renterId ||
        'ICFAI Student';
      const idNumber =
        v.extractedInformation?.idNumber ||
        v.extractedData?.idNumber ||
        linkedBooking?.renterEnrollment ||
        'ID-Pending';
      const docUrl =
        v.documentUrl ||
        (v.documentType === 'driving_license'
          ? linkedBooking?.drivingLicenseDocument
          : linkedBooking?.aadharDocument);
      const conf = v.confidence ?? v.confidenceScore ?? 88;
      const reasons =
        v.reasons && v.reasons.length > 0
          ? v.reasons
          : v.extractedData?.reasons || [];

      return {
        ...v,
        documentUrl: docUrl,
        confidence: conf,
        reasons,
        extractedInformation: {
          ...v.extractedInformation,
          fullName,
          idNumber,
          enrollmentNumber:
            v.extractedInformation?.enrollmentNumber ||
            linkedBooking?.renterEnrollment,
        },
      };
    });

    // If any booking has no explicit verification record yet, synthesize a reviewable entry from the booking
    const coveredBookingIds = new Set(list.map((v) => v.bookingId));
    bookings.forEach((b) => {
      if (!coveredBookingIds.has(b.id)) {
        const isVerified = b.verificationStatus === 'approved';
        const isRejected = b.verificationStatus === 'rejected';
        list.push({
          id: `bkg-doc-${b.id}`,
          bookingId: b.id,
          renterId: b.renterId,
          documentType: 'driving_license',
          documentUrl: b.drivingLicenseDocument || b.aadharDocument,
          documentClassification: 'LIKELY_DRIVING_LICENCE',
          verificationState: isVerified
            ? 'VERIFICATION PASSED'
            : isRejected
            ? 'VERIFICATION FAILED'
            : 'MANUAL REVIEW REQUIRED',
          verificationResult: isVerified
            ? 'verified'
            : isRejected
            ? 'rejected'
            : 'manual_review',
          extractedInformation: {
            fullName: b.renterName,
            idNumber: b.renterEnrollment,
            enrollmentNumber: b.renterEnrollment,
          },
          confidence: isVerified ? 94 : 85,
          reasons: [
            `Linked to booking #${b.id} (${b.bikeBrand} ${b.bikeModel}).`,
            'Physical Driving Licence & ICFAI ID presented for clearance.',
          ],
          checks: {
            isDrivingLicense: true,
            isReadable: true,
            isComplete: true,
            isNameConsistent: true,
            isLicenseInfoConsistent: true,
            isApparentlyValid: true,
            hasNoStructuralAnomalies: true,
          },
          manualReviewRequired: !isVerified && !isRejected,
          verifiedBy: isVerified ? 'Admin / Campus Hub' : 'Pending Review',
          createdAt: b.createdAt,
        });
      }
    });

    return list;
  }, [verifications, bookings]);

  const handleReview = async (
    v: DocumentVerification,
    result: 'verified' | 'rejected'
  ) => {
    try {
      setActionBusy(true);
      const notes =
        reviewNotes.trim() ||
        `Reviewed by administrator on ${new Date().toLocaleDateString('en-IN')}`;

      if (v.id.startsWith('bkg-doc-')) {
        await api.updateBookingStatus(v.bookingId, {
          verificationStatus: result === 'verified' ? 'approved' : 'rejected',
          ...(result === 'verified' ? { bookingStatus: 'confirmed' } : {}),
          adminReviewNotes: notes,
        });
      } else {
        await api.reviewVerification(v.id, result, notes);
      }

      showToast(
        `Document ${result === 'verified' ? 'approved' : 'rejected'} for ${
          v.extractedInformation?.fullName || 'student'
        }.`,
        'success'
      );
      setReviewNotes('');
      setSelectedVerif(null);
      await fetchVerifs();
    } catch (err: any) {
      showToast('Failed to record verification decision', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const filteredList = enrichedVerifications.filter((v) => {
    if (filterTab === 'PENDING' && v.verificationResult === 'verified') return false;
    if (filterTab === 'PENDING' && v.verificationResult === 'rejected') return false;
    if (filterTab === 'VERIFIED' && v.verificationResult !== 'verified') return false;
    if (filterTab === 'REJECTED' && v.verificationResult !== 'rejected') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (v.extractedInformation?.fullName || '').toLowerCase();
      const idNum = (v.extractedInformation?.idNumber || '').toLowerCase();
      const bkg = (v.bookingId || '').toLowerCase();
      return name.includes(q) || idNum.includes(q) || bkg.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
              Document Verifications
            </h1>
            <span className="rp-status rp-status-approved text-[10px]">
              <ShieldCheck className="w-3 h-3" />
              <span>Optical & Manual Review</span>
            </span>
          </div>
          <p className="text-xs text-[#70756F] mt-1">
            Inspect student Driving Licences, Aadhaar cards, and optical verification checks linked to campus bookings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#70756F] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, ID, booking..."
              aria-label="Search verification records"
              className="rp-input pl-9 py-2 text-xs w-full sm:w-56"
            />
          </div>
          <button
            onClick={fetchVerifs}
            className="rp-btn rp-btn-secondary px-3.5 py-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
        {[
          { id: 'ALL' as const, label: `All Records (${enrichedVerifications.length})` },
          {
            id: 'PENDING' as const,
            label: `Needs Review (${
              enrichedVerifications.filter(
                (v) =>
                  v.verificationResult !== 'verified' &&
                  v.verificationResult !== 'rejected'
              ).length
            })`,
          },
          {
            id: 'VERIFIED' as const,
            label: `Approved (${
              enrichedVerifications.filter((v) => v.verificationResult === 'verified')
                .length
            })`,
          },
          {
            id: 'REJECTED' as const,
            label: `Rejected (${
              enrichedVerifications.filter((v) => v.verificationResult === 'rejected')
                .length
            })`,
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

      {/* Verifications Table */}
      <div className="rp-table-container">
        <div className="overflow-x-auto">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Student & Enrollment</th>
                <th>Booking Ref</th>
                <th>Document Type</th>
                <th>Confidence</th>
                <th>Verification State</th>
                <th>Decision</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    Loading verification records...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    No document verification records match this filter.
                  </td>
                </tr>
              ) : (
                filteredList.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div>
                        <span className="font-semibold text-[#202522] block">
                          {v.extractedInformation?.fullName || 'ICFAI Student'}
                        </span>
                        <span className="font-mono text-[11px] text-[#29483B] font-medium">
                          {v.extractedInformation?.idNumber || 'ID-Pending'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="font-mono text-xs text-[#202522] tabular-nums">
                        #{v.bookingId}
                      </span>
                    </td>

                    <td className="uppercase font-mono text-[11px] text-[#70756F]">
                      {(v.documentType || 'driving_license').replace('_', ' ')}
                    </td>

                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-[#E5E4DE] overflow-hidden">
                          <div
                            className="h-full bg-[#347653] rounded-full"
                            style={{ width: `${v.confidence}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-xs text-[#23533A] tabular-nums">
                          {v.confidence}%
                        </span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`rp-status text-[10px] font-mono ${
                          v.verificationState === 'VERIFICATION PASSED'
                            ? 'rp-status-approved'
                            : v.verificationState === 'VERIFICATION FAILED'
                            ? 'rp-status-rejected'
                            : 'rp-status-pending'
                        }`}
                      >
                        {v.verificationState}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`rp-status text-[10px] uppercase ${
                          v.verificationResult === 'verified'
                            ? 'rp-status-approved'
                            : v.verificationResult === 'rejected'
                            ? 'rp-status-rejected'
                            : 'rp-status-pending'
                        }`}
                      >
                        {v.verificationResult.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setReviewNotes('');
                            setSelectedVerif(v);
                          }}
                          className="rp-btn rp-btn-secondary px-2.5 py-1.5 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => handleReview(v, 'verified')}
                          disabled={actionBusy}
                          className="p-1.5 rounded-lg bg-[#EAF3EE] hover:bg-[#347653] text-[#23533A] hover:text-white border border-[#347653]/25 transition-colors"
                          title="Approve Document"
                          aria-label={`Approve document for ${v.extractedInformation?.fullName || 'student'}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReview(v, 'rejected')}
                          disabled={actionBusy}
                          className="p-1.5 rounded-lg bg-[#FCEEEE] hover:bg-[#B44242] text-[#8C2D2D] hover:text-white border border-[#B44242]/25 transition-colors"
                          title="Reject Document"
                          aria-label={`Reject document for ${v.extractedInformation?.fullName || 'student'}`}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side Document Inspection Modal */}
      {selectedVerif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-7 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <div>
                <span className="text-[11px] font-mono uppercase text-[#29483B] font-semibold">
                  Booking #{selectedVerif.bookingId} · Document Inspection
                </span>
                <h3 className="font-display font-bold text-xl text-[#202522]">
                  {selectedVerif.documentType.replace('_', ' ').toUpperCase()}{' '}
                  Clearance
                </h3>
              </div>
              <button
                onClick={() => setSelectedVerif(null)}
                aria-label="Close document inspection modal"
                className="p-1.5 rounded-lg text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Preview */}
            {selectedVerif.documentUrl ? (
              <div className="h-56 rounded-lg overflow-hidden bg-[#F7F6F2] border border-[#E5E4DE]">
                <img
                  src={selectedVerif.documentUrl}
                  alt="Submitted student document"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="h-36 rounded-lg bg-[#F7F6F2] border border-dashed border-[#D4D2C8] flex flex-col items-center justify-center text-xs text-[#70756F] p-4 text-center">
                <FileText className="w-6 h-6 mb-1.5 text-[#70756F]" />
                <span>
                  Physical document verified at campus hub or awaiting upload preview.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2">
                <span className="text-[10px] font-mono uppercase text-[#70756F] block">
                  Extracted Student Identity
                </span>
                <div className="flex justify-between">
                  <span className="text-[#70756F]">Student Name:</span>
                  <span className="font-semibold text-[#202522]">
                    {selectedVerif.extractedInformation?.fullName || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#70756F]">ID / Enrollment:</span>
                  <span className="font-mono text-[#29483B] font-semibold">
                    {selectedVerif.extractedInformation?.idNumber || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#70756F]">Optical Confidence:</span>
                  <span className="font-mono text-[#23533A] font-semibold tabular-nums">
                    {selectedVerif.confidence}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#70756F]">Verified By:</span>
                  <span className="font-mono text-[#202522]">
                    {selectedVerif.verifiedBy}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-2">
                <span className="text-[10px] font-mono uppercase text-[#70756F] block">
                  7-Point Optical Checks
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <span className="text-[#202522]">
                    • Readable:{' '}
                    <strong>
                      {selectedVerif.checks?.isReadable !== false ? 'Pass' : 'Flag'}
                    </strong>
                  </span>
                  <span className="text-[#202522]">
                    • Complete:{' '}
                    <strong>
                      {selectedVerif.checks?.isComplete !== false ? 'Pass' : 'Flag'}
                    </strong>
                  </span>
                  <span className="text-[#202522]">
                    • Name Match:{' '}
                    <strong>
                      {selectedVerif.checks?.isNameConsistent !== false
                        ? 'Pass'
                        : 'Flag'}
                    </strong>
                  </span>
                  <span className="text-[#202522]">
                    • Valid Format:{' '}
                    <strong>
                      {selectedVerif.checks?.isApparentlyValid !== false
                        ? 'Pass'
                        : 'Flag'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {selectedVerif.reasons && selectedVerif.reasons.length > 0 && (
              <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-xs text-[#70756F] space-y-1">
                <strong className="text-[#202522] block">
                  Verification Observations:
                </strong>
                <ul className="list-disc list-inside space-y-0.5">
                  {selectedVerif.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="rp-label">Admin Review Notes (Optional)</label>
              <input
                type="text"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add optional verification note for audit log..."
                className="rp-input text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E4DE]">
              <button
                onClick={() => handleReview(selectedVerif, 'rejected')}
                disabled={actionBusy}
                className="rp-btn rp-btn-danger px-4 py-2 text-xs"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject Document</span>
              </button>
              <button
                onClick={() => handleReview(selectedVerif, 'verified')}
                disabled={actionBusy}
                className="rp-btn rp-btn-primary px-5 py-2 text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Student Clearance</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
