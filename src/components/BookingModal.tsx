import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Unit, Room, Currency, PaymentPreference, PaymentGateway, Booking, SiteSettings } from '../lib/types';
import { calculateNights, formatDatePretty, getRoomMonthlyRate, getRoomWeeklyRate, USD_TO_GHS_RATE } from '../lib/utils';
import { createBooking, initializePaystackCheckout, sendBookingConfirmationEmail } from '../lib/supabase';
import { AradadLogo } from './AradadLogo';
import {
  X,
  Calendar,
  User,
  CreditCard,
  CheckCircle2,
  Copy,
  Printer,
  Phone,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  FileCheck,
  Building2,
  Smartphone,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface BookingModalProps {
  unit: Unit | null;
  room?: Room | null;
  currency: Currency;
  siteSettings: SiteSettings;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  isOpen: boolean;
  onClose: () => void;
  onBookingSuccess: (booking: Booking) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  unit,
  room,
  currency,
  siteSettings,
  initialCheckIn,
  initialCheckOut,
  initialGuests = 1,
  isOpen,
  onClose,
  onBookingSuccess,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultCheckout = new Date(tomorrow);
  defaultCheckout.setDate(defaultCheckout.getDate() + (room?.preferredPeriod === 'month' ? 30 : 7));

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [checkIn, setCheckIn] = useState<string>(initialCheckIn || tomorrow.toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState<string>(initialCheckOut || defaultCheckout.toISOString().split('T')[0]);
  const [guestCount, setGuestCount] = useState<number>(initialGuests);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+233');
  const [guestPhoneNumber, setGuestPhoneNumber] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');

  const [paymentPref, setPaymentPref] = useState<PaymentPreference>('full');
  const [paymentGateway, setPaymentGateway] = useState<PaymentGateway>('paystack');
  const [agreeRules, setAgreeRules] = useState(false);
  const [copiedBank, setCopiedBank] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (!isOpen || !room) return;
    const nextCheckIn = initialCheckIn || tomorrow.toISOString().split('T')[0];
    const checkout = new Date(`${nextCheckIn}T12:00:00`);
    if (initialCheckOut) {
      setCheckIn(nextCheckIn);
      setCheckOut(initialCheckOut);
      setGuestCount(initialGuests);
      return;
    }
    checkout.setDate(checkout.getDate() + (room.preferredPeriod === 'month' ? 30 : 7));
    setCheckIn(nextCheckIn);
    setCheckOut(checkout.toISOString().split('T')[0]);
    setGuestCount(initialGuests);
  }, [isOpen, room?.id, room?.preferredPeriod, initialCheckIn, initialCheckOut, initialGuests]);

  if (!isOpen || !unit) return null;

  // Pricing calculations
  const nights = calculateNights(checkIn, checkOut);
  const roomRatePeriod = room?.preferredPeriod === 'month' ? 'month' : 'week';
  const roomPeriodNights = roomRatePeriod === 'month' ? 30 : 7;
  const roomPeriodRate = room
    ? roomRatePeriod === 'month' ? getRoomMonthlyRate(room) : getRoomWeeklyRate(room)
    : 0;
  const roomBillingPeriods = room ? Math.ceil(Math.max(nights, 1) / roomPeriodNights) : 0;
  const effectiveNightlyRate = room ? roomPeriodRate / roomPeriodNights : unit.nightlyRate;

  // If stay >= 28 nights, calculate monthly discount
  const isMonthlyStay = nights >= 28 && !room;
  const subtotal = room
    ? roomPeriodRate * roomBillingPeriods
    : isMonthlyStay
      ? (unit.weeklyMonthlyRate / 30) * nights
      : effectiveNightlyRate * Math.max(nights, 1);

  const securityDeposit = unit.securityDeposit; // $300
  const cleaningFee = 0; // $0
  const totalAmount = subtotal + securityDeposit;
  const formatAmount = (amount: number, currencyCode: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${currencyCode} ${amount.toFixed(2)}`;
    }
  };
  const bookingCurrency = room?.currency || unit.currency || 'USD';
  const formatDisplayAmount = (amount: number) => {
    if (bookingCurrency === currency) return formatAmount(amount, bookingCurrency);
    const exchangeRate = Number(siteSettings.usdToGhsRate) > 0 ? Number(siteSettings.usdToGhsRate) : USD_TO_GHS_RATE;
    if (bookingCurrency === 'USD' && currency === 'GHS') return formatAmount(amount * exchangeRate, 'GHS');
    if (bookingCurrency === 'GHS' && currency === 'USD') return formatAmount(amount / exchangeRate, 'USD');
    return formatAmount(amount, bookingCurrency);
  };

  // Deposit amount if 'deposit' preference chosen (30% + security deposit)
  const depositRequired = Math.round((subtotal * 0.3 + securityDeposit) * 100) / 100;

  const maxAllowedGuests = room ? room.maxGuests : unit.maxOccupancy;

  const choosePaymentPreference = (preference: PaymentPreference) => {
    setPaymentPref(preference);
    setPaymentGateway(current => preference === 'arrival' ? 'cash' : current === 'cash' ? 'paystack' : current);
  };

  const retryPaystackCheckout = async (booking: Booking) => {
    setIsRetryingPayment(true);
    setPaymentNotice('');
    const result = await initializePaystackCheckout(booking);
    if (result.success && result.authorizationUrl) {
      window.location.assign(result.authorizationUrl);
      return;
    }
    setPaymentNotice(result.error || 'Paystack checkout could not be started.');
    setIsRetryingPayment(false);
  };

  const handleNextToGuest = () => {
    if (nights <= 0) {
      alert('Please select a valid check-out date after check-in.');
      return;
    }
    setStep(2);
  };

  const handleNextToPayment = () => {
    if (!guestName.trim() || !guestEmail.trim() || !guestPhoneNumber.trim()) {
      alert('Please fill out all required guest contact fields.');
      return;
    }
    setStep(3);
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    if (!agreeRules) {
      setBookingError('Please review and accept the House Rules & Security Deposit terms.');
      return;
    }

    setIsSubmitting(true);
    setPaymentNotice('');
    const fullPhone = `${phonePrefix} ${guestPhoneNumber.trim()}`;

    const bookingPayload = {
      unitId: unit.id,
      roomId: room?.id,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: fullPhone,
      guestCount,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      paymentPreference: paymentPref,
      paymentGateway,
      specialRequests: specialRequests.trim(),
    };

    try {
      const res = await createBooking(bookingPayload);
      if (res.success && res.data) {
        if (res.data.paymentGateway === 'paystack') {
          const checkout = await initializePaystackCheckout(res.data);
          if (checkout.success && checkout.authorizationUrl) {
            window.location.assign(checkout.authorizationUrl);
            return;
          }
          setConfirmedBooking(res.data);
          onBookingSuccess(res.data);
          setPaymentNotice(checkout.error || 'Paystack checkout could not be started. Your reservation request is saved.');
          setStep(4);
          return;
        }
        setConfirmedBooking(res.data);
        onBookingSuccess(res.data);
        void sendBookingConfirmationEmail(res.data);
        setStep(4);
        try {
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {}
      } else {
        setBookingError(res.error || 'Failed to save reservation. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setBookingError('We could not save your reservation. No payment was taken. Please try again or contact Aradad Homes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyBankDetails = () => {
    const text = `ARADAD HOMES Bank Details:\nAccount Name: ARADAD HOMES\nAccount Number: 1400011105469\nBranch: Osu\nSwift Code: ACCCGHAC`;
    navigator.clipboard.writeText(text);
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-900 text-stone-100">
          <div>
            <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold block">
              Reservation Process · {siteSettings.siteName}
            </span>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-white">
              {room ? `${room.name} (${unit.propertyType})` : unit.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Step Indicator (Step 1-3) */}
        {step < 4 && (
          <div className="flex border-b border-stone-200 bg-stone-50 px-6 py-3 text-xs font-semibold text-stone-600 justify-between">
            <span className={step >= 1 ? 'text-amber-800 font-bold' : 'text-stone-400'}>
              1. Dates & Pricing
            </span>
            <span className="text-stone-300">/</span>
            <span className={step >= 2 ? 'text-amber-800 font-bold' : 'text-stone-400'}>
              2. Guest Information
            </span>
            <span className="text-stone-300">/</span>
            <span className={step >= 3 ? 'text-amber-800 font-bold' : 'text-stone-400'}>
              3. Payment & Policy
            </span>
          </div>
        )}

        {/* Body Container */}
        <div className="overflow-y-auto p-6 flex-1">
          {/* STEP 1: DATES & PRICING */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Check-In Date (from {unit.checkInTime || '15:00'})
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={checkIn}
                    onChange={e => setCheckIn(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Check-Out Date (by {unit.checkOutTime || '11:00'})
                  </label>
                  <input
                    type="date"
                    min={checkIn || todayStr}
                    value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Number of Guests
                </label>
                <select
                  value={guestCount}
                  onChange={e => setGuestCount(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                >
                  {Array.from({ length: maxAllowedGuests }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'Guest' : 'Guests'} (Maximum {maxAllowedGuests})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Note: House rules strictly restrict unregistered overnight visitors.
                </p>
              </div>

              {/* Price Breakdown Card */}
              <div className="bg-stone-50 rounded-xl p-5 border border-stone-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Itemized Cost Breakdown
                </h4>

                <div className="flex justify-between text-sm text-stone-700">
                  <span>
                    {room ? (
                      <>
                        {formatDisplayAmount(roomPeriodRate)} &times; {roomBillingPeriods} {roomRatePeriod === 'week' ? (roomBillingPeriods === 1 ? 'week' : 'weeks') : (roomBillingPeriods === 1 ? 'month' : 'months')}
                        <span className="block text-xs text-stone-500 mt-1">Billed in full {roomPeriodNights}-night periods for {nights} {nights === 1 ? 'night' : 'nights'}.</span>
                      </>
                    ) : (
                      <>
                        {formatDisplayAmount(effectiveNightlyRate)} &times; {nights} {nights === 1 ? 'night' : 'nights'}
                        {isMonthlyStay && <span className="text-xs text-amber-700 ml-1 font-semibold">(Monthly rate applied)</span>}
                      </>
                    )}
                  </span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatDisplayAmount(subtotal)}
                  </span>
                </div>

                <div className="flex justify-between text-sm text-stone-700">
                  <span className="flex items-center gap-1">
                    <span>Cleaning Fee</span>
                    <span className="text-[11px] text-emerald-700 font-semibold">(Complimentary)</span>
                  </span>
                  <span className="font-mono tabular-nums text-emerald-700 font-semibold">{formatDisplayAmount(cleaningFee)}</span>
                </div>

                <div className="flex justify-between text-sm text-stone-700 border-t border-stone-200 pt-2">
                  <div>
                    <span className="block font-medium">Refundable Security Deposit</span>
                    <span className="text-[11px] text-stone-500">
                      Returned 1–3 business days after departure inspection
                    </span>
                  </div>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatDisplayAmount(securityDeposit)}
                  </span>
                </div>

                <div className="flex justify-between items-baseline border-t border-stone-300 pt-3 text-stone-900">
                  <div>
                    <span className="font-serif text-lg font-bold">Total Reservation Value</span>
                    <span className="block text-[11px] text-stone-500">
                      Includes GH₵ {unit.prepaidElectricityGhc} power credit + Starlink Wi-Fi
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold tabular-nums text-amber-900 block">
                      {formatDisplayAmount(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: GUEST INFORMATION */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Primary Guest Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kwame Mensah"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Email Address * (For Booking Confirmation & Passcode)
                </label>
                <input
                  type="email"
                  placeholder="e.g. kwame@example.com"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Phone / WhatsApp Number *
                </label>
                <div className="flex gap-2">
                  <select
                    value={phonePrefix}
                    onChange={e => setPhonePrefix(e.target.value)}
                    className="bg-stone-50 border border-stone-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="+233">🇬🇭 +233 (Ghana)</option>
                    <option value="+1">🇺🇸/🇨🇦 +1</option>
                    <option value="+44">🇬🇧 +44 (UK)</option>
                    <option value="+49">🇩🇪 +49 (Germany)</option>
                    <option value="+234">🇳🇬 +234 (Nigeria)</option>
                    <option value="+33">🇫🇷 +33 (France)</option>
                  </select>
                  <input
                    type="tel"
                    placeholder="55 097 7992"
                    value={guestPhoneNumber}
                    onChange={e => setGuestPhoneNumber(e.target.value)}
                    className="flex-1 bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="p-3.5 bg-stone-50 border border-dashed border-stone-300 rounded-xl">
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Government Photo ID</p>
                <p className="text-xs text-stone-500">
                  Please bring a valid passport, Ghana Card, or driver’s license for verification at check-in. Your ID is not uploaded here.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Special Requests / Estimated Arrival Time
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Arriving on British Airways flight BA0078 around 7:00 PM, require airport pickup advice."
                  value={specialRequests}
                  onChange={e => setSpecialRequests(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* STEP 3: PAYMENT & POLICIES */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Payment Preference */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                  Payment Preference
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => choosePaymentPreference('full')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      paymentPref === 'full'
                        ? 'border-amber-600 bg-amber-50/50 text-stone-900 font-semibold'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <span className="block text-xs text-amber-800 font-bold mb-0.5">Option A</span>
                    <span className="text-sm block">Full Payment</span>
                    <span className="text-[11px] text-stone-500 block">
                      {formatDisplayAmount(totalAmount)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => choosePaymentPreference('deposit')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      paymentPref === 'deposit'
                        ? 'border-amber-600 bg-amber-50/50 text-stone-900 font-semibold'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <span className="block text-xs text-amber-800 font-bold mb-0.5">Option B</span>
                    <span className="text-sm block">Deposit Only</span>
                    <span className="text-[11px] text-stone-500 block">
                      Pay {formatDisplayAmount(depositRequired)} now
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => choosePaymentPreference('arrival')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      paymentPref === 'arrival'
                        ? 'border-amber-600 bg-amber-50/50 text-stone-900 font-semibold'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <span className="block text-xs text-amber-800 font-bold mb-0.5">Option C</span>
                    <span className="text-sm block">Pay on Arrival</span>
                    <span className="text-[11px] text-stone-500 block">Confirm reservation now</span>
                  </button>
                </div>
              </div>

              {/* Online and manual payment methods */}
              {paymentPref !== 'arrival' ? <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentGateway('mobile_money')}
                    className={`p-2.5 rounded-lg border text-center transition-all ${
                      paymentGateway === 'mobile_money'
                        ? 'border-amber-600 bg-amber-50/60 font-semibold text-stone-900'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 mx-auto mb-1 text-amber-700" />
                    <span className="text-xs block">Mobile Money</span>
                    <span className="text-[10px] text-stone-400 block">MTN / Telecel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentGateway('bank_transfer')}
                    className={`p-2.5 rounded-lg border text-center transition-all ${
                      paymentGateway === 'bank_transfer'
                        ? 'border-amber-600 bg-amber-50/60 font-semibold text-stone-900'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <Building2 className="w-4 h-4 mx-auto mb-1 text-amber-700" />
                    <span className="text-xs block">Bank Transfer</span>
                    <span className="text-[10px] text-stone-400 block">Osu Branch Wire</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentGateway('paystack')}
                    className={`p-2.5 rounded-lg border text-center transition-all ${
                      paymentGateway === 'paystack'
                        ? 'border-amber-600 bg-amber-50/60 font-semibold text-stone-900'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 mx-auto mb-1 text-amber-700" />
                    <span className="text-xs block">Paystack Checkout</span>
                    <span className="text-[10px] text-stone-400 block">Card / Mobile Money</span>
                  </button>
                </div>
                {paymentGateway === 'paystack' && (
                  <p className="mt-2 text-[11px] text-stone-500">You will continue to Paystack’s secure checkout. Aradad Homes does not store card details.</p>
                )}
              </div> : (
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-700">
                  Payment will be collected on arrival. Your room request will be saved first.
                </div>
              )}

              {/* Payment Details Drawer based on gateway */}
              {paymentGateway === 'bank_transfer' && (
                <div className="bg-stone-100 p-4 rounded-xl border border-stone-200 text-xs text-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">ARADAD HOMES Bank Details</span>
                    <button
                      type="button"
                      onClick={copyBankDetails}
                      className="flex items-center gap-1 text-[11px] text-amber-800 font-semibold hover:underline"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedBank ? 'Copied!' : 'Copy Details'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>Account Name: <strong className="text-stone-900">ARADAD HOMES</strong></div>
                    <div>Account Number: <strong className="text-stone-900">1400011105469</strong></div>
                    <div>Branch: <strong className="text-stone-900">Osu</strong></div>
                    <div>SWIFT Code: <strong className="text-stone-900">ACCCGHAC</strong></div>
                  </div>
                </div>
              )}

              {paymentGateway === 'mobile_money' && (
                <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
                  <span className="font-bold block">Ghana Mobile Money Instructions:</span>
                  <p>Send to official merchant line: <strong>{siteSettings.ownerPhone}</strong> ({siteSettings.ownerName} / {siteSettings.siteName}). After submitting the reservation, use its booking reference as the transfer reference. Staff must verify manual transfers.</p>
                </div>
              )}

              {paymentGateway === 'paystack' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
                  Paystack will charge {formatAmount(paymentPref === 'deposit' ? depositRequired : totalAmount, bookingCurrency)} now
                  {currency !== bookingCurrency && <> (about {formatDisplayAmount(paymentPref === 'deposit' ? depositRequired : totalAmount)} in {currency})</>}. Your room is held as a request until payment is verified.
                </div>
              )}

              {/* House Rules & Policies Checkbox */}
              {bookingError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  {bookingError}
                </div>
              )}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2 text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeRules}
                    onChange={e => setAgreeRules(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-stone-700 leading-snug">
                    I acknowledge and agree to the <strong>House Rules</strong>: Zero tolerance for speakers / DJ sound systems, quiet hours ({siteSettings.quietHours}), no indoor smoking, maximum occupancy limit, and the <strong>{formatDisplayAmount(securityDeposit)} refundable security deposit</strong> terms.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: INSTANT BOOKING CONFIRMATION & PRINTABLE VOUCHER */}
          {step === 4 && confirmedBooking && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-2">
                  {confirmedBooking.paymentStatus === 'paid' || confirmedBooking.paymentGateway === 'cash'
                    ? <CheckCircle2 className="w-7 h-7" />
                    : <AlertTriangle className="w-7 h-7" />}
                </div>
                <h3 className="font-serif text-2xl font-bold text-stone-900">
                  {confirmedBooking.paymentGateway === 'paystack' && confirmedBooking.paymentStatus !== 'paid'
                    ? 'Payment Not Complete'
                    : confirmedBooking.bookingStatus === 'confirmed' ? 'Reservation Confirmed!' : 'Reservation Request Received'}
                </h3>
                <p className="text-xs text-stone-500 font-mono mt-1">
                  Booking Reference: <strong className="text-stone-900 text-sm">{confirmedBooking.bookingCode}</strong>
                </p>
              </div>

              {paymentNotice && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>{paymentNotice}</p>
                  {confirmedBooking.paymentGateway === 'paystack' && confirmedBooking.paymentStatus !== 'paid' && (
                    <button type="button" onClick={() => void retryPaystackCheckout(confirmedBooking)} disabled={isRetryingPayment}
                      className="mt-3 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-stone-950 disabled:opacity-60">
                      {isRetryingPayment ? 'Opening Paystack…' : 'Retry Paystack Checkout'}
                    </button>
                  )}
                </div>
              )}

              {/* Printable Official Voucher Container */}
              <div id="booking-voucher" className="border-2 border-stone-300 rounded-xl p-5 bg-stone-50 space-y-4">
                <div className="flex justify-between items-start border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-3">
                    <AradadLogo size="sm" />
                    <div>
                      <h4 className="font-serif text-base font-bold text-stone-900 leading-tight">ARADAD HOMES</h4>
                      <p className="text-[11px] text-stone-500">{siteSettings.address}, {siteSettings.neighborhood}, {siteSettings.city} · {siteSettings.domain}</p>
                      <p className="text-[10px] text-stone-400">{siteSettings.landmarks}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      {String(confirmedBooking.bookingStatus || 'confirmed').toUpperCase()}
                    </span>
                    <span className="block text-[11px] text-stone-500 mt-1 font-mono">
                      Ref: {confirmedBooking.bookingCode}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block">Guest Name</span>
                    <strong className="text-stone-900">{confirmedBooking.guestName}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Unit Reserved</span>
                    <strong className="text-stone-900">{confirmedBooking.unitName}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Guests</span>
                    <strong className="text-stone-900">{confirmedBooking.guestCount} Guests</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Check-In</span>
                    <strong className="text-stone-900">{formatDatePretty(confirmedBooking.checkInDate)} ({unit.checkInTime || '15:00'})</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Check-Out</span>
                    <strong className="text-stone-900">{formatDatePretty(confirmedBooking.checkOutDate)} ({unit.checkOutTime || '11:00'})</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Duration</span>
                    <strong className="text-stone-900">{confirmedBooking.nights} Nights</strong>
                  </div>
                </div>

                <div className="border-t border-stone-200 pt-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-stone-500">Total Stay Value:</span>
                    <strong className="font-mono text-base ml-2 text-stone-900">
                      {formatDisplayAmount(confirmedBooking.totalAmount)}
                    </strong>
                  </div>
                  <div className="text-right font-mono text-[11px] text-stone-500">
                    Payment Method: {String(confirmedBooking.paymentGateway || 'mobile_money').replace('_', ' ').toUpperCase()}
                  </div>
                </div>

                {confirmedBooking.paymentGateway === 'paystack' && confirmedBooking.paymentStatus !== 'paid' && !paymentNotice && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
                    Online payment is still pending. Do not treat this reservation as confirmed until Paystack verifies payment.
                    <button type="button" onClick={() => void retryPaystackCheckout(confirmedBooking)} disabled={isRetryingPayment}
                      className="ml-2 font-bold underline disabled:opacity-60">
                      {isRetryingPayment ? 'Opening checkout…' : 'Continue to Paystack'}
                    </button>
                  </div>
                )}

                {(confirmedBooking.paymentGateway === 'mobile_money' || confirmedBooking.paymentGateway === 'bank_transfer') && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
                    <p className="font-bold">Manual payment reference: {confirmedBooking.bookingCode}</p>
                    <p className="mt-1">Amount due now: {formatDisplayAmount(confirmedBooking.paymentPreference === 'deposit'
                      ? Math.round((confirmedBooking.subtotalAmount * 0.3 + confirmedBooking.securityDeposit) * 100) / 100
                      : confirmedBooking.totalAmount)}. The reservation remains pending until staff verify payment.</p>
                    {confirmedBooking.paymentGateway === 'mobile_money'
                      ? <p className="mt-1">Mobile Money: <strong>{siteSettings.ownerPhone}</strong> ({siteSettings.ownerName} / {siteSettings.siteName}).</p>
                      : <p className="mt-1">Bank: <strong>{siteSettings.bankAccountName}</strong>, account <strong>{siteSettings.bankAccountNumber}</strong>, {siteSettings.bankBranch}, SWIFT <strong>{siteSettings.bankSwiftCode}</strong>.</p>}
                  </div>
                )}

                {/* Important Check-in Notes for Guest */}
                <div className="bg-amber-100/60 p-3 rounded-lg border border-amber-200/80 text-[11px] text-amber-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-800" />
                    Guest Arrival & Key Collection:
                  </div>
                  <p>
                    Please present a valid government photo ID to security upon arrival at {siteSettings.address}, {siteSettings.neighborhood} ({siteSettings.landmarks}).
                    Emergency Landlord Contact: <strong>{siteSettings.ownerName} ({siteSettings.ownerPhone})</strong>.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-stone-300"
                >
                  <Printer className="w-4 h-4" />
                  Print / Save Voucher (PDF)
                </button>
                <a
                  href={`https://wa.me/${siteSettings.ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${siteSettings.ownerName}, I have booked ${confirmedBooking.bookingCode} at ${siteSettings.siteName}.` )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Smartphone className="w-4 h-4" />
                  Message Landlord on WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons (Step 1-3) */}
        {step < 4 && (
          <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800"
              >
                Cancel
              </button>
            )}

            {step === 1 && (
              <button
                type="button"
                onClick={handleNextToGuest}
                className="px-6 py-2.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                Next: Guest Info
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleNextToPayment}
                className="px-6 py-2.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                Next: Payment & Confirm
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleSubmitBooking}
                disabled={isSubmitting}
                className="px-7 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting Booking…' : 'Submit Booking'}
              </button>
            )}
          </div>
        )}

        {/* Done Button on Step 4 */}
        {step === 4 && (
          <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-lg transition-colors"
            >
              Done & Return Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
