export type Currency = 'USD' | 'GHS';

export interface Apartment {
  id: string;
  name: string;
  address: string;
  city: string;
  neighborhood: string;
  country: string;
  landmarks: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  payoutAccount: {
    name: string;
    number: string;
    branch: string;
    swiftCode: string;
  };
}

export interface Unit {
  id: string;
  apartmentId: string;
  title: string;
  subtitle: string;
  propertyType: string;
  category: 'apartment' | 'room';
  bedrooms: number;
  bathrooms: number;
  maxOccupancy: number;
  nightlyRate: number; // in USD
  weeklyMonthlyRate: number; // in USD
  currency: string;
  minimumStay: number;
  maximumStay: number;
  cleaningFee: number;
  securityDeposit: number; // $300 refundable
  prepaidElectricityGhc: number; // GH₵ 500 or GH₵ 350
  checkInTime: string; // "15:00"
  checkOutTime: string; // "11:00"
  bookingStyle: 'instant' | 'manual';
  description: string;
  amenities: string[];
  images: string[];
  rooms?: Room[];
  isActive: boolean;
}

export type RentalPeriodMode = 'week' | 'month';

export interface AdminSignupRequest {
  id: string;
  email: string;
  fullName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Room {
  id: string;
  unitId: string;
  name: string;
  bedType: string;
  hasPrivateBath: boolean;
  hasAc: boolean;
  hasWardrobe: boolean;
  /** Legacy rate kept for rooms saved before weekly/monthly pricing was introduced. */
  nightlyRate?: number;
  weeklyRate?: number; // in USD (optional weekly tier)
  monthlyRate?: number; // in USD (optional monthly tier)
  preferredPeriod?: RentalPeriodMode;
  currency: string;
  maxGuests: number;
  description?: string;
  images: string[];
  isActive: boolean;
}

export type PaymentPreference = 'full' | 'deposit' | 'arrival';

export type PaymentGateway =
  | 'mobile_money'
  | 'bank_transfer'
  | 'paystack'
  | 'cash';

export interface Booking {
  id: string;
  bookingCode: string; // Random database-generated reservation reference.
  unitId: string;
  roomId?: string;
  unitName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCount: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  checkInTime: string;
  checkOutTime: string;
  nights: number;
  nightlyRate: number;
  subtotalAmount: number;
  securityDeposit: number;
  totalAmount: number;
  refundedAmount: number | null;
  currency: string;
  paymentPreference: PaymentPreference;
  paymentGateway: PaymentGateway;
  paymentReference?: string;
  paymentStatus:
    | 'pending'
    | 'verified'
    | 'paid'
    | 'refund_pending'
    | 'refund_processing'
    | 'refund_needs_attention'
    | 'refund_failed'
    | 'refunded';
  bookingStatus: 'confirmed' | 'pending_approval' | 'cancelled' | 'completed';
  specialRequests?: string;
  idDocumentUrl?: string;
  createdAt: string;
}

export interface BlockedDate {
  id: string;
  unitId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
}

export interface Review {
  id: string;
  unitId: string;
  guestName: string;
  guestLocation: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  isUsingFallback: boolean;
}

export interface SiteSettings {
  siteName: string;
  domain: string;
  tagline: string;
  address: string;
  neighborhood: string;
  city: string;
  country: string;
  landmarks: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  defaultSecurityDeposit: number;
  usdToGhsRate: number;
  quietHours: string;
  starlinkNetworkName: string;
  poweredBy: string; // "JAMS TECH"
}
