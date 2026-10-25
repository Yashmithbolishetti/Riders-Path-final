import React, { useState, useEffect, useMemo } from 'react';
import { Bike, PickupLocation } from '../types';
import { BikeCard } from '../components/BikeCard';
import { VehicleImage } from '../components/VehicleImage';
import { api } from '../services/api';
import {
  Search,
  Filter,
  RotateCcw,
  LayoutGrid,
  List,
  MapPin,
  X,
  ArrowRight,
} from 'lucide-react';

interface BikesPageProps {
  bikes?: Bike[];
  onSelectBike?: (bike: Bike | string) => void;
  onBookBike?: (bike: Bike) => void;
}

export const BikesPage: React.FC<BikesPageProps> = ({
  bikes: initialBikes,
  onSelectBike,
  onBookBike,
}) => {
  const [bikesList, setBikesList] = useState<Bike[]>(initialBikes || []);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [fuelFilter, setFuelFilter] = useState('ALL');
  const [hubFilter, setHubFilter] = useState('ALL');
  const [transmissionFilter, setTransmissionFilter] = useState('ALL');
  const [maxPrice, setMaxPrice] = useState<number>(1200);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (initialBikes && initialBikes.length > 0) {
      setBikesList(initialBikes);
    } else {
      api
        .getBikes()
        .then((data) => setBikesList(data || []))
        .catch((err) => console.error('Failed to load bikes in BikesPage:', err));
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
    } else if (typeof onSelectBike === 'function') {
      onSelectBike(bike.id || (bike as any));
    }
  };

  const approvedBikes = useMemo(() => {
    return (bikesList || []).filter((b) => b && b.active && b.approvedByAdmin);
  }, [bikesList]);

  const uniqueBrands = useMemo(() => {
    return Array.from(
      new Set(approvedBikes.map((b) => b?.brand).filter(Boolean) as string[])
    ).sort();
  }, [approvedBikes]);

  const uniqueTypes = useMemo(() => {
    return Array.from(
      new Set(approvedBikes.map((b) => b?.bikeType).filter(Boolean) as string[])
    ).sort();
  }, [approvedBikes]);

  const uniqueHubs = useMemo(() => {
    const fromBikes = approvedBikes.map((b) => b?.pickupHub).filter(Boolean) as string[];
    const fromLocations = pickupLocations.map((l) => l.name).filter(Boolean);
    return Array.from(new Set([...fromLocations, ...fromBikes])).sort();
  }, [approvedBikes, pickupLocations]);

  const filteredBikes = useMemo(() => {
    return approvedBikes.filter((b) => {
      if (statusFilter !== 'ALL' && b.availabilityStatus !== statusFilter) return false;
      if (brandFilter !== 'ALL' && (b.brand || '').toLowerCase() !== brandFilter.toLowerCase())
        return false;
      if (typeFilter !== 'ALL' && (b.bikeType || '').toLowerCase() !== typeFilter.toLowerCase())
        return false;
      if (fuelFilter !== 'ALL' && (b.fuelType || '').toLowerCase() !== fuelFilter.toLowerCase())
        return false;
      if (
        hubFilter !== 'ALL' &&
        !(b.pickupHub || '').toLowerCase().includes(hubFilter.toLowerCase())
      )
        return false;
      if (
        transmissionFilter !== 'ALL' &&
        (b.transmission || '').toLowerCase() !== transmissionFilter.toLowerCase()
      )
        return false;
      if (b.pricePerDay > maxPrice) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          (b.brand || '').toLowerCase().includes(q) ||
          (b.model || '').toLowerCase().includes(q) ||
          (b.pickupHub || '').toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q) ||
          (b.ownerName || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    approvedBikes,
    statusFilter,
    brandFilter,
    typeFilter,
    fuelFilter,
    hubFilter,
    transmissionFilter,
    maxPrice,
    search,
  ]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setBrandFilter('ALL');
    setTypeFilter('ALL');
    setFuelFilter('ALL');
    setHubFilter('ALL');
    setTransmissionFilter('ALL');
    setMaxPrice(1200);
  };

  const hasActiveFilters =
    search !== '' ||
    statusFilter !== 'ALL' ||
    brandFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    fuelFilter !== 'ALL' ||
    hubFilter !== 'ALL' ||
    transmissionFilter !== 'ALL' ||
    maxPrice < 1200;

  const availableCount = filteredBikes.filter(
    (b) => b && b.availabilityStatus === 'AVAILABLE'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E5E4DE]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#70756F]">
            <span className="rp-kicker">ICFAI Hyderabad Marketplace</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#347653] font-medium tabular-nums">
              {availableCount} Available Now
            </span>
          </div>
          <h1 className="rp-page-title">Explore Available Bikes</h1>
          <p className="rp-text-secondary">
            Browse bikes listed by fellow students across campus pickup locations.
          </p>
        </div>

        {/* Status Segmented Filter & View Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE]">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-[#202522] font-semibold shadow-2xs'
                  : 'text-[#70756F] hover:text-[#202522]'
              }`}
            >
              All ({approvedBikes.length})
            </button>
            <button
              onClick={() => setStatusFilter('AVAILABLE')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === 'AVAILABLE'
                  ? 'bg-white text-[#29483B] font-semibold shadow-2xs'
                  : 'text-[#70756F] hover:text-[#202522]'
              }`}
            >
              Available Only
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-[#202522] shadow-2xs'
                  : 'text-[#70756F] hover:text-[#202522]'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-[#202522] shadow-2xs'
                  : 'text-[#70756F] hover:text-[#202522]'
              }`}
              title="List View"
              aria-label="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar Panel */}
      <div className="p-5 rp-card space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#70756F] absolute left-3.5 top-3" />
            <input
              id="bike-search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by model, brand, pickup hub, or owner name..."
              className="rp-input !pl-10 !pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-[#70756F] hover:text-[#202522]"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="rp-btn rp-btn-secondary self-end md:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Detailed Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-[#E5E4DE]">
          <div>
            <label htmlFor="filter-brand-select" className="rp-label">
              Brand
            </label>
            <select
              id="filter-brand-select"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rp-select text-xs"
            >
              <option value="ALL">All Brands</option>
              {uniqueBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-type-select" className="rp-label">
              Category
            </label>
            <select
              id="filter-type-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rp-select text-xs"
            >
              <option value="ALL">All Categories</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-hub-select" className="rp-label">
              Pickup Location
            </label>
            <select
              id="filter-hub-select"
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
              className="rp-select text-xs"
            >
              <option value="ALL">All Pickup Hubs</option>
              {uniqueHubs.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-transmission-select" className="rp-label">
              Transmission
            </label>
            <select
              id="filter-transmission-select"
              value={transmissionFilter}
              onChange={(e) => setTransmissionFilter(e.target.value)}
              className="rp-select text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="Manual">Manual Geared</option>
              <option value="Automatic">Automatic</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-fuel-select" className="rp-label">
              Fuel / Energy
            </label>
            <select
              id="filter-fuel-select"
              value={fuelFilter}
              onChange={(e) => setFuelFilter(e.target.value)}
              className="rp-select text-xs"
            >
              <option value="ALL">All Fuel Types</option>
              <option value="Petrol">Petrol</option>
              <option value="Electric">Electric EV</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="filter-price-slider" className="rp-label !mb-0">
                Max Rate
              </label>
              <span className="font-mono text-xs text-[#202522] font-medium tabular-nums">
                ₹{maxPrice}/day
              </span>
            </div>
            <input
              id="filter-price-slider"
              type="range"
              min="300"
              max="1500"
              step="50"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-[#29483B] cursor-pointer mt-1.5"
            />
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-[#70756F]">
        <span>
          Showing{' '}
          <strong className="text-[#202522] font-semibold tabular-nums">
            {filteredBikes.length}
          </strong>{' '}
          matching vehicles
        </span>
      </div>

      {/* Results Grid or List */}
      {filteredBikes.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBikes.map((bike) => (
              <BikeCard
                key={bike.id}
                bike={bike}
                onSelect={handleSelect}
                onBookNow={handleBook}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBikes.map((bike) => {
              const isAvailable = bike.availabilityStatus === 'AVAILABLE';
              return (
                <div
                  key={bike.id}
                  className="p-4 rp-card rp-card-interactive flex flex-col md:flex-row items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="w-28 h-20 rounded-lg overflow-hidden shrink-0 bg-[#EFEEE8] border border-[#E5E4DE]">
                      <VehicleImage
                        src={bike.images?.[0]}
                        alt={bike.model}
                        brand={bike.brand}
                        model={bike.model}
                        bikeType={bike.bikeType}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-[#70756F]">
                        <span className="font-medium text-[#29483B]">{bike.brand}</span>
                        <span aria-hidden="true">·</span>
                        <span>{bike.bikeType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{bike.transmission}</span>
                      </div>
                      <h3
                        onClick={() => handleSelect(bike)}
                        className="font-display font-semibold text-base text-[#202522] hover:text-[#29483B] cursor-pointer"
                      >
                        {bike.model}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-[#70756F]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#29483B]" />
                          {bike.pickupHub}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Host: {bike.ownerName || 'Student Owner'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-[#E5E4DE]">
                    <div className="text-left md:text-right">
                      <div className="font-display font-bold text-lg text-[#202522] tabular-nums">
                        ₹{bike.pricePerDay}
                        <span className="text-xs font-normal text-[#70756F]"> / day</span>
                      </div>
                      <span className="text-xs text-[#70756F] font-mono tabular-nums">
                        ₹{bike.securityDeposit} deposit
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelect(bike)}
                        className="rp-btn rp-btn-secondary rp-btn-sm"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => handleBook(bike)}
                        disabled={!isAvailable}
                        className={`rp-btn rp-btn-sm ${
                          isAvailable ? 'rp-btn-primary' : 'rp-btn-secondary opacity-60'
                        }`}
                      >
                        <span>{isAvailable ? 'Book Now' : bike.availabilityStatus}</span>
                        {isAvailable && <ArrowRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="p-14 rp-card text-center space-y-3">
          <div className="w-10 h-10 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE] text-[#70756F] flex items-center justify-center mx-auto">
            <Filter className="w-5 h-5" />
          </div>
          <h3 className="font-display font-semibold text-base text-[#202522]">
            No matching bikes found
          </h3>
          <p className="text-xs text-[#70756F] max-w-sm mx-auto">
            Adjust your search query, price range, or category filter to view other student-listed vehicles.
          </p>
          <button onClick={resetFilters} className="rp-btn rp-btn-primary">
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};
