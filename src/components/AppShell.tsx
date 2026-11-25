import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  FileBarChart2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { cn, formatDateShort } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';

export type ModuleKey =
  | 'dashboard'
  | 'students'
  | 'staff'
  | 'academics'
  | 'examinations'
  | 'finance'
  | 'attendance'
  | 'timetable'
  | 'communication'
  | 'reports'
  | 'administration';

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { key: 'students', label: 'Students', icon: GraduationCap, permission: 'students.view' },
  { key: 'staff', label: 'Staff & HR', icon: UserCheck, permission: 'staff.view' },
  { key: 'academics', label: 'Academics', icon: BookOpen, permission: 'academics.view' },
  { key: 'examinations', label: 'Examinations', icon: CheckSquare, permission: 'exams.view' },
  { key: 'finance', label: 'Finance & Fees', icon: Wallet, permission: 'finance.view' },
  { key: 'attendance', label: 'Attendance', icon: Users, permission: 'attendance.view' },
  { key: 'timetable', label: 'Timetable', icon: CalendarClock, permission: 'timetable.view' },
  { key: 'communication', label: 'Communication', icon: MessageSquare, permission: 'comms.view' },
  { key: 'reports', label: 'Reports', icon: FileBarChart2, permission: 'reports.view' },
  { key: 'administration', label: 'System & Security', icon: Shield, permission: 'admin.users' },
];

interface AppShellProps {
  activeModule: ModuleKey;
  onSelectModule: (key: ModuleKey) => void;
  breadcrumbDetail?: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeModule,
  onSelectModule,
  breadcrumbDetail,
  children,
}) => {
  const { user, schoolSettings, currentYear, currentTerm, unreadNotificationsCount, logout, hasPermission } =
    useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    students: Array<{ id: number; admissionNumber: string; firstName: string; lastName: string }>;
    staff: Array<{ id: number; employeeNumber: string; firstName: string; lastName: string; designation: string }>;
    receipts: Array<{ id: number; receiptNumber: string; amount: string }>;
  } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Array<{ id: number; title: string; message: string; isRead: boolean; createdAt: string }>>([]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
      } catch {
        // ignore search errors
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      try {
        const rows = await apiFetch('/api/notifications');
        setNotifs(rows);
      } catch {
        // ignore
      }
    }
  };

  const markNotifRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.key === 'administration') {
      return hasPermission('admin.users') || hasPermission('admin.settings') || hasPermission('admin.audit');
    }
    return !item.permission || hasPermission(item.permission);
  });

  const activeNav = NAV_ITEMS.find((n) => n.key === activeModule);

  const SidebarContent = (
    <div className="flex h-full flex-col bg-[#0F2557] text-slate-100">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <img
          src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
          alt="Milo Boys Crest"
          referrerPolicy="no-referrer"
          className="h-9 w-9 rounded object-cover bg-white p-0.5 shrink-0"
        />
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-white truncate">
            {schoolSettings?.schoolName || 'MILO BOYS'}
          </div>
          <div className="text-[11px] text-blue-200 truncate">
            {currentYear?.name || '2026'} · {currentTerm?.name || 'Term 2'}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                onSelectModule(item.key);
                setMobileOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md bg-white/5">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.fullName?.slice(0, 2).toUpperCase() || 'MB'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
            <p className="text-[11px] text-blue-200 truncate">{user?.roleName}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#09111E] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 no-print">
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 text-white p-1 rounded hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded-md border border-slate-200 dark:border-slate-700"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="font-semibold text-[#0F2557] dark:text-blue-400 whitespace-nowrap">
                MILO BOYS
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                {activeNav?.label || 'Dashboard'}
              </span>
              {breadcrumbDetail && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 hidden sm:inline" />
                  <span className="text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                    {breadcrumbDetail}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Global Search */}
            <div className="relative hidden md:block w-64">
              <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students, staff, receipts..."
                className="pl-8 h-8 text-xs"
              />
              {searchResults && (
                <div className="absolute left-0 right-0 top-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 z-50 space-y-2 max-h-80 overflow-y-auto">
                  {searchResults.students.length === 0 &&
                    searchResults.staff.length === 0 &&
                    searchResults.receipts.length === 0 && (
                      <p className="text-xs text-slate-500 p-2">No matching records found.</p>
                    )}
                  {searchResults.students.map((s) => (
                    <button
                      key={`stu-${s.id}`}
                      onClick={() => {
                        onSelectModule('students');
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between"
                    >
                      <span className="font-medium">{s.firstName} {s.lastName}</span>
                      <span className="font-mono text-slate-500">{s.admissionNumber}</span>
                    </button>
                  ))}
                  {searchResults.staff.map((st) => (
                    <button
                      key={`stf-${st.id}`}
                      onClick={() => {
                        onSelectModule('staff');
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between"
                    >
                      <span className="font-medium">{st.firstName} {st.lastName}</span>
                      <span className="text-slate-500">{st.designation}</span>
                    </button>
                  ))}
                  {searchResults.receipts.map((rcp) => (
                    <button
                      key={`rcp-${rcp.id}`}
                      onClick={() => {
                        onSelectModule('finance');
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between"
                    >
                      <span className="font-mono font-medium">{rcp.receiptNumber}</span>
                      <span className="font-mono text-slate-500">KES {rcp.amount}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleNotifications}
                aria-label="Notifications"
                className="relative h-8 w-8"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#1D4ED8] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotificationsCount}
                  </span>
                )}
              </Button>
              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 z-50 space-y-2 max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-semibold">Notifications</span>
                    <button onClick={() => setNotifOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
                      Close
                    </button>
                  </div>
                  {notifs.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">No recent notifications.</p>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotifRead(n.id)}
                        className={cn(
                          'p-2 rounded text-xs cursor-pointer border',
                          n.isRead
                            ? 'border-transparent text-slate-500'
                            : 'border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 text-slate-900 dark:text-slate-100'
                        )}
                      >
                        <p className="font-semibold">{n.title}</p>
                        <p className="text-[11px] mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{formatDateShort(n.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Theme Switch */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle light or dark theme"
              className="h-8 w-8"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {hasPermission('admin.settings') && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onSelectModule('administration')}
                aria-label="System settings"
                className="h-8 w-8 hidden sm:inline-flex"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={logout} className="h-8 px-2.5 text-xs">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
