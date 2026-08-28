import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, HeartPulse, LockKeyhole, Mail, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import MedicalScene from '../components/MedicalScene';
import { Button, Input, Modal } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [form, setForm] = useState({ login: '', password: '', remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryState, setRecoveryState] = useState({ loading: false, message: '' });
  const { signIn, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user]);

  const submit = async event => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (!form.login.trim() || !form.password) throw new Error('Enter your username/email and password.');
      localStorage.setItem('school-emr-session-mode', form.remember ? 'persistent' : 'session');
      if (!form.remember) sessionStorage.setItem('school-emr-session-active', '1');
      await signIn(form.login, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err.message.includes('Invalid login') ? 'Invalid username/email or password.' : err.message); }
    finally { setLoading(false); }
  };

  const recover = async event => {
    event.preventDefault(); setRecoveryState({loading:true,message:''});
    try {
      if (!recoveryEmail.includes('@')) throw new Error('Enter the email assigned to your account.');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(recoveryEmail, { redirectTo: `${window.location.origin}/reset-password` });
      if (resetError) throw resetError;
      setRecoveryState({loading:false,message:'If the email is registered, a password-recovery link has been sent.'});
    } catch (err) { setRecoveryState({loading:false,message:err.message}); }
  };

  return <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-sky-50 to-teal-50 dark:from-slate-950 dark:via-[#071a2d] dark:to-[#06221f]">
    <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_1px_1px,rgba(56,189,248,.18)_1px,transparent_0)] [background-size:28px_28px]" />
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="absolute right-5 top-5 z-20 rounded-2xl border border-white/40 bg-white/70 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/70" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
    <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
      <section className="hidden items-center justify-center p-10 lg:flex"><div className="max-w-xl"><div className="mb-7 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-clinic-teal text-white shadow-glow"><HeartPulse /></div><div><p className="text-xl font-bold">School Clinic EMR</p><p className="text-sm text-slate-500 dark:text-slate-400">Care, records, and insight in one secure workspace</p></div></div><MedicalScene className="h-[390px] w-full" /><div className="grid grid-cols-3 gap-3"><div className="glass rounded-2xl p-4"><ShieldCheck className="mb-2 h-5 w-5 text-primary-500" /><p className="text-sm font-bold">RLS Protected</p><p className="mt-1 text-xs text-slate-500">Permissions enforced in PostgreSQL.</p></div><div className="glass rounded-2xl p-4"><UserRound className="mb-2 h-5 w-5 text-clinic-teal" /><p className="text-sm font-bold">Student Focused</p><p className="mt-1 text-xs text-slate-500">Complete longitudinal clinic records.</p></div><div className="glass rounded-2xl p-4"><HeartPulse className="mb-2 h-5 w-5 text-emerald-500" /><p className="text-sm font-bold">Clinic Ready</p><p className="mt-1 text-xs text-slate-500">Visits, medicines, and reports.</p></div></div></div></section>
      <section className="flex items-center justify-center p-5 sm:p-10"><motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} className="glass w-full max-w-md rounded-[28px] p-6 shadow-2xl sm:p-8"><div className="mb-7 lg:hidden"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary-600 text-white"><HeartPulse /></div><h1 className="text-2xl font-bold">School Clinic EMR</h1></div><p className="text-xs font-bold uppercase tracking-[.2em] text-primary-600">Authorized personnel only</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Welcome back</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sign in with your assigned username or email.</p>
        <form onSubmit={submit} className="mt-7 space-y-4"><Input label="Username or email" icon={Mail} value={form.login} onChange={e => setForm({...form,login:e.target.value})} autoComplete="username" placeholder="nurse.maria or nurse@school.edu" required /><label className="block"><span className="form-label">Password <span className="text-red-500">*</span></span><div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={showPassword?'text':'password'} className="input-base px-10" value={form.password} onChange={e => setForm({...form,password:e.target.value})} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Show or hide password">{showPassword?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></label><div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.remember} onChange={e=>setForm({...form,remember:e.target.checked})} className="h-4 w-4 rounded border-slate-300 text-primary-600" />Remember session</label><button type="button" onClick={()=>setForgotOpen(true)} className="text-sm font-semibold text-primary-600 hover:underline">Forgot password?</button></div>{error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}<Button type="submit" size="lg" loading={loading} className="w-full">Sign in securely</Button></form>
        <p className="mt-6 text-center text-xs text-slate-400">Medical information is confidential. All access is audited.</p></motion.div></section>
    </div>
    <Modal open={forgotOpen} onClose={()=>setForgotOpen(false)} title="Recover password" size="sm"><form onSubmit={recover} className="space-y-4"><p className="text-sm text-slate-500">Enter the email assigned to your staff account. Recovery links use Supabase Auth.</p><Input label="Account email" type="email" value={recoveryEmail} onChange={e=>setRecoveryEmail(e.target.value)} required />{recoveryState.message&&<p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{recoveryState.message}</p>}<Button type="submit" loading={recoveryState.loading} className="w-full">Send recovery link</Button></form></Modal>
  </div>;
}
