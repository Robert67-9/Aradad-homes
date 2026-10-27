import { getSupabaseClient } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  phone?: string;
  title?: string;
  isActive: boolean;
  createdAt: string;
}

type AuthResult = { success: boolean; user?: AuthUser; error?: string };

function mapAdminProfile(profile: any): AuthUser | null {
  if (!profile || !['admin', 'manager', 'staff'].includes(profile.role)) return null;
  return {
    id: profile.user_id,
    name: profile.full_name || profile.email,
    email: profile.email,
    role: profile.role,
    phone: profile.phone || undefined,
    title: profile.title || undefined,
    isActive: profile.is_active !== false,
    createdAt: profile.created_at,
  };
}

function clearLegacyLocalAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('aradad_current_user');
  localStorage.removeItem('aradad_admin_accounts');
}

export async function requestAdminSignupOtp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  clearLegacyLocalAuth();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { success: false, error: 'Choose a password with at least 8 characters.' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Secure signup is not configured. Set the Supabase URL and public key in the deployment environment.' };
  }

  const { data, error } = await client.auth.signUp({
    email: cleanEmail,
    password,
  });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return { success: false, error: 'Supabase is limiting verification emails. Wait before trying again or configure a custom SMTP provider in Supabase Auth.' };
    }
    return { success: false, error: `Supabase could not start signup or send the verification email: ${error.message}` };
  }
  if (!data.user) return { success: false, error: 'Supabase did not create a signup account. Check the Auth logs and try again.' };
  if (data.user.identities?.length === 0) {
    return {
      success: false,
      error: 'This email may already have a Supabase account, so no new signup code was sent. Use Resend code if you have an unverified signup, or sign in/contact an administrator.',
    };
  }
  if (data.session) {
    return {
      success: false,
      error: 'Email confirmation is disabled in Supabase Auth, so no verification code was sent. Enable email confirmations before requesting dashboard access.',
    };
  }
  return { success: true };
}

export async function resendAdminSignupOtp(email: string): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure signup is not configured.' };

  const { error } = await client.auth.resend({ type: 'signup', email: cleanEmail });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return { success: false, error: 'Supabase is limiting verification emails. Wait before trying again or configure a custom SMTP provider in Supabase Auth.' };
    }
    return { success: false, error: `Supabase could not resend the verification email: ${error.message}` };
  }
  return { success: true };
}

async function submitVerifiedSignupRequest(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  email: string,
  fullName: string,
): Promise<{ success: boolean; verified?: boolean; error?: string }> {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || (user.email || '').toLowerCase() !== email) {
    return { success: false, error: 'Your verified signup session expired. Request a new email code and try again.' };
  }

  const { data: requestCreated, error: requestError } = await client.rpc('request_admin_signup', {
    p_full_name: fullName,
  });
  if (requestError || requestCreated !== true) {
    return {
      success: false,
      verified: true,
      error: requestError
        ? `Your email is verified, but Supabase could not save the access request: ${requestError.message}`
        : 'Your email is verified, but Supabase did not save the access request. Retry submission.',
    };
  }

  try {
    await client.auth.signOut();
  } catch {
    // The access request is already durable; the unapproved session cannot access the portal.
  }
  return { success: true };
}

/** Verify email ownership, submit a request, and end the unprivileged session. */
export async function verifySignupOtpAndRequestAccess(
  email: string,
  token: string,
  fullName: string,
): Promise<{ success: boolean; verified?: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.replace(/\s+/g, '');
  const cleanName = fullName.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    return { success: false, error: 'Enter your name (2 to 120 characters).' };
  }
  if (!/^[0-9]{6,8}$/.test(cleanToken)) {
    return { success: false, error: 'Enter the one-time code from your email.' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure signup is not configured.' };

  const { data, error } = await client.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'email',
  });
  if (error || !data.user) {
    return {
      success: false,
      error: error
        ? `Supabase could not verify that code: ${error.message}`
        : 'Supabase did not return a verified account. Request a new code and try again.',
    };
  }
  if ((data.user.email || '').toLowerCase() !== cleanEmail) {
    await client.auth.signOut();
    return { success: false, error: 'The verified account did not match this email. Request a new code and try again.' };
  }
  return submitVerifiedSignupRequest(client, cleanEmail, cleanName);
}

/** Retry saving a verified signup request if the database was temporarily unavailable. */
export async function retryVerifiedSignupRequest(
  email: string,
  fullName: string,
): Promise<{ success: boolean; verified?: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    return { success: false, verified: true, error: 'Enter your name (2 to 120 characters).' };
  }
  const client = getSupabaseClient();
  if (!client) return { success: false, verified: true, error: 'Secure signup is not configured.' };
  return submitVerifiedSignupRequest(client, cleanEmail, cleanName);
}

