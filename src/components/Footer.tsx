import React from 'react';
import { Phone, Mail, MapPin, CalendarCheck, Globe, Shield } from 'lucide-react';
import { AradadLogo } from './AradadLogo';
import { SiteSettings } from '../lib/types';

interface FooterProps {
  onOpenMyBooking: () => void;
  onOpenAdminPortal: () => void;
  isAdminSignedIn: boolean;
  siteSettings?: SiteSettings;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenMyBooking,
  onOpenAdminPortal,
  isAdminSignedIn,
  siteSettings,
}) => {
  const domain = siteSettings?.domain || 'adradhomesgh.com';
  const siteName = siteSettings?.siteName || 'Aradad Homes';
  const poweredBy = siteSettings?.poweredBy || 'JAMS TECH';
  const ownerName = siteSettings?.ownerName || 'James M. Nartey';
  const ownerPhone = siteSettings?.ownerPhone || '+233 55 097 7992';
  const ownerEmail = siteSettings?.ownerEmail || 'aradadhomes@gmail.com';
  const bankName = siteSettings?.bankAccountName || 'ARADAD HOMES';
  const bankNum = siteSettings?.bankAccountNumber || '1400011105469';
  const bankBranch = siteSettings?.bankBranch || 'Osu, Accra';
  const bankSwift = siteSettings?.bankSwiftCode || 'ACCCGHAC';
  const address = siteSettings
    ? [siteSettings.address, siteSettings.landmarks, siteSettings.neighborhood, siteSettings.city, siteSettings.country].filter(Boolean).join(', ')
    : 'Nii Kwei Mensah Street, Opposite Galaxy Int\'l School, Adjiringanor, Accra';
  const locationLabel = [siteSettings?.neighborhood || 'Adjiringanor', siteSettings?.city || 'Accra']
    .filter(Boolean)
    .join(', ');
  const deposit = siteSettings?.defaultSecurityDeposit ?? 300;

  return (
    <footer className="bg-[#0A0908] text-stone-300 border-t border-stone-800/80 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-stone-800">
          {/* Col 1: Brand & Bio */}
          <div className="space-y-4 md:col-span-1">
            <AradadLogo size="md" />
            <p className="text-xs text-stone-400 leading-relaxed font-light mt-3">
              Private furnished en-suite rooms in {locationLabel}, with standby power, high-speed Starlink Wi-Fi, and 24/7 security.
            </p>
            <div className="pt-1 flex items-start gap-2 text-xs text-stone-400">
              <MapPin className="w-3.5 h-3.5 text-[#C89B3C] shrink-0 mt-0.5" />
              <span>{address}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#DFB76C] font-mono">
              <Globe className="w-3.5 h-3.5" />
              <span>{domain}</span>
            </div>
          </div>

          {/* Col 2: Navigation & Portals */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-[#DFB76C] font-semibold">
              Guest Services
            </h4>
            <ul className="space-y-2 text-xs text-stone-400">
              <li>
                <a href="#rooms" className="hover:text-white transition-colors">
                  Private En-Suite Rooms
                </a>
              </li>
              <li>
                <a href="#amenities" className="hover:text-white transition-colors">
                  Starlink Wi-Fi & Generator Setup
                </a>
              </li>
              <li>
                <a href="#policies" className="hover:text-white transition-colors">
                  Quiet Hours & House Regulations
                </a>
              </li>
              <li>
                <button
                  onClick={onOpenMyBooking}
                  className="hover:text-[#DFB76C] transition-colors text-left flex items-center gap-1.5 pt-1 text-stone-300"
                >
                  <CalendarCheck className="w-3.5 h-3.5 text-[#C89B3C]" />
                  <span>Look Up My Reservation</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenAdminPortal}
                  className="hover:text-[#DFB76C] transition-colors text-left flex items-center gap-1.5 pt-1 text-stone-500"
                >
                  <Shield className="w-3.5 h-3.5 text-[#C89B3C]" />
                  <span>{isAdminSignedIn ? 'Open Admin Dashboard' : 'Admin Dashboard Login'}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Direct Host Contact */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-[#DFB76C] font-semibold">
              Host & Property Direct
            </h4>
            <div className="space-y-2 text-xs text-stone-400 font-light">
              <div>
                <span className="text-stone-500 block">General Manager:</span>
                <strong className="text-white font-medium">{ownerName}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#C89B3C] shrink-0" />
                <a href={`tel:${ownerPhone.replace(/\s+/g, '')}`} className="hover:text-white font-mono">
                  {ownerPhone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#C89B3C] shrink-0" />
                <a href={`mailto:${ownerEmail}`} className="hover:text-white">
                  {ownerEmail}
                </a>
              </div>
              <div className="pt-2">
                <a
                  href={`https://wa.me/${ownerPhone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <span>Chat on WhatsApp</span>
                </a>
              </div>
            </div>
          </div>

          {/* Col 4: Official Wire Settlement */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-[#DFB76C] font-semibold">
              Official Wire Settlement
            </h4>
            <div className="p-3 bg-stone-900 rounded-lg border border-stone-800 text-[11px] font-mono text-stone-400 space-y-1">
              <div>Beneficiary: <strong className="text-stone-200">{bankName}</strong></div>
              <div>Account: <strong className="text-stone-200">{bankNum}</strong></div>
              <div>Branch: <strong className="text-stone-200">{bankBranch}</strong></div>
              <div>SWIFT: <strong className="text-stone-200">{bankSwift}</strong></div>
            </div>

          </div>
        </div>

        {/* Bottom Bar with Powered by JAMS TECH */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 font-light gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p>© {new Date().getFullYear()} {siteName} Ghana ({domain}). All rights reserved.</p>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="text-[#C89B3C] font-medium tracking-wide">
              Powered by <strong className="text-white font-semibold">{poweredBy}</strong>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-stone-400">{locationLabel}</span>
            <span aria-hidden="true">·</span>
            <span>${deposit} Refundable Security Deposit</span>
            <span aria-hidden="true">·</span>
            <span>Uninterrupted Power Guarantee</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
