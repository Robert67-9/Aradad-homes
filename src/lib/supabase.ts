import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AdminSignupRequest, Booking, Unit, Room, BlockedDate, SupabaseConfig, SiteSettings } from './types';
import { INITIAL_UNITS, DEFAULT_SITE_SETTINGS } from './mockData';

const STORAGE_KEYS = {
  SUPABASE_URL: 'aradad_supabase_url',
  SUPABASE_ANON_KEY: 'aradad_supabase_anon_key',
  UNITS: 'aradad_local_units',
  SETTINGS: 'aradad_site_settings',
};

// Only allow production HTTPS URLs (plain HTTP is limited to local development).
export function isValidSupabaseUrl(url: unknown): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.includes('your-project') || trimmed.includes('example.com') || trimmed.length < 15) return false;
  try {
    const parsed = new URL(trimmed);
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    return parsed.hostname.length > 3 && (parsed.protocol === 'https:' || (localHost && parsed.protocol === 'http:'));
  } catch {
    return false;
  }
}

/** Public keys are safe in a browser; secret and service-role keys never are. */
export function isPublicSupabaseKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  const value = key.trim();
  if (value.startsWith('sb_secret_') || value.length < 20 || value.includes('your-anon-key')) return false;
  if (value.startsWith('sb_publishable_')) return /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value);
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'anon';
  } catch {
    return false;
  }
}

// Retrieve configured or env-based Supabase credentials
export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '' : '';

  // A deployment's reviewed endpoint cannot be replaced by browser-local settings.
  let candidateUrl = (envUrl || localUrl || '').trim();
  let candidateKey = (envKey || localKey || '').trim();

  // Validate URL format
  if (!isValidSupabaseUrl(candidateUrl)) {
    candidateUrl = '';
    // Clean invalid cached entry if present
    if (typeof window !== 'undefined' && localUrl && !isValidSupabaseUrl(localUrl)) {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
    }
  }

  if (!isPublicSupabaseKey(candidateKey)) {
    candidateKey = '';
    if (typeof window !== 'undefined' && localKey) {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_ANON_KEY);
    }
  }

  return {
    url: candidateUrl,
    anonKey: candidateKey,
  };
}

export function saveStoredSupabaseConfig(url: string, anonKey: string) {
  supabaseInstance = null;
  const trimmedUrl = (url || '').trim();
  const trimmedKey = (anonKey || '').trim();
  if (!isValidSupabaseUrl(trimmedUrl) || !isPublicSupabaseKey(trimmedKey)) return false;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, trimmedUrl);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, trimmedKey);
  }
  return true;
}

// Client singleton
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !isValidSupabaseUrl(url) || !isPublicSupabaseKey(anonKey)) {
    supabaseInstance = null;
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey);
    } catch (e) {
      console.warn('Could not initialize Supabase client:', e);
      supabaseInstance = null;
    }
  }
  return supabaseInstance;
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  const cleanUrl = (url || '').trim();
  const cleanKey = (anonKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    return { success: false, message: 'Both Supabase Project URL and Anon Public Key are required.' };
  }

  if (!isValidSupabaseUrl(cleanUrl)) {
    return {
      success: false,
      message: 'Invalid Supabase URL: use an HTTPS project URL (HTTP is allowed only for localhost).',
    };
  }

  if (!isPublicSupabaseKey(cleanKey)) {
    return { success: false, message: 'Use a Supabase publishable key or legacy anon public key. Secret and service-role keys are blocked in the browser.' };
  }

  try {
    const testClient = createClient(cleanUrl, cleanKey);
    const { error } = await testClient.from('units').select('id').limit(1);
    if (error) {
      if (
        error.code === 'PGRST204' ||
        error.code === '42P01' ||
        error.message.includes('relation "public.units" does not exist') ||
        error.message.includes('does not exist')
      ) {
        return {
          success: true,
          message: 'Connected to Supabase! Run the provided SQL Schema in your Supabase SQL Editor to initialize tables.',
        };
      }
      return { success: false, message: `Supabase Error: ${error.message}` };
    }
    return { success: true, message: 'Successfully connected and verified database tables in Supabase!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to ping Supabase.' };
  }
}

