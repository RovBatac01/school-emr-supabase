import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';

export type AdminContext = {
  user: User;
  caller: Record<string, unknown>;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
};

export async function requireCaller(req: Request, permission: string): Promise<AdminContext> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey) throw new Error('FUNCTION_CONFIGURATION_ERROR');
  if (!authorization?.startsWith('Bearer ')) throw new Error('AUTHENTICATION_REQUIRED');

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) throw new Error('AUTHENTICATION_REQUIRED');
  const { data: allowed, error: permissionError } = await userClient.rpc('has_permission', { p_code: permission });
  if (permissionError || !allowed) throw new Error('PERMISSION_DENIED');
  const { data: caller, error: callerError } = await serviceClient.from('staff_directory').select('*').eq('id', user.id).single();
  if (callerError || !caller || caller.status !== 'ACTIVE') throw new Error('ACCOUNT_DISABLED');
  return { user, caller, userClient, serviceClient };
}

export async function auditAs(serviceClient: SupabaseClient, actorId: string, action: string, description: string, entityType: string, entityId: string | null, req: Request, metadata: Record<string, unknown> = {}) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  await serviceClient.from('activity_logs').insert({
    user_id: actorId,
    action,
    description,
    entity_type: entityType,
    entity_id: entityId,
    ip_address: ip,
    user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
    metadata
  });
}

export function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTHENTICATION_REQUIRED') return 401;
  if (message === 'PERMISSION_DENIED' || message === 'ACCOUNT_DISABLED') return 403;
  if (message === 'FUNCTION_CONFIGURATION_ERROR') return 500;
  return 400;
}

export function publicMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTHENTICATION_REQUIRED') return 'Authentication is required.';
  if (message === 'PERMISSION_DENIED') return 'You do not have permission to perform this action.';
  if (message === 'ACCOUNT_DISABLED') return 'This account is disabled.';
  if (message === 'FUNCTION_CONFIGURATION_ERROR') return 'The server function is not configured correctly.';
  return 'The requested staff operation could not be completed.';
}
