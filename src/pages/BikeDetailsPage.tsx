import React, { useState, useEffect } from 'react';
import { Bike } from '../types';
import { VehicleImage } from '../components/VehicleImage';
import { api } from '../services/api';
import {
  ArrowLeft,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  Clock,
} from 'lucide-react';

interface BikeDetailsPageProps {
  bike?: Bike;
  bikeId?: string;
  onBack: () => void;
  onBookNow: (bike: Bike) => void;
}

export const BikeDetailsPage: React.FC<BikeDetailsPageProps> = ({
  bike: initialBike,
  bikeId,
  onBack,
  onBookNow,
}) => {
  const [currentBike, setCurrentBike] = useState<Bike | null>(initialBike || null);
  const [loading, setLoading] = useState<boolean>(!initialBike && !!bikeId);
  const [error, setError] = useState<string>('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    if (initialBike) {
      setCurrentBike(initialBike);
      setLoading(false);
    } else if (bikeId) {
      setLoading(true);
      api
        .getBikeById(bikeId)
        .then((data) => {
          setCurrentBike(data);
          setError('');
        })
        .catch((err) => {
          console.error(err);
          setError('Could not load bike details.');
        })
        .finally(() => setLoading(false));
    }
  }, [initialBike, bikeId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#29483B] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-[#70756F]">Loading vehicle details...</p>
      </div>
    );
  }

  if (error || !currentBike) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="p-4 rounded-xl bg-white border border-[#E5E4DE] text-[#202522] text-sm">
          {error || 'Bike not found in active campus listings.'}
        </div>
        <button onClick={onBack} className="rp-btn rp-btn-primary">
          Return to Explore Bikes
        </button>
      </div>
    );
  }

  const bike = currentBike;
  const isAvailable = bike.availabilityStatus === 'AVAILABLE';
  const images = bike.images && bike.images.length > 0 ? bike.images : [''];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Breadcrumb & Back Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E4DE]">
        <button
          id="back-to-bikes-btn"
          onClick={onBack}
          className="rp-btn rp-btn-secondary rp-btn-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Explore Bikes</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-[#70756F]">
          <span>{bike.brand}</span>
          <span aria-hidden="true">/</span>
          <span className="text-[#202522] font-medium">{bike.model}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Vehicle Photography, Specs, and Notes */}
        <div className="lg:col-span-7 space-y-6">
          {/* Primary Vehicle Image */}
          <div className="relative h-[340px] sm:h-[420px] w-full rounded-xl overflow-hidden bg-[#EFEEE8] border border-[#E5E4DE]">
            <VehicleImage
              src={images[selectedImageIndex]}
              alt={`${bike.brand} ${bike.model}`}
              brand={bike.brand}
              model={bike.model}
              bikeType={bike.bikeType}
              className="w-full h-full object-cover object-center"
            />

            {/* Status Indicator */}
            <div className="absolute top-4 left-4">
              <span
                className={`rp-status shadow-2xs ${
                  isAvailable
                    ? 'rp-status-success'
                    : bike.availabilityStatus === 'UNAVAILABLE'
                    ? 'rp-status-error'
                    : bike.availabilityStatus === 'MAINTENANCE'
                    ? 'rp-status-neutral'
                    : 'rp-status-warning'
                }`}
              >
                {isAvailable ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {bike.availabilityStatus === 'AVAILABLE'
                    ? 'Available for Booking'
                    : bike.availabilityStatus === 'RESERVED'
                    ? 'Currently Reserved'
                    : bike.availabilityStatus === 'MAINTENANCE'
                    ? 'Under Maintenance'
                    : 'Currently Unavailable'}
                </span>
              </span>
            </div>
          </div>

          {/* Thumbnail Selector */}
          {images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative h-18 w-24 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    selectedImageIndex === idx
                      ? 'border-[#29483B]'
                      : 'border-[#E5E4DE] opacity-65 hover:opacity-100'
                  }`}
                >
                  <VehicleImage
                    src={img}
                    alt={`${bike.model} view ${idx + 1}`}
                    brand={bike.brand}
                    model={bike.model}
                    bikeType={bike.bikeType}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Technical Specifications */}
          <div className="p-6 rp-card space-y-4">
            <h2 className="font-display font-semibold text-base text-[#202522]">
              Vehicle Specifications &amp; Inclusions
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Displacement</span>
                <span className="font-semibold text-[#202522] tabular-nums">
                  {bike.specs?.cc ? `${bike.specs.cc} cc` : 'Electric Motor'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Fuel / Energy</span>
                <span className="font-semibold text-[#202522]">{bike.fuelType}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Transmission</span>
                <span className="font-semibold text-[#202522]">{bike.transmission}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Efficiency / Range</span>
                <span className="font-semibold text-[#202522] tabular-nums">
                  {bike.specs?.mileage || '40 km/l'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Top Speed</span>
                <span className="font-semibold text-[#202522] tabular-nums">
                  {bike.specs?.topSpeed || '110 km/h'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Tank / Battery</span>
                <span className="font-semibold text-[#202522] tabular-nums">
                  {bike.specs?.fuelCapacity || '12 L'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Braking System</span>
                <span className="font-semibold text-[#202522]">
                  {bike.specs?.abs ? 'ABS Equipped' : 'Standard Disc/Drum'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-0.5">
                <span className="text-[#70756F] block text-[11px]">Helmets Included</span>
                <span className="font-semibold text-[#29483B] tabular-nums">
                  {bike.specs?.helmetsIncluded || 1} ISI Helmet(s)
                </span>
              </div>
            </div>
          </div>

          {/* Student Owner Notes */}
          <div className="p-6 rp-card space-y-2.5">
            <h2 className="font-display font-semibold text-base text-[#202522]">
              Owner Description &amp; Notes
            </h2>
            <p className="text-sm text-[#70756F] leading-relaxed whitespace-pre-line">
              {bike.description}
            </p>
          </div>

          {/* Intermediary Notice */}
          <div className="p-4 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE] flex items-start gap-2.5 text-xs text-[#70756F]">
            <Info className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-[#202522]">Marketplace Notice:</strong> Riders Path connects eligible ICFAI Hyderabad students with student bike owners. Riders Path does not own this vehicle; handovers and inspections are conducted at the designated campus pickup location.
            </p>
          </div>
        </div>

        {/* Right 5 Columns: Contiguous Booking Module & Host Profile */}
        <div className="lg:col-span-5 space-y-6">
          {/* Contiguous Purchase / Booking Card */}
          <div className="p-6 rp-card space-y-5">
            <div className="border-b border-[#E5E4DE] pb-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-[#70756F]">
                <span className="font-medium text-[#29483B]">{bike.brand}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{bike.year}</span>
                <span aria-hidden="true">·</span>
                <span>{bike.bikeType}</span>
              </div>
              <h1 className="font-display font-bold text-2xl text-[#202522]">{bike.model}</h1>

              <div className="flex items-baseline justify-between pt-2">
                <div>
                  <span className="text-xs text-[#70756F] block">Daily Rate</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-display font-bold text-3xl text-[#202522] tabular-nums">
                      ₹{bike.pricePerDay}
                    </span>
                    <span className="text-xs text-[#70756F]">/ 24 hours</span>
                  </div>
                </div>

                {bike.pricePerHour && (
                  <div className="text-right">
                    <span className="text-xs text-[#70756F] block">Hourly Rate</span>
                    <span className="font-mono text-sm font-semibold text-[#29483B] tabular-nums">
                      ₹{bike.pricePerHour}/hr
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div className="space-y-2.5 text-xs text-[#70756F]">
              <div className="flex justify-between">
                <span>Base 24-Hour Rental</span>
                <span className="font-mono text-[#202522] tabular-nums">₹{bike.pricePerDay}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Service Fee (8%)</span>
                <span className="font-mono text-[#202522] tabular-nums">
                  ₹{Math.round(bike.pricePerDay * 0.08)}
                </span>
              </div>
              <div className="flex justify-between text-[#202522] font-medium pt-2 border-t border-[#E5E4DE]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#347653]" />
                  <span>Refundable Security Deposit</span>
                </span>
                <span className="font-mono font-semibold text-[#347653] tabular-nums">
                  ₹{bike.securityDeposit}
                </span>
              </div>
              <p className="text-[11px] text-[#70756F] pt-0.5">
                Security deposit and laptop collateral are returned upon post-ride inspection at the pickup hub.
              </p>
            </div>

            {/* Designated Pickup Hub */}
            <div className="p-3.5 rounded-lg bg-[#F7F6F2] border border-[#E5E4DE] space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#29483B] block">
                Designated Pickup Location
              </span>
              <div className="flex items-center gap-2 text-xs text-[#202522] font-medium">
                <MapPin className="w-4 h-4 text-[#29483B] shrink-0" />
                <span>{bike.pickupHub}</span>
              </div>
              <p className="text-[11px] text-[#70756F] pl-6">
                ICFAI Hyderabad · Coordinate handover after booking verification.
              </p>
            </div>

            {/* Primary CTA */}
            <div className="space-y-2.5 pt-1">
              <button
                id="book-this-ride-btn"
                onClick={() => onBookNow(bike)}
                disabled={!isAvailable}
                className="rp-btn rp-btn-primary rp-btn-lg w-full"
              >
                <span>
                  {isAvailable
                    ? 'Book This Bike'
                    : 'Vehicle Currently Unavailable'}
                </span>
                {isAvailable && <ArrowRight className="w-4 h-4" />}
              </button>

              {!isAvailable && (
                <p className="text-center text-xs text-[#9A6B25] flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>This vehicle is currently reserved or undergoing maintenance.</span>
                </p>
              )}
            </div>
          </div>

          {/* Student Host Card */}
          <div className="p-5 rp-card space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <span className="text-xs font-semibold text-[#202522]">Listed By Student Owner</span>
              <span className="text-xs text-[#347653] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ICFAI Peer</span>
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-lg bg-[#EBF0ED] border border-[#CBE2D6] flex items-center justify-center text-[#29483B] font-display font-bold text-base">
                {(bike.ownerName || 'S').charAt(0)}
              </div>
              <div>
                <h3 className="font-display font-semibold text-[#202522] text-sm">
                  {bike.ownerName}
                </h3>
                {bike.ownerEnrollment && (
                  <p className="text-xs font-mono text-[#70756F]">
                    Enrollment: <span className="text-[#202522]">{bike.ownerEnrollment}</span>
                  </p>
                )}
                <p className="text-[11px] text-[#70756F]">
                  {bike.ownerCourse ? `${bike.ownerCourse} · ` : ''}ICFAI University Hyderabad
                </p>
              </div>
            </div>
          </div>

          {/* Campus Rental Checklist */}
          <div className="p-5 rp-card space-y-3">
            <h3 className="font-display font-semibold text-sm text-[#202522]">
              Required for Booking &amp; Pickup
            </h3>
            <ul className="space-y-2 text-xs text-[#70756F]">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#347653] shrink-0 mt-0.5" />
                <span>18+ years old with a valid Government Driving Licence.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#347653] shrink-0 mt-0.5" />
                <span>Active ICFAI Enrollment Number &amp; physical Student ID card at handover.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#347653] shrink-0 mt-0.5" />
                <span>Aadhaar card &amp; Driving Licence upload during booking.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#347653] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#202522]">Laptop Collateral:</strong> Working laptop deposited during active rental.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