// Local Storage Helper for local mode
// Data API: Get all listings/units
export async function fetchUnits(): Promise<Unit[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.from('units').select('*').eq('is_active', true);
      if (error) {
        console.warn('Could not fetch units from Supabase:', error.message);
        return [];
      }
      if (!error && data) {
        if (data.length === 0) return [];
        const { data: roomRows, error: roomError } = await client
          .from('rooms')
          .select('*')
          .in('unit_id', data.map((item: any) => item.id))
          .eq('is_active', true);
        if (roomError) console.warn('Could not fetch individual rooms from Supabase:', roomError.message);
        const roomsByUnit = new Map<string, Room[]>();
        (roomRows || []).forEach((room: any) => {
          const unitRooms = roomsByUnit.get(room.unit_id) || [];
          unitRooms.push(mapRoomRecord(room));
          roomsByUnit.set(room.unit_id, unitRooms);
        });
        return data.map((item: any) => ({
          id: item.id,
          apartmentId: item.apartment_id,
          title: item.title,
          subtitle: item.subtitle,
          propertyType: item.property_type,
          category: item.category,
          bedrooms: item.bedrooms,
          bathrooms: item.bathrooms,
          maxOccupancy: item.max_occupancy,
          nightlyRate: Number(item.nightly_rate),
          weeklyMonthlyRate: Number(item.weekly_monthly_rate),
          currency: item.currency || 'USD',
          minimumStay: item.minimum_stay,
          maximumStay: item.maximum_stay,
          cleaningFee: Number(item.cleaning_fee || 0),
          securityDeposit: Number(item.security_deposit || 300),
          prepaidElectricityGhc: Number(item.prepaid_electricity_ghc || 500),
          checkInTime: item.check_in_time || '15:00',
          checkOutTime: item.check_out_time || '11:00',
          bookingStyle: item.booking_style || 'instant',
          description: item.description,
          amenities: item.amenities || [],
          images: item.images && item.images.length > 0 ? item.images : INITIAL_UNITS.find(u => u.id === item.id)?.images || [],
          rooms: roomError ? [] : roomsByUnit.get(item.id) || [],
          isActive: item.is_active,
        }));
      }
    } catch (e) {
      console.warn('Could not fetch units from Supabase:', e);
      return [];
    }
  }
  return getLocalUnits();
}

// Local Storage for units / rooms
export function getLocalUnits(): Unit[] {
  if (typeof window === 'undefined') return INITIAL_UNITS;
  const stored = localStorage.getItem(STORAGE_KEYS.UNITS);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(INITIAL_UNITS));
    return INITIAL_UNITS;
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_UNITS;
  } catch {
    return INITIAL_UNITS;
  }
}

export function saveLocalUnits(units: Unit[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(units));
  }
}

function mapRoomRecord(item: any): Room {
  return {
    id: item.id,
    unitId: item.unit_id,
    name: item.name,
    bedType: item.bed_type,
    hasPrivateBath: item.has_private_bath !== false,
    hasAc: item.has_ac !== false,
    hasWardrobe: item.has_wardrobe !== false,
    nightlyRate: item.nightly_rate == null ? undefined : Number(item.nightly_rate),
    weeklyRate: item.weekly_rate == null ? undefined : Number(item.weekly_rate),
    monthlyRate: item.monthly_rate == null ? undefined : Number(item.monthly_rate),
    preferredPeriod: item.preferred_period === 'month' ? 'month' : 'week',
    currency: item.currency || 'USD',
    maxGuests: Number(item.max_guests || 2),
    description: item.description || '',
    images: Array.isArray(item.images) ? item.images : [],
    isActive: item.is_active !== false,
  };
}

