import React, { useState } from 'react';
import { Currency, Unit, Room, Booking, BlockedDate, SiteSettings } from '../lib/types';
import { formatCurrency, calculateNights, checkRoomAvailability, getRoomMonthlyRate, getRoomWeeklyRate } from '../lib/utils';
import { HERO_BACKGROUND_IMAGE } from '../lib/imageAssets';
import { Calendar, Users, Wifi, Zap, Shield, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

interface HeroProps {
  units: Unit[];
  currency: Currency;
  usdToGhsRate: number;
  siteSettings: SiteSettings;
  bookings: Booking[];
  blockedDates: BlockedDate[];
  onSelectBooking: (unit: Unit, room: Room, checkIn: string, checkOut: string, guests: number) => void;
}

export const Hero: React.FC<HeroProps> = ({
  units,
  currency,
  usdToGhsRate,
  siteSettings,
  bookings,
  blockedDates,
  onSelectBooking,
}) => {
  const roomOptions = units.flatMap(unit =>
    (unit.rooms || [])
      .filter(room => room.isActive !== false)
      .map(room => ({ unit, room }))
  );

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultCheckIn = tomorrow.toISOString().split('T')[0];
  const defaultCheckout = new Date(tomorrow);
  defaultCheckout.setDate(defaultCheckout.getDate() + 7);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckout.toISOString().split('T')[0]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [availabilityMessage, setAvailabilityMessage] = useState<{
    status: 'idle' | 'available' | 'unavailable';
    text: string;
  }>({ status: 'idle', text: '' });

  const selectedOption = roomOptions.find(option => option.room.id === selectedRoomId) || roomOptions[0];
  const selectedRoom = selectedOption?.room;
  const selectedUnit = selectedOption?.unit;
  const nights = calculateNights(checkIn, checkOut);

  const handleCheckDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !selectedUnit) {
      setAvailabilityMessage({ status: 'unavailable', text: 'No rooms are currently listed. Please check back soon.' });
      return;
    }
    if (nights <= 0) {
      setAvailabilityMessage({ status: 'unavailable', text: 'Check-out date must be after check-in date.' });
      return;
    }
    if (guestCount > selectedRoom.maxGuests) {
      setAvailabilityMessage({ status: 'unavailable', text: `This room accommodates up to ${selectedRoom.maxGuests} guests.` });
      return;
    }

    const { isAvailable, conflictReason } = checkRoomAvailability(
      selectedUnit.id,
      selectedRoom.id,
      checkIn,
      checkOut,
      bookings,
      blockedDates,
    );
    if (!isAvailable) {
      setAvailabilityMessage({ status: 'unavailable', text: conflictReason || 'This room is unavailable for those dates.' });
      return;
    }

    const period = selectedRoom.preferredPeriod === 'month' ? 'month' : 'week';
    const periodNights = period === 'month' ? 30 : 7;
    const periodRate = period === 'month' ? getRoomMonthlyRate(selectedRoom) : getRoomWeeklyRate(selectedRoom);
    const periods = Math.ceil(nights / periodNights);
    setAvailabilityMessage({
      status: 'available',
      text: `Available! ${formatCurrency(periodRate * periods, currency, usdToGhsRate)} for ${periods} ${period}${periods === 1 ? '' : 's'} (plus ${formatCurrency(selectedUnit.securityDeposit, currency, usdToGhsRate)} refundable deposit).`,
    });
  };

  const handleBookNow = () => {
    if (selectedUnit && selectedRoom) {
      onSelectBooking(selectedUnit, selectedRoom, checkIn, checkOut, guestCount);
    }
  };

  return (
    <div className="relative bg-stone-900 text-stone-100 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={HERO_BACKGROUND_IMAGE}
          alt="Aradad Homes in Adjiringanor, Accra"
          className="w-full h-full object-cover object-center filter brightness-40"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-medium mb-4">
            <span>{siteSettings.neighborhood}</span>
            <span aria-hidden="true">·</span>
            <span>{siteSettings.landmarks}</span>
            <span aria-hidden="true">·</span>
            <span>{siteSettings.city}, {siteSettings.country}</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Private En-Suite Rooms in Accra
          </h1>

          <p className="text-lg sm:text-xl text-stone-300 font-light leading-relaxed mb-8 max-w-2xl">
            {siteSettings.tagline || 'Choose a furnished private room with weekly or monthly pricing, Starlink Wi-Fi, standby power, and 24/7 gated security.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 pb-8 border-t border-stone-800 text-xs text-stone-300 font-medium">
            <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-amber-400 shrink-0" /><span>Free Starlink Wi-Fi</span></div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400 shrink-0" /><span>Standby Generator</span></div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400 shrink-0" /><span>24/7 Gated Security</span></div>
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400 shrink-0" /><span>No Cleaning Fee</span></div>
          </div>
        </div>

        <div className="mt-6 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl p-5 md:p-6 shadow-2xl">
          <form onSubmit={handleCheckDates} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label htmlFor="hero-room" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">Private Room</label>
              <select
                id="hero-room"
                value={selectedOption?.room.id || ''}
                onChange={event => {
                  setSelectedRoomId(event.target.value);
                  setAvailabilityMessage({ status: 'idle', text: '' });
                }}
                className="w-full bg-stone-800 text-white border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                required
              >
                {roomOptions.length === 0 ? <option value="">No rooms currently listed</option> : roomOptions.map(({ unit, room }) => (
                  <option key={room.id} value={room.id}>{room.name} · {room.bedType}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="hero-check-in" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">Check-In</label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input id="hero-check-in" type="date" value={checkIn} min={today.toISOString().split('T')[0]} onChange={event => { setCheckIn(event.target.value); setAvailabilityMessage({ status: 'idle', text: '' }); }} className="w-full bg-stone-800 text-white border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" required />
              </div>
            </div>

            <div>
              <label htmlFor="hero-check-out" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">Check-Out</label>
              <input id="hero-check-out" type="date" value={checkOut} min={checkIn || today.toISOString().split('T')[0]} onChange={event => { setCheckOut(event.target.value); setAvailabilityMessage({ status: 'idle', text: '' }); }} className="w-full bg-stone-800 text-white border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" required />
            </div>

            <div>
              <label htmlFor="hero-guests" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">Guests</label>
              <div className="relative">
                <Users className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select id="hero-guests" value={guestCount} onChange={event => setGuestCount(Number(event.target.value))} className="w-full bg-stone-800 text-white border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-amber-400">
                  {Array.from({ length: Math.max(1, selectedRoom?.maxGuests || 2) }, (_, index) => index + 1).map(guests => (
                    <option key={guests} value={guests}>{guests} {guests === 1 ? 'Guest' : 'Guests'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={!selectedRoom} className="flex-1 px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">Check</button>
              <button type="button" onClick={handleBookNow} disabled={!selectedRoom} className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg text-sm transition-colors shadow-md disabled:opacity-50">Book Room</button>
            </div>
          </form>

          {availabilityMessage.status !== 'idle' && (
            <div className={`mt-4 p-3 rounded-lg flex items-center justify-between text-xs sm:text-sm ${availabilityMessage.status === 'available' ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-200' : 'bg-red-950/70 border border-red-700/60 text-red-200'}`}>
              <div className="flex items-center gap-2">
                {availabilityMessage.status === 'available' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <span>{availabilityMessage.text}</span>
              </div>
              {availabilityMessage.status === 'available' && <button type="button" onClick={handleBookNow} className="font-bold underline ml-3 text-emerald-300 hover:text-emerald-100">Reserve Room →</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
