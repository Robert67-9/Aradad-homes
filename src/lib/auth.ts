import { getSupabaseClient } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  phone?: string;
  title?: string;
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

  const { error } = await client.auth.signUp({
    email: cleanEmail,
    password,
  });
  if (error) {
    return { success: false, error: 'Could not create the account. Check the password and try again.' };
  }
  return { success: true };
}

/** Verify email ownership, submit a request, and end the unprivileged session. */
export async function verifySignupOtpAndRequestAccess(
  email: string,
  token: string,
  fullName: string,
): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: 'That code is invalid or expired. Request a new code and try again.' };
  }

  try {
    if ((data.user.email || '').toLowerCase() !== cleanEmail) {
      return { success: false, error: 'Could not verify this email. Request a new code and try again.' };
    }
    const { data: requestCreated, error: requestError } = await client.rpc('request_admin_signup', {
      p_full_name: cleanName,
    });
    if (requestError || requestCreated !== true) {
      return { success: false, error: 'Your request could not be submitted. Please try again later.' };
    }
    return { success: true };
  } finally {
    // Signup creates no portal profile. Never leave that verified but unapproved session active.
    try {
      await client.auth.signOut();
    } catch {
      // Keep the request result independent of a remote session-revocation error.
    }
  }
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

export async function updateAdminPassword(password: string): Promise<{ success: boolean; error?: string }> {
  if (password.length < 8) {
    return { success: false, error: 'Choose a password with at least 8 characters.' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Secure password updates are not configured.' };

  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return { success: false, error: 'Only an active administrator can change this password.' };
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) return { success: false, error: 'Could not update the password. Please try again.' };
  return { success: true };
}

export async function logout(): Promise<void> {
  clearLegacyLocalAuth();
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
}
