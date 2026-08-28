import { corsHeaders, json } from '../_shared/http.ts';
import { auditAs, publicMessage, requireCaller, statusForError } from '../_shared/admin.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { success: false, message: 'Method not allowed.' }, 405);
  try {
    const { user, caller, serviceClient } = await requireCaller(req, 'staff.create');
    const body = await req.json().catch(() => ({}));
    const required = ['staff_id','full_name','username','email','position','role_id','temporary_password'];
    for (const key of required) if (!String(body[key] || '').trim()) return json(req, { success: false, message: `${key.replaceAll('_',' ')} is required.` }, 422);
    if (!/^[a-z0-9._-]{3,80}$/i.test(body.username)) return json(req, { success: false, message: 'Username contains unsupported characters.' }, 422);
    if (String(body.temporary_password).length < 10) return json(req, { success: false, message: 'Temporary password must contain at least 10 characters.' }, 422);

    const { data: role, error: roleError } = await serviceClient.from('roles').select('*').eq('id', body.role_id).single();
    if (roleError || !role) return json(req, { success: false, message: 'Selected role was not found.' }, 422);
    if (role.code === 'SUPER_ADMIN' && caller.role_code !== 'SUPER_ADMIN') return json(req, { success: false, message: 'Only a Super Administrator may create another Super Administrator.' }, 403);
    if (Number(role.rank) > Number(caller.role_rank)) return json(req, { success: false, message: 'You cannot assign a role above your own authority.' }, 403);

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email: String(body.email).trim().toLowerCase(), password: String(body.temporary_password), email_confirm: true,
      user_metadata: { staff_id: String(body.staff_id).trim().toUpperCase(), full_name: String(body.full_name).trim(), username: String(body.username).trim().toLowerCase(), contact: body.contact || null, position: String(body.position).trim(), must_change_password: true },
      app_metadata: { role_code: role.code }
    });
    if (createError || !created.user) throw createError || new Error('AUTH_USER_CREATE_FAILED');

    const { error: profileError } = await serviceClient.from('profiles').update({
      staff_id: String(body.staff_id).trim().toUpperCase(), full_name: String(body.full_name).trim(), username: String(body.username).trim().toLowerCase(),
      email: String(body.email).trim().toLowerCase(), contact: body.contact || null, position: String(body.position).trim(), role_id: role.id,
      status: body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE', must_change_password: true, created_by: user.id
    }).eq('id', created.user.id);
    if (profileError) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    await auditAs(serviceClient, user.id, 'CREATE_STAFF', `Created staff account ${String(body.staff_id).trim().toUpperCase()} for ${String(body.full_name).trim()}`, 'profiles', created.user.id, req, { role_code: role.code });
    return json(req, { success: true, message: 'Staff account created.', data: { id: created.user.id, staff_id: body.staff_id, username: body.username, role: role.name } }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && /already|duplicate|registered/i.test(error.message) ? 'Staff ID, username, or email already exists.' : publicMessage(error);
    return json(req, { success: false, message }, statusForError(error));
  }
});
