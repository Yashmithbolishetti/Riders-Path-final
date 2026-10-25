import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Search, RefreshCw } from 'lucide-react';

export const AdminUsers: React.FC = () => {
  const { showToast } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'student' | 'owner'>('ALL');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
      showToast('Failed to load student directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await api.updateUserStatus(userId, newStatus);
      showToast('Student verification status updated.', 'success');
      fetchUsers();
    } catch (err) {
      showToast('Failed to update student status', 'error');
    }
  };

  const filteredUsers = (users || []).filter((u) => {
    if (!u) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.icfaiEnrollmentNumber || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(search) ||
        (u.course || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            ICFAI Student & Host Directory
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            Registered student renters and vehicle hosts across the ICFAI Hyderabad campus community.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#70756F] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search enrollment, name, course..."
              aria-label="Search student directory"
              className="rp-input pl-9 py-2 text-xs w-full sm:w-64"
            />
          </div>
          <button
            onClick={fetchUsers}
            className="rp-btn rp-btn-secondary px-3.5 py-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
        {[
          { id: 'ALL' as const, label: `All Members (${users.length})` },
          {
            id: 'student' as const,
            label: `Student Renters (${
              users.filter((u) => u.role === 'student').length
            })`,
          },
          {
            id: 'owner' as const,
            label: `Vehicle Hosts (${
              users.filter((u) => u.role === 'owner').length
            })`,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setRoleFilter(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
              roleFilter === t.id
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522] hover:bg-[#F7F6F2]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rp-table-container">
        <div className="overflow-x-auto">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Student Name & Program</th>
                <th>ICFAI Enrollment ID</th>
                <th>Role</th>
                <th>Contact Details</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-right">Access Control</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    Loading student directory...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    No students found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="font-semibold text-[#202522] block">
                        {u.fullName}
                      </span>
                      {(u.academicYear || u.course) && (
                        <span className="text-[11px] text-[#70756F] block">
                          {[u.academicYear, u.course].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>

                    <td className="font-mono text-[#29483B] font-semibold">
                      {u.icfaiEnrollmentNumber}
                    </td>

                    <td>
                      <span className="text-xs font-mono uppercase text-[#70756F]">
                        {u.role === 'owner' ? 'Bike Host' : 'Student Renter'}
                      </span>
                    </td>

                    <td>
                      <span className="block text-[#202522] font-mono text-xs">
                        {u.phone}
                      </span>
                      <span className="text-[11px] text-[#70756F] block">
                        {u.email}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`rp-status text-[10px] uppercase ${
                          u.verificationStatus === 'verified'
                            ? 'rp-status-approved'
                            : u.verificationStatus === 'suspended'
                            ? 'rp-status-rejected'
                            : 'rp-status-pending'
                        }`}
                      >
                        {u.verificationStatus}
                      </span>
                    </td>

                    <td className="text-[#70756F] font-mono text-xs tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="text-right">
                      <select
                        value={u.verificationStatus}
                        onChange={(e) => handleStatusChange(u.id, e.target.value)}
                        aria-label={`Update status for ${u.fullName}`}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] text-xs text-[#202522] focus:outline-none focus:border-[#29483B] cursor-pointer"
                      >
                        <option value="verified">Verified</option>
                        <option value="pending">Pending</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
