import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AdminConfig, AdminRole, AdminUserRecord, PickupLocation } from '../../types';
import {
  Settings,
  Lock,
  ShieldCheck,
  MapPin,
  Save,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  Clock,
  Phone,
  AlertTriangle,
  X,
  Mail,
  UserPlus,
  Send,
  ShieldAlert,
} from 'lucide-react';

interface AdminSettingsProps {
  initialSection?: 'locations' | 'settings' | 'admins';
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  initialSection = 'settings',
}) => {
  const { showToast, isSuperAdmin: authIsSuperAdmin, adminEmail } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<
    'locations' | 'policies' | 'admins' | 'security'
  >(
    initialSection === 'locations'
      ? 'locations'
      : initialSection === 'admins'
      ? 'admins'
      : 'policies'
  );
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin Management State
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [currentAdminRole, setCurrentAdminRole] = useState<AdminRole>(
    authIsSuperAdmin ? 'super_admin' : 'admin'
  );
  const [initialSuperAdminEmail, setInitialSuperAdminEmail] = useState(
    'yashmithbolishetti01@gmail.com'
  );
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminMgmtError, setAdminMgmtError] = useState('');
  const [adminMgmtSuccess, setAdminMgmtSuccess] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingAdmin, setRevokingAdmin] = useState<AdminUserRecord | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  useEffect(() => {
    setActiveSubTab(
      initialSection === 'locations'
        ? 'locations'
        : initialSection === 'admins'
        ? 'admins'
        : 'policies'
    );
  }, [initialSection]);

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // Config fields
  const [platformFee, setPlatformFee] = useState(8);
  const [defaultDeposit, setDefaultDeposit] = useState(1000);

  // Policy & Terms fields
  const [termsVersion, setTermsVersion] = useState('v1.2-2026-AUG');
  const [freeCancellationHours, setFreeCancellationHours] = useState(4);
  const [cancellationFeePercent, setCancellationFeePercent] = useState(15);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(30);
  const [hourlyLateFee, setHourlyLateFee] = useState(100);
  const [trafficFineHandlingFee, setTrafficFineHandlingFee] = useState(100);

  // Pickup Location Modal State
  const [showLocModal, setShowLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<PickupLocation | null>(null);
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locLandmark, setLocLandmark] = useState('');
  const [locHours, setLocHours] = useState('07:00 AM - 10:30 PM (Daily)');
  const [locPhone, setLocPhone] = useState('+91 91210 98765');
  const [locActive, setLocActive] = useState(true);
  const [locSaving, setLocSaving] = useState(false);

  // Custom Delete Confirmation Modal for Pickup Hub
  const [deletingLoc, setDeletingLoc] = useState<PickupLocation | null>(null);
  const [deleteLocBusy, setDeleteLocBusy] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configData, locsData, adminsData] = await Promise.all([
        api.getConfig(),
        api.adminGetPickupLocations().catch(() => []),
        api.adminListAdmins().catch(() => null),
      ]);

      setConfig(configData);
      setPickupLocations(locsData);
      if (adminsData) {
        setAdmins(adminsData.admins || []);
        setCurrentAdminRole(adminsData.currentAdminRole || 'admin');
        if (adminsData.initialSuperAdminEmail) {
          setInitialSuperAdminEmail(adminsData.initialSuperAdminEmail);
        }
      }
      setPlatformFee(configData.platformFeePercent ?? 8);
      setDefaultDeposit(configData.defaultSecurityDeposit || 1000);
      if (configData.termsVersion) setTermsVersion(configData.termsVersion);
      if (configData.cancellationPolicy) {
        setFreeCancellationHours(
          configData.cancellationPolicy.freeCancellationHours || 4
        );
        setCancellationFeePercent(
          configData.cancellationPolicy.cancellationFeePercent || 15
        );
      }
      if (configData.lateReturnPolicy) {
        setGracePeriodMinutes(
          configData.lateReturnPolicy.gracePeriodMinutes || 30
        );
        setHourlyLateFee(configData.lateReturnPolicy.hourlyLateFee || 100);
      }
      if (configData.trafficFineHandlingFee) {
        setTrafficFineHandlingFee(configData.trafficFineHandlingFee);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isSuperAdmin =
    currentAdminRole === 'super_admin' || authIsSuperAdmin;

  const handleAddAdministrator = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminMgmtError('');
    setAdminMgmtSuccess('');
    const cleanEmail = newAdminEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAdminMgmtError('Enter a valid email address for the new administrator.');
      return;
    }

    try {
      setAddingAdmin(true);
      const res = await api.adminAddAdmin(cleanEmail);
      setNewAdminEmail('');
      setAdminMgmtSuccess(res.message);
      showToast(res.message, 'success');
      const refreshed = await api.adminListAdmins();
      setAdmins(refreshed.admins || []);
    } catch (err: any) {
      setAdminMgmtError(err?.message || 'Failed to add administrator.');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleResendInvite = async (adminRecord: AdminUserRecord) => {
    setAdminMgmtError('');
    setAdminMgmtSuccess('');
    try {
      setResendingId(adminRecord.id);
      const res = await api.adminResendInvite(adminRecord.id);
      setAdminMgmtSuccess(res.message);
      showToast(res.message, 'info');
    } catch (err: any) {
      setAdminMgmtError(err?.message || 'Could not resend password setup link.');
    } finally {
      setResendingId(null);
    }
  };

  const confirmRevokeAdministrator = async () => {
    if (!revokingAdmin) return;
    setAdminMgmtError('');
    setAdminMgmtSuccess('');
    try {
      setRevokeBusy(true);
      const res = await api.adminRevokeAdmin(revokingAdmin.id);
      setAdminMgmtSuccess(res.message);
      showToast(res.message, 'info');
      setRevokingAdmin(null);
      const refreshed = await api.adminListAdmins();
      setAdmins(refreshed.admins || []);
    } catch (err: any) {
      setAdminMgmtError(err?.message || 'Failed to revoke administrator privileges.');
      setRevokingAdmin(null);
    } finally {
      setRevokeBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters long');
      return;
    }

    try {
      setPwLoading(true);
      setPwError('');
      await api.adminChangePassword(oldPassword, newPassword);
      showToast('Administrator password updated securely!', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await api.updateConfig({
        platformFeePercent: Number(platformFee),
        defaultSecurityDeposit: Number(defaultDeposit),
        termsVersion: termsVersion.trim() || 'v1.2-2026-AUG',
        cancellationPolicy: {
          freeCancellationHours: Number(freeCancellationHours),
          cancellationFeePercent: Number(cancellationFeePercent),
          refundProcessingDays: 2,
        },
        lateReturnPolicy: {
          gracePeriodMinutes: Number(gracePeriodMinutes),
          hourlyLateFee: Number(hourlyLateFee),
          maxLatePenaltyPerDay: 1200,
        },
        trafficFineHandlingFee: Number(trafficFineHandlingFee),
      });

      setConfig(updated);
      showToast('Marketplace policies & fee settings saved!', 'success');
    } catch (err: any) {
      showToast('Failed to save marketplace configuration', 'error');
    }
  };

  const openAddLocModal = () => {
    setEditingLoc(null);
    setLocName('');
    setLocCode('');
    setLocLandmark('');
    setLocHours('07:00 AM - 10:30 PM (Daily)');
    setLocPhone('+91 91210 98765');
    setLocActive(true);
    setShowLocModal(true);
  };

  const openEditLocModal = (loc: PickupLocation) => {
    setEditingLoc(loc);
    setLocName(loc.name);
    setLocCode(loc.hubCode || '');
    setLocLandmark(loc.landmark || '');
    setLocHours(loc.operatingHours || '07:00 AM - 10:30 PM (Daily)');
    setLocPhone(loc.contactPhone || '+91 91210 98765');
    setLocActive(loc.isActive);
    setShowLocModal(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      showToast('Hub name is required', 'error');
      return;
    }

    try {
      setLocSaving(true);
      if (editingLoc) {
        const updated = await api.adminUpdatePickupLocation(editingLoc.id, {
          name: locName.trim(),
          hubCode: (locCode || locName.slice(0, 4))
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ''),
          landmark: locLandmark.trim(),
          operatingHours: locHours.trim(),
          contactPhone: locPhone.trim(),
          isActive: locActive,
        });
        setPickupLocations((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l))
        );
        showToast('Pickup hub updated successfully', 'success');
      } else {
        const created = await api.adminCreatePickupLocation({
          name: locName.trim(),
          hubCode: (locCode || locName.slice(0, 4))
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ''),
          landmark: locLandmark.trim(),
          operatingHours: locHours.trim(),
          contactPhone: locPhone.trim(),
          isActive: locActive,
          displayOrder: pickupLocations.length + 1,
        });
        setPickupLocations((prev) => [...prev, created]);
        showToast('New campus pickup hub created', 'success');
      }
      setShowLocModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save pickup hub', 'error');
    } finally {
      setLocSaving(false);
    }
  };

  const confirmDeleteLocation = async () => {
    if (!deletingLoc) return;
    try {
      setDeleteLocBusy(true);
      await api.adminDeletePickupLocation(deletingLoc.id);
      setPickupLocations((prev) => prev.filter((l) => l.id !== deletingLoc.id));
      showToast(`Pickup hub "${deletingLoc.name}" removed.`, 'info');
      setDeletingLoc(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete pickup hub', 'error');
    } finally {
      setDeleteLocBusy(false);
    }
  };

  const handleToggleLocActive = async (loc: PickupLocation) => {
    try {
      const updated = await api.adminUpdatePickupLocation(loc.id, {
        isActive: !loc.isActive,
      });
      setPickupLocations((prev) =>
        prev.map((l) => (l.id === updated.id ? updated : l))
      );
      showToast(
        `Hub "${loc.name}" marked as ${updated.isActive ? 'Active' : 'Disabled'}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle hub status', 'error');
    }
  };

  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            {activeSubTab === 'locations'
              ? 'Campus Pickup Locations'
              : activeSubTab === 'admins'
              ? 'Admin Authentication & Role Management'
              : 'Settings, Policies & Admin Security'}
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            {activeSubTab === 'admins'
              ? 'Manage authorized Riders Path administrators, roles, and Supabase Auth setup invitations.'
              : 'Single source of truth for ICFAI Hyderabad handover hubs, marketplace fee policies, and admin credentials.'}
          </p>
        </div>

        {/* Sub-navigation Switcher */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
          <button
            type="button"
            onClick={() => setActiveSubTab('admins')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'admins'
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Admin Management ({admins.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('locations')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'locations'
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Pickup Locations ({pickupLocations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('policies')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'policies'
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Marketplace Policies
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('security')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'security'
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522]'
            }`}
          >
            Admin Password
          </button>
        </div>
      </div>

      {/* SECTION 0: Admin Management */}
      {activeSubTab === 'admins' && (
        <div className="space-y-6">
          {/* Role & Authorization Banner */}
          <div className="p-5 sm:p-6 rounded-xl bg-white border border-[#E5E4DE] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#29483B] flex items-center justify-center text-white shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-semibold text-base text-[#202522]">
                    Administrator Access Control
                  </h2>
                  <span
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                      isSuperAdmin
                        ? 'bg-[#29483B] text-white'
                        : 'bg-[#EAF2EE] text-[#29483B] border border-[#29483B]/20'
                    }`}
                  >
                    YOUR ROLE: {isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}
                  </span>
                </div>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Initial Super Admin:{' '}
                  <span className="font-mono font-medium text-[#202522]">
                    {initialSuperAdminEmail}
                  </span>
                  {adminEmail ? ` • Signed in as ${adminEmail}` : ''}
                </p>
              </div>
            </div>
          </div>

          {adminMgmtError && (
            <div className="p-3.5 rounded-lg bg-[#FCEEEE] border border-[#B44242]/20 flex items-start gap-2.5 text-xs text-[#B44242]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{adminMgmtError}</span>
            </div>
          )}

          {adminMgmtSuccess && (
            <div className="p-3.5 rounded-lg bg-[#EAF2EE] border border-[#29483B]/20 flex items-start gap-2.5 text-xs text-[#29483B]">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{adminMgmtSuccess}</span>
            </div>
          )}

          {/* Add Administrator Card (Super Admin Only) */}
          {isSuperAdmin ? (
            <div className="p-6 sm:p-7 rounded-xl bg-white border border-[#E5E4DE] space-y-4">
              <div className="space-y-1">
                <h3 className="font-display font-semibold text-base text-[#202522] flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#29483B]" />
                  <span>Add New Administrator</span>
                </h3>
                <p className="text-xs text-[#70756F]">
                  Enter the administrator&apos;s email address. They will be granted the standard{' '}
                  <strong className="text-[#202522]">Admin</strong> role and sent a secure Supabase Auth link to establish their own password (passwords are never entered or stored here).
                </p>
              </div>

              <form
                onSubmit={handleAddAdministrator}
                className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
              >
                <div className="flex-1">
                  <label className="rp-label">Administrator Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#70756F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="coordinator@icfai.ac.in"
                      className="rp-input pl-10 text-xs"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingAdmin || !newAdminEmail.trim()}
                  className="rp-btn rp-btn-primary px-5 py-2.5 text-xs whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {addingAdmin ? 'Sending Setup Link...' : 'Add Admin & Send Setup Link'}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] flex items-start gap-3 text-xs text-[#4E544F]">
              <ShieldAlert className="w-4 h-4 text-[#8C6229] shrink-0 mt-0.5" />
              <span>
                You are signed in with a standard <strong className="text-[#202522]">Admin</strong> role. Only the Super Admin (<span className="font-mono text-[#202522]">{initialSuperAdminEmail}</span>) can invite new administrators or revoke administrator privileges.
              </span>
            </div>
          )}

          {/* Existing Administrators Roster */}
          <div className="p-6 sm:p-7 rounded-xl bg-white border border-[#E5E4DE] space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-4">
              <div>
                <h3 className="font-display font-semibold text-base text-[#202522]">
                  Authorized Administrators ({admins.length})
                </h3>
                <p className="text-xs text-[#70756F]">
                  All administrator sessions are verified on the server via Supabase Auth.
                </p>
              </div>
            </div>

            <div className="divide-y divide-[#E5E4DE]">
              {admins.map((item) => {
                const isInitialSuper =
                  item.role === 'super_admin' ||
                  item.email.toLowerCase() === initialSuperAdminEmail.toLowerCase();
                return (
                  <div
                    key={item.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-xs sm:text-sm text-[#202522] break-all">
                          {item.email}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            isInitialSuper
                              ? 'bg-[#29483B] text-white'
                              : 'bg-[#EAF2EE] text-[#29483B] border border-[#29483B]/20'
                          }`}
                        >
                          {isInitialSuper ? 'SUPER ADMIN' : 'ADMIN'}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                            item.status === 'active'
                              ? 'bg-[#EAF2EE] text-[#23633F]'
                              : 'bg-[#FEF6E8] text-[#8C6229]'
                          }`}
                        >
                          {item.status === 'active'
                            ? 'Active (Verified)'
                            : 'Invited — Pending Password Setup'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#70756F]">
                        {isInitialSuper
                          ? 'Primary owner & initial Super Admin (Protected)'
                          : `Added by ${item.addedBy || initialSuperAdminEmail} • ${new Date(
                              item.createdAt
                            ).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}`}
                      </p>
                    </div>

                    {isSuperAdmin && !isInitialSuper && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResendInvite(item)}
                          disabled={resendingId === item.id}
                          className="rp-btn rp-btn-secondary px-3 py-1.5 text-xs"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {resendingId === item.id ? 'Sending...' : 'Send Setup Link'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokingAdmin(item)}
                          className="rp-btn rp-btn-danger px-3 py-1.5 text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: Campus Pickup Locations */}
      {activeSubTab === 'locations' && (
        <div className="p-6 sm:p-7 rounded-xl bg-white border border-[#E5E4DE] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E4DE] pb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-base text-[#202522]">
                  Authorized Campus Pickup & Return Hubs
                </h2>
                <p className="text-xs text-[#70756F]">
                  Active locations immediately sync to public bike filtering, checkout, and student host onboarding.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openAddLocModal}
              className="rp-btn rp-btn-primary px-4 py-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Pickup Hub</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pickupLocations.map((loc) => (
              <div
                key={loc.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  loc.isActive
                    ? 'bg-[#F7F6F2] border-[#E5E4DE]'
                    : 'bg-[#EFEEE8]/60 border-[#E5E4DE] opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white border border-[#E5E4DE] text-[#29483B]">
                        {loc.hubCode || loc.name.slice(0, 4).toUpperCase()}
                      </span>
                      <h3 className="font-semibold text-[#202522] text-sm">
                        {loc.name}
                      </h3>
                    </div>
                    {loc.landmark && (
                      <p className="text-xs text-[#70756F] mt-1">
                        Landmark: {loc.landmark}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleLocActive(loc)}
                      className={`rp-status text-[10px] cursor-pointer ${
                        loc.isActive ? 'rp-status-approved' : 'rp-status-neutral'
                      }`}
                      title="Click to toggle active status"
                    >
                      {loc.isActive ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => openEditLocModal(loc)}
                      className="p-1.5 rounded-lg bg-white hover:bg-[#EFEEE8] border border-[#E5E4DE] text-[#202522]"
                      title="Edit Location"
                      aria-label={`Edit ${loc.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingLoc(loc)}
                      className="p-1.5 rounded-lg bg-[#FCEEEE] hover:bg-[#B44242] text-[#8C2D2D] hover:text-white border border-[#B44242]/25 transition-colors"
                      title="Delete Location"
                      aria-label={`Delete ${loc.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E5E4DE] flex flex-wrap items-center justify-between text-[11px] text-[#70756F] gap-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#29483B]" />
                    {loc.operatingHours || '07:00 AM - 10:30 PM (Daily)'}
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3 text-[#29483B]" />
                    {loc.contactPhone || '+91 91210 98765'}
                  </span>
                </div>
              </div>
            ))}

            {pickupLocations.length === 0 && (
              <div className="col-span-full p-8 text-center rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] text-[#70756F] text-xs">
                No pickup locations configured. Click &quot;Add Pickup Hub&quot; above to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: Marketplace Policies & Fee Structure */}
      {activeSubTab === 'policies' && (
        <div className="p-6 sm:p-7 rounded-xl bg-white border border-[#E5E4DE] space-y-6">
          <div className="flex items-center gap-3 border-b border-[#E5E4DE] pb-4">
            <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base text-[#202522]">
                Marketplace Fees, Deposits & Rental Policies
              </h2>
              <p className="text-xs text-[#70756F]">
                Configure default security deposits, platform fees, and late return / cancellation rules.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="rp-label">Platform Service Fee (%)</label>
                <input
                  type="number"
                  min="0"
                  max="25"
                  value={platformFee}
                  onChange={(e) => setPlatformFee(Number(e.target.value))}
                  className="rp-input font-mono text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="rp-label">Default Security Deposit (₹)</label>
                <input
                  type="number"
                  min="500"
                  max="5000"
                  value={defaultDeposit}
                  onChange={(e) => setDefaultDeposit(Number(e.target.value))}
                  className="rp-input font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#E5E4DE] space-y-4">
              <h3 className="font-semibold text-[#202522] text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#29483B]" />
                <span>Terms Version & Operational Rules</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="rp-label">Active Terms Version</label>
                  <input
                    type="text"
                    value={termsVersion}
                    onChange={(e) => setTermsVersion(e.target.value)}
                    placeholder="v1.2-2026-AUG"
                    className="rp-input font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="rp-label">
                    Free Cancellation Window (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={freeCancellationHours}
                    onChange={(e) =>
                      setFreeCancellationHours(Number(e.target.value))
                    }
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>

                <div>
                  <label className="rp-label">Late Cancellation Fee (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={cancellationFeePercent}
                    onChange={(e) =>
                      setCancellationFeePercent(Number(e.target.value))
                    }
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="rp-label">
                    Late Return Grace Period (Minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={gracePeriodMinutes}
                    onChange={(e) =>
                      setGracePeriodMinutes(Number(e.target.value))
                    }
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>

                <div>
                  <label className="rp-label">Hourly Late Return Fee (₹/hr)</label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={hourlyLateFee}
                    onChange={(e) => setHourlyLateFee(Number(e.target.value))}
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>

                <div>
                  <label className="rp-label">Traffic Challan Handling Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={trafficFineHandlingFee}
                    onChange={(e) =>
                      setTrafficFineHandlingFee(Number(e.target.value))
                    }
                    className="rp-input font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="rp-btn rp-btn-primary px-6 py-2.5 text-xs"
              >
                <Save className="w-4 h-4" />
                <span>Save Marketplace Settings</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 3: Administrator Password Management */}
      {activeSubTab === 'security' && (
        <div className="p-6 sm:p-7 rounded-xl bg-white border border-[#E5E4DE] space-y-5">
          <div className="flex items-center gap-3 border-b border-[#E5E4DE] pb-4">
            <div className="w-9 h-9 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base text-[#202522]">
                Update Administrator Password
              </h2>
              <p className="text-xs text-[#70756F]">
                Passwords are salted and SHA-256 hashed on the backend.
              </p>
            </div>
          </div>

          {pwError && (
            <div className="p-3.5 rounded-lg bg-[#FCEEEE] border border-[#B44242]/25 text-[#8C2D2D] text-xs font-medium flex items-center gap-2 max-w-md">
              <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
              <span>{pwError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="rp-label">Current Password</label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                className="rp-input font-mono text-xs"
              />
            </div>

            <div>
              <label className="rp-label">New Password (min 6 characters)</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="rp-input font-mono text-xs"
              />
            </div>

            <div>
              <label className="rp-label">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="rp-input font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={pwLoading}
              className="rp-btn rp-btn-primary px-5 py-2.5 text-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{pwLoading ? 'Updating Password...' : 'Update Password'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Add / Edit Pickup Location Modal */}
      {showLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <h3 className="font-display font-semibold text-base text-[#202522]">
                {editingLoc ? 'Edit Pickup Hub' : 'Add Campus Pickup Hub'}
              </h3>
              <button
                type="button"
                onClick={() => setShowLocModal(false)}
                className="p-1.5 rounded-lg text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div>
                <label className="rp-label">Hub Display Name *</label>
                <input
                  type="text"
                  required
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  placeholder="e.g. ICFAI Main Gate"
                  className="rp-input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rp-label">Hub Code (3-5 chars)</label>
                  <input
                    type="text"
                    value={locCode}
                    onChange={(e) => setLocCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MAIN"
                    className="rp-input font-mono text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="rp-label">Contact Phone</label>
                  <input
                    type="text"
                    value={locPhone}
                    onChange={(e) => setLocPhone(e.target.value)}
                    placeholder="+91 91210 98765"
                    className="rp-input font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="rp-label">Landmark & Handover Instructions</label>
                <input
                  type="text"
                  value={locLandmark}
                  onChange={(e) => setLocLandmark(e.target.value)}
                  placeholder="e.g. Opposite University Security Post"
                  className="rp-input text-xs"
                />
              </div>

              <div>
                <label className="rp-label">Operating Hours</label>
                <input
                  type="text"
                  value={locHours}
                  onChange={(e) => setLocHours(e.target.value)}
                  placeholder="07:00 AM - 10:30 PM (Daily)"
                  className="rp-input text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="locActiveCheck"
                  checked={locActive}
                  onChange={(e) => setLocActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#29483B]"
                />
                <label
                  htmlFor="locActiveCheck"
                  className="text-xs text-[#202522] select-none cursor-pointer"
                >
                  Active for public bookings and student host listings
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-[#E5E4DE]">
                <button
                  type="button"
                  onClick={() => setShowLocModal(false)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={locSaving}
                  className="rp-btn rp-btn-primary px-5 py-2 text-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{locSaving ? 'Saving...' : 'Save Hub'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Revoke Administrator Confirmation Modal */}
      {revokingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FCEEEE] border border-[#B44242]/25 flex items-center justify-center text-[#B44242] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-semibold text-base text-[#202522]">
                  Revoke Administrator Privileges?
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Are you sure you want to revoke administrator access for{' '}
                  <strong className="font-mono text-[#202522]">{revokingAdmin.email}</strong>?
                  Their admin sessions will be immediately blocked on all protected server endpoints.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setRevokingAdmin(null)}
                disabled={revokeBusy}
                className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRevokeAdministrator}
                disabled={revokeBusy}
                className="rp-btn rp-btn-danger px-4 py-2 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{revokeBusy ? 'Revoking...' : 'Confirm Revoke'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Pickup Location Confirmation Modal */}
      {deletingLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FCEEEE] border border-[#B44242]/25 flex items-center justify-center text-[#B44242] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-semibold text-base text-[#202522]">
                  Remove Campus Pickup Hub?
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Are you sure you want to remove{' '}
                  <strong className="text-[#202522]">{deletingLoc.name}</strong> from
                  the list of campus pickup locations?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setDeletingLoc(null)}
                disabled={deleteLocBusy}
                className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteLocation}
                disabled={deleteLocBusy}
                className="rp-btn rp-btn-danger px-4 py-2 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteLocBusy ? 'Removing...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
