import React, { useState } from 'react';
import { Booking, SiteSettings } from '../lib/types';
import { lookupBooking, requestBookingCancellation } from '../lib/supabase';
import { formatDatePretty } from '../lib/utils';
import {
  X,
  Search,
  Calendar,
  User,
  ShieldCheck,
  Smartphone,
  AlertTriangle,
  Printer,
  Wifi,
  Zap,
} from 'lucide-react';

interface MyBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSettings: SiteSettings;
}

export const MyBookingModal: React.FC<MyBookingModalProps> = ({ isOpen, onClose, siteSettings }) => {
  const [bookingCode, setBookingCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [foundBooking, setFoundBooking] = useState<Booking | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  const formatStoredMoney = (amount: number, currencyCode: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currencyCode} ${amount.toFixed(2)}`;
    }
  };

  if (!isOpen) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCode.trim() || !email.trim()) {
      setErrorMessage('Please provide both your Booking Code and Email.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const result = await lookupBooking(bookingCode, email);
      setSearched(true);
      if (result) {
        setFoundBooking(result);
      } else {
        setFoundBooking(null);
        setErrorMessage('No reservation found matching this reference code and email. Please check and try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error looking up reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!foundBooking) return;
    const confirmCancel = window.confirm(
      `Are you sure you want to cancel? Per ${siteSettings.siteName} policy, tenant cancellations are eligible for up to 70% refund on unstayed nights (30% retained for operations & calendar blockages). The $${siteSettings.defaultSecurityDeposit} security deposit is returned within 1-3 business days after inspection.`
    );
    if (!confirmCancel) return;

    const cancelled = await requestBookingCancellation(foundBooking.bookingCode, foundBooking.guestEmail);
    if (!cancelled) {
      alert('We could not record the cancellation. Please contact the host for help.');
      return;
    }
    setFoundBooking({ ...foundBooking, bookingStatus: 'cancelled' });
    setShowCancelPrompt(false);
    alert('Your cancellation request has been recorded. Our team will process the eligible refund.');
  };

  const getPaymentSummary = (booking: Booking) => {
    if (booking.paymentStatus === 'refunded') {
      if (booking.refundedAmount === null) return 'The previous payment record has no refund amount or completion confirmation. Contact the host to confirm the refund.';
      const refundAmount = formatStoredMoney(booking.refundedAmount, booking.currency);
      return booking.paymentGateway === 'paystack'
        ? 'Paystack processed a ' + refundAmount + ' refund; your bank may take up to 10 business days'
        : 'The host recorded a ' + refundAmount + ' refund as complete';
    }
    if (booking.paymentStatus === 'refund_pending') return 'Refund requested from Paystack';
    if (booking.paymentStatus === 'refund_processing') return 'Paystack is processing the refund';
    if (booking.paymentStatus === 'refund_needs_attention') return 'Refund needs host follow-up; please contact the host';
    if (booking.paymentStatus === 'refund_failed') return 'Paystack could not complete the refund; please contact the host';
    if (booking.bookingStatus === 'cancelled') {
      return booking.paymentStatus === 'paid' || booking.paymentStatus === 'verified'
        ? 'Cancelled · contact the host about your eligible refund'
        : 'Cancelled · no payment recorded';
    }
    const expectedNow = booking.paymentPreference === 'deposit'
      ? Math.round((booking.subtotalAmount * 0.3 + booking.securityDeposit) * 100) / 100
      : booking.totalAmount;
    const paymentIsRecorded = booking.paymentStatus === 'paid' || booking.paymentStatus === 'verified';
    if (paymentIsRecorded) {
      if (booking.paymentPreference === 'deposit') {
        const remaining = Math.max(0, booking.totalAmount - expectedNow);
        return remaining > 0
          ? `Payment received · Balance due: ${formatStoredMoney(remaining, booking.currency)}`
          : 'Paid in full';
      }
      return 'Paid in full';
    }
    if (booking.paymentPreference === 'arrival') return `Due on arrival: ${formatStoredMoney(booking.totalAmount, booking.currency)}`;
    return `Due now: ${formatStoredMoney(expectedNow, booking.currency)} · ${booking.paymentStatus}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-900 text-stone-100">
          <div>
            <h3 className="font-serif text-xl font-bold text-white">Manage My Stay</h3>
            <p className="text-xs text-stone-400">{siteSettings.siteName} Guest Portal · {siteSettings.neighborhood}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Lookup Form */}
          <form onSubmit={handleLookup} className="space-y-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Booking Code
                </label>
                <input
                  type="text"
                  placeholder="ARD- followed by your 32-character reference"
                  value={bookingCode}
                  onChange={e => setBookingCode(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Guest Email
                </label>
                <input
                  type="email"
                  placeholder="you@domain.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              {loading ? 'Searching Database...' : 'Find My Reservation'}
            </button>

            {errorMessage && (
              <div className="p-2.5 rounded bg-red-50 text-red-800 text-xs border border-red-200">
                {errorMessage}
              </div>
            )}
          </form>

          {/* Result Card */}
          {foundBooking && (
            <div className="space-y-4 border border-stone-200 rounded-xl p-5 bg-white shadow-xs">
              <div className="flex justify-between items-start border-b border-stone-100 pb-3">
                <div>
                  <span className="text-xs uppercase font-mono text-stone-400 block">
                    Code: {foundBooking.bookingCode}
                  </span>
                  <h4 className="font-serif text-lg font-bold text-stone-900">
                    {foundBooking.unitName}
                  </h4>
                </div>
                <span
                  className={`text-xs uppercase font-mono px-2 py-0.5 rounded font-bold ${
                    foundBooking.bookingStatus === 'confirmed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : foundBooking.bookingStatus === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {foundBooking.bookingStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-stone-700">
                <div>
                  <span className="text-stone-400 block">Guest Name</span>
                  <strong className="text-stone-900">{foundBooking.guestName}</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Guests</span>
                  <strong className="text-stone-900">{foundBooking.guestCount} Guests</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Check-In</span>
                  <strong className="text-stone-900">{formatDatePretty(foundBooking.checkInDate)} ({foundBooking.checkInTime})</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Check-Out</span>
                  <strong className="text-stone-900">{formatDatePretty(foundBooking.checkOutDate)} ({foundBooking.checkOutTime})</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Total Nights</span>
                  <strong className="text-stone-900">{foundBooking.nights} Nights</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Total Amount</span>
                  <strong className="text-stone-900 font-mono">
                    {formatStoredMoney(foundBooking.totalAmount, foundBooking.currency)}
                  </strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Payment</span>
                  <strong className="text-stone-900 font-mono">{getPaymentSummary(foundBooking)}</strong>
                </div>
              </div>

              {/* Guest Privileges & Check-in box */}
              <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-2 border border-stone-200">
                <div className="flex items-center gap-2 text-stone-800 font-semibold">
                  <Wifi className="w-4 h-4 text-amber-600" />
                  <span>Wi-Fi Network: {siteSettings.starlinkNetworkName}</span>
                </div>
                <div className="flex items-center gap-2 text-stone-800 font-semibold">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>Standby Power & Water: Active 24/7</span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Location: {siteSettings.address}, {siteSettings.neighborhood}, {siteSettings.city}, {siteSettings.country} ({siteSettings.landmarks}).
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-stone-100">
                <a
                  href={`https://wa.me/${siteSettings.ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${siteSettings.ownerName}, I have an inquiry regarding booking ${foundBooking.bookingCode}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  WhatsApp Host ({siteSettings.ownerName})
                </a>

                {foundBooking.bookingStatus !== 'cancelled' && (
                  <button
                    onClick={handleCancelReservation}
                    className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Request Cancellation
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
