import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CheckCheck,
  FileSpreadsheet,
  HardDrive,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { NotificationItem, User, UserRole } from '../types.ts';

export type NavTabId =
  | 'dashboard'
  | 'tickets'
  | 'chat'
  | 'moderators'
  | 'employees'
  | 'assets'
  | 'budgets'
  | 'org'
  | 'reports'
  | 'dropdowns'
  | 'integrations'
  | 'sessions';

interface NavItem {
  id: NavTabId;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

interface LayoutProps {
  user: User;
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  dark: boolean;
  onToggleDark: () => void;
  notifications: NotificationItem[];
  unreadNotifications: number;
  unreadChat: number;
  onMarkNotifRead: (id: number) => void;
  onMarkAllNotifRead: () => void;
  onOpenTicketFromNotif: (ticketId: number) => void;
  onRaiseTicket: () => void;
  onLogout: () => void;
  mustResetPassword: boolean;
  onPasswordChanged: (u: User) => void;
  children: React.ReactNode;
}

export function Layout({
  user,
  activeTab,
  onSelectTab,
  dark,
  onToggleDark,
  notifications,
  unreadNotifications,
  unreadChat,
  onMarkNotifRead,
  onMarkAllNotifRead,
  onOpenTicketFromNotif,
  onRaiseTicket,
  onLogout,
  mustResetPassword,
  onPasswordChanged,
  children,
}: LayoutProps) {
  const { showToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const ticketLabel =
    user.role === 'employee'
      ? 'My Tickets'
      : user.role === 'moderator'
      ? 'Assigned Tasks'
      : 'Work & Task Queue';

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'moderator', 'employee', 'management'] },
    { id: 'tickets', label: ticketLabel, icon: Ticket, roles: ['super_admin', 'moderator', 'employee', 'management'] },
    { id: 'chat', label: 'Direct Chat', icon: MessageSquare, roles: ['super_admin', 'moderator'] },
    { id: 'moderators', label: 'Moderators & Access', icon: ShieldCheck, roles: ['super_admin'] },
    { id: 'employees', label: 'Employee & HR', icon: Users, roles: ['super_admin'] },
    { id: 'assets', label: 'IT Assets', icon: HardDrive, roles: ['super_admin', 'moderator', 'management'] },
    { id: 'budgets', label: 'Budget & Expenses', icon: IndianRupee, roles: ['super_admin', 'moderator', 'management'] },
    { id: 'org', label: 'Hubs & Vendors', icon: Building2, roles: ['super_admin', 'management'] },
    { id: 'reports', label: 'Reports & Exports', icon: FileSpreadsheet, roles: ['super_admin', 'management'] },
    { id: 'dropdowns', label: 'Dropdown Manager', icon: ListChecks, roles: ['super_admin'] },
    { id: 'integrations', label: 'SLA & Integrations', icon: Settings, roles: ['super_admin'] },
    { id: 'sessions', label: 'Sessions & Audit', icon: Activity, roles: ['super_admin'] },
  ];

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));
  const activeItem = visibleNav.find((i) => i.id === activeTab) || visibleNav[0];

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showToast('Password updated successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setPwModalOpen(false);
      onPasswordChanged(res.user);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-64">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <BrandLogo />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'chat' && unreadChat > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                    active ? 'bg-white text-blue-700' : 'bg-blue-700 text-white'
                  }`}
                >
                  {unreadChat}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="px-2 py-1.5">
          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.full_name}</div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
            {user.role.replace('_', ' ')} · {user.location_code || 'HQ'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {user.email && (
            <button
              type="button"
              onClick={() => setPwModalOpen(true)}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1"
            >
              <KeyRound className="w-3 h-3" /> Password
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1"
          >
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline font-medium">LogiCore</span>
              <span className="hidden sm:inline">/</span>
              <span className="font-display font-semibold text-sm text-slate-900 dark:text-white truncate">
                {activeItem?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {user.role !== 'management' && (
              <button
                type="button"
                onClick={onRaiseTicket}
                className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Raise Ticket</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 relative"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold">Notifications</span>
                    <button
                      type="button"
                      onClick={onMarkAllNotifRead}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">All caught up!</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            onMarkNotifRead(n.id);
                            if (n.link_type === 'ticket' && Number(n.link_id)) {
                              onOpenTicketFromNotif(Number(n.link_id));
                              setNotifOpen(false);
                            }
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                            !n.is_read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`font-semibold ${
                                n.type === 'critical'
                                  ? 'text-red-600'
                                  : n.type === 'warning'
                                  ? 'text-amber-600'
                                  : n.type === 'success'
                                  ? 'text-emerald-600'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {n.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(n.created_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      {/* Change Password / Forced Reset Modal */}
      {(pwModalOpen || mustResetPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handlePasswordSubmit}
            className="w-full max-w-md p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">
                {mustResetPassword ? 'Password Reset Required' : 'Change Password'}
              </h2>
              {!mustResetPassword && (
                <button type="button" onClick={() => setPwModalOpen(false)} className="text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {mustResetPassword && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg">
                Your administrator requires you to set a new password before continuing.
              </p>
            )}
            {!mustResetPassword && (
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            )}
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2">
              {!mustResetPassword && (
                <button
                  type="button"
                  onClick={() => setPwModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
              )}
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
