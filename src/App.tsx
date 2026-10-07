import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { Unit, Room, Booking, BlockedDate, Currency, SiteSettings } from './lib/types';
import { fetchUnits, fetchBookings, fetchBlockedDates, fetchSiteSettings, getSiteSettings, getSupabaseClient, verifyPaystackCheckout } from './lib/supabase';
import { INITIAL_UNITS } from './lib/mockData';
import { AuthUser, getCurrentUser, logout } from './lib/auth';
import { formatCurrency, getRoomMonthlyRate, getRoomWeeklyRate } from './lib/utils';
import { setCookie } from './lib/cookies';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { ChevronLeft, ChevronRight, Users, Wifi, Zap } from 'lucide-react';

const BookingModal = lazy(() => import('./components/BookingModal').then(module => ({ default: module.BookingModal })));
const MyBookingModal = lazy(() => import('./components/MyBookingModal').then(module => ({ default: module.MyBookingModal })));
const HostDashboardModal = lazy(() => import('./components/HostDashboardModal').then(module => ({ default: module.HostDashboardModal })));
const AdminAuthModal = lazy(() => import('./components/AdminAuthModal').then(module => ({ default: module.AdminAuthModal })));
const AmenitiesSection = lazy(() => import('./components/AmenitiesSection').then(module => ({ default: module.AmenitiesSection })));
const RulesAndPolicySection = lazy(() => import('./components/RulesAndPolicySection').then(module => ({ default: module.RulesAndPolicySection })));
const LocationSection = lazy(() => import('./components/LocationSection').then(module => ({ default: module.LocationSection })));
const Footer = lazy(() => import('./components/Footer').then(module => ({ default: module.Footer })));

