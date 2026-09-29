import React from 'react';
import {
  Wifi,
  Zap,
  Shield,
  Car,
  CookingPot,
  Wind,
  Tv,
  Sparkles,
  Droplets,
  CheckCircle,
} from 'lucide-react';

export const AmenitiesSection: React.FC = () => {
  const highlights = [
    {
      icon: Wifi,
      title: 'High-Speed Starlink Wi-Fi',
      desc: 'Complimentary, uncapped satellite internet throughout every room and balcony. Ideal for seamless video conferencing, remote work, and streaming.',
    },
    {
      icon: Zap,
      title: '24/7 Automatic Generator',
      desc: 'Uninterrupted power security. Our standby diesel generator kicks in automatically during municipal grid drops so your AC and lights never falter.',
    },
    {
      icon: Droplets,
      title: 'Dedicated Water Reservoirs',
      desc: 'High-capacity on-site water storage tanks and automated pressure pumps guarantee consistent, high-pressure hot & cold running water.',
    },
    {
      icon: Shield,
      title: '24/7 Gated Security & CCTV',
      desc: 'Secure perimeter walls with 24/7 uniformed security personnel stationed at the main gate and full external compound CCTV surveillance.',
    },
    {
      icon: Wind,
      title: 'Split Air Conditioners',
      desc: 'Individual high-efficiency split AC units installed in every bedroom, living area, and dining space for customized thermal comfort.',
    },
    {
      icon: CookingPot,
      title: 'Fully Fitted Modern Kitchen',
      desc: 'Double-door refrigerator, cooker/oven, microwave, electric kettle, cookware sets, and full tableware for effortless self-catering.',
    },
    {
      icon: Car,
      title: 'Designated On-Site Parking',
      desc: 'Gated parking bays with ample room for multiple registered vehicles, providing secure off-street convenience for you and your guests.',
    },
    {
      icon: Sparkles,
      title: 'Prepaid Electricity & Housekeeping',
      desc: 'Each stay includes a complimentary initial electricity credit of GH₵ 500 (3-bed) or GH₵ 350 (2-bed) plus regular fresh linen changes.',
    },
  ];

  return (
    <section id="amenities" className="py-20 bg-stone-100 border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          {/* Unboxed natural kicker */}
          <div className="text-xs uppercase tracking-widest text-amber-800 font-semibold mb-2">
            Comfort · Reliability · Security
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
            Designed for Flawless Stays in Accra
          </h2>
          <p className="text-stone-600 mt-3 text-sm sm:text-base font-light leading-relaxed">
            Every feature at Aradad Homes is engineered to eliminate the common friction of short-stay accommodation. Enjoy continuous power, dependable water, high-speed Starlink Wi-Fi, and 24/7 peace of mind.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {highlights.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs hover:border-amber-400 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-serif text-lg font-bold text-stone-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
