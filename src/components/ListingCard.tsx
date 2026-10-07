import React, { useRef, useState } from 'react';
import { Unit, Currency } from '../lib/types';
import { formatCurrency } from '../lib/utils';
import {
  Bed,
  Bath,
  Users,
  Wifi,
  Zap,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Calendar,
  X,
} from 'lucide-react';

interface ListingCardProps {
  unit: Unit;
  currency: Currency;
  onBookNow: (unit: Unit) => void;
  onViewDetails: (unit: Unit) => void;
}

export const ListingCard: React.FC<ListingCardProps> = ({
  unit,
  currency,
  onBookNow,
  onViewDetails,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const nextImage = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    setActiveImageIndex(prev => (prev + 1) % unit.images.length);
  };

  const prevImage = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    setActiveImageIndex(prev => (prev - 1 + unit.images.length) % unit.images.length);
  };

  const openGallery = (event?: React.MouseEvent | React.KeyboardEvent | React.TouchEvent) => {
    event?.stopPropagation();
    setIsGalleryOpen(true);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) {
      nextImage(event);
    } else {
      prevImage(event);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
        {/* Image Gallery Container */}
        <div
          className="relative aspect-[16/10] bg-stone-100 overflow-hidden group cursor-pointer"
          onClick={openGallery}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="button"
          tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openGallery(event);
            }
          }}
        >
          <img
            src={unit.images[activeImageIndex]}
            alt={`${unit.title} - View ${activeImageIndex + 1}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />

          {/* Carousel arrows */}
          {unit.images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center shadow-lg transition hover:bg-black/75"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={nextImage}
                aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center shadow-lg transition hover:bg-black/75"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Image dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-xs">
            {unit.images.map((_, idx) => (
              <button
                key={idx}
                onClick={e => {
                  e.stopPropagation();
                  setActiveImageIndex(idx);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  idx === activeImageIndex ? 'w-4 bg-amber-400' : 'bg-white/60'
                }`}
              />
            ))}
          </div>

          {/* Property Type unboxed indicator */}
          <div className="absolute top-3 left-3 bg-stone-900/80 backdrop-blur-xs text-white text-xs font-semibold px-2.5 py-1 rounded">
            {unit.propertyType}
          </div>
        </div>

      {/* Content Area */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Metadata unboxed discipline */}
          <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mb-1">
            <span>Adjiringanor, Accra</span>
            <span aria-hidden="true">·</span>
            <span>Opposite Galaxy School</span>
          </div>

          <h3 className="font-serif text-2xl font-bold text-stone-900 tracking-tight mb-2 hover:text-amber-800 transition-colors">
            {unit.title}
          </h3>

          <p className="text-sm text-stone-600 line-clamp-2 mb-4 leading-relaxed font-light">
            {unit.subtitle}
          </p>

          {/* Quick Specifications */}
          <div className="grid grid-cols-3 gap-2 py-3 border-y border-stone-100 text-xs text-stone-700 font-medium mb-4">
            <div className="flex items-center gap-1.5">
              <Bed className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{unit.bedrooms} En-Suite Beds</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Bath className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{unit.bathrooms} Bathrooms</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Up to {unit.maxOccupancy} Guests</span>
            </div>
          </div>

          {/* Key included amenities tags */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 mb-6">
            <span className="flex items-center gap-1 text-stone-700">
              <Wifi className="w-3.5 h-3.5 text-amber-600" /> Starlink Wi-Fi
            </span>
            <span aria-hidden="true" className="text-stone-300">·</span>
            <span className="flex items-center gap-1 text-stone-700">
              <Zap className="w-3.5 h-3.5 text-amber-600" /> Standby Power
            </span>
            <span aria-hidden="true" className="text-stone-300">·</span>
            <span className="flex items-center gap-1 text-stone-700">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> 24/7 Guard & CCTV
            </span>
            <span aria-hidden="true" className="text-stone-300">·</span>
            <span className="text-stone-700">
              GH₵ {unit.prepaidElectricityGhc} Power Credit
            </span>
          </div>
        </div>

        {/* Pricing & Booking Footer */}
        <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-stone-900 tabular-nums">
                {formatCurrency(unit.nightlyRate, currency)}
              </span>
              <span className="text-xs text-stone-500">/ night</span>
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Monthly: {formatCurrency(unit.weeklyMonthlyRate, currency)} · $0 clean fee
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewDetails(unit)}
              className="px-3 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              Details & Rooms
            </button>
            <button
              onClick={() => onBookNow(unit)}
              className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>

      {isGalleryOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8"
          onClick={() => setIsGalleryOpen(false)}
        >
          <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIsGalleryOpen(false)}
              aria-label="Close gallery"
              className="absolute -top-3 right-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>

            <div
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black"
              onTouchStart={event => {
                touchStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={event => {
                if (touchStartX.current == null) return;
                const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(deltaX) < 50) return;
                if (deltaX < 0) {
                  setActiveImageIndex(prev => (prev + 1) % unit.images.length);
                } else {
                  setActiveImageIndex(prev => (prev - 1 + unit.images.length) % unit.images.length);
                }
              }}
            >
              <img
                src={unit.images[activeImageIndex]}
                alt={`${unit.title} photo ${activeImageIndex + 1}`}
                className="h-[72vh] w-full object-cover"
                referrerPolicy="no-referrer"
              />

              {unit.images.length > 1 && (
                <>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      prevImage();
                    }}
                    aria-label="Previous full gallery image"
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/60"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      nextImage();
                    }}
                    aria-label="Next full gallery image"
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/60"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}

              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
                {unit.images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={e => {
                      e.stopPropagation();
                      setActiveImageIndex(idx);
                    }}
                    className={`h-2.5 rounded-full transition-all ${
                      idx === activeImageIndex ? 'w-7 bg-amber-400' : 'w-2.5 bg-white/75'
                    }`}
                    aria-label={`View image ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
