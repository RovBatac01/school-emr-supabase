import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, LockKeyhole } from 'lucide-react';
import { Button, Card, Input } from '../components/UI';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [state, setState] = useState({loading:false,error:''}); const navigate=useNavigate();
  const submit=async e=>{e.preventDefault();setState({loading:true,error:''});try{if(password.length<10)throw new Error('Use at least 10 characters.');if(password!==confirm)throw new Error('Passwords do not match.');const {error}=await supabase.auth.updateUser({password});if(error)throw error;await supabase.rpc('clear_temporary_password_flag');navigate('/dashboard');}catch(err){setState({loading:false,error:err.message});}};
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-5 dark:bg-slate-950"><Card className="w-full max-w-md p-7"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary-600 text-white"><HeartPulse/></div><h1 className="text-2xl font-bold">Set a new password</h1><p className="mt-2 text-sm text-slate-500">Choose a strong password that you do not use elsewhere.</p><form onSubmit={submit} className="mt-6 space-y-4"><Input label="New password" type="password" icon={LockKeyhole} value={password} onChange={e=>setPassword(e.target.value)} required /><Input label="Confirm password" type="password" icon={LockKeyhole} value={confirm} onChange={e=>setConfirm(e.target.value)} required />{state.error&&<p className="text-sm text-red-500">{state.error}</p>}<Button type="submit" loading={state.loading} className="w-full">Update password</Button></form></Card></div>;
}
