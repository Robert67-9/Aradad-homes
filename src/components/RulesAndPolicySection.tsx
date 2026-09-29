import React, { useState } from 'react';
import { SiteSettings } from '../lib/types';
import { HOUSE_RULES, CANCELLATION_POLICY } from '../lib/mockData';
import {
  ShieldAlert,
  VolumeX,
  Clock,
  CigaretteOff,
  FileText,
  BadgeCheck,
  ChevronDown,
  Info,
} from 'lucide-react';

export const RulesAndPolicySection: React.FC<{ siteSettings: SiteSettings }> = ({ siteSettings }) => {
  const [openAccordion, setOpenAccordion] = useState<number | null>(0);
  const applySettings = (text: string) => text
    .replaceAll('10:00 PM – 8:00 AM daily', siteSettings.quietHours)
    .replaceAll('$300', `$${siteSettings.defaultSecurityDeposit}`);

  const toggleAccordion = (index: number) => {
    setOpenAccordion(openAccordion === index ? null : index);
  };

  return (
    <section id="policies" className="py-20 bg-stone-50 border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12">
          <div className="text-xs uppercase tracking-widest text-amber-800 font-semibold mb-2">
            Standards & Transparency
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
            House Rules & Stay Policies
          </h2>
          <p className="text-stone-600 mt-3 text-sm sm:text-base font-light leading-relaxed">
            To preserve a quiet, peaceful, and elevated atmosphere for all residents in Adjiringanor, Aradad Homes maintains clear, non-negotiable community standards.
          </p>
        </div>

        {/* Important Warning Banner */}
        <div className="mb-10 p-5 rounded-xl bg-amber-50/80 border border-amber-300 text-stone-900 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0">
            <VolumeX className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-amber-950 mb-1">
              Strict Zero-Tolerance Noise & Sound Policy
            </h3>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-light">
              Bluetooth speakers, DJ equipment, subwoofers, and external PA systems are strictly prohibited at all times indoors and outdoors. Quiet hours are <strong>{siteSettings.quietHours}</strong>. Large parties, unauthorized commercial video shoots, or disruptive events are not permitted.
            </p>
          </div>
        </div>

        {/* House Privileges & Rules Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Column: Your Included Privileges */}
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-5">
            <h3 className="font-serif text-xl font-bold text-stone-900 pb-3 border-b border-stone-100 flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-amber-600" />
              <span>Your Resident Privileges</span>
            </h3>

            <div className="space-y-4">
              {HOUSE_RULES.privileges.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <h4 className="text-sm font-semibold text-stone-900">
                    {item.title}
                  </h4>
                  <p className="text-xs text-stone-600 font-light leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed Rules Accordion */}
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <h3 className="font-serif text-xl font-bold text-stone-900 pb-3 border-b border-stone-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Community Regulations</span>
            </h3>

            <div className="space-y-3">
              {HOUSE_RULES.rules.map((rule, idx) => {
                const isOpen = openAccordion === idx;
                return (
                  <div
                    key={idx}
                    className="border border-stone-200 rounded-xl overflow-hidden transition-colors"
                  >
                    <button
                      onClick={() => toggleAccordion(idx)}
                      className="w-full text-left p-4 bg-stone-50 hover:bg-stone-100 flex items-center justify-between transition-colors"
                    >
                      <span className="font-semibold text-sm text-stone-900">
                        {rule.title}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-amber-700' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="p-4 bg-white space-y-2 border-t border-stone-100 text-xs text-stone-600">
                        {rule.points.map((pt, pIdx) => (
                          <div key={pIdx} className="flex items-start gap-2">
                            <span className="text-amber-600 font-bold mt-0.5">•</span>
                            <span className="leading-relaxed font-light">{applySettings(pt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cancellation & Security Deposit Breakdown */}
        <div className="mt-12 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs">
          <div className="max-w-2xl mb-6">
            <h3 className="font-serif text-2xl font-bold text-stone-900">
              Cancellation & Refund Framework
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-1 font-light">
              Clear contractual clauses covering cancellations, early terminations, and the ${siteSettings.defaultSecurityDeposit} refundable security deposit.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-stone-700">
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <h4 className="font-semibold text-stone-900 text-sm">
                {CANCELLATION_POLICY.hostInitiated.title}
              </h4>
              <p className="leading-relaxed font-light text-stone-600">
                {applySettings(CANCELLATION_POLICY.hostInitiated.desc)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <h4 className="font-semibold text-stone-900 text-sm">
                {CANCELLATION_POLICY.tenantInitiated.title}
              </h4>
              <p className="leading-relaxed font-light text-stone-600">
                {applySettings(CANCELLATION_POLICY.tenantInitiated.desc)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <h4 className="font-semibold text-stone-900 text-sm">
                {CANCELLATION_POLICY.damageAssessment.title}
              </h4>
              <p className="leading-relaxed font-light text-stone-600">
                {applySettings(CANCELLATION_POLICY.damageAssessment.desc)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