function mapRoomToDatabase(room: Room): Record<string, unknown> {
  return {
    id: room.id,
    unit_id: room.unitId,
    name: room.name,
    bed_type: room.bedType,
    has_private_bath: room.hasPrivateBath,
    has_ac: room.hasAc,
    has_wardrobe: room.hasWardrobe,
    nightly_rate: room.nightlyRate ?? null,
    weekly_rate: room.weeklyRate,
    monthly_rate: room.monthlyRate,
    preferred_period: room.preferredPeriod === 'month' ? 'month' : 'week',
    currency: room.currency,
    max_guests: room.maxGuests,
    description: room.description || '',
    images: room.images,
    is_active: room.isActive,
  };
}

// Add New Apartment / Room Unit
export async function createUnit(unitData: Omit<Unit, 'id'>): Promise<Unit> {
  const newId = 'unit_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const fullUnit: Unit = {
    ...unitData,
    id: newId,
  };
  const list = getLocalUnits();
  const updated = [fullUnit, ...list];
  saveLocalUnits(updated);

  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('units').insert({
        id: fullUnit.id,
        apartment_id: fullUnit.apartmentId,
        title: fullUnit.title,
        subtitle: fullUnit.subtitle,
        property_type: fullUnit.propertyType,
        category: fullUnit.category,
        bedrooms: fullUnit.bedrooms,
        bathrooms: fullUnit.bathrooms,
        max_occupancy: fullUnit.maxOccupancy,
        nightly_rate: fullUnit.nightlyRate,
        weekly_monthly_rate: fullUnit.weeklyMonthlyRate,
        currency: fullUnit.currency,
        minimum_stay: fullUnit.minimumStay,
        maximum_stay: fullUnit.maximumStay,
        cleaning_fee: fullUnit.cleaningFee,
        security_deposit: fullUnit.securityDeposit,
        prepaid_electricity_ghc: fullUnit.prepaidElectricityGhc,
        check_in_time: fullUnit.checkInTime,
        check_out_time: fullUnit.checkOutTime,
        booking_style: fullUnit.bookingStyle,
        description: fullUnit.description,
        amenities: fullUnit.amenities,
        images: fullUnit.images,
        is_active: fullUnit.isActive,
      });
    } catch (e) {
      console.warn('Supabase createUnit notice (cached locally):', e);
    }
  }
  return fullUnit;
}

// Edit Existing Apartment / Room Unit
export async function updateUnit(unitId: string, updates: Partial<Unit>): Promise<Unit | null> {
  const list = getLocalUnits();
  let updatedUnit: Unit | null = null;
  const updated = list.map(u => {
    if (u.id === unitId) {
      updatedUnit = { ...u, ...updates };
      return updatedUnit;
    }
    return u;
  });
  saveLocalUnits(updated);

  const client = getSupabaseClient();
  if (client && updatedUnit) {
    try {
      const dbUpdates: any = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.subtitle !== undefined) dbUpdates.subtitle = updates.subtitle;
      if (updates.nightlyRate !== undefined) dbUpdates.nightly_rate = updates.nightlyRate;
      if (updates.weeklyMonthlyRate !== undefined) dbUpdates.weekly_monthly_rate = updates.weeklyMonthlyRate;
      if (updates.prepaidElectricityGhc !== undefined) dbUpdates.prepaid_electricity_ghc = updates.prepaidElectricityGhc;
      if (updates.maxOccupancy !== undefined) dbUpdates.max_occupancy = updates.maxOccupancy;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
      if (updates.images !== undefined) dbUpdates.images = updates.images;
      if (updates.amenities !== undefined) dbUpdates.amenities = updates.amenities;
      await client.from('units').update(dbUpdates).eq('id', unitId);
    } catch (e) {
      console.warn('Supabase updateUnit notice:', e);
    }
  }
  return updatedUnit;
}

