import React, { useState, useEffect } from 'react';
import { Bike, PickupLocation } from '../types';
import { BikeCard } from '../components/BikeCard';
import { VehicleImage } from '../components/VehicleImage';
import { api } from '../services/api';
import {
  ArrowRight,
  MapPin,
  CheckCircle2,
  Lock,
  Award,
  Laptop,
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (view: string, params?: any) => void;
  bikes?: Bike[];
  onSelectBike: (bike: Bike | string) => void;
  onBookBike?: (bike: Bike) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  bikes: initialBikes,
  onSelectBike,
  onBookBike,
}) => {
  const [selectedType, setSelectedType] = useState('ALL');
  const [bikesList, setBikesList] = useState<Bike[]>(initialBikes || []);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [ownerDaysPerWeek, setOwnerDaysPerWeek] = useState(4);
  const [ownerAvgPrice, setOwnerAvgPrice] = useState(550);

  useEffect(() => {
    if (initialBikes && initialBikes.length > 0) {
      setBikesList(initialBikes);
    } else {
      api
        .getBikes()
        .then((data) => setBikesList(data || []))
        .catch((err) => console.error('Failed to load bikes for home page:', err));
    }

    api
      .getPickupLocations(true)
      .then((locs) => setPickupLocations(locs || []))
      .catch(() => {});
  }, [initialBikes]);

  const handleSelect = (bike: Bike) => {
    if (typeof onSelectBike === 'function') {
      onSelectBike(bike.id || (bike as any));
    }
  };

  const handleBook = (bike: Bike) => {
    if (typeof onBookBike === 'function') {
      onBookBike(bike);
    } else {
      onNavigate('book', { bikeId: bike.id });
    }
  };

  const approvedBikes = (bikesList || []).filter(
    (b) => b && b.active && b.approvedByAdmin
  );

  const availableBikes = approvedBikes.filter(
    (b) => b.availabilityStatus === 'AVAILABLE'
  );

  const displayedBikes = approvedBikes
    .filter((b) => selectedType === 'ALL' || b.bikeType === selectedType)
    .slice(0, 6);

  const defaultHubs = [
    {
      name: 'ICFAI Main Gate',
      address: 'Main Entrance Gate, Shankerpally Road',
      landmark: 'Opposite University Security Post',
    },
    {
      name: 'Socials Gaming Zone',
      address: 'Campus Commercial Strip',
      landmark: 'Near Student Recreation Corner',
    },
    {
      name: "Kaka's Hotel",
      address: 'Campus Outer Boulevard',
      landmark: 'Cafeteria & Eatery Corner',
    },
  ];

  const hubsToShow =
    pickupLocations.length > 0
      ? pickupLocations.map((loc) => ({
          name: loc.name,
          address: loc.address || 'Designated Campus Pickup Point',
          landmark: loc.landmark || 'Direct Student Handover',
        }))
      : defaultHubs;

  const estimatedMonthlyEarnings = Math.round(ownerDaysPerWeek * 4 * ownerAvgPrice * 0.92);

  return (
    <div className="space-y-20">
      {/* 1. HOMEPAGE HERO */}
      <section className="border-b border-[#E5E4DE] bg-[#F7F6F2] pt-10 pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Column: Value Proposition & Dual CTAs */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8 py-2">
              <div className="space-y-5">
                <p className="rp-kicker">
                  Your campus. Your ride. Your path. · ICFAI Hyderabad
                </p>
                <h1 className="font-display font-bold text-4xl sm:text-5xl text-[#202522] leading-[1.12] tracking-tight max-w-xl">
                  Your next ride starts here.
                </h1>
                <p className="text-base sm:text-lg text-[#70756F] max-w-xl leading-relaxed">
                  Explore bikes available from the campus community. Find a ride that fits your plans, or list your own bike when it sits parked between classes.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    id="hero-explore-bikes-btn"
                    onClick={() => onNavigate('bikes')}
                    className="rp-btn rp-btn-primary rp-btn-lg"
                  >
                    <span>Explore Bikes</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    id="hero-list-bike-btn"
                    onClick={() => onNavigate('onboard')}
                    className="rp-btn rp-btn-secondary rp-btn-lg"
                  >
                    <span>List Your Bike</span>
                  </button>
                </div>

                {/* Unboxed Campus Context Metadata */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#70756F] pt-2 border-t border-[#E5E4DE]">
                  <span>Exclusively for eligible ICFAI Hyderabad students</span>
                  <span aria-hidden="true">·</span>
                  <span>Designated campus pickup points</span>
                  <span aria-hidden="true">·</span>
                  <span>Direct student-to-student handovers</span>
                </div>
              </div>
            </div>

            {/* Right Column: Editorial Motorcycle Composition */}
            <div className="lg:col-span-5">
              <div className="relative h-72 sm:h-80 lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-[#E5E4DE] bg-[#EFEEE8]">
                <VehicleImage
                  src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1400&q=85"
                  alt="Motorcycle available in the ICFAI Hyderabad campus community"
                  brand="Royal Enfield"
                  model="Hunter 350 Roadster"
                  bikeType="Cruiser"
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 text-white flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-white/80">Campus Pickup Locations</p>
                    <p className="font-display font-semibold text-sm">
                      ICFAI Main Gate · Socials · Kaka&apos;s Hotel
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-white/95 text-[#202522] px-2.5 py-1 rounded-md font-medium tabular-nums shrink-0">
                    From ₹399 / day
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width 4-Column Campus Overview Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white border border-[#E5E4DE]">
              <span className="text-xs text-[#70756F] block">Campus Fleet</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-2xl text-[#202522] tabular-nums">
                  {availableBikes.length} Available
                </span>
                <span className="text-xs text-[#70756F] tabular-nums">
                  of {approvedBikes.length} listed
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#E5E4DE]">
              <span className="text-xs text-[#70756F] block">Daily Rates From</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-display font-bold text-2xl text-[#202522] tabular-nums">
                  ₹399
                </span>
                <span className="text-xs text-[#70756F]">/ 24 hours</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#E5E4DE]">
              <span className="text-xs text-[#70756F] block">Pickup Points</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-display font-bold text-2xl text-[#202522] tabular-nums">
                  {hubsToShow.length} Hubs
                </span>
                <span className="text-xs text-[#70756F]">On &amp; Near Campus</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#E5E4DE]">
              <span className="text-xs text-[#70756F] block">Renter Eligibility</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-display font-bold text-2xl text-[#29483B]">
                  ICFAI ID
                </span>
                <span className="text-xs text-[#70756F]">+ Valid DL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FEATURED CAMPUS BIKES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E4DE] pb-5">
          <div className="space-y-1">
            <span className="rp-kicker block">Available Fleet</span>
            <h2 className="rp-section-heading">Explore Bikes Near Campus</h2>
            <p className="rp-text-secondary">
              Motorcycles and scooters listed by fellow ICFAI Hyderabad students.
            </p>
          </div>

          {/* Interactive Category Segmented Filter */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE] overflow-x-auto">
            {['ALL', 'Cruiser', 'Street', 'Commuter', 'Sport', 'Electric', 'Scooter'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  selectedType === t
                    ? 'bg-white text-[#202522] font-semibold shadow-2xs'
                    : 'text-[#70756F] hover:text-[#202522]'
                }`}
              >
                {t === 'ALL' ? 'All Bikes' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Bike Grid */}
        {displayedBikes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedBikes.map((bike) => (
              <BikeCard
                key={bike.id}
                bike={bike}
                onSelect={handleSelect}
                onBookNow={handleBook}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center rounded-xl bg-white border border-[#E5E4DE] space-y-3">
            <p className="text-sm text-[#70756F]">No bikes match the selected category.</p>
            <button
              onClick={() => setSelectedType('ALL')}
              className="rp-btn rp-btn-secondary"
            >
              Show All Bikes
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <button
            onClick={() => onNavigate('bikes')}
            className="rp-btn rp-btn-secondary rp-btn-lg"
          >
            <span>Explore Full Fleet ({approvedBikes.length} Bikes)</span>
            <ArrowRight className="w-4 h-4 text-[#29483B]" />
          </button>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <span className="rp-kicker block">Simple Process</span>
            <h2 className="rp-section-heading">How Riders Path Works</h2>
            <p className="rp-text-secondary">
              A straightforward four-step process from selecting a bike to returning it at the campus pickup point.
            </p>
          </div>
          <button
            onClick={() => onNavigate('how-it-works')}
            className="rp-btn rp-btn-secondary rp-btn-sm self-start sm:self-auto"
          >
            <span>Full Process Guide</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              step: '01',
              title: 'Browse & Select',
              desc: 'Compare available student-listed bikes by daily rate, category, transmission, and campus pickup location.',
            },
            {
              step: '02',
              title: 'Submit Verification',
              desc: 'Enter your ICFAI enrollment number, select your rental window, and upload your Driving Licence and Aadhaar card.',
            },
            {
              step: '03',
              title: 'Campus Handover',
              desc: 'Once approved, meet the student owner at the pickup hub, deposit your laptop collateral, and collect the keys and helmet.',
            },
            {
              step: '04',
              title: 'Return & Refund',
              desc: 'Return the bike at the agreed time and condition to immediately retrieve your laptop collateral and refundable deposit.',
            },
          ].map((item) => (
            <div key={item.step} className="p-5 rp-card space-y-3">
              <span className="font-mono text-xs font-semibold text-[#29483B] block">
                {item.step}. Step
              </span>
              <h3 className="rp-card-title">{item.title}</h3>
              <p className="text-xs text-[#70756F] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. LIST YOUR BIKE / STUDENT OWNER SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-10 rounded-xl bg-white border border-[#E5E4DE]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-2">
                <span className="rp-kicker block">For Student Bike Owners</span>
                <h2 className="rp-section-heading">
                  Put your parked bike to work on campus
                </h2>
                <p className="rp-text-secondary">
                  If your motorcycle or scooter stays parked during lectures, list it on Riders Path. You set your daily rate, choose your preferred pickup hub, and rent only to verified ICFAI peers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-[#202522]">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#347653] shrink-0 mt-0.5" />
                  <span>
                    <strong>You Control Pricing:</strong> Set your own daily and hourly rates.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#347653] shrink-0 mt-0.5" />
                  <span>
                    <strong>Campus Pickup Points:</strong> Hand over keys at familiar campus hubs.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#347653] shrink-0 mt-0.5" />
                  <span>
                    <strong>Collateral Protection:</strong> Renters deposit a working laptop at handover.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#347653] shrink-0 mt-0.5" />
                  <span>
                    <strong>Admin Reviewed:</strong> Every renter and booking is screened before handover.
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-6 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-5">
              <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3.5">
                <span className="font-display font-semibold text-sm text-[#202522]">
                  Owner Earnings Calculator
                </span>
                <span className="text-xs text-[#70756F]">92% Host Share</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#70756F]">Days rented per week</span>
                  <span className="font-mono font-semibold text-[#202522] tabular-nums">
                    {ownerDaysPerWeek} days / week
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={ownerDaysPerWeek}
                  onChange={(e) => setOwnerDaysPerWeek(Number(e.target.value))}
                  className="w-full accent-[#29483B] cursor-pointer"
                  aria-label="Days rented per week"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#70756F]">Your daily rate</span>
                  <span className="font-mono font-semibold text-[#202522] tabular-nums">
                    ₹{ownerAvgPrice} / day
                  </span>
                </div>
                <input
                  type="range"
                  min={350}
                  max={1200}
                  step={50}
                  value={ownerAvgPrice}
                  onChange={(e) => setOwnerAvgPrice(Number(e.target.value))}
                  className="w-full accent-[#29483B] cursor-pointer"
                  aria-label="Daily rental rate"
                />
              </div>

              <div className="p-4 rounded-lg bg-white border border-[#E5E4DE] text-center space-y-1">
                <span className="text-xs text-[#70756F] block">Estimated Monthly Net Payout</span>
                <div className="font-display font-bold text-3xl text-[#29483B] tabular-nums">
                  ₹{estimatedMonthlyEarnings.toLocaleString('en-IN')}
                </div>
                <span className="text-[11px] text-[#70756F] block tabular-nums">
                  Based on {ownerDaysPerWeek * 4} rental days per month after 8% platform fee
                </span>
              </div>

              <button
                id="home-onboard-cta-btn"
                onClick={() => onNavigate('onboard')}
                className="rp-btn rp-btn-primary rp-btn-lg w-full"
              >
                <span>List Your Bike</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. DESIGNATED PICKUP HUBS & RENTER ELIGIBILITY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Campus Pickup Hubs */}
          <div className="lg:col-span-6 space-y-4">
            <div className="space-y-1">
              <span className="rp-kicker block">Campus Locations</span>
              <h2 className="rp-section-heading">Designated Pickup Points</h2>
              <p className="rp-text-secondary">
                All vehicle handovers and returns take place at approved campus locations.
              </p>
            </div>

            <div className="space-y-3">
              {hubsToShow.slice(0, 4).map((hub, idx) => (
                <div
                  key={idx}
                  className="p-4 rp-card flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#EBF0ED] text-[#29483B] flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-sm text-[#202522]">
                        {hub.name}
                      </h3>
                      <p className="text-xs text-[#70756F] mt-0.5">{hub.address}</p>
                      <p className="text-[11px] text-[#70756F] mt-0.5">{hub.landmark}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('bikes')}
                    className="text-xs font-medium text-[#29483B] hover:text-[#20392F] whitespace-nowrap shrink-0"
                  >
                    View Bikes →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Renter Eligibility & Accountability */}
          <div className="lg:col-span-6 space-y-4">
            <div className="space-y-1">
              <span className="rp-kicker block">Eligibility & Guidelines</span>
              <h2 className="rp-section-heading">Clear Rental Requirements</h2>
              <p className="rp-text-secondary">
                Transparent standards that protect both student renters and student vehicle owners.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rp-card space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EBF0ED] text-[#29483B] flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  18+ &amp; Valid Driving Licence
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Renters must be at least 18 years old and hold a valid Indian Driving Licence for the vehicle category.
                </p>
              </div>

              <div className="p-5 rp-card space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EBF0ED] text-[#29483B] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  ICFAI Enrollment &amp; Aadhaar
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Active ICFAI Hyderabad enrollment number, Aadhaar upload, and physical Student ID presentation at pickup.
                </p>
              </div>

              <div className="p-5 rp-card space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EBF0ED] text-[#29483B] flex items-center justify-center">
                  <Laptop className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  Laptop Collateral Deposit
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  A working laptop and refundable security deposit are held during the active rental and returned upon inspection.
                </p>
              </div>

              <div className="p-5 rp-card space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EBF0ED] text-[#29483B] flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-sm text-[#202522]">
                  Safe Riding &amp; Terms
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Mandatory helmet usage, no sub-renting, and full renter responsibility for any traffic challans during the ride.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
