import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, ChevronDown, ClipboardList, FileBarChart, HeartPulse, LayoutDashboard,
  LogOut, Menu, Moon, Package, Pill, Search, Settings, ShieldCheck, Stethoscope,
  Sun, UserRound, Users, X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { getNotifications, markNotificationRead } from '../services/emr';
import { supabase } from '../lib/supabase';
import { formatDateTime, initials } from '../utils/format';
import { Badge, Button } from '../components/UI';

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', permission: 'dashboard.view' },
  { label: 'Patients', icon: Users, permission: 'patients.view', children: [
    { label: 'All Patients', to: '/patients', permission: 'patients.view' },
    { label: 'Register Patient', to: '/patients/new', permission: 'patients.create' }
  ] },
  { label: 'Visits', icon: ClipboardList, permission: 'visits.view', children: [
    { label: 'Register Visit', to: '/visits/new', permission: 'visits.create' },
    { label: 'Visit History', to: '/visits', permission: 'visits.view' }
  ] },
  { label: 'Consultations', icon: Stethoscope, to: '/consultations', permission: 'consultations.view' },
  { label: 'Medicines', icon: Pill, permission: 'medicines.view', children: [
    { label: 'Inventory', to: '/medicines', permission: 'medicines.view' },
    { label: 'Issuance', to: '/medicine-issuance', permission: 'issuance.create' },
    { label: 'Issuance History', to: '/medicine-issuance/history', permission: 'issuance.view' }
  ] },
  { label: 'Staff Management', icon: ShieldCheck, to: '/staff', permission: 'staff.view' },
  { label: 'Reports', icon: FileBarChart, to: '/reports', permission: 'reports.view' },
  { label: 'Activity Logs', icon: Activity, to: '/activity', permission: 'activity.view' },
  { label: 'Settings', icon: Settings, to: '/settings', permission: 'settings.view' }
];

function SidebarContent({ close }) {
  const { profile, hasPermission, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(() => new Set(['Patients', 'Visits', 'Medicines']));

  const logout = async () => {
    try { await signOut(); navigate('/login'); }
    catch (error) { toast(error.message, 'error'); }
  };

  const toggle = label => setExpanded(current => {
    const next = new Set(current); next.has(label) ? next.delete(label) : next.add(label); return next;
  });

  return <div className="flex h-full flex-col bg-slate-950 text-slate-200">
    <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-clinic-teal shadow-lg shadow-primary-500/20"><HeartPulse className="h-6 w-6 text-white" /></div>
      <div><p className="font-bold text-white">School Clinic EMR</p><p className="text-xs text-slate-400">Secure health records</p></div>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
      {navigation.map(item => {
        if (!hasPermission(item.permission)) return null;
        const Icon = item.icon;
        if (item.children) {
          const visible = item.children.filter(child => hasPermission(child.permission));
          if (!visible.length) return null;
          const active = visible.some(child => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
          return <div key={item.label}>
            <button onClick={() => toggle(item.label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="h-5 w-5" /><span className="flex-1 text-left">{item.label}</span><ChevronDown className={`h-4 w-4 transition ${expanded.has(item.label) ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>{expanded.has(item.label) && <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="ml-5 overflow-hidden border-l border-white/10 pl-4">
              {visible.map(child => <NavLink key={child.to} to={child.to} onClick={close} className={({isActive}) => `mt-1 block rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-primary-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{child.label}</NavLink>)}
            </motion.div>}</AnimatePresence>
          </div>;
        }
        return <NavLink key={item.to} to={item.to} onClick={close} className={({isActive}) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon className="h-5 w-5" />{item.label}</NavLink>;
      })}
    </nav>
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 p-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-500/20 font-bold text-primary-300">{initials(profile?.full_name)}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{profile?.full_name}</p><p className="truncate text-xs text-slate-400">{profile?.role_name}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs hover:bg-white/10">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Theme</button>
        <button onClick={logout} className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs hover:bg-red-500/20 hover:text-red-300"><LogOut className="h-4 w-4" /> Logout</button>
      </div>
    </div>
  </div>;
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const unread = notifications.filter(item => !item.is_read).length;
  const loadNotifications = async () => { try { setNotifications(await getNotifications()); } catch (error) { console.error(error); } };
  useEffect(() => { loadNotifications(); const channel = supabase.channel('emr-notifications').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, loadNotifications).subscribe(); return () => { supabase.removeChannel(channel); }; }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const readNotification = async item => {
    try { if (!item.is_read) await markNotificationRead(item.id); await loadNotifications(); if (item.link) navigate(item.link); setNotificationsOpen(false); }
    catch (error) { toast(error.message, 'error'); }
  };

  const pageName = useMemo(() => {
    const all = navigation.flatMap(item => item.children || [item]);
    return all.find(item => location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(`${item.to}/`)))?.label || 'School Clinic EMR';
  }, [location.pathname]);

  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block"><SidebarContent /></aside>
    <AnimatePresence>{mobileOpen && <><motion.div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setMobileOpen(false)} /><motion.aside className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden" initial={{x:-300}} animate={{x:0}} exit={{x:-300}}><button className="absolute right-3 top-3 z-10 rounded-lg bg-white/10 p-2" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button><SidebarContent close={() => setMobileOpen(false)} /></motion.aside></>}</AnimatePresence>
    <div className="lg:pl-72">
      <header className="no-print sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 sm:px-6">
        <div className="flex items-center gap-3"><button className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-6 w-6" /></button><div><p className="text-xs font-medium uppercase tracking-widest text-primary-600">School Health Services</p><h1 className="text-lg font-bold">{pageName}</h1></div></div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/patients')} className="hidden rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 sm:block" title="Search patients"><Search className="h-5 w-5" /></button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          <div className="relative"><button onClick={() => setNotificationsOpen(v => !v)} className="relative rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="Notifications"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}</button>
            <AnimatePresence>{notificationsOpen && <motion.div className="absolute right-0 mt-3 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}>
              <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"><h3 className="font-bold">Notifications</h3>{unread > 0 && <Badge tone="red">{unread} unread</Badge>}</div><div className="max-h-[440px] overflow-y-auto">{notifications.length ? notifications.map(item => <button key={item.id} onClick={() => readNotification(item)} className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${!item.is_read ? 'bg-primary-50/70 dark:bg-primary-950/25' : ''}`}><div className="flex gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === 'critical' ? 'bg-red-500' : item.severity === 'warning' ? 'bg-amber-500' : 'bg-primary-500'}`} /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p><p className="mt-1 text-[11px] text-slate-400">{formatDateTime(item.created_at)}</p></div></div></button>) : <div className="p-8 text-center text-sm text-slate-500">No notifications.</div>}</div>
            </motion.div>}</AnimatePresence>
          </div>
          <button onClick={() => navigate('/settings')} className="ml-1 hidden items-center gap-2 rounded-xl border border-slate-200 p-1.5 pr-3 dark:border-slate-700 sm:flex"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-300">{initials(profile?.full_name)}</span><span className="max-w-28 truncate text-xs font-semibold">{profile?.full_name}</span></button>
        </div>
      </header>
      <main className="p-4 sm:p-6 xl:p-8"><motion.div key={location.pathname} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.22}}><Outlet /></motion.div></main>
    </div>
  </div>;
}
