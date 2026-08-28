import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, ClipboardCheck, HeartPulse, PackageX, Stethoscope, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { Card, EmptyState, Spinner } from '../components/UI';
import { getDashboard } from '../services/emr';
import { formatDateTime, safeNumber } from '../utils/format';

const cardConfig = [
  ['total_students','Total Students',Users,'text-primary-600 bg-primary-100 dark:bg-primary-950'],
  ['visits_today','Clinic Visits Today',CalendarDays,'text-cyan-600 bg-cyan-100 dark:bg-cyan-950'],
  ['patients_seen_today','Patients Seen Today',ClipboardCheck,'text-emerald-600 bg-emerald-100 dark:bg-emerald-950'],
  ['pending_consultations','Pending Consultations',Stethoscope,'text-amber-600 bg-amber-100 dark:bg-amber-950'],
  ['low_stock_medicines','Low Stock Medicines',PackageX,'text-orange-600 bg-orange-100 dark:bg-orange-950'],
  ['critical_cases','Critical / Flagged Cases',AlertTriangle,'text-red-600 bg-red-100 dark:bg-red-950']
];

export default function DashboardPage(){
  const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{getDashboard().then(data=>setState({loading:false,data,error:''})).catch(error=>setState({loading:false,data:null,error:error.message}));},[]);
  if(state.loading)return <Spinner label="Preparing clinic dashboard…"/>;
  if(state.error)return <EmptyState title="Dashboard unavailable" description={state.error}/>;
  const {summary,analytics,complaints,usage,activity}=state.data;
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="page-title">Clinic overview</h2><p className="muted mt-1">Live operational data from your Supabase project.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">● Database connected</span></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{cardConfig.map(([key,label,Icon,tone],i)=><motion.div key={key} initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:i*.05}}><Card className="h-full p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-2xl ${tone}`}><Icon className="h-5 w-5"/></div><p className="text-2xl font-extrabold">{safeNumber(summary[key]).toLocaleString()}</p><p className="mt-1 text-xs font-medium text-slate-500">{label}</p></Card></motion.div>)}</div>
    <div className="grid gap-6 xl:grid-cols-3"><Card className="p-5 xl:col-span-2"><div className="mb-5"><h3 className="font-bold">Visit analytics</h3><p className="muted">Clinic volume over the selected monthly window</p></div><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics}><defs><linearGradient id="visitGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3994f0" stopOpacity={.4}/><stop offset="95%" stopColor="#3994f0" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" opacity={.15}/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area type="monotone" dataKey="visits" stroke="#3994f0" strokeWidth={3} fill="url(#visitGradient)"/></AreaChart></ResponsiveContainer></div></Card>
      <Card className="p-5"><h3 className="font-bold">Common complaints</h3><p className="muted mb-4">Most frequent reasons for clinic visits</p>{complaints.length?<div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={complaints} layout="vertical" margin={{left:5,right:8}}><CartesianGrid strokeDasharray="3 3" opacity={.12}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="complaint" width={90} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#0f9f98" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>:<EmptyState title="No complaint data"/>}</Card></div>
    <div className="grid gap-6 xl:grid-cols-5"><Card className="p-5 xl:col-span-2"><h3 className="font-bold">Medicine usage</h3><p className="muted mb-4">Most issued medicines by quantity</p>{usage.length?<div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={usage} dataKey="quantity" nameKey="medicine" innerRadius={55} outerRadius={95} paddingAngle={3}>{usage.map((_,i)=><Cell key={i} fill={['#3994f0','#0f9f98','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#64748b'][i%8]}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" height={44}/></PieChart></ResponsiveContainer></div>:<EmptyState title="No issuance data"/>}</Card>
      <Card className="p-5 xl:col-span-3"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950"><HeartPulse className="h-5 w-5"/></div><div><h3 className="font-bold">Recent activity</h3><p className="muted">Latest audited system events</p></div></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{activity.length?activity.map(item=><div key={item.id} className="flex gap-3 py-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.actor_name || 'System'} · {item.action?.replaceAll('_',' ')}</p><p className="truncate text-xs text-slate-500">{item.description}</p></div><time className="whitespace-nowrap text-[11px] text-slate-400">{formatDateTime(item.created_at)}</time></div>):<EmptyState title="No recent activity"/>}</div></Card></div>
  </div>;
}