// Delete Apartment / Room Unit
export async function deleteUnit(unitId: string): Promise<boolean> {
  const list = getLocalUnits();
  saveLocalUnits(list.filter(u => u.id !== unitId));

  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('units').delete().eq('id', unitId);
    } catch (e) {
      console.warn('Supabase deleteUnit notice:', e);
    }
  }
  return true;
}

// -------------------------------------------------------------
// ROOM-LEVEL CRUD OPERATIONS (Inside Apartments)
// -------------------------------------------------------------
export async function addRoomToUnit(
  unitId: string,
  roomData: Omit<Room, 'id' | 'unitId'>
): Promise<Room> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before adding a room.');
  const newRoom: Room = { ...roomData, id: `room_${crypto.randomUUID()}`, unitId };
  const { data, error } = await client.from('rooms').insert(mapRoomToDatabase(newRoom)).select('*').single();
  if (error || !data) throw new Error(error?.message || 'Room could not be saved.');
  const savedRoom = mapRoomRecord(data);
  const localUnits = getLocalUnits();
  saveLocalUnits(localUnits.map(unit => unit.id === unitId
    ? { ...unit, rooms: [...(unit.rooms || []).filter(room => room.id !== savedRoom.id), savedRoom] }
    : unit));
  return savedRoom;
}

export async function updateRoomInUnit(
  unitId: string,
  roomId: string,
  updates: Partial<Room>
): Promise<Room | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before editing a room.');
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.bedType !== undefined) dbUpdates.bed_type = updates.bedType;
  if (updates.hasPrivateBath !== undefined) dbUpdates.has_private_bath = updates.hasPrivateBath;
  if (updates.hasAc !== undefined) dbUpdates.has_ac = updates.hasAc;
  if (updates.hasWardrobe !== undefined) dbUpdates.has_wardrobe = updates.hasWardrobe;
  if (updates.weeklyRate !== undefined) dbUpdates.weekly_rate = updates.weeklyRate;
  if (updates.monthlyRate !== undefined) dbUpdates.monthly_rate = updates.monthlyRate;
  if (updates.preferredPeriod !== undefined) dbUpdates.preferred_period = updates.preferredPeriod;
  if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
  if (updates.maxGuests !== undefined) dbUpdates.max_guests = updates.maxGuests;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.images !== undefined) dbUpdates.images = updates.images;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { data, error } = await client.from('rooms').update(dbUpdates)
    .eq('id', roomId).eq('unit_id', unitId).select('*').single();
  if (error || !data) throw new Error(error?.message || 'Room could not be updated.');
  const savedRoom = mapRoomRecord(data);
  const localUnits = getLocalUnits();
  saveLocalUnits(localUnits.map(unit => unit.id === unitId
    ? {
        ...unit,
        rooms: (unit.rooms || []).some(room => room.id === roomId)
          ? (unit.rooms || []).map(room => room.id === roomId ? savedRoom : room)
          : [...(unit.rooms || []), savedRoom],
      }
    : unit));
  return savedRoom;
}

export async function deleteRoomFromUnit(unitId: string, roomId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.from('rooms').delete().eq('id', roomId).eq('unit_id', unitId).select('id').maybeSingle();
  if (error) {
    console.warn('Room deletion denied or failed:', error.message);
    return false;
  }
  if (!data) return false;
  const localUnits = getLocalUnits();
  saveLocalUnits(localUnits.map(unit => unit.id === unitId
    ? { ...unit, rooms: (unit.rooms || []).filter(room => room.id !== roomId) }
    : unit));
  return true;
}

// Site Settings Management
function normalizeSiteSettings(value: unknown): SiteSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<SiteSettings>
    : {};
  const settings = { ...DEFAULT_SITE_SETTINGS, ...saved } as SiteSettings;
  const exchangeRate = Number(settings.usdToGhsRate);
  const securityDeposit = Number(settings.defaultSecurityDeposit);
  settings.usdToGhsRate = Number.isFinite(exchangeRate) && exchangeRate > 0
    ? exchangeRate
    : DEFAULT_SITE_SETTINGS.usdToGhsRate;
  settings.defaultSecurityDeposit = Number.isFinite(securityDeposit) && securityDeposit >= 0
    ? securityDeposit
    : DEFAULT_SITE_SETTINGS.defaultSecurityDeposit;
  return settings;
}

