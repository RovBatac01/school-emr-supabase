import { supabase } from '../lib/supabase';
import { escapePostgrestSearch } from '../utils/format';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };
const range = (page = 1, pageSize = 15) => [(page - 1) * pageSize, page * pageSize - 1];

export async function getDashboard() {
  const [summary, analytics, complaints, usage, activity] = await Promise.all([
    supabase.rpc('dashboard_summary'),
    supabase.rpc('visit_analytics', { p_period: 'monthly', p_date_from: null, p_date_to: null }),
    supabase.rpc('common_complaints', { p_limit: 8, p_date_from: null, p_date_to: null }),
    supabase.rpc('medicine_usage_report', { p_limit: 8, p_date_from: null, p_date_to: null }),
    supabase.from('activity_feed').select('*').limit(8)
  ]);
  for (const response of [summary, analytics, complaints, usage, activity]) if (response.error) throw response.error;
  return { summary: summary.data || {}, analytics: analytics.data || [], complaints: complaints.data || [], usage: usage.data || [], activity: activity.data || [] };
}

export async function listStudents({ page = 1, pageSize = 15, search = '', grade = '', section = '', sex = '', status = '', sort = 'last_name', ascending = true } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('student_directory').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`student_id.ilike.%${q}%,student_number.ilike.%${q}%,full_name.ilike.%${q}%,contact_number.ilike.%${q}%`);
  if (grade) query = query.eq('grade_level', grade);
  if (section) query = query.eq('section', section);
  if (sex) query = query.eq('sex', sex);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order(sort, { ascending }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function listStudentFilters() {
  return unwrap(await supabase.rpc('student_filter_options')) || { grades: [], sections: [] };
}

export async function getStudent(id) {
  const { data, error } = await supabase.from('student_record').select('*').eq('id', id).single();
  if (error) throw error;
  const [visits, issuances] = await Promise.all([
    supabase.from('visit_history_view').select('*').eq('student_id', id).order('visit_date', { ascending: false }).limit(50),
    supabase.from('medicine_issuance_history').select('*').eq('student_id', id).order('issued_at', { ascending: false }).limit(20)
  ]);
  if (visits.error) throw visits.error;
  if (issuances.error) throw issuances.error;
  return { ...data, visits: visits.data || [], issuances: issuances.data || [] };
}

export async function saveStudent(payload) {
  return unwrap(await supabase.rpc('upsert_student_record', { p_payload: payload }));
}

export async function deleteStudent(id) {
  return unwrap(await supabase.rpc('archive_student', { p_student_id: id }));
}

export async function listVisits({ page = 1, pageSize = 15, search = '', dateFrom = '', dateTo = '', visitType = '', priority = '', status = '', studentId = '' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('visit_history_view').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`visit_id.ilike.%${q}%,student_name.ilike.%${q}%,complaint.ilike.%${q}%,diagnosis.ilike.%${q}%`);
  if (dateFrom) query = query.gte('visit_date', dateFrom);
  if (dateTo) query = query.lte('visit_date', dateTo);
  if (visitType) query = query.eq('visit_type', visitType);
  if (priority) query = query.eq('priority', priority);
  if (status) query = query.eq('status', status);
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error, count } = await query.order('visit_date', { ascending: false }).order('visit_time', { ascending: false }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function createVisit(payload) {
  const { data, error } = await supabase.from('visits').insert(payload).select('id, visit_id').single();
  if (error) throw error;
  return data;
}

export async function updateVisit(id, payload) {
  return unwrap(await supabase.from('visits').update(payload).eq('id', id).select('*').single());
}

export async function getVisit(id) {
  return unwrap(await supabase.from('visit_detail').select('*').eq('id', id).single());
}

export async function listConsultations({ page = 1, pageSize = 15, search = '', dateFrom = '', dateTo = '', staffId = '', status = '' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('consultation_directory').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`consultation_id.ilike.%${q}%,student_name.ilike.%${q}%,diagnosis.ilike.%${q}%,chief_complaint.ilike.%${q}%`);
  if (dateFrom) query = query.gte('consultation_date', dateFrom);
  if (dateTo) query = query.lte('consultation_date', dateTo);
  if (staffId) query = query.eq('staff_id', staffId);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order('consultation_date', { ascending: false }).order('consultation_time', { ascending: false }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function getConsultation(id) {
  return unwrap(await supabase.from('consultation_detail').select('*').eq('id', id).single());
}

export async function saveConsultation(payload) {
  return unwrap(await supabase.rpc('save_consultation', { p_payload: payload }));
}

export async function listMedicines({ page = 1, pageSize = 15, search = '', category = '', status = '', sort = 'generic_name' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('medicine_inventory_view').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`medicine_id.ilike.%${q}%,generic_name.ilike.%${q}%,brand_name.ilike.%${q}%,batch_number.ilike.%${q}%`);
  if (category) query = query.eq('category_id', category);
  if (status) query = query.eq('computed_status', status);
  const { data, error, count } = await query.order(sort, { ascending: true }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function listMedicineCategories() {
  return unwrap(await supabase.from('medicine_categories').select('*').order('name')) || [];
}

export async function saveMedicine(payload) {
  const query = payload.id
    ? supabase.from('medicines').update({ ...payload, id: undefined }).eq('id', payload.id)
    : supabase.from('medicines').insert(payload);
  return unwrap(await query.select('*').single());
}

export async function deleteMedicine(id) {
  return unwrap(await supabase.rpc('archive_medicine', { p_medicine_id: id }));
}

export async function issueMedicine(payload) {
  return unwrap(await supabase.rpc('issue_medicine', {
    p_student_id: payload.student_id,
    p_visit_id: payload.visit_id || null,
    p_items: payload.items,
    p_instructions: payload.instructions || null,
    p_notes: payload.notes || null
  }));
}

export async function voidMedicineIssuance(id, reason) {
  return unwrap(await supabase.rpc('void_medicine_issuance', { p_issuance_id: id, p_reason: reason }));
}

export async function listIssuances({ page = 1, pageSize = 15, search = '', dateFrom = '', dateTo = '', studentId = '', status = '' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('medicine_issuance_history').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`issuance_id.ilike.%${q}%,student_name.ilike.%${q}%,medicine_summary.ilike.%${q}%`);
  if (dateFrom) query = query.gte('issued_date', dateFrom);
  if (dateTo) query = query.lte('issued_date', dateTo);
  if (studentId) query = query.eq('student_id', studentId);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order('issued_at', { ascending: false }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function listStaff({ page = 1, pageSize = 15, search = '', role = '', status = '' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('staff_directory').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`staff_id.ilike.%${q}%,full_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`);
  if (role) query = query.eq('role_code', role);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order('full_name').range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function listRoles() {
  return unwrap(await supabase.from('roles').select('id,code,name,rank').order('rank')) || [];
}

export async function adminCreateUser(payload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || 'Unable to create staff account.');
  return data.data;
}

export async function adminUpdateUser(payload) {
  const { data, error } = await supabase.functions.invoke('admin-update-user', { body: payload });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || 'Unable to update staff account.');
  return data.data;
}

export async function adminResetPassword(userId) {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', { body: { user_id: userId } });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || 'Unable to reset password.');
  return data;
}

export async function getReportData(filters) {
  const { data, error } = await supabase.rpc('generate_report', {
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_grade: filters.grade || null,
    p_section: filters.section || null,
    p_visit_type: filters.visitType || null,
    p_diagnosis: filters.diagnosis || null,
    p_staff_id: filters.staffId || null
  });
  if (error) throw error;
  return data;
}

export async function listActivity({ page = 1, pageSize = 20, search = '', action = '', dateFrom = '', dateTo = '', userId = '' } = {}) {
  const [from, to] = range(page, pageSize);
  let query = supabase.from('activity_feed').select('*', { count: 'exact' });
  const q = escapePostgrestSearch(search);
  if (q) query = query.or(`actor_name.ilike.%${q}%,action.ilike.%${q}%,description.ilike.%${q}%`);
  if (action) query = query.eq('action', action);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
  if (userId) query = query.eq('user_id', userId);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function getNotifications() {
  return unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)) || [];
}

export async function markNotificationRead(id) {
  return unwrap(await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id).select('*').single());
}

export async function getSettings() {
  const { data, error } = await supabase.rpc('get_public_settings');
  if (error) throw error;
  return data || {};
}

export async function saveSettings(settings) {
  return unwrap(await supabase.rpc('update_system_settings', { p_settings: settings }));
}

export async function updateMyProfile(payload) {
  return unwrap(await supabase.rpc('update_my_profile', { p_payload: payload }));
}

export async function uploadClinicLogo(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `clinic/logo-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('clinic-assets').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('clinic-assets').getPublicUrl(path).data.publicUrl;
}
