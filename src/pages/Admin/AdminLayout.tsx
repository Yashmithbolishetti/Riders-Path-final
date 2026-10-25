import React from 'react';
import {
  LayoutDashboard,
  Bike,
  CalendarCheck,
  FileSpreadsheet,
  Users,
  Settings,
  LogOut,
  ArrowLeft,
  UserCheck,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AdminTab =
  | 'dashboard'
  | 'bikes'
  | 'bookings'
  | 'verifications'
  | 'approvals'
  | 'locations'
  | 'users'
  | 'admins'
  | 'settings';

interface AdminLayoutProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onExitAdmin: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onExitAdmin,
  children,
}) => {
  const { logoutAdmin, adminEmail, adminRole, isSuperAdmin } = useAuth();

  const navItems: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'verifications', label: 'Verifications', icon: FileSpreadsheet },
    { id: 'approvals', label: 'Approvals', icon: UserCheck },
    { id: 'bikes', label: 'Bikes', icon: Bike },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'users', label: 'Students', icon: Users },
    { id: 'admins', label: 'Admin Access', icon: ShieldCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = () => {
    logoutAdmin();
    onExitAdmin();
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F6F2]">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-[#E5E4DE] p-5 shrink-0">
        <div className="flex items-center gap-2.5 px-2 pb-5 border-b border-[#E5E4DE]">
          <div className="w-8 h-8 rounded-lg bg-[#29483B] flex items-center justify-center text-white">
            <Bike className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-display font-bold text-sm text-[#202522] block leading-none">
              RIDERS PATH
            </span>
            <span className="text-[11px] font-medium text-[#70756F] mt-0.5 block">
              {isSuperAdmin ? 'Super Admin Console' : 'Admin Console'}
            </span>
          </div>
        </div>

        {adminEmail && (
          <div className="mt-3 px-2.5 py-2 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#70756F]">
                Signed In Role
              </span>
              <span
                className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                  isSuperAdmin
                    ? 'bg-[#29483B] text-white'
                    : 'bg-[#EAF2EE] text-[#29483B] border border-[#29483B]/20'
                }`}
              >
                {adminRole === 'super_admin' ? 'SUPER ADMIN' : 'ADMIN'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#202522] truncate" title={adminEmail}>
              {adminEmail}
            </p>
          </div>
        )}

        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#29483B] text-white'
                    : 'text-[#4E544F] hover:text-[#202522] hover:bg-[#EFEEE8]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-[#E5E4DE] space-y-1">
          <button
            onClick={onExitAdmin}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#4E544F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>View Public Site</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#B44242] hover:bg-[#FCEEEE] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Nav */}
      <div className="lg:hidden bg-white border-b border-[#E5E4DE] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#29483B] flex items-center justify-center text-white">
              <Bike className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-display font-bold text-sm text-[#202522] block leading-none">
                RIDERS PATH ADMIN
              </span>
              {adminEmail && (
                <span className="text-[10px] font-mono text-[#70756F]">
                  {adminEmail} ({isSuperAdmin ? 'Super Admin' : 'Admin'})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onExitAdmin}
              className="px-2.5 py-1.5 rounded-md bg-[#EFEEE8] text-xs font-medium text-[#202522]"
            >
              Exit
            </button>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-md bg-[#FCEEEE] text-xs font-medium text-[#B44242]"
            >
              Sign Out
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-[#29483B] text-white' : 'bg-[#F7F6F2] text-[#4E544F]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-5 sm:p-8 lg:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};
