import { corsHeaders, json } from '../_shared/http.ts';
import { auditAs, publicMessage, requireCaller, statusForError } from '../_shared/admin.ts';

function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('') + '9aA!';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { success: false, message: 'Method not allowed.' }, 405);
  try {
    const { user, caller, serviceClient } = await requireCaller(req, 'staff.reset_password');
    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id || '');
    const { data: target, error: targetError } = await serviceClient.from('staff_directory').select('*').eq('id', targetId).single();
    if (targetError || !target) return json(req, { success: false, message: 'Staff account not found.' }, 404);
    if (target.role_code === 'SUPER_ADMIN' && caller.role_code !== 'SUPER_ADMIN') return json(req, { success: false, message: 'Only a Super Administrator may reset this password.' }, 403);
    const password = temporaryPassword();
    const { error: authError } = await serviceClient.auth.admin.updateUserById(targetId, { password, user_metadata: { must_change_password: true } });
    if (authError) throw authError;
    const { error: profileError } = await serviceClient.from('profiles').update({ must_change_password: true }).eq('id', targetId);
    if (profileError) throw profileError;
    await auditAs(serviceClient, user.id, 'RESET_STAFF_PASSWORD', `Assigned a temporary password to ${target.staff_id} (${target.full_name})`, 'profiles', targetId, req);
    return json(req, { success: true, message: 'Temporary password created. Share it through an approved private channel.', temporary_password: password });
  } catch (error) {
    console.error(error);
    return json(req, { success: false, message: publicMessage(error) }, statusForError(error));
  }
});
