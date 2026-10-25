import React, { useState, useEffect } from 'react';
import { HelpCircle, ChevronDown, MapPin, Search } from 'lucide-react';
import { api } from '../services/api';
import { PickupLocation } from '../types';

export const FAQPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);

  useEffect(() => {
    api
      .getPickupLocations(true)
      .then((locs) => setPickupLocations(locs || []))
      .catch(() => {});
  }, []);

  const faqs = [
    {
      q: 'Does Riders Path own the bikes listed on the website?',
      a: 'No. Riders Path is a peer-to-peer student mobility marketplace that connects eligible ICFAI Hyderabad students with bikes listed by fellow student owners. Riders Path does not own or operate the vehicles.',
    },
    {
      q: 'Who is eligible to rent a bike on Riders Path?',
      a: 'Any currently enrolled student at ICFAI University Hyderabad who is 18 years of age or older, holds a valid Indian Driving Licence, and provides Aadhaar and ICFAI Student ID verification.',
    },
    {
      q: 'Where do pickups and returns take place?',
      a: 'All handovers and returns take place at designated campus pickup locations such as ICFAI Main Gate, Socials Gaming Zone, and Kaka\'s Hotel. The exact pickup location is shown on every bike card and detail page.',
    },
    {
      q: 'How do the security deposit and laptop collateral work?',
      a: 'During handover, renters provide a refundable cash security deposit (typically ₹600 to ₹2,000 depending on the vehicle) along with a working laptop as physical collateral. Both are returned upon timely return and post-ride inspection.',
    },
    {
      q: 'Are helmets included with the booking?',
      a: 'Yes. Every vehicle listing includes at least one ISI-certified helmet handed over with the keys. Wearing a helmet is mandatory at all times.',
    },
    {
      q: 'Who is responsible for traffic fines or e-challans?',
      a: 'The student renter is solely responsible for any traffic violations, speeding fines, or e-challans incurred during the active rental window.',
    },
    {
      q: 'How can I list my own bike on Riders Path?',
      a: 'Select "List Your Bike" in the top navigation bar, enter your ICFAI enrollment number and vehicle specifications, set your daily rate, and submit for admin review.',
    },
  ];

  const filteredFaqs = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase())
  );

  const hubs =
    pickupLocations.length > 0
      ? pickupLocations
      : [
          {
            id: 'loc-1',
            name: 'ICFAI Main Gate',
            address: 'Main Entrance Gate, Shankerpally Road',
            landmark: 'Opposite University Security Post',
            isActive: true,
            displayOrder: 1,
            createdAt: '',
          },
          {
            id: 'loc-2',
            name: 'Socials Gaming Zone',
            address: 'Campus Commercial Strip',
            landmark: 'Near Student Recreation Corner',
            isActive: true,
            displayOrder: 2,
            createdAt: '',
          },
          {
            id: 'loc-3',
            name: "Kaka's Hotel",
            address: 'Campus Outer Boulevard',
            landmark: 'Cafeteria & Eatery Corner',
            isActive: true,
            displayOrder: 3,
            createdAt: '',
          },
        ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-4 max-w-2xl">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#29483B]">
          <HelpCircle className="w-4 h-4" />
          <span>Help &amp; Pickup Locations</span>
        </div>
        <h1 className="rp-page-title">Frequently Asked Questions</h1>
        <p className="rp-text-secondary">
          Clear answers on student eligibility, campus pickup locations, security deposits, and peer-to-peer bike listings.
        </p>

        {/* Search */}
        <div className="relative max-w-md pt-1">
          <Search className="w-4 h-4 text-[#70756F] absolute left-3.5 top-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions (e.g. deposit, licence, pickup, helmet)..."
            className="rp-input !pl-10"
          />
        </div>
      </div>

      {/* Campus Hubs Reference Banner */}
      <div className="p-6 rp-card space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#29483B]">
          <MapPin className="w-4 h-4" />
          <span>Designated Campus Pickup Locations</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {hubs.map((hub) => (
            <div
              key={hub.id}
              className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5"
            >
              <span className="font-semibold text-[#202522] block">{hub.name}</span>
              <span className="text-[11px] text-[#70756F] block">
                {hub.landmark || hub.address}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Accordion list */}
      <div className="space-y-3">
        {filteredFaqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={idx} className="rp-card overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 font-display font-semibold text-sm text-[#202522] hover:text-[#29483B] transition-colors"
                aria-expanded={isOpen}
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#70756F] shrink-0 transition-transform duration-150 ${
                    isOpen ? 'rotate-180 text-[#29483B]' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-xs text-[#70756F] leading-relaxed border-t border-[#E5E4DE] pt-3.5">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