export function getSiteSettings(): SiteSettings {
  if (typeof window === 'undefined') return DEFAULT_SITE_SETTINGS;
  const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SITE_SETTINGS));
    return DEFAULT_SITE_SETTINGS;
  }
  try {
    return normalizeSiteSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const client = getSupabaseClient();
  if (!client) return getSiteSettings();

  try {
    const { data, error } = await client.from('site_settings').select('settings').eq('id', true).maybeSingle();
    if (error) {
      console.warn('Could not load shared site settings:', error.message);
      return getSiteSettings();
    }
    if (!data?.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return getSiteSettings();

    const merged = normalizeSiteSettings(data.settings);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.warn('Could not load shared site settings:', error);
    return getSiteSettings();
  }
}

export async function saveSiteSettings(newSettings: Partial<SiteSettings>): Promise<SiteSettings> {
  const current = getSiteSettings();
  const updated = normalizeSiteSettings({ ...current, ...newSettings });
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before saving shared site settings.');

  const { error } = await client.from('site_settings').upsert({
    id: true,
    settings: updated,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message || 'Site settings could not be saved.');

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  }
  return updated;
}

// Sensitive booking records are returned only for an authenticated staff profile (enforced by RLS).
function mapBookingRecord(b: any): Booking {
  return {
    id: b.id,
    bookingCode: b.booking_code,
    unitId: b.unit_id,
    roomId: b.room_id || undefined,
    unitName: b.unit_name,
    guestName: b.guest_name,
    guestEmail: b.guest_email,
    guestPhone: b.guest_phone,
    guestCount: Number(b.guest_count),
    checkInDate: b.check_in_date,
    checkOutDate: b.check_out_date,
    checkInTime: b.check_in_time || '15:00',
    checkOutTime: b.check_out_time || '11:00',
    nights: Number(b.nights),
    nightlyRate: Number(b.nightly_rate),
    subtotalAmount: Number(b.subtotal_amount),
    securityDeposit: Number(b.security_deposit),
    totalAmount: Number(b.total_amount),
    refundedAmount: b.refunded_amount == null ? null : Number(b.refunded_amount),
    currency: b.currency,
    paymentPreference: b.payment_preference,
    paymentGateway: b.payment_gateway,
    paymentStatus: b.payment_status,
    bookingStatus: b.booking_status,
    specialRequests: b.special_requests || '',
    createdAt: b.created_at,
  };
}

export type GuestBookingInput = Pick<Booking,
  'unitId' | 'roomId' | 'guestName' | 'guestEmail' | 'guestPhone' | 'guestCount' |
  'checkInDate' | 'checkOutDate' | 'paymentPreference' | 'paymentGateway' | 'specialRequests'
>;

async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Use the safe fallback for non-JSON gateway errors.
    }
  }
  return fallback;
}

export async function fetchBookings(): Promise<Booking[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from('bookings')
      .select('id,booking_code,unit_id,room_id,unit_name,guest_name,guest_email,guest_phone,guest_count,check_in_date,check_out_date,check_in_time,check_out_time,nights,nightly_rate,subtotal_amount,security_deposit,total_amount,refunded_amount,currency,payment_preference,payment_gateway,payment_status,booking_status,special_requests,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Bookings are available only to active staff accounts:', error.message);
      return [];
    }
    return (data || []).map(mapBookingRecord);
  } catch (error) {
    console.warn('Could not load bookings:', error);
    return [];
  }
}

