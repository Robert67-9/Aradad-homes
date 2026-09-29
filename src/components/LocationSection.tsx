import React from 'react';
import { SiteSettings } from '../lib/types';
import { MapPin, Navigation, Compass, ExternalLink, School, Plane, ShoppingBag, ShieldCheck } from 'lucide-react';

export const LocationSection: React.FC<{ siteSettings: SiteSettings }> = ({ siteSettings }) => {
  const propertyLocation = [siteSettings.address, siteSettings.neighborhood, siteSettings.city, siteSettings.country].filter(Boolean).join(', ');
  const mapSearch = encodeURIComponent([propertyLocation, siteSettings.landmarks].filter(Boolean).join(', '));
  return (
    <section id="location" className="py-20 bg-stone-100 border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Text Column */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-800 font-semibold mb-2">
                Prime Neighborhood
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
                {siteSettings.neighborhood}, {siteSettings.city}
              </h2>
              <p className="text-stone-600 mt-3 text-sm font-light leading-relaxed">
                Located at {siteSettings.address}, {siteSettings.landmarks}. {siteSettings.neighborhood} offers convenient access to nearby dining, shopping, and Kotoka International Airport.
              </p>
            </div>

            {/* Landmarks List */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-stone-200 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
                  <School className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Galaxy International School</h4>
                  <p className="text-[11px] text-stone-500 font-light">
                    Directly opposite the front security gate (instant landmark for drivers).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-stone-200 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">A&C Mall & East Legon Dining</h4>
                  <p className="text-[11px] text-stone-500 font-light">
                    Approx. 10–12 minutes away with high-end cafes, grocery marts, and banks.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-stone-200 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
                  <Plane className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Kotoka International Airport (ACC)</h4>
                  <p className="text-[11px] text-stone-500 font-light">
                    Approx. 25 minutes via the East Legon bypass or motorway.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`https://maps.google.com/?q=${mapSearch}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Compass className="w-4 h-4 text-amber-400" />
                Open Directions in Google Maps
                <ExternalLink className="w-3.5 h-3.5 text-stone-400" />
              </a>
            </div>
          </div>

            {/* Right map preview; clicking it opens Google's satellite view. */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-300 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-stone-900 text-stone-100 flex items-center justify-between border-b border-stone-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-medium">
                  {propertyLocation}
                </span>
              </div>
              <span className="text-[11px] text-stone-400 font-mono">{siteSettings.landmarks}</span>
            </div>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapSearch}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${siteSettings.siteName} in Google Maps`}
              title="Open this location in Google Maps"
              className="relative block h-80 sm:h-96 bg-stone-200 overflow-hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-amber-500 group"
            >
              {/* Graphic simulated styled map canvas */}
              <div className="absolute inset-0 bg-[#e5e3df] opacity-90">
                {/* SVG vector roads styling */}
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d5d0c7" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  {/* Main Roads */}
                  <path d="M 0,160 Q 200,180 500,140 T 900,180" fill="none" stroke="#ffffff" strokeWidth="18" />
                  <path d="M 0,160 Q 200,180 500,140 T 900,180" fill="none" stroke="#f0c05a" strokeWidth="4" />
                  {/* Secondary Roads */}
                  <path d="M 280,0 L 290,400" fill="none" stroke="#ffffff" strokeWidth="12" />
                  <path d="M 520,0 L 510,400" fill="none" stroke="#ffffff" strokeWidth="12" />
                  <path d="M 120,280 L 700,290" fill="none" stroke="#ffffff" strokeWidth="10" />
                  {/* Vegetation blocks */}
                  <rect x="60" y="40" width="160" height="80" rx="8" fill="#cbe6c4" opacity="0.7" />
                  <rect x="580" y="60" width="180" height="110" rx="8" fill="#cbe6c4" opacity="0.7" />
                  <rect x="360" y="220" width="120" height="90" rx="8" fill="#cbe6c4" opacity="0.6" />
                </svg>
              </div>

              {/* Pin for Aradad Homes */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-bounce duration-1000">
                <div className="px-3 py-1.5 bg-stone-900 text-white rounded-lg shadow-xl text-xs font-bold font-serif whitespace-nowrap border border-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {siteSettings.siteName}
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-stone-900" />
              </div>

              {/* Pin for Galaxy School */}
              <div className="absolute top-[35%] left-[55%] flex flex-col items-center">
                <div className="px-2.5 py-1 bg-white/95 text-stone-800 rounded shadow-md text-[10px] font-semibold whitespace-nowrap border border-stone-300 flex items-center gap-1">
                  <School className="w-3 h-3 text-blue-600" />
                  Galaxy Int'l School
                </div>
              </div>

              <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-stone-950/90 px-3 py-2 text-xs font-semibold text-white shadow-lg transition-colors group-hover:bg-amber-500 group-hover:text-stone-950">
                <ExternalLink className="h-3.5 w-3.5" />
                View Satellite Map
              </span>
            </a>

            <div className="p-3 bg-stone-50 border-t border-stone-200 text-xs text-stone-600 flex items-center justify-between">
              <span>{propertyLocation}</span>
              <span className="font-semibold text-stone-900">Gated Perimeter with 24/7 Security</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
