import { Currency, Booking, BlockedDate, Room } from './types';

// Approximate live rate for Accra, Ghana
export const USD_TO_GHS_RATE = 15.5;

export function formatCurrency(amount: number, currency: Currency = 'USD', usdToGhsRate = USD_TO_GHS_RATE): string {
  if (currency === 'GHS') {
    const ghsAmount = amount * usdToGhsRate;
    return `GH₵ ${ghsAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatCurrencyExact(amount: number, currency: Currency = 'USD', usdToGhsRate = USD_TO_GHS_RATE): string {
  if (currency === 'GHS') {
    const ghsAmount = amount * usdToGhsRate;
    return `GH₵ ${ghsAmount.toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  usdToGhsRate = USD_TO_GHS_RATE,
): number {
  if (fromCurrency === toCurrency) return amount;
  if (fromCurrency === 'USD' && toCurrency === 'GHS') return amount * usdToGhsRate;
  if (fromCurrency === 'GHS' && toCurrency === 'USD') return amount / usdToGhsRate;
  return amount;
}

export function formatCurrencyIn(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currencyCode + ' ' + amount.toFixed(2);
  }
}

export function getRoomWeeklyRate(room: Pick<Room, 'weeklyRate' | 'nightlyRate'>): number {
  return Number(room.weeklyRate) || Math.round(Number(room.nightlyRate || 65) * 6.5);
}

export function getRoomMonthlyRate(room: Pick<Room, 'monthlyRate' | 'nightlyRate'>): number {
  return Number(room.monthlyRate) || Math.round(Number(room.nightlyRate || 65) * 23);
}

export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

export function isDateRangeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && endA > startB;
}

export function checkUnitAvailability(
  unitId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
  blockedDates: BlockedDate[]
): { isAvailable: boolean; conflictReason?: string } {
  if (!checkIn || !checkOut) return { isAvailable: true };

  // Check existing confirmed or pending bookings
  const bookedConflict = bookings.find(
    b =>
      b.unitId === unitId &&
      b.bookingStatus !== 'cancelled' &&
      isDateRangeOverlapping(checkIn, checkOut, b.checkInDate, b.checkOutDate)
  );

  if (bookedConflict) {
    return {
      isAvailable: false,
      conflictReason: `Reserved for ${bookedConflict.guestName} (${bookedConflict.checkInDate} to ${bookedConflict.checkOutDate})`,
    };
  }

  // Check blocked dates
  const blockedConflict = blockedDates.find(
    b =>
      b.unitId === unitId &&
      isDateRangeOverlapping(checkIn, checkOut, b.startDate, b.endDate)
  );

  if (blockedConflict) {
    return {
      isAvailable: false,
      conflictReason: `Blocked by host (${blockedConflict.reason || 'Maintenance'})`,
    };
  }

  return { isAvailable: true };
}

export function checkRoomAvailability(
  unitId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
  blockedDates: BlockedDate[]
): { isAvailable: boolean; conflictReason?: string } {
  if (!checkIn || !checkOut) return { isAvailable: true };

  const bookedConflict = bookings.find(
    booking => booking.unitId === unitId &&
      (booking.roomId === roomId || !booking.roomId) &&
      booking.bookingStatus !== 'cancelled' &&
      isDateRangeOverlapping(checkIn, checkOut, booking.checkInDate, booking.checkOutDate)
  );
  if (bookedConflict) {
    return {
      isAvailable: false,
      conflictReason: `This room is reserved from ${bookedConflict.checkInDate} to ${bookedConflict.checkOutDate}.`,
    };
  }

  const blockedConflict = blockedDates.find(
    blocked => blocked.unitId === unitId &&
      isDateRangeOverlapping(checkIn, checkOut, blocked.startDate, blocked.endDate)
  );
  if (blockedConflict) {
    return {
      isAvailable: false,
      conflictReason: `These dates are blocked by the host (${blockedConflict.reason || 'Maintenance'}).`,
    };
  }

  return { isAvailable: true };
}

export function formatDatePretty(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
