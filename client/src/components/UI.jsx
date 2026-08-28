import { Loader2, X, Search, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', type = 'button', ...props }) {
  const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' };
  return (
    <button type={type} disabled={loading || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export const Card = ({ children, className = '', ...props }) => <div className={`surface ${className}`} {...props}>{children}</div>;

export function Input({ label, error, icon: Icon, className = '', ...props }) {
  return <label className="block"><span className="form-label">{label}{props.required && <span className="ml-1 text-red-500">*</span>}</span><div className="relative">{Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}<input className={`input-base ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : ''} ${className}`} {...props} /></div>{error && <span className="mt-1 block text-xs text-red-500">{error}</span>}</label>;
}

export function Select({ label, error, children, className = '', ...props }) {
  return <label className="block"><span className="form-label">{label}{props.required && <span className="ml-1 text-red-500">*</span>}</span><select className={`input-base ${error ? 'border-red-500' : ''} ${className}`} {...props}>{children}</select>{error && <span className="mt-1 block text-xs text-red-500">{error}</span>}</label>;
}

export function Textarea({ label, error, className = '', ...props }) {
  return <label className="block"><span className="form-label">{label}{props.required && <span className="ml-1 text-red-500">*</span>}</span><textarea className={`input-base min-h-24 resize-y ${error ? 'border-red-500' : ''} ${className}`} {...props} />{error && <span className="mt-1 block text-xs text-red-500">{error}</span>}</label>;
}

export function Badge({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', purple: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate} ${className}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, size = 'lg', footer }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-7xl' };
  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
    <motion.div role="dialog" aria-modal="true" aria-label={title} className={`surface max-h-[92vh] w-full overflow-hidden ${sizes[size]}`} initial={{opacity:0, y:20, scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:12,scale:.98}}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800"><h2 className="text-lg font-bold">{title}</h2><button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
      <div className="max-h-[calc(92vh-130px)] overflow-y-auto p-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">{footer}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>;
}

export const Spinner = ({ label = 'Loading…' }) => <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-primary-500" /><span className="text-sm">{label}</span></div>;
export const EmptyState = ({ title = 'No records found', description = 'There is nothing to display yet.', action }) => <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><Inbox className="mb-3 h-10 w-10 text-slate-400" /><h3 className="font-bold">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return <div className={`relative ${className}`}><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={value} onChange={onChange} placeholder={placeholder} className="input-base pl-10" aria-label={placeholder} /></div>;
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800"><span className="text-xs text-slate-500">Page {page} of {pages} • {total} records</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button></div></div>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', danger = false, loading = false }) {
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmText}</Button></>}><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p></Modal>;
}
