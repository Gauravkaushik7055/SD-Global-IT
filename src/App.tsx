import { useCallback, useEffect, useRef, useState } from 'react';
import { CreateTicketModal } from './components/CreateTicketModal.tsx';
import { Layout, NavTabId } from './components/Layout.tsx';
import { TicketDetailDrawer } from './components/TicketDetailDrawer.tsx';
import { ToastProvider, useToast } from './components/ToastContext.tsx';
import { apiFetch, getToken, getWebSocketUrl, onUnauthorized, setToken } from './lib/api.ts';
import { AssetsPage } from './pages/AssetsPage.tsx';
import { BudgetExpensesPage } from './pages/BudgetExpensesPage.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DropdownManagerPage } from './pages/DropdownManagerPage.tsx';
import { EmployeesPage } from './pages/EmployeesPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ModeratorsPage } from './pages/ModeratorsPage.tsx';
import { OrgVendorsPage } from './pages/OrgVendorsPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SessionsAuditPage } from './pages/SessionsAuditPage.tsx';
import { SettingsIntegrationsPage } from './pages/SettingsIntegrationsPage.tsx';
import { TicketsPage } from './pages/TicketsPage.tsx';
import { ChatMessage, NotificationItem, User } from './types.ts';

function AppShell() {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');

  const [dark, setDark] = useState(() => localStorage.getItem('logicore_theme') === 'dark');

  // Notifications & Real-time WS
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [incomingChatMessage, setIncomingChatMessage] = useState<ChatMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Modals & Drawers
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketRefreshTick, setTicketRefreshTick] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('logicore_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const handleLogout = useCallback(async () => {
    try {
      if (getToken()) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
      setMustResetPassword(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      setToken(null);
      setUser(null);
    });
  }, []);

  const loadNotificationsAndCounts = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [meRes, notifRes] = await Promise.all([
        apiFetch<{ user: User; unreadNotifications: number; unreadChat: number }>('/api/auth/me'),
        apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications'),
      ]);
      setUser(meRes.user);
      setMustResetPassword(Boolean(meRes.user.must_reset_password));
      setUnreadNotifications(notifRes.unreadCount);
      setUnreadChat(meRes.unreadChat);
      setNotifications(notifRes.notifications);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    loadNotificationsAndCounts().finally(() => setBootstrapping(false));
  }, [loadNotificationsAndCounts]);

  // WebSocket Connection with Reconnect
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const url = getWebSocketUrl();
      if (!url || cancelled) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as { event: string; payload: unknown };
          if (msg.event === 'ws:ready' || msg.event === 'presence:update') {
            const p = msg.payload as { onlineUserIds?: number[] };
            if (Array.isArray(p.onlineUserIds)) setOnlineUserIds(p.onlineUserIds);
          } else if (msg.event === 'notification:new') {
            const notif = msg.payload as NotificationItem;
            setNotifications((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
            setUnreadNotifications((c) => c + 1);
            showToast(`${notif.title}: ${notif.message}`, notif.type === 'critical' ? 'error' : 'info');
            setTicketRefreshTick((t) => t + 1);
          } else if (msg.event === 'chat:message') {
            const chatMsg = msg.payload as ChatMessage;
            setIncomingChatMessage(chatMsg);
            if (chatMsg.sender_id !== user.id) {
              setUnreadChat((c) => c + 1);
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [user, showToast]);

  const handleMarkNotifRead = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadNotifications((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotifRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadNotifications(0);
    } catch {
      // ignore
    }
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Initializing LogiCore IT Support CRM...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        onSuccess={(loggedInUser, mustReset) => {
          setUser(loggedInUser);
          setMustResetPassword(mustReset);
          setActiveTab('dashboard');
          loadNotificationsAndCounts();
        }}
      />
    );
  }

  return (
    <Layout
      user={user}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      dark={dark}
      onToggleDark={() => setDark((d) => !d)}
      notifications={notifications}
      unreadNotifications={unreadNotifications}
      unreadChat={unreadChat}
      onMarkNotifRead={handleMarkNotifRead}
      onMarkAllNotifRead={handleMarkAllNotifRead}
      onOpenTicketFromNotif={(id) => {
        setActiveTab('tickets');
        setSelectedTicketId(id);
      }}
      onRaiseTicket={() => setCreateTicketOpen(true)}
      onLogout={handleLogout}
      mustResetPassword={mustResetPassword}
      onPasswordChanged={(updated) => {
        setUser(updated);
        setMustResetPassword(false);
      }}
    >
      {activeTab === 'dashboard' && (
        <DashboardPage
          user={user}
          onRaiseTicket={() => setCreateTicketOpen(true)}
          onNavigateTickets={() => setActiveTab('tickets')}
        />
      )}
      {activeTab === 'tickets' && (
        <TicketsPage
          user={user}
          refreshTrigger={ticketRefreshTick}
          onOpenTicket={(id) => setSelectedTicketId(id)}
          onCreateTicket={() => setCreateTicketOpen(true)}
        />
      )}
      {activeTab === 'chat' && (user.role === 'super_admin' || user.role === 'moderator') && (
        <ChatPage
          user={user}
          onlineUserIds={onlineUserIds}
          incomingMessage={incomingChatMessage}
          onUnreadChange={loadNotificationsAndCounts}
        />
      )}
      {activeTab === 'moderators' && user.role === 'super_admin' && <ModeratorsPage />}
      {activeTab === 'employees' && user.role === 'super_admin' && <EmployeesPage />}
      {activeTab === 'assets' && user.role !== 'employee' && <AssetsPage user={user} />}
      {activeTab === 'budgets' && user.role !== 'employee' && <BudgetExpensesPage user={user} />}
      {activeTab === 'org' && (user.role === 'super_admin' || user.role === 'management') && (
        <OrgVendorsPage user={user} />
      )}
      {activeTab === 'reports' && (user.role === 'super_admin' || user.role === 'management') && <ReportsPage />}
      {activeTab === 'dropdowns' && user.role === 'super_admin' && <DropdownManagerPage />}
      {activeTab === 'integrations' && user.role === 'super_admin' && <SettingsIntegrationsPage />}
      {activeTab === 'sessions' && user.role === 'super_admin' && <SessionsAuditPage />}

      <CreateTicketModal
        open={createTicketOpen}
        user={user}
        onClose={() => setCreateTicketOpen(false)}
        onCreated={() => setTicketRefreshTick((t) => t + 1)}
      />

      <TicketDetailDrawer
        ticketId={selectedTicketId}
        user={user}
        onClose={() => setSelectedTicketId(null)}
        onUpdated={() => setTicketRefreshTick((t) => t + 1)}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