export async function signInAdminWithPassword(email: string, password: string): Promise<AuthResult> {
  clearLegacyLocalAuth();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  if (!password) {
    return { success: false, error: 'Enter your password.' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Secure sign-in is not configured.' };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error || !data.user) {
    return { success: false, error: 'The email or password is incorrect.' };
  }

  const { data: profile, error: profileError } = await client
    .from('admin_users')
    .select('user_id,email,full_name,role,phone,title,created_at,is_active')
    .eq('user_id', data.user.id)
    .eq('is_active', true)
    .maybeSingle();
  const user = !profileError ? mapAdminProfile(profile) : null;
  if (!user || user.email.toLowerCase() !== cleanEmail) {
    await client.auth.signOut();
    return { success: false, error: 'This email is not authorized for the management portal.' };
  }

  clearLegacyLocalAuth();
  return { success: true, user };
}

/** Return a user only when Supabase confirms both the session and active admin profile. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  clearLegacyLocalAuth();
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: { user: sessionUser }, error } = await client.auth.getUser();
  if (error || !sessionUser) return null;

  const { data: profile, error: profileError } = await client
    .from('admin_users')
    .select('user_id,email,full_name,role,phone,title,created_at,is_active')
    .eq('user_id', sessionUser.id)
    .eq('is_active', true)
    .maybeSingle();
  const user = !profileError ? mapAdminProfile(profile) : null;
  if (!user || user.email.toLowerCase() !== (sessionUser.email || '').toLowerCase()) {
    await client.auth.signOut();
    return null;
  }
  return user;
}

export async function updateManagementPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  if (newPassword.length < 8) {
    return { success: false, error: 'Choose a password with at least 8 characters.' };
  }
  if (!currentPassword) {
    return { success: false, error: 'Enter your current password to confirm this change.' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure password updates are not configured.' };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Only an active management account can change its password.' };
  }

  // Re-authenticate with the existing password first. Without this, a stolen or
  // left-open session could silently rotate the password and lock the owner out.
  const { data: reauth, error: reauthError } = await client.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError || !reauth.user || reauth.user.id !== user.id) {
    return { success: false, error: 'The current password is incorrect.' };
  }

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message || 'Could not update the password. Please try again.' };
  return { success: true };
}

export async function createStaffAccount(input: {
  fullName: string;
  email: string;
  password: string;
  role: AuthUser['role'];
}): Promise<{ success: boolean; email?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure staff management is not configured.' };
  const current = await getCurrentUser();
  if (!current || current.role !== 'admin') {
    return { success: false, error: 'Only an active administrator can add management accounts.' };
  }
  try {
    const { data, error } = await client.functions.invoke('admin-create-staff', { body: input });
    if (error || !data?.success) {
      return { success: false, error: data?.error || error?.message || 'Could not create the management account.' };
    }
    return { success: true, email: input.email.trim().toLowerCase() };
  } catch {
    return { success: false, error: 'Could not reach the staff management service.' };
  }
}

export async function fetchStaffAccounts(): Promise<AuthUser[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Secure staff management is not configured.');
  const current = await getCurrentUser();
  if (!current || current.role !== 'admin') {
    throw new Error('Only an active administrator can view management accounts.');
  }
  const { data, error } = await client
    .from('admin_users')
    .select('user_id,email,full_name,role,phone,title,created_at,is_active')
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load management accounts.');
  return (data || []).map(mapAdminProfile).filter((user): user is AuthUser => Boolean(user));
}

export async function updateStaffProfile(input: {
  userId: string;
  fullName: string;
  phone: string;
  title: string;
  role: AuthUser['role'];
}): Promise<{ success: boolean; error?: string }> {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const title = input.title.trim();
  if (fullName.length < 2 || fullName.length > 120) {
    return { success: false, error: 'Enter a name between 2 and 120 characters.' };
  }
  if (phone.length > 40 || title.length > 100) {
    return { success: false, error: 'Phone must be 40 characters or fewer and title must be 100 characters or fewer.' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure staff management is not configured.' };
  const current = await getCurrentUser();
  if (!current || current.role !== 'admin') {
    return { success: false, error: 'Only an active administrator can update management profiles.' };
  }
  if (current.id === input.userId && input.role !== 'admin') {
    return { success: false, error: 'You cannot remove your own administrator access.' };
  }

  const { data: target, error: lookupError } = await client
    .from('admin_users')
    .select('role,is_active')
    .eq('user_id', input.userId)
    .maybeSingle();
  if (lookupError || !target) {
    return { success: false, error: lookupError?.message || 'Management profile not found.' };
  }
  if (target.role === 'admin' && target.is_active && input.role !== 'admin') {
    const { count, error: countError } = await client
      .from('admin_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);
    if (countError) return { success: false, error: 'Could not verify the remaining administrator accounts.' };
    if ((count || 0) <= 1) {
      return { success: false, error: 'The last active administrator cannot be changed to another role.' };
    }
  }

  const { data, error } = await client
    .from('admin_users')
    .update({ full_name: fullName, phone: phone || null, title: title || null, role: input.role })
    .eq('user_id', input.userId)
    .select('user_id')
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message || 'Could not update this management profile.' };
  }
  return { success: true };
}

export async function toggleStaffAccountStatus(userId: string, nextActive: boolean): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure staff management is not configured.' };

  const current = await getCurrentUser();
  if (!current || current.role !== 'admin') {
    return { success: false, error: 'Only an active administrator can change management account status.' };
  }
  if (current.id === userId && !nextActive) {
    return { success: false, error: 'You cannot deactivate your own management account while you are signed in.' };
  }

  if (!nextActive) {
    const { data: target, error: lookupError } = await client
      .from('admin_users')
      .select('role,is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (lookupError || !target) {
      return { success: false, error: lookupError?.message || 'Management account not found.' };
    }
    if (target.role === 'admin' && target.is_active) {
      const { count, error: countError } = await client
        .from('admin_users')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);
      if (countError) return { success: false, error: 'Could not verify the remaining administrator accounts.' };
      if ((count || 0) <= 1) {
        return { success: false, error: 'The last active administrator cannot be deactivated.' };
      }
    }
  }

  const { error } = await client
    .from('admin_users')
    .update({ is_active: nextActive })
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message || 'Could not update this management account.' };
  }

  return { success: true };
}

export async function logout(): Promise<void> {
  clearLegacyLocalAuth();
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
}
