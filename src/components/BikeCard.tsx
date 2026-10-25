import React from 'react';
import { Bike } from '../types';
import { VehicleImage } from './VehicleImage';
import { MapPin, ArrowRight, CheckCircle2, Clock, Wrench, Ban } from 'lucide-react';

interface BikeCardProps {
  bike: Bike;
  onSelect: (bike: Bike) => void;
  onBookNow: (bike: Bike) => void;
}

export const BikeCard: React.FC<BikeCardProps> = ({ bike, onSelect, onBookNow }) => {
  const isAvailable = bike.availabilityStatus === 'AVAILABLE';

  const statusConfig = {
    AVAILABLE: {
      label: 'Available',
      className: 'rp-status-success',
      Icon: CheckCircle2,
    },
    RESERVED: {
      label: 'Reserved',
      className: 'rp-status-warning',
      Icon: Clock,
    },
    MAINTENANCE: {
      label: 'Maintenance',
      className: 'rp-status-neutral',
      Icon: Wrench,
    },
    UNAVAILABLE: {
      label: 'Unavailable',
      className: 'rp-status-error',
      Icon: Ban,
    },
  }[bike.availabilityStatus] || {
    label: bike.availabilityStatus,
    className: 'rp-status-neutral',
    Icon: Clock,
  };

  const StatusIcon = statusConfig.Icon;
  const imageSrc = bike.images && bike.images.length > 0 ? bike.images[0] : undefined;

  return (
    <article
      id={`bike-card-${bike.id}`}
      className="group rp-card rp-card-interactive overflow-hidden flex flex-col justify-between"
    >
      <div>
        {/* Vehicle Image with Resilient Architectural SVG Fallback */}
        <div
          onClick={() => onSelect(bike)}
          className="relative h-52 w-full overflow-hidden bg-[#EFEEE8] cursor-pointer select-none border-b border-[#E5E4DE]"
          tabIndex={0}
          role="button"
          aria-label={`View details for ${bike.brand} ${bike.model}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(bike);
            }
          }}
        >
          <VehicleImage
            src={imageSrc}
            alt={`${bike.brand} ${bike.model}`}
            brand={bike.brand}
            model={bike.model}
            bikeType={bike.bikeType}
            className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-200 ease-out"
          />

          {/* Single Accessible Status Indicator */}
          <div className="absolute top-3 left-3">
            <span className={`rp-status shadow-2xs ${statusConfig.className}`}>
              <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{statusConfig.label}</span>
            </span>
          </div>
        </div>

        {/* Card Content Body */}
        <div className="p-5 space-y-3.5">
          <div>
            {/* Clean Unboxed Metadata Line (Zero-Pill Discipline) */}
            <div className="flex items-center justify-between gap-2 text-xs text-[#70756F]">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-medium text-[#29483B]">{bike.brand}</span>
                {bike.year && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{bike.year}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{bike.bikeType}</span>
              </div>

              {bike.displayRegistrationToPublic && bike.registrationNumber && (
                <span className="font-mono text-[11px] text-[#70756F] shrink-0">
                  {bike.registrationNumber}
                </span>
              )}
            </div>

            <h3
              onClick={() => onSelect(bike)}
              className="font-display font-semibold text-lg text-[#202522] group-hover:text-[#29483B] transition-colors cursor-pointer line-clamp-1 mt-0.5"
            >
              {bike.model}
            </h3>
          </div>

          {/* Unboxed Technical Specifications */}
          <div className="pt-2.5 border-t border-[#E5E4DE] flex items-center justify-between text-xs text-[#70756F]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-[#202522] tabular-nums">
                {bike.specs?.cc ? `${bike.specs.cc} cc` : 'Electric'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{bike.transmission}</span>
              <span aria-hidden="true">·</span>
              <span>{bike.fuelType}</span>
              {bike.specs?.mileage && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{bike.specs.mileage}</span>
                </>
              )}
            </div>
            <span className="tabular-nums font-mono text-[11px] text-[#70756F] shrink-0">
              ₹{bike.securityDeposit} dep.
            </span>
          </div>

          {/* Pickup Location & Student Host */}
          <div className="flex items-center justify-between gap-2 text-xs text-[#70756F]">
            <div className="flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-[#29483B] shrink-0" />
              <span className="truncate">{bike.pickupHub}</span>
            </div>
            <span className="text-[11px] text-[#70756F] shrink-0">
              Host: {(bike.ownerName || 'Student Owner').split(' ')[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Pricing & Primary Actions */}
      <div className="px-5 py-3.5 border-t border-[#E5E4DE] bg-[#F7F6F2]/75 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-display font-bold text-lg text-[#202522] tabular-nums">
              ₹{bike.pricePerDay}
            </span>
            <span className="text-xs text-[#70756F]">/ day</span>
          </div>
          {bike.pricePerHour && (
            <p className="text-[11px] text-[#70756F] font-mono tabular-nums">
              ₹{bike.pricePerHour}/hr available
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            id={`view-details-${bike.id}`}
            onClick={() => onSelect(bike)}
            className="rp-btn rp-btn-secondary rp-btn-sm"
          >
            Details
          </button>
          <button
            id={`book-now-${bike.id}`}
            onClick={() => onBookNow(bike)}
            disabled={!isAvailable}
            className={`rp-btn rp-btn-sm ${
              isAvailable ? 'rp-btn-primary' : 'rp-btn-secondary opacity-60'
            }`}
          >
            <span>{isAvailable ? 'Book Now' : statusConfig.label}</span>
            {isAvailable && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </article>
  );
};
