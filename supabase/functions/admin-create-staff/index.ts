import { withSupabase } from 'npm:@supabase/server';
import { jsonResponse } from '../_shared/paystack.ts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roles = new Set(['admin', 'manager', 'staff']);

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    try {
      const callerId = ctx.userClaims?.sub;
      if (!callerId) return jsonResponse({ error: 'Your management session is invalid.' }, 401);

      const { data: caller, error: callerError } = await ctx.supabase
        .from('admin_users')
        .select('role,is_active')
        .eq('user_id', callerId)
        .eq('is_active', true)
        .maybeSingle();
      if (callerError || caller?.role !== 'admin') {
        return jsonResponse({ error: 'Only an active administrator can add management accounts.' }, 403);
      }

      const input = await request.json();
      const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      const role = typeof input.role === 'string' ? input.role : '';
      if (fullName.length < 2 || fullName.length > 120) return jsonResponse({ error: 'Enter a name between 2 and 120 characters.' }, 400);
      if (!emailPattern.test(email)) return jsonResponse({ error: 'Enter a valid email address.' }, 400);
      if (password.length < 8) return jsonResponse({ error: 'The temporary password must be at least 8 characters.' }, 400);
      if (!roles.has(role)) return jsonResponse({ error: 'Choose a valid management role.' }, 400);

      const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || 'Could not create the Auth account.' }, 409);
      }

      const { error: profileError } = await ctx.supabaseAdmin.from('admin_users').insert({
        user_id: created.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      });
      if (profileError) {
        await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ error: 'The account was created but its management profile could not be saved.' }, 500);
      }

      return jsonResponse({ success: true, email, role });
    } catch (error) {
      console.error('Admin staff creation error:', error);
      return jsonResponse({ error: error instanceof Error ? error.message : 'Could not create the management account.' }, 500);
    }
  }),
};
