import React, { useEffect, useState } from 'react';
import { Unit, Room, Currency } from '../lib/types';
import { formatCurrency, getRoomMonthlyRate, getRoomWeeklyRate } from '../lib/utils';
import {
  X,
  Bed,
  Bath,
  Users,
  Wifi,
  Zap,
  ShieldCheck,
  Check,
  ChevronRight,
  Info,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface RoomListModalProps {
  unit: Unit | null;
  currency: Currency;
  isOpen: boolean;
  onClose: () => void;
  onBookEntireApartment: (unit: Unit) => void;
  onBookRoom: (unit: Unit, room: Room) => void;
}

export const RoomListModal: React.FC<RoomListModalProps> = ({
  unit,
  currency,
  isOpen,
  onClose,
  onBookEntireApartment,
  onBookRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'amenities' | 'policies'>('overview');
  const [selectedPhoto, setSelectedPhoto] = useState<string>(unit?.images[0] || '');
  const [selectedRoomPhotos, setSelectedRoomPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (unit) {
      setSelectedPhoto(unit.images[0] || '');
      setSelectedRoomPhotos({});
      setActiveTab('overview');
    }
  }, [unit?.id]);

  if (!isOpen || !unit) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
              {unit.propertyType}
            </div>
            <h2 className="font-serif text-2xl font-bold text-stone-900">{unit.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-stone-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 px-6 gap-6 bg-white text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Overview & Photos
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'rooms'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Individual Rooms ({unit.rooms?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('amenities')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'amenities'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            All Amenities ({unit.amenities.length})
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'policies'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            House Rules & Policies
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-6 flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Photo Showcase */}
              <div className="space-y-3">
                <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-stone-100 border border-stone-200">
                  <img
                    src={selectedPhoto}
                    alt="Apartment Interior"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {/* Thumbnails */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {unit.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhoto(img)}
                      className={`w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                        selectedPhoto === img ? 'border-amber-500 scale-102' : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="Thumbnail" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                <div>
                  <span className="text-stone-500 block">Bedrooms</span>
                  <span className="font-semibold text-stone-900 text-sm">{unit.bedrooms} Private En-Suite</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Bathrooms</span>
                  <span className="font-semibold text-stone-900 text-sm">{unit.bathrooms} Modern Baths</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Maximum Occupancy</span>
                  <span className="font-semibold text-stone-900 text-sm">Up to {unit.maxOccupancy} Guests</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Prepaid Electricity</span>
                  <span className="font-semibold text-stone-900 text-sm">GH₵ {unit.prepaidElectricityGhc} Included</span>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-2">
                  Apartment Description & Layout
                </h4>
                <p className="text-stone-700 leading-relaxed text-sm whitespace-pre-line font-light">
                  {unit.description}
                </p>
              </div>

              {/* Key Guest Privileges */}
              <div className="border-t border-stone-200 pt-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
                  Included Guest Privileges
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-700">
                  <div className="flex items-start gap-2">
                    <Wifi className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-stone-900">Complimentary Starlink Wi-Fi</strong>
                      High-speed satellite internet throughout the apartment.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-stone-900">Uninterrupted Power Guarantee</strong>
                      Standby automatic generator kicks in instantly if municipal power drops.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-stone-900">24/7 Gated Security & CCTV</strong>
                      Dedicated security personnel and controlled compound access.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-stone-900">Zero Cleaning Fee</strong>
                      Complimentary professional housekeeping and fresh linens.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                You can book the entire apartment or select an individual en-suite bedroom chamber below.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {unit.rooms?.map(room => (
                  <div
                    key={room.id}
                    className="p-4 rounded-xl border border-stone-200 hover:border-amber-400 bg-stone-50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[4/3] rounded-lg overflow-hidden mb-3 bg-stone-200">
                        <img
                          src={selectedRoomPhotos[room.id] || room.images[0] || unit.images[2]}
                          alt={room.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      {room.images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
                          {room.images.map((image, index) => (
                            <button
                              key={`${room.id}-photo-${index}`}
                              type="button"
                              onClick={() => setSelectedRoomPhotos(prev => ({ ...prev, [room.id]: image }))}
                              aria-label={`Show ${room.name} photo ${index + 1}`}
                              className={`w-14 h-10 shrink-0 overflow-hidden rounded border-2 ${
                                (selectedRoomPhotos[room.id] || room.images[0]) === image ? 'border-amber-500' : 'border-transparent opacity-75 hover:opacity-100'
                              }`}
                            >
                              <img src={image} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <h4 className="font-serif text-lg font-bold text-stone-900">{room.name}</h4>
                      <div className="flex items-center gap-2 text-xs text-stone-600 my-1.5">
                        <span>{room.bedType}</span>
                        <span>·</span>
                        <span>Private En-Suite Bath</span>
                        <span>·</span>
                        <span>Split AC</span>
                      </div>
                      {room.description && (
                        <p className="text-xs text-stone-500 mt-2 font-light">{room.description}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-200 flex items-end justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-mono text-sm font-bold text-stone-900 tabular-nums">
                          {formatCurrency(getRoomWeeklyRate(room), currency)} <span className="text-[10px] font-sans font-normal text-stone-500">/ week</span>
                        </div>
                        <div className="font-mono text-xs text-stone-600 tabular-nums">
                          {formatCurrency(getRoomMonthlyRate(room), currency)} <span className="text-[10px] font-sans text-stone-500">/ month</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onBookRoom(unit, room);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-lg transition-colors"
                      >
                        Book This Room
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'amenities' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
                Full Property Features & Amenities
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {unit.amenities.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 p-2 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-stone-800 font-medium text-xs sm:text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'policies' && (
            <div className="space-y-6 text-sm text-stone-700">
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <h4 className="font-semibold text-red-900 mb-1 flex items-center gap-2">
                  <Info className="w-4 h-4 text-red-700" />
                  NO Speakers / Amplified Sound (Zero Tolerance)
                </h4>
                <p className="text-xs text-red-800 leading-relaxed">
                  Bluetooth speakers, DJ equipment, PA systems, subwoofers, or external sound systems are strictly
                  prohibited at all times indoors and outdoors. Quiet hours: 10:00 PM – 8:00 AM daily.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-stone-900">Check-In & Occupancy</h4>
                <ul className="list-disc list-inside space-y-1 text-xs text-stone-600">
                  <li>Standard check-in: 3:00 PM (15:00) | Check-out: 11:00 AM</li>
                  <li>Maximum {unit.maxOccupancy} guests total. Unregistered overnight guests not permitted.</li>
                  <li>Primary guest must show valid government photo ID upon arrival.</li>
                  <li>Minimum stay: {unit.minimumStay} night | Maximum stay: {unit.maximumStay} nights</li>
                </ul>
              </div>

              <div className="space-y-3 border-t border-stone-200 pt-4">
                <h4 className="font-semibold text-stone-900">Cancellation & Security Deposit ($300)</h4>
                <ul className="list-disc list-inside space-y-1 text-xs text-stone-600">
                  <li><strong>Host-Initiated Cancellation:</strong> 100% refund of unstayed nights minus documented damages.</li>
                  <li><strong>Tenant-Initiated Cancellation:</strong> Up to 70% refund of unstayed nights (30% retained for operational costs & calendar blocking).</li>
                  <li>$300 refundable security deposit returned within 1–3 business days following property inspection.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-stone-900 tabular-nums">
                {formatCurrency(unit.nightlyRate, currency)}
              </span>
              <span className="text-xs text-stone-500">/ night</span>
            </div>
            <div className="text-xs text-stone-500 font-mono">
              Monthly: {formatCurrency(unit.weeklyMonthlyRate, currency)} · $300 deposit
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                onBookEntireApartment(unit);
              }}
              className="px-6 py-2.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-lg transition-colors shadow-sm"
            >
              Reserve Entire Apartment &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
