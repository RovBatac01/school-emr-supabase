import { format, formatDistanceToNow, parseISO, differenceInYears } from 'date-fns';

export const formatDate = (value, fallback = '—') => {
  if (!value) return fallback;
  try { return format(typeof value === 'string' ? parseISO(value) : value, 'MMM d, yyyy'); }
  catch { return fallback; }
};

export const formatDateTime = (value, fallback = '—') => {
  if (!value) return fallback;
  try { return format(typeof value === 'string' ? parseISO(value) : value, 'MMM d, yyyy • h:mm a'); }
  catch { return fallback; }
};

export const relativeTime = (value) => {
  if (!value) return '—';
  try { return formatDistanceToNow(parseISO(value), { addSuffix: true }); }
  catch { return '—'; }
};

export const ageFromBirthDate = (value) => value ? differenceInYears(new Date(), parseISO(value)) : '—';
export const titleCase = (text = '') => text.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(v => v[0]).join('').toUpperCase() || 'U';
export const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const escapePostgrestSearch = (value = '') => value.replace(/[(),]/g, '').replace(/[%_]/g, '').trim();
export const medicineStatus = med => {
  if (!med) return 'Available';
  const today = new Date(); today.setHours(0,0,0,0);
  const expiration = med.expiration_date ? new Date(`${med.expiration_date}T00:00:00`) : null;
  const near = new Date(today); near.setDate(near.getDate() + 30);
  if (expiration && expiration < today) return 'Expired';
  if (Number(med.quantity) <= 0) return 'Out of Stock';
  if (Number(med.quantity) <= Number(med.minimum_stock)) return 'Low Stock';
  if (expiration && expiration <= near) return 'Near Expiration';
  return 'Available';
};