// Prices, booking status, reference code, and payment status are all derived by the database.
export async function createBooking(booking: GuestBookingInput): Promise<{ success: boolean; data?: Booking; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'The secure reservation service is not connected, so no booking or payment was created. Please contact Aradad Homes to arrange your stay.',
    };
  }
  try {
    const { data, error } = await client.rpc('create_guest_booking', {
      p_unit_id: booking.unitId,
      p_room_id: booking.roomId || null,
      p_guest_name: booking.guestName,
      p_guest_email: booking.guestEmail,
      p_guest_phone: booking.guestPhone,
      p_guest_count: booking.guestCount,
      p_check_in: booking.checkInDate,
      p_check_out: booking.checkOutDate,
      p_payment_preference: booking.paymentPreference,
      p_payment_gateway: booking.paymentGateway,
      p_special_requests: booking.specialRequests || '',
    });
    if (error || !data) {
      console.error('Secure reservation RPC failed:', error);
      if (error?.code === '23P01') {
        return { success: false, error: 'Those dates are no longer available. Please choose another date range. No payment was taken.' };
      }
      if (error?.code === '22023') {
        return { success: false, error: 'The room or reservation details are invalid. Please review the dates and guest count. No payment was taken.' };
      }
      if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01') {
        return { success: false, error: 'The secure reservation service needs to be set up. No booking or payment was created.' };
      }
      return { success: false, error: 'We could not save your reservation. No payment was taken. Please try again or contact Aradad Homes.' };
    }
    return { success: true, data: mapBookingRecord(data) };
  } catch (error) {
    console.error('Secure reservation request failed:', error);
    return { success: false, error: 'We could not reach the reservation service. No booking or payment was created. Please try again or contact Aradad Homes.' };
  }
}

export async function initializePaystackCheckout(booking: Pick<Booking, 'id' | 'bookingCode' | 'guestEmail'>): Promise<{
  success: boolean;
  authorizationUrl?: string;
  reference?: string;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'The secure payment service is not connected. No payment was taken.' };
  try {
    const { data, error } = await client.functions.invoke('paystack-initialize', {
      body: { bookingId: booking.id, bookingCode: booking.bookingCode, guestEmail: booking.guestEmail },
    });
    if (error || !data?.authorizationUrl) {
      console.error('Paystack checkout initialization failed:', error || data?.error);
      return {
        success: false,
        error: data?.error || (error ? await readFunctionError(error, 'Paystack checkout could not be started. Your reservation request is saved; use the retry button or contact Aradad Homes.') : 'Paystack checkout could not be started. Your reservation request is saved; use the retry button or contact Aradad Homes.'),
      };
    }
    return { success: true, authorizationUrl: data.authorizationUrl, reference: data.reference };
  } catch (error) {
    console.error('Paystack checkout request failed:', error);
    return { success: false, error: 'We could not reach Paystack. Your reservation request is saved; retry checkout or contact Aradad Homes.' };
  }
}

export async function verifyPaystackCheckout(reference: string): Promise<{
  success: boolean;
  bookingCode?: string;
  bookingStatus?: Booking['bookingStatus'];
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'The secure payment service is not connected.' };
  try {
    const { data, error } = await client.functions.invoke('paystack-verify', { body: { reference } });
    if (error || !data?.success) {
      console.error('Paystack payment verification failed:', error || data?.error);
      return { success: false, error: data?.error || (error ? await readFunctionError(error, 'We could not confirm this payment yet.') : 'We could not confirm this payment yet.') };
    }
    return { success: true, bookingCode: data.bookingCode, bookingStatus: data.bookingStatus };
  } catch (error) {
    console.error('Paystack payment verification request failed:', error);
    return { success: false, error: 'We could not reach the payment service to verify this payment.' };
  }
}