export default function App() {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [units, setUnits] = useState<Unit[]>(INITIAL_UNITS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => getSiteSettings());
  const [selectedRoomPhotos, setSelectedRoomPhotos] = useState<Record<string, string>>({});

  // Authentication State for Admin & Staff
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isHostDashboardOpen, setIsHostDashboardOpen] = useState(false);

  // Room reservation state
  const [selectedUnitForBooking, setSelectedUnitForBooking] = useState<Unit | null>(null);
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<Room | null>(null);
  const [bookingCheckIn, setBookingCheckIn] = useState<string>('');
  const [bookingCheckOut, setBookingCheckOut] = useState<string>('');
  const [bookingGuests, setBookingGuests] = useState<number>(1);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const [isMyBookingOpen, setIsMyBookingOpen] = useState(false);
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('aradad_cookie_consent');
  });
  const [paystackReturn, setPaystackReturn] = useState<{
    status: 'checking' | 'verified' | 'error';
    reference: string;
    bookingCode?: string;
    bookingStatus?: Booking['bookingStatus'];
    message?: string;
  } | null>(null);
  const paystackReturnStarted = useRef(false);

  // Load live data from Supabase or local storage when auth state changes.
  const loadData = useCallback(async () => {
    try {
      const [loadedUnits, loadedBookings, loadedBlocked, loadedSettings] = await Promise.all([
        fetchUnits(Boolean(currentUser)),
        fetchBookings(),
        fetchBlockedDates(),
        fetchSiteSettings(),
      ]);

      if (loadedUnits) setUnits(loadedUnits);
      if (loadedBookings) setBookings(loadedBookings);
      if (loadedBlocked) setBlockedDates(loadedBlocked);
      setSiteSettings(loadedSettings);
    } catch (err) {
      console.warn('Data load warning:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Staff login remains available through a private bookmark, without a public navigation link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('staff') !== 'login') return;
    setIsAdminAuthOpen(true);
    params.delete('staff');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || '';
    if (params.get('paystack') !== 'return' && !reference) return;
    if (paystackReturnStarted.current) return;
    paystackReturnStarted.current = true;
    params.delete('paystack');
    params.delete('reference');
    params.delete('trxref');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);

    if (!reference) {
      setPaystackReturn({ status: 'error', reference: '', message: 'Paystack returned without a transaction reference. Contact Aradad Homes before trying another payment.' });
      return;
    }
    setPaystackReturn({ status: 'checking', reference });
    void verifyPaystackCheckout(reference).then(result => {
      if (result.success) {
        setPaystackReturn({ status: 'verified', reference, bookingCode: result.bookingCode, bookingStatus: result.bookingStatus });
      } else {
        setPaystackReturn({ status: 'error', reference, message: `${result.error || 'The payment is not verified yet.'} Do not pay again until this transaction is checked.` });
      }
    });
  }, []);

  const retryPaystackVerification = async () => {
    const reference = paystackReturn?.reference;
    if (!reference) return;
    setPaystackReturn({ status: 'checking', reference });
    const result = await verifyPaystackCheckout(reference);
    if (result.success) {
      setPaystackReturn({ status: 'verified', reference, bookingCode: result.bookingCode, bookingStatus: result.bookingStatus });
    } else {
      setPaystackReturn({ status: 'error', reference, message: `${result.error || 'The payment is not verified yet.'} Do not pay again until this transaction is checked.` });
    }
  };

  useEffect(() => {
    let isMounted = true;
    getCurrentUser().then(user => {
      if (isMounted) setCurrentUser(user);
    }).catch(() => {
      if (isMounted) setCurrentUser(null);
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setIsHostDashboardOpen(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleToggleCurrency = () => {
    setCurrency(prev => (prev === 'USD' ? 'GHS' : 'USD'));
  };

  // Open booking modal for a specific individual room
  const handleOpenRoomBooking = (unit: Unit, room: Room, checkIn?: string, checkOut?: string, guests?: number) => {
    setSelectedUnitForBooking(unit);
    setSelectedRoomForBooking(room);
    setBookingCheckIn(checkIn || '');
    setBookingCheckOut(checkOut || '');
    setBookingGuests(guests || 1);
    setIsBookingModalOpen(true);
  };

  const handleBookingSuccess = (newBooking: Booking) => {
    setBookings(prev => [newBooking, ...prev]);
  };

  // Handle protected admin portal access
  const handleOpenAdminPortal = () => {
    if (currentUser) {
      setIsHostDashboardOpen(true);
    } else {
      setIsAdminAuthOpen(true);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setIsHostDashboardOpen(false);
    }
  };

  const handleCookieChoice = (choice: 'accept' | 'decline' | 'configure') => {
    const value = choice === 'accept' ? 'accepted' : choice === 'decline' ? 'declined' : 'configured';
    if (typeof window !== 'undefined') {
      localStorage.setItem('aradad_cookie_consent', value);
    }
    setCookie('aradad_cookie_consent', value, 365);
    setShowCookieBanner(false);
  };

  // Extract all individual rooms across apartments
  const allRooms = units.flatMap(u =>
    (u.rooms || []).filter(room => room.isActive !== false).map(r => ({ ...r, parentUnit: u }))
  );

  useEffect(() => {
    if (allRooms.every(room => room.images.length <= 1)) return;
    const timer = window.setInterval(() => {
      setSelectedRoomPhotos(current => {
        const next = { ...current };
        allRooms.forEach(room => {
          if (room.images.length <= 1) return;
          const currentImage = next[room.id] || room.images[0];
          const currentIndex = room.images.indexOf(currentImage);
          next[room.id] = room.images[(currentIndex + 1) % room.images.length];
        });
        return next;
      });
    }, 3500);

    return () => window.clearInterval(timer);
  }, [units]);

  const moveRoomPhoto = (room: Room, direction: -1 | 1) => {
    if (room.images.length <= 1) return;
    setSelectedRoomPhotos(current => {
      const currentImage = current[room.id] || room.images[0];
      const currentIndex = room.images.indexOf(currentImage);
      const nextIndex = (Math.max(currentIndex, 0) + direction + room.images.length) % room.images.length;
      return { ...current, [room.id]: room.images[nextIndex] };
    });
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans">
      {paystackReturn && (
        <div role="status" aria-live="polite" className="fixed top-4 left-1/2 z-[100] w-[min(92vw,36rem)] -translate-x-1/2 rounded-xl border border-stone-300 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-stone-900">
                {paystackReturn.status === 'checking' ? 'Verifying Paystack payment…'
                  : paystackReturn.status === 'verified' ? 'Payment verified'
                    : 'Payment needs checking'}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {paystackReturn.status === 'checking' ? 'Please wait while the secure payment service checks the transaction.'
                  : paystackReturn.status === 'verified'
                    ? `${paystackReturn.bookingCode ? `Booking ${paystackReturn.bookingCode}: ` : ''}${paystackReturn.bookingStatus === 'pending_approval' ? 'payment received; the stay is awaiting host approval.' : 'your reservation is confirmed.'}`
                    : paystackReturn.message}
              </p>
              {paystackReturn.reference && <p className="mt-1 break-all font-mono text-[11px] text-stone-500">Payment reference: {paystackReturn.reference}</p>}
              {paystackReturn.status === 'error' && paystackReturn.reference && (
                <button type="button" onClick={() => void retryPaystackVerification()} className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-stone-950">Retry verification</button>
              )}
            </div>
            <button type="button" onClick={() => setPaystackReturn(null)} aria-label="Dismiss payment status" className="rounded-full p-1 text-stone-500 hover:bg-stone-100">×</button>
          </div>
        </div>
      )}
      {/* Navigation Top Bar */}
      <Navbar
        currency={currency}
        siteSettings={siteSettings}
        currentUser={currentUser}
        onToggleCurrency={handleToggleCurrency}
        onOpenMyBooking={() => setIsMyBookingOpen(true)}
        onOpenAdminPortal={handleOpenAdminPortal}
        onLogout={handleLogout}
      />

      {showCookieBanner && (
        <div className="fixed inset-x-0 bottom-0 z-[120] bg-[#2d3a45]/95 backdrop-blur-md border-t border-white/10 px-4 pb-4 pt-3 shadow-2xl">
          <div className="mx-auto max-w-5xl rounded-[18px] bg-[#2b2f38]/90 p-4 text-stone-100 shadow-2xl ring-1 ring-white/10 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">How we use cookies</h3>
              <button
                type="button"
                onClick={() => handleCookieChoice('decline')}
                aria-label="Close cookie banner"
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-stone-200 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <p className="text-base sm:text-xl leading-relaxed text-stone-200">
              When you visit our website, we use strictly necessary cookies to ensure the website functions properly and securely. With your consent, we and our partners also use performance, analytics, and marketing cookies to measure website usage, improve our services, and deliver relevant advertising.
            </p>

            <p className="mt-4 text-base sm:text-lg leading-relaxed text-stone-200">
              You can find a full list of the cookies we use and learn more about how and why we process your personal data in our <span className="font-semibold text-amber-300 underline decoration-amber-300/80 underline-offset-4">Cookie Policy</span>. You may withdraw your consent at any time via the <span className="font-semibold text-amber-300 underline decoration-amber-300/80 underline-offset-4">Cookie Settings</span>.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleCookieChoice('accept')}
                className="w-full rounded-xl bg-[#f46b8d] px-4 py-4 text-xl font-black text-white shadow-lg shadow-pink-500/20 transition hover:brightness-110"
              >
                Accept all
              </button>

              <button
                type="button"
                onClick={() => handleCookieChoice('configure')}
                className="w-full rounded-xl bg-white/10 px-4 py-4 text-xl font-black text-white transition hover:bg-white/15"
              >
                Configure
              </button>

              <button
                type="button"
                onClick={() => handleCookieChoice('decline')}
                className="w-full rounded-xl bg-white/10 px-4 py-4 text-xl font-black text-white transition hover:bg-white/15"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* Hero Banner with Search & Availability Widget */}
        <Hero
          units={units}
          currency={currency}
          usdToGhsRate={siteSettings.usdToGhsRate}
          siteSettings={siteSettings}
          bookings={bookings}
          blockedDates={blockedDates}
          onSelectBooking={(unit, room, checkIn, checkOut, guests) => {
            handleOpenRoomBooking(unit, room, checkIn, checkOut, guests);
          }}
        />

        {/* Listings Section */}
        <section id="rooms" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
            <div>
              {/* Unboxed natural kicker */}
              <div className="text-xs uppercase tracking-widest text-[#C89B3C] font-semibold mb-2">
                Private Stays · Adjiringanor, Accra
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
                Private Rooms & En-Suite Suites
              </h2>
              <p className="text-stone-600 mt-2 text-sm sm:text-base font-light max-w-2xl leading-relaxed">
                Browse furnished private rooms with flexible weekly and monthly rates. Each room is reserved separately.
              </p>
            </div>

            <div className="px-4 py-2 rounded-lg bg-stone-100 text-stone-600 text-xs font-semibold self-start md:self-auto">
              {allRooms.length} {allRooms.length === 1 ? 'room' : 'rooms'} available
            </div>
          </div>

          {/* Room inventory only. Parent apartments remain internal room containers. */}
          {allRooms.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-600">
              <h3 className="font-serif text-xl font-semibold text-stone-900">No rooms are listed right now</h3>
              <p className="mt-2 text-sm">Please check back soon or contact us for availability.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {allRooms.map(room => (
                <div
                  key={room.id}
                  className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs hover:border-amber-400 transition-all flex flex-col justify-between"
                >
                  <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden">
                    <img
                      src={selectedRoomPhotos[room.id] || room.images[0] || room.parentUnit.images[2]}
                      alt={room.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {room.images.length > 1 && (
                      <>
                      <button
                        type="button"
                        onClick={() => moveRoomPhoto(room, -1)}
                        aria-label={`Previous photo of ${room.name}`}
                        className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRoomPhoto(room, 1)}
                        aria-label={`Next photo of ${room.name}`}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/45 backdrop-blur-sm">
                        {room.images.map((image, index) => (
                          <button
                            key={`${room.id}-photo-${index}`}
                            type="button"
                            onClick={() => setSelectedRoomPhotos(prev => ({ ...prev, [room.id]: image }))}
                            aria-label={`Show photo ${index + 1} of ${room.name}`}
                            aria-pressed={(selectedRoomPhotos[room.id] || room.images[0]) === image}
                            className={`h-1.5 rounded-full transition-all ${(selectedRoomPhotos[room.id] || room.images[0]) === image ? 'w-4 bg-amber-400' : 'w-1.5 bg-white/65 hover:bg-white'}`}
                          />
                        ))}
                      </div>
                      </>
                    )}
                    <div className="absolute top-2.5 left-2.5 bg-stone-900/80 backdrop-blur-xs text-white text-[11px] font-semibold px-2 py-0.5 rounded">
                      Private room · Adjiringanor
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mb-1">
                        <span>{room.bedType}</span>
                        <span aria-hidden="true">·</span>
                        <span>Private En-Suite</span>
                        <span aria-hidden="true">·</span>
                        <span>Split AC</span>
                      </div>

                      <h3 className="font-serif text-xl font-bold text-stone-900 mb-2">
                        {room.name}
                      </h3>

                      <p className="text-xs text-stone-600 font-light leading-relaxed mb-4">
                        {room.description ||
                          'Includes private en-suite bathroom, split air conditioning, and Starlink Wi-Fi access.'}
                      </p>

                      <div className="flex flex-wrap gap-2 text-[11px] text-stone-600 pb-3 border-b border-stone-100">
                        <span className="flex items-center gap-1">
                          <Wifi className="w-3 h-3 text-[#C89B3C]" /> Starlink Wi-Fi
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-[#C89B3C]" /> Standby Gen
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-[#C89B3C]" /> Max {room.maxGuests} Guests
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm font-bold text-stone-900 tabular-nums">
                          {formatCurrency(getRoomWeeklyRate(room), currency, siteSettings.usdToGhsRate)} <span className="text-[10px] font-sans font-normal text-stone-500">/ week</span>
                        </div>
                        <div className="font-mono text-xs text-stone-600 tabular-nums">
                          {formatCurrency(getRoomMonthlyRate(room), currency, siteSettings.usdToGhsRate)} <span className="text-[10px] font-sans text-stone-500">/ month</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenRoomBooking(room.parentUnit, room)}
                        className="px-4 py-2 text-xs font-semibold bg-[#C89B3C] hover:bg-[#DFB76C] text-stone-950 rounded-lg transition-colors shadow-xs"
                      >
                        Book Room
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Amenities Section */}
        <Suspense fallback={null}>
          <AmenitiesSection />
          <RulesAndPolicySection siteSettings={siteSettings} />
          <LocationSection siteSettings={siteSettings} />
        </Suspense>
      </main>

      {/* Footer */}
      <Suspense fallback={null}>
        <Footer
          onOpenMyBooking={() => setIsMyBookingOpen(true)}
          onOpenAdminPortal={handleOpenAdminPortal}
          isAdminSignedIn={Boolean(currentUser)}
          siteSettings={siteSettings}
        />
      </Suspense>

      {/* Modals */}
      {/* 1. Room Booking & Checkout Modal */}
      <Suspense fallback={null}>
      <BookingModal
        unit={selectedUnitForBooking}
        room={selectedRoomForBooking}
        currency={currency}
        siteSettings={siteSettings}
        initialCheckIn={bookingCheckIn}
        initialCheckOut={bookingCheckOut}
        initialGuests={bookingGuests}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onBookingSuccess={handleBookingSuccess}
      />

      {/* 2. Guest Stay Management Portal Modal */}
      <MyBookingModal
        isOpen={isMyBookingOpen}
        onClose={() => setIsMyBookingOpen(false)}
        siteSettings={siteSettings}
      />

      {/* 3. Management sign-in */}
      <AdminAuthModal
        isOpen={isAdminAuthOpen}
        onClose={() => setIsAdminAuthOpen(false)}
        onAuthSuccess={user => {
          setCurrentUser(user);
          setIsAdminAuthOpen(false);
          setIsHostDashboardOpen(true);
        }}
      />

      {/* 4. Protected Host Admin Portal */}
      {currentUser && (
        <HostDashboardModal
          currentUser={currentUser}
          bookings={bookings}
          blockedDates={blockedDates}
          units={units}
          currency={currency}
          isOpen={isHostDashboardOpen}
          onClose={() => setIsHostDashboardOpen(false)}
          onLogout={handleLogout}
          onRefreshData={loadData}
          siteSettings={siteSettings}
          onUpdateSiteSettings={newSettings => setSiteSettings(newSettings)}
        />
      )}
      </Suspense>
    </div>
  );
}
