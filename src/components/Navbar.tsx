import React, { useState } from 'react';
import { Currency, SiteSettings } from '../lib/types';
import { AuthUser, logout } from '../lib/auth';
import { AradadLogo } from './AradadLogo';
import {
  CalendarCheck,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Shield,
} from 'lucide-react';

interface NavbarProps {
  currency: Currency;
  siteSettings: SiteSettings;
  currentUser: AuthUser | null;
  onToggleCurrency: () => void;
  onOpenMyBooking: () => void;
  onOpenAdminPortal: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currency,
  siteSettings,
  currentUser,
  onToggleCurrency,
  onOpenMyBooking,
  onOpenAdminPortal,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#0E0D0C]/95 backdrop-blur-md text-stone-100 border-b border-stone-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Zone 1: Official Brand Logo & Wordmark */}
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2 group">
            <AradadLogo size="md" />
          </a>
          <span className="hidden xl:inline-block text-[11px] uppercase tracking-[0.2em] text-[#C89B3C]/80 font-medium pl-3 border-l border-stone-800">
            {siteSettings.neighborhood} · {siteSettings.city}
          </span>
        </div>

        {/* Zone 2: Navigation Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-medium text-stone-300">
          <a href="#rooms" className="hover:text-[#DFB76C] transition-colors">
            Rooms
          </a>
          <a href="#amenities" className="hover:text-[#DFB76C] transition-colors">
            Amenities
          </a>
          <a href="#policies" className="hover:text-[#DFB76C] transition-colors">
            House Rules
          </a>
          <a href="#location" className="hover:text-[#DFB76C] transition-colors">
            Location
          </a>
          <button
            onClick={onOpenMyBooking}
            className="flex items-center gap-1.5 text-stone-300 hover:text-[#DFB76C] transition-colors"
          >
            <CalendarCheck className="w-4 h-4 text-[#C89B3C]" />
            <span>My Stay</span>
          </button>
        </nav>

        {/* Zone 3: Actions (Currency & signed-in staff access) */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Currency Toggle */}
          <button
            onClick={onToggleCurrency}
            title="Toggle Currency (USD / GHS)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700/80 transition-colors"
          >
            <span className={currency === 'USD' ? 'text-[#DFB76C] font-bold' : 'text-stone-400'}>
              USD $
            </span>
            <span className="text-stone-600">/</span>
            <span className={currency === 'GHS' ? 'text-[#DFB76C] font-bold' : 'text-stone-400'}>
              GHS GH₵
            </span>
          </button>

          {/* Staff portal controls appear only after a staff member signs in. */}
          {currentUser ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenAdminPortal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C89B3C] hover:bg-[#DFB76C] text-stone-950 transition-colors shadow-xs"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="max-w-[100px] truncate">{currentUser.name.split(' ')[0]} (Host)</span>
              </button>
              <button
                onClick={onLogout}
                title="Log out from staff portal"
                className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-700/80 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-stone-900 text-stone-300 hover:text-white border border-stone-800"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0D0D0C] border-b border-stone-800 px-4 pt-3 pb-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-2 text-sm font-medium text-stone-300">
            <a
              href="#rooms"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded hover:bg-stone-900 hover:text-[#DFB76C] transition-colors"
            >
              Private Rooms & Suites
            </a>
            <a
              href="#amenities"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded hover:bg-stone-900 hover:text-[#DFB76C] transition-colors"
            >
              Amenities & Utilities
            </a>
            <a
              href="#policies"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded hover:bg-stone-900 hover:text-[#DFB76C] transition-colors"
            >
              House Rules & Noise Regulations
            </a>
            <a
              href="#location"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded hover:bg-stone-900 hover:text-[#DFB76C] transition-colors"
            >
              Location & Landmarks
            </a>
          </div>

          <div className="pt-3 border-t border-stone-800/80 flex flex-col gap-2.5">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenMyBooking();
              }}
              className="w-full py-2.5 px-3 bg-stone-900 text-stone-200 rounded-lg text-xs font-semibold flex items-center justify-between border border-stone-800"
            >
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-[#C89B3C]" />
                <span>Look Up My Reservation</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>

            {currentUser && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAdminPortal();
                }}
                className="w-full py-2.5 px-3 bg-[#C89B3C] text-stone-950 font-bold rounded-lg text-xs flex items-center justify-between"
              >
                <span>Open Host Management Portal</span>
                <ChevronRight className="w-4 h-4 text-stone-950" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