export async function updateBookingStatus(
  bookingId: string,
  updates: Partial<Pick<Booking, 'bookingStatus' | 'paymentStatus' | 'refundedAmount'>>
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const dbUpdates: Record<string, string | number | null> = {};
  if (updates.bookingStatus) dbUpdates.booking_status = updates.bookingStatus;
  if (updates.paymentStatus) dbUpdates.payment_status = updates.paymentStatus;
  if (updates.refundedAmount !== undefined) {
    if (updates.refundedAmount === null || !Number.isFinite(updates.refundedAmount) || updates.refundedAmount < 0) return false;
    dbUpdates.refunded_amount = updates.refundedAmount;
  }
  if (updates.paymentStatus === 'refunded' && updates.refundedAmount === undefined) return false;
  if (Object.keys(dbUpdates).length === 0) return false;
  try {
    const { data, error } = await client.from('bookings').update(dbUpdates).eq('id', bookingId).select('id').maybeSingle();
    if (error) console.warn('Booking status update denied or failed:', error.message);
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export async function deleteBooking(bookingId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { data, error } = await client.from('bookings').delete().eq('id', bookingId).select('id').maybeSingle();
    if (error) console.warn('Booking deletion denied or failed:', error.message);
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export async function fetchBlockedDates(): Promise<BlockedDate[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    // Staff receive maintenance notes; public visitors receive only unit and date ranges.
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data, error } = await client.from('blocked_dates').select('*');
      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          unitId: d.unit_id,
          startDate: d.start_date,
          endDate: d.end_date,
          reason: d.reason,
        }));
      }
    }
    const { data, error } = await client.rpc('get_public_blocked_dates');
    if (error || !data) return [];
    return data.map((d: any) => ({
      id: `${d.unit_id}-${d.start_date}-${d.end_date}`,
      unitId: d.unit_id,
      startDate: d.start_date,
      endDate: d.end_date,
      reason: '',
    }));
  } catch (error) {
    console.warn('Could not load blocked dates:', error);
    return [];
  }
}

export async function addBlockedDate(date: Omit<BlockedDate, 'id'>): Promise<BlockedDate> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before changing availability.');
  const { data, error } = await client.from('blocked_dates').insert({
    unit_id: date.unitId,
    start_date: date.startDate,
    end_date: date.endDate,
    reason: date.reason,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message || 'Dates could not be blocked.');
  return { id: data.id, unitId: data.unit_id, startDate: data.start_date, endDate: data.end_date, reason: data.reason };
}

export async function removeBlockedDate(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.from('blocked_dates').delete().eq('id', id).select('id').maybeSingle();
  if (error) console.warn('Blocked date removal denied or failed:', error.message);
  return !error && Boolean(data);
}

export async function lookupBooking(bookingCode?: string, email?: string): Promise<Booking | null> {
  const cleanCode = String(bookingCode || '').trim().toUpperCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanCode || !cleanEmail) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc('lookup_booking', {
      p_booking_code: cleanCode,
      p_email: cleanEmail,
    });
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    return mapBookingRecord(data[0]);
  } catch {
    return null;
  }
}

export async function requestBookingCancellation(bookingCode: string, email: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { data, error } = await client.rpc('request_booking_cancellation', {
      p_booking_code: bookingCode.trim().toUpperCase(),
      p_email: email.trim().toLowerCase(),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function fetchAdminSignupRequests(): Promise<AdminSignupRequest[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before reviewing staff requests.');
  const { data, error } = await client.from('admin_signup_requests')
    .select('id,email,full_name,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Could not load staff access requests.');
  return (data || []).map((request: any) => ({
    id: request.id,
    email: request.email,
    fullName: request.full_name,
    status: request.status,
    createdAt: request.created_at,
  }));
}

export async function reviewAdminSignupRequest(
  requestId: string,
  approve: boolean,
  role: 'admin' | 'manager' | 'staff' = 'staff',
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connect the secure database before reviewing staff requests.');
  const { data, error } = await client.rpc('review_admin_signup', {
    p_request_id: requestId,
    p_approve: approve,
    p_role: role,
  });
  if (error) throw new Error(error.message || 'Could not review this staff request.');
  if (data !== true) throw new Error('This request was already reviewed or the email is no longer verified.');
}
