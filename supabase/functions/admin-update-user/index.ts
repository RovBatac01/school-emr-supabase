import { corsHeaders, json } from '../_shared/http.ts';
import { auditAs, publicMessage, requireCaller, statusForError } from '../_shared/admin.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { success: false, message: 'Method not allowed.' }, 405);
  try {
    const { user, caller, serviceClient } = await requireCaller(req, 'staff.update');
    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id || '');
    if (!targetId) return json(req, { success: false, message: 'Target staff account is required.' }, 422);
    const { data: target, error: targetError } = await serviceClient.from('staff_directory').select('*').eq('id', targetId).single();
    if (targetError || !target) return json(req, { success: false, message: 'Staff account not found.' }, 404);
    if (target.role_code === 'SUPER_ADMIN' && caller.role_code !== 'SUPER_ADMIN') return json(req, { success: false, message: 'Only a Super Administrator may modify a Super Administrator.' }, 403);
    if (targetId === user.id && body.status === 'DISABLED') return json(req, { success: false, message: 'You cannot disable your own account.' }, 422);

    let role = null;
    if (body.role_id) {
      const result = await serviceClient.from('roles').select('*').eq('id', body.role_id).single();
      if (result.error || !result.data) return json(req, { success: false, message: 'Selected role was not found.' }, 422);
      role = result.data;
      if (role.code === 'SUPER_ADMIN' && caller.role_code !== 'SUPER_ADMIN') return json(req, { success: false, message: 'Only a Super Administrator may assign that role.' }, 403);
      if (Number(role.rank) > Number(caller.role_rank)) return json(req, { success: false, message: 'You cannot assign a role above your own authority.' }, 403);
    }
    if (target.role_code === 'SUPER_ADMIN' && ((body.status === 'DISABLED') || (role && role.code !== 'SUPER_ADMIN'))) {
      const { count } = await serviceClient.from('staff_directory').select('*', { count: 'exact', head: true }).eq('role_code', 'SUPER_ADMIN').eq('status', 'ACTIVE');
      if ((count || 0) <= 1) return json(req, { success: false, message: 'The last active Super Administrator cannot be disabled or demoted.' }, 422);
    }

    const profilePatch: Record<string, unknown> = {};
    for (const key of ['staff_id','full_name','username','email','contact','position','status']) if (body[key] !== undefined) profilePatch[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    if (profilePatch.staff_id) profilePatch.staff_id = String(profilePatch.staff_id).toUpperCase();
    if (profilePatch.username) profilePatch.username = String(profilePatch.username).toLowerCase();
    if (profilePatch.email) profilePatch.email = String(profilePatch.email).toLowerCase();
    if (role) profilePatch.role_id = role.id;
    const { error: updateError } = await serviceClient.from('profiles').update(profilePatch).eq('id', targetId);
    if (updateError) throw updateError;

    const authPatch: Record<string, unknown> = {};
    if (profilePatch.email) authPatch.email = profilePatch.email;
    if (role) authPatch.app_metadata = { role_code: role.code };
    if (body.status === 'DISABLED') authPatch.ban_duration = '876000h';
    if (body.status === 'ACTIVE') authPatch.ban_duration = 'none';
    if (Object.keys(authPatch).length) {
      const { error } = await serviceClient.auth.admin.updateUserById(targetId, authPatch);
      if (error) throw error;
    }
    await auditAs(serviceClient, user.id, 'UPDATE_STAFF', `Updated staff account ${target.staff_id} (${target.full_name})`, 'profiles', targetId, req, { changed_fields: Object.keys(profilePatch) });
    return json(req, { success: true, message: 'Staff account updated.', data: { id: targetId } });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && /already|duplicate/i.test(error.message) ? 'Staff ID, username, or email already exists.' : publicMessage(error);
    return json(req, { success: false, message }, statusForError(error));
  }
});
