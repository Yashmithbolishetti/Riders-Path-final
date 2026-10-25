import React, { useState, useEffect, useRef } from 'react';
import { Bike, PickupLocation } from '../../types';
import {
  api,
  MAX_BIKE_IMAGES_PER_LISTING,
  isHttpsBikeImageUrl,
  validateSelectedBikeImageFile,
  validateCustomBikeImageUrl,
  readFileAsDataUrl,
  assertHttpsBikeImageList,
  runSequentialPhotoBatch,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { hourlyToDaily, dailyToHourly, PRICING_HELPER_TEXT } from '../../utils/pricing';
import { triggerHaptic } from '../../utils/haptics';
import { EnrollmentNumberInput } from '../../components/EnrollmentNumberInput';
import { VehicleImage } from '../../components/VehicleImage';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Upload,
  X,
  Image as ImageIcon,
  Star,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export const AdminBikes: React.FC = () => {
  const { showToast } = useAuth();
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal State (replaces window.confirm)
  const [deletingBike, setDeletingBike] = useState<Bike | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Form fields — 1. Basic Bike Details
  const [brand, setBrand] = useState('Royal Enfield');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(2024);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [bikeType, setBikeType] = useState<any>('Cruiser');
  const [fuelType, setFuelType] = useState<any>('Petrol');
  const [transmission, setTransmission] = useState<any>('Manual');
  const [pickupHub, setPickupHub] = useState('ICFAI Main Gate');
  const [description, setDescription] = useState('');

  // Form fields — 2. Pricing & Deposit
  const [pricePerDay, setPricePerDay] = useState(600);
  const [pricePerHour, setPricePerHour] = useState(25);
  const [securityDeposit, setSecurityDeposit] = useState(1000);

  // Form fields — 3. Specifications
  const [cc, setCc] = useState(349);
  const [mileage, setMileage] = useState('38 km/l');
  const [topSpeed, setTopSpeed] = useState('115 km/h');
  const [fuelCapacity, setFuelCapacity] = useState('13 L');
  const [weight, setWeight] = useState('175 kg');
  const [abs, setAbs] = useState(true);
  const [helmetsIncluded, setHelmetsIncluded] = useState(1);

  // Form fields — 4. Owner & Status
  const [availabilityStatus, setAvailabilityStatus] = useState<
    'AVAILABLE' | 'RESERVED' | 'MAINTENANCE' | 'UNAVAILABLE'
  >('AVAILABLE');
  const [ownerName, setOwnerName] = useState('Campus Fleet Host');
  const [ownerEnrollment, setOwnerEnrollment] = useState('26FMUCHH010101');
  const [ownerPhone, setOwnerPhone] = useState('+91 98490 21000');
  const [active, setActive] = useState(true);
  const [approvedByAdmin, setApprovedByAdmin] = useState(true);

  // Form fields — 5. Photos & Visibility
  const [images, setImages] = useState<string[]>([]);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [failedPhotoUpload, setFailedPhotoUpload] = useState<{
    dataUrl: string;
    mimeType: string;
    replaceIndex?: number;
  } | null>(null);
  const [displayRegistrationToPublic, setDisplayRegistrationToPublic] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [bikesData, locsData] = await Promise.all([
        api.getAllBikesAdmin(),
        api.adminGetPickupLocations().catch(() => []),
      ]);
      setBikes(bikesData);
      setPickupLocations(locsData);
    } catch (err) {
      console.error(err);
      showToast('Failed to load fleet inventory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const defaultHubName =
    pickupLocations.find((l) => l.isActive)?.name || 'ICFAI Main Gate';

  const openAddModal = () => {
    triggerHaptic('light');
    setEditingBike(null);
    setBrand('Royal Enfield');
    setModel('');
    setYear(2024);
    setRegistrationNumber('');
    setBikeType('Cruiser');
    setFuelType('Petrol');
    setTransmission('Manual');
    setPickupHub(defaultHubName);
    setPricePerDay(600);
    setPricePerHour(dailyToHourly(600));
    setSecurityDeposit(1000);
    setCc(349);
    setMileage('38 km/l');
    setTopSpeed('115 km/h');
    setFuelCapacity('13 L');
    setWeight('175 kg');
    setAbs(true);
    setHelmetsIncluded(1);
    setAvailabilityStatus('AVAILABLE');
    setOwnerName('Campus Fleet Host');
    setOwnerEnrollment('26FMUCHH010101');
    setOwnerPhone('+91 98490 21000');
    setDescription('');
    setImages([
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
    ]);
    setCustomImageUrl('');
    setPhotoError('');
    setUploadingPhotos(false);
    setFailedPhotoUpload(null);
    setDisplayRegistrationToPublic(false);
    setActive(true);
    setApprovedByAdmin(true);
    setModalOpen(true);
  };

  const openEditModal = (bike: Bike) => {
    triggerHaptic('light');
    setEditingBike(bike);
    setBrand(bike.brand);
    setModel(bike.model);
    setYear(bike.year);
    setRegistrationNumber(bike.registrationNumber);
    setBikeType(bike.bikeType);
    setFuelType(bike.fuelType);
    setTransmission(bike.transmission);
    setPickupHub(bike.pickupHub || defaultHubName);

    const dayP = bike.pricePerDay;
    const hrP =
      bike.pricePerHour && bike.pricePerHour > 0
        ? bike.pricePerHour
        : dailyToHourly(dayP);
    setPricePerDay(dayP);
    setPricePerHour(hrP);
    setSecurityDeposit(bike.securityDeposit);

    setCc(bike.specs?.cc ?? 150);
    setMileage(bike.specs?.mileage || '42 km/l');
    setTopSpeed(bike.specs?.topSpeed || '110 km/h');
    setFuelCapacity(bike.specs?.fuelCapacity || '12 L');
    setWeight(bike.specs?.weight || '145 kg');
    setAbs(bike.specs?.abs !== undefined ? bike.specs.abs : true);
    setHelmetsIncluded(bike.specs?.helmetsIncluded ?? 1);

    setAvailabilityStatus(bike.availabilityStatus);
    setOwnerName(bike.ownerName);
    setOwnerEnrollment(bike.ownerEnrollment || '26FMUCHH010101');
    setOwnerPhone(bike.ownerPhone);
    setDescription(bike.description);
    setImages(
      bike.images && bike.images.length > 0
        ? bike.images
            .filter((img) => isHttpsBikeImageUrl(img))
            .slice(0, MAX_BIKE_IMAGES_PER_LISTING)
        : []
    );
    setCustomImageUrl('');
    setPhotoError('');
    setUploadingPhotos(false);
    setFailedPhotoUpload(null);
    setDisplayRegistrationToPublic(Boolean(bike.displayRegistrationToPublic));
    setActive(bike.active !== false);
    setApprovedByAdmin(Boolean(bike.approvedByAdmin));
    setModalOpen(true);
  };

  const handleDailyPriceChange = (valStr: string) => {
    const val = Number(valStr);
    if (isNaN(val) || val < 0) {
      setPricePerDay(0);
      setPricePerHour(0);
      return;
    }
    setPricePerDay(val);
    setPricePerHour(dailyToHourly(val));
  };

  const handleHourlyPriceChange = (valStr: string) => {
    const val = Number(valStr);
    if (isNaN(val) || val < 0) {
      setPricePerHour(0);
      setPricePerDay(0);
      return;
    }
    setPricePerHour(val);
    setPricePerDay(hourlyToDaily(val));
  };

  const uploadSingleAdminBikePhoto = async (
    dataUrl: string,
    mimeType: string,
    replaceIndex?: number,
    options?: { manageUploadingState?: boolean }
  ): Promise<boolean> => {
    const manageUploadingState = options?.manageUploadingState !== false;
    try {
      if (manageUploadingState) {
        setUploadingPhotos(true);
      }
      setPhotoError('');
      setFailedPhotoUpload(null);

      const uploaded = await api.uploadBikeImage(
        {
          image: dataUrl,
          mimeType,
          bikeId: editingBike?.id,
          purpose: editingBike?.id ? undefined : 'onboarding',
        },
        { authRole: 'admin' }
      );

      if (typeof replaceIndex === 'number') {
        setImages((prev) =>
          prev.map((item, idx) => (idx === replaceIndex ? uploaded.publicUrl : item))
        );
      } else {
        setImages((prev) =>
          prev.length < MAX_BIKE_IMAGES_PER_LISTING
            ? [...prev, uploaded.publicUrl]
            : prev
        );
      }
      triggerHaptic('light');
      showToast('Photo uploaded to Storage.', 'success');
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to upload bike photo. Please try again.';
      setPhotoError(msg);
      setFailedPhotoUpload({ dataUrl, mimeType, replaceIndex });
      showToast(msg, 'error');
      triggerHaptic('error');
      return false;
    } finally {
      if (manageUploadingState) {
        setUploadingPhotos(false);
      }
    }
  };

  const processAdminSelectedFile = async (
    file: File,
    currentImageCount: number,
    replaceIndex?: number,
    options?: { manageUploadingState?: boolean }
  ): Promise<boolean> => {
    setPhotoError('');
    if (
      replaceIndex === undefined &&
      currentImageCount >= MAX_BIKE_IMAGES_PER_LISTING
    ) {
      const msg = `A bike listing can have at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`;
      setPhotoError(msg);
      showToast(msg, 'error');
      return false;
    }

    let normalizedMime: string;
    try {
      normalizedMime = validateSelectedBikeImageFile(file);
    } catch (err: any) {
      const msg = err?.message || 'Please select a valid JPEG, PNG, or WEBP image under 5 MB.';
      setPhotoError(msg);
      showToast(msg, 'error');
      return false;
    }

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (err: any) {
      const msg = err?.message || 'Failed to read image file.';
      setPhotoError(msg);
      showToast(msg, 'error');
      return false;
    }

    return uploadSingleAdminBikePhoto(dataUrl, normalizedMime, replaceIndex, options);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList: File[] = e.target.files ? Array.from<File>(e.target.files) : [];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (fileList.length === 0 || uploadingPhotos) return;

    const availableSlots = MAX_BIKE_IMAGES_PER_LISTING - images.length;
    if (availableSlots <= 0) {
      const msg = `A bike listing can have at most ${MAX_BIKE_IMAGES_PER_LISTING} photos.`;
      setPhotoError(msg);
      showToast(msg, 'error');
      return;
    }

    if (fileList.length > availableSlots) {
      const msg = `Only ${availableSlots} more photo(s) can be added (maximum ${MAX_BIKE_IMAGES_PER_LISTING} photos per listing).`;
      setPhotoError(msg);
      showToast(msg, 'error');
    }

    const filesToProcess = fileList.slice(0, availableSlots);
    let runningCount = images.length;

    await runSequentialPhotoBatch(
      filesToProcess,
      setUploadingPhotos,
      async (file) => {
        const ok = await processAdminSelectedFile(file, runningCount, undefined, {
          manageUploadingState: false,
        });
        if (ok) {
          runningCount += 1;
        }
        return ok;
      }
    );
  };

  const handleReplaceImage = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingPhotos) return;
    await processAdminSelectedFile(file, images.length, index, {
      manageUploadingState: true,
    });
  };

  const handleRetryPhotoUpload = async () => {
    if (!failedPhotoUpload || uploadingPhotos) return;
    await uploadSingleAdminBikePhoto(
      failedPhotoUpload.dataUrl,
      failedPhotoUpload.mimeType,
      failedPhotoUpload.replaceIndex
    );
  };

  const handleAddCustomUrl = () => {
    if (uploadingPhotos) return;
    setPhotoError('');
    try {
      const validHttpsUrl = validateCustomBikeImageUrl(
        customImageUrl,
        images.length,
        MAX_BIKE_IMAGES_PER_LISTING
      );
      setImages((prev) => [...prev, validHttpsUrl]);
      setCustomImageUrl('');
      triggerHaptic('light');
      showToast('HTTPS image URL added to gallery', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Custom image URL must be a valid https:// URL.';
      setPhotoError(msg);
      showToast(msg, 'error');
      triggerHaptic('error');
    }
  };

  const handleRemoveImage = (index: number) => {
    if (uploadingPhotos) return;
    triggerHaptic('warning');
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimaryImage = (index: number) => {
    if (index === 0 || uploadingPhotos) return;
    triggerHaptic('light');
    setImages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.unshift(item);
      return copy;
    });
  };

  const handleSaveBike = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingPhotos) return;
    triggerHaptic('medium');

    const rawImages =
      images.length > 0
        ? images
        : [
            'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
          ];

    let finalImages: string[];
    try {
      finalImages = assertHttpsBikeImageList(rawImages);
    } catch (err: any) {
      const msg = err?.message || 'All bike photos must be valid https:// URLs.';
      setPhotoError(msg);
      showToast(msg, 'error');
      triggerHaptic('error');
      return;
    }

    const matchedLoc = pickupLocations.find((l) => l.name === pickupHub);

    const payload: Partial<Bike> = {
      brand: brand.trim(),
      model: model.trim(),
      year: Number(year) || 2024,
      registrationNumber: registrationNumber.trim().toUpperCase(),
      bikeType,
      fuelType,
      transmission,
      pickupHub,
      pickupLocationId: matchedLoc?.id,
      pricePerDay: Number(pricePerDay),
      pricePerHour: Number(pricePerHour) || dailyToHourly(Number(pricePerDay)),
      securityDeposit: Number(securityDeposit),
      availabilityStatus,
      ownerName: ownerName.trim(),
      ownerEnrollment: ownerEnrollment.trim().toUpperCase(),
      ownerPhone: ownerPhone.trim(),
      description:
        description.trim() ||
        `${brand.trim()} ${model.trim()} listed on ICFAI Hyderabad campus fleet.`,
      images: finalImages,
      displayRegistrationToPublic,
      active,
      approvedByAdmin,
      approvalStatus: approvedByAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
      specs: {
        cc: fuelType === 'Electric' ? 0 : Number(cc) || 150,
        mileage: mileage.trim() || '40 km/l',
        topSpeed: topSpeed.trim() || '110 km/h',
        fuelCapacity: fuelCapacity.trim() || '12 L',
        weight: weight.trim() || '145 kg',
        abs,
        helmetsIncluded: Number(helmetsIncluded) || 1,
      },
    };

    try {
      setSaving(true);
      if (editingBike) {
        await api.updateBike(editingBike.id, payload);
        triggerHaptic('success');
        showToast('Vehicle listing updated.', 'success');
      } else {
        await api.createBike(payload);
        triggerHaptic('success');
        showToast('New vehicle added to campus fleet.', 'success');
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      triggerHaptic('error');
      showToast(err.message || 'Failed to save vehicle', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBike = async () => {
    if (!deletingBike) return;
    try {
      setDeleteBusy(true);
      await api.deleteBike(deletingBike.id);
      triggerHaptic('success');
      showToast(
        `${deletingBike.brand} ${deletingBike.model} removed from fleet.`,
        'info'
      );
      setDeletingBike(null);
      fetchData();
    } catch (err: any) {
      triggerHaptic('error');
      showToast(err.message || 'Failed to delete bike', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleQuickStatusToggle = async (bike: Bike, newStatus: any) => {
    triggerHaptic('light');
    try {
      await api.updateBike(bike.id, { availabilityStatus: newStatus });
      showToast(`${bike.brand} ${bike.model} marked as ${newStatus}`, 'success');
      fetchData();
    } catch (err: any) {
      showToast('Failed to update vehicle status', 'error');
    }
  };

  const filteredBikes = (bikes || []).filter((b) => {
    if (!b) return false;
    if (statusFilter !== 'ALL' && b.availabilityStatus !== statusFilter) {
      return false;
    }
    if (
      categoryFilter !== 'ALL' &&
      (b.bikeType || '').toLowerCase() !== categoryFilter.toLowerCase()
    ) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (b.brand || '').toLowerCase().includes(q) ||
        (b.model || '').toLowerCase().includes(q) ||
        (b.registrationNumber || '').toLowerCase().includes(q) ||
        (b.ownerName || '').toLowerCase().includes(q) ||
        (b.ownerEnrollment || '').toLowerCase().includes(q) ||
        (b.pickupHub || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hubOptions = Array.from(
    new Set([
      ...pickupLocations.map((l) => l.name),
      'ICFAI Main Gate',
      'Socials Gaming Zone',
      "Kaka's Hotel",
      ...(pickupHub ? [pickupHub] : []),
    ])
  );

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Top Action & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#202522] tracking-tight">
            Fleet Management
          </h1>
          <p className="text-xs text-[#70756F] mt-1">
            Manage {bikes.length} registered vehicles, hourly/daily pricing, pickup hubs, and live availability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#70756F] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model, reg no, host..."
              aria-label="Search fleet inventory"
              className="rp-input pl-9 py-2 text-xs w-full sm:w-64"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rp-select py-2 text-xs w-36"
            aria-label="Filter by category"
          >
            <option value="ALL">All Categories</option>
            <option value="Cruiser">Cruiser</option>
            <option value="Street">Street</option>
            <option value="Sport">Sport</option>
            <option value="Scooter">Scooter</option>
            <option value="Electric">Electric</option>
            <option value="Commuter">Commuter</option>
          </select>

          <button
            id="admin-add-bike-btn"
            onClick={openAddModal}
            className="rp-btn rp-btn-primary px-4 py-2 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Bike</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white border border-[#E5E4DE] w-fit">
        {[
          { id: 'ALL', label: `All (${bikes.length})` },
          {
            id: 'AVAILABLE',
            label: `Available (${
              bikes.filter((b) => b.availabilityStatus === 'AVAILABLE').length
            })`,
          },
          {
            id: 'RESERVED',
            label: `Reserved (${
              bikes.filter((b) => b.availabilityStatus === 'RESERVED').length
            })`,
          },
          {
            id: 'MAINTENANCE',
            label: `Maintenance (${
              bikes.filter((b) => b.availabilityStatus === 'MAINTENANCE').length
            })`,
          },
          {
            id: 'UNAVAILABLE',
            label: `Unavailable (${
              bikes.filter((b) => b.availabilityStatus === 'UNAVAILABLE').length
            })`,
          },
        ].map((st) => (
          <button
            key={st.id}
            onClick={() => setStatusFilter(st.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
              statusFilter === st.id
                ? 'bg-[#29483B] text-white'
                : 'text-[#70756F] hover:text-[#202522] hover:bg-[#F7F6F2]'
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Fleet Table */}
      <div className="rp-table-container">
        <div className="overflow-x-auto">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Vehicle & Specs</th>
                <th>Owner / Host</th>
                <th>Pickup Hub</th>
                <th>Pricing & Deposit</th>
                <th>Approval</th>
                <th>Availability Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    Loading campus fleet inventory...
                  </td>
                </tr>
              ) : filteredBikes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#70756F]">
                    No vehicles match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredBikes.map((bike) => (
                  <tr key={bike.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <VehicleImage
                          src={bike.images?.[0]}
                          alt={`${bike.brand} ${bike.model}`}
                          brand={bike.brand}
                          model={bike.model}
                          bikeType={bike.bikeType}
                          className="w-14 h-10 rounded-lg object-cover bg-[#EFEEE8] border border-[#E5E4DE] shrink-0"
                        />
                        <div>
                          <span className="font-semibold text-[#202522] block">
                            {bike.brand} {bike.model}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-[#70756F] mt-0.5">
                            <span className="font-mono text-[#29483B] font-medium">
                              {bike.registrationNumber}
                            </span>
                            <span>·</span>
                            <span>{bike.year}</span>
                            <span>·</span>
                            <span>{bike.bikeType}</span>
                            <span>·</span>
                            <span>{bike.transmission}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div>
                        <span className="font-medium text-[#202522] block">
                          {bike.ownerName}
                        </span>
                        <span className="font-mono text-[11px] text-[#70756F] block">
                          {bike.ownerEnrollment}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="inline-flex items-center gap-1 text-xs text-[#202522]">
                        <MapPin className="w-3.5 h-3.5 text-[#29483B] shrink-0" />
                        <span>{bike.pickupHub}</span>
                      </span>
                    </td>

                    <td className="font-mono tabular-nums">
                      <div className="font-semibold text-[#202522]">
                        ₹{bike.pricePerDay}
                        <span className="text-[10px] text-[#70756F] font-normal">
                          /day
                        </span>{' '}
                        · ₹{bike.pricePerHour || dailyToHourly(bike.pricePerDay)}
                        <span className="text-[10px] text-[#70756F] font-normal">
                          /hr
                        </span>
                      </div>
                      <div className="text-[11px] text-[#70756F]">
                        ₹{bike.securityDeposit} deposit
                      </div>
                    </td>

                    <td>
                      <span
                        className={`rp-status text-[10px] ${
                          bike.approvedByAdmin
                            ? 'rp-status-approved'
                            : bike.approvalStatus === 'REJECTED'
                            ? 'rp-status-rejected'
                            : 'rp-status-pending'
                        }`}
                      >
                        {bike.approvedByAdmin
                          ? 'Approved'
                          : bike.approvalStatus === 'CHANGES_REQUESTED'
                          ? 'Changes Req.'
                          : bike.approvalStatus === 'REJECTED'
                          ? 'Rejected'
                          : 'Pending Review'}
                      </span>
                    </td>

                    <td>
                      <select
                        value={bike.availabilityStatus}
                        onChange={(e) =>
                          handleQuickStatusToggle(bike, e.target.value)
                        }
                        aria-label={`Change status for ${bike.brand} ${bike.model}`}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none cursor-pointer ${
                          bike.availabilityStatus === 'AVAILABLE'
                            ? 'bg-[#EAF3EE] text-[#23533A] border-[#347653]/30'
                            : bike.availabilityStatus === 'RESERVED'
                            ? 'bg-[#FDF6EA] text-[#7A5318] border-[#9A6B25]/30'
                            : bike.availabilityStatus === 'MAINTENANCE'
                            ? 'bg-[#FCEEEE] text-[#8C2D2D] border-[#B44242]/25'
                            : 'bg-[#EFEEE8] text-[#70756F] border-[#E5E4DE]'
                        }`}
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="MAINTENANCE">MAINTENANCE</option>
                        <option value="UNAVAILABLE">UNAVAILABLE</option>
                      </select>
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(bike)}
                          className="rp-btn rp-btn-secondary px-2.5 py-1.5 text-xs"
                          title="Edit Vehicle Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingBike(bike)}
                          className="p-1.5 rounded-lg bg-[#FCEEEE] hover:bg-[#B44242] text-[#8C2D2D] hover:text-white border border-[#B44242]/25 transition-colors"
                          title="Delete Vehicle"
                          aria-label={`Delete ${bike.brand} ${bike.model}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Vehicle Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl bg-white border border-[#E5E4DE] rounded-xl p-6 sm:p-7 shadow-xl max-h-[92vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-4">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#29483B] font-semibold">
                  Fleet Inventory Configuration
                </span>
                <h3 className="font-display font-bold text-xl text-[#202522]">
                  {editingBike
                    ? `Edit ${editingBike.brand} ${editingBike.model}`
                    : 'Add New Bike to Campus Fleet'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close vehicle modal"
                className="p-1.5 rounded-lg text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBike} className="space-y-6">
              {/* Section 1: Basic Bike Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#70756F] font-semibold">
                  1. Basic Vehicle Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="rp-label">Brand *</label>
                    <input
                      type="text"
                      required
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Royal Enfield"
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Model *</label>
                    <input
                      type="text"
                      required
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. Hunter 350"
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Manufacture Year *</label>
                    <input
                      type="number"
                      required
                      min={2015}
                      max={2027}
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="rp-label">Registration No. *</label>
                    <input
                      type="text"
                      required
                      value={registrationNumber}
                      onChange={(e) =>
                        setRegistrationNumber(e.target.value.toUpperCase())
                      }
                      placeholder="TS 08 HG 7721"
                      className="rp-input font-mono uppercase text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Category</label>
                    <select
                      value={bikeType}
                      onChange={(e) => setBikeType(e.target.value)}
                      className="rp-select text-xs"
                    >
                      <option value="Cruiser">Cruiser</option>
                      <option value="Street">Street</option>
                      <option value="Sport">Sport</option>
                      <option value="Scooter">Scooter</option>
                      <option value="Electric">Electric</option>
                      <option value="Commuter">Commuter</option>
                    </select>
                  </div>
                  <div>
                    <label className="rp-label">Fuel Type</label>
                    <select
                      value={fuelType}
                      onChange={(e) => setFuelType(e.target.value)}
                      className="rp-select text-xs"
                    >
                      <option value="Petrol">Petrol</option>
                      <option value="Electric">Electric</option>
                    </select>
                  </div>
                  <div>
                    <label className="rp-label">Transmission</label>
                    <select
                      value={transmission}
                      onChange={(e) => setTransmission(e.target.value)}
                      className="rp-select text-xs"
                    >
                      <option value="Manual">Manual</option>
                      <option value="Automatic">Automatic</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="rp-label">Campus Pickup Hub *</label>
                    <select
                      value={pickupHub}
                      onChange={(e) => setPickupHub(e.target.value)}
                      className="rp-select text-xs"
                    >
                      {hubOptions.map((hub) => (
                        <option key={hub} value={hub}>
                          {hub}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="rp-label">Availability Status</label>
                    <select
                      value={availabilityStatus}
                      onChange={(e) =>
                        setAvailabilityStatus(e.target.value as any)
                      }
                      className="rp-select text-xs"
                    >
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="RESERVED">RESERVED</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                      <option value="UNAVAILABLE">UNAVAILABLE</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="rp-label">Vehicle Description & Notes</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Condition notes, riding comfort, and included accessories..."
                    className="rp-textarea text-xs"
                  />
                </div>
              </div>

              {/* Section 2: Bidirectional Pricing & Deposit */}
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-[#202522] font-semibold">
                    2. Pricing & Security Deposit
                  </h4>
                  <span className="text-[11px] font-mono text-[#29483B] font-medium">
                    1 Day = 24 Hours Auto-Sync
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="rp-label">Daily Rate (₹ / 24 hrs) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={pricePerDay || ''}
                      onChange={(e) => handleDailyPriceChange(e.target.value)}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Hourly Rate (₹ / hr) *</label>
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={pricePerHour || ''}
                      onChange={(e) => handleHourlyPriceChange(e.target.value)}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Refundable Deposit (₹) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={securityDeposit}
                      onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-[#70756F]">{PRICING_HELPER_TEXT}</p>
              </div>

              {/* Section 3: Technical Specifications */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#70756F] font-semibold">
                  3. Technical Specifications
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="rp-label">Engine (cc)</label>
                    <input
                      type="number"
                      min={0}
                      value={cc}
                      onChange={(e) => setCc(Number(e.target.value))}
                      disabled={fuelType === 'Electric'}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Mileage / Range</label>
                    <input
                      type="text"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder="42 km/l"
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Top Speed</label>
                    <input
                      type="text"
                      value={topSpeed}
                      onChange={(e) => setTopSpeed(e.target.value)}
                      placeholder="115 km/h"
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Tank / Battery</label>
                    <input
                      type="text"
                      value={fuelCapacity}
                      onChange={(e) => setFuelCapacity(e.target.value)}
                      placeholder="12 L"
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Helmets Included</label>
                    <input
                      type="number"
                      min={1}
                      max={2}
                      value={helmetsIncluded}
                      onChange={(e) => setHelmetsIncluded(Number(e.target.value))}
                      className="rp-input font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-[#202522] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={abs}
                      onChange={(e) => setAbs(e.target.checked)}
                      className="accent-[#29483B] w-4 h-4 rounded"
                    />
                    <span>Equipped with ABS Braking</span>
                  </label>
                </div>
              </div>

              {/* Section 4: Owner / Host Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#70756F] font-semibold">
                  4. Owner / Student Host Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="rp-label">Owner / Host Name *</label>
                    <input
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="rp-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="rp-label">Owner Phone *</label>
                    <input
                      type="text"
                      required
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      className="rp-input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <EnrollmentNumberInput
                      id="admin-bike-owner-enrollment"
                      value={ownerEnrollment}
                      onChange={(val) => setOwnerEnrollment(val)}
                      label="Owner ICFAI Enrollment"
                      required
                      showHelpText={false}
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Vehicle Photos & Visibility */}
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E4DE] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#202522] flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#29483B]" />
                    <span>
                      5. Vehicle Photos ({images.length}/{MAX_BIKE_IMAGES_PER_LISTING})
                    </span>
                  </span>
                  <span className="text-[11px] text-[#70756F]">
                    JPG, PNG, WEBP · Max 5MB · First photo is cover
                  </span>
                </div>

                {uploadingPhotos && (
                  <div className="p-2.5 rounded-lg bg-white border border-[#E5E4DE] text-[#202522] text-xs flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#29483B] animate-spin shrink-0" />
                    <span>Uploading vehicle photo securely...</span>
                  </div>
                )}

                {photoError && (
                  <div className="p-2.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-[#B44242] shrink-0" />
                      <span>{photoError}</span>
                    </div>
                    {failedPhotoUpload && (
                      <button
                        type="button"
                        disabled={uploadingPhotos}
                        onClick={handleRetryPhotoUpload}
                        className="px-2.5 py-1 rounded bg-white border border-[#E8C5C5] text-[#8F3030] hover:bg-[#F4DFDF] font-semibold shrink-0"
                      >
                        Retry Upload
                      </button>
                    )}
                  </div>
                )}

                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-lg overflow-hidden bg-white border border-[#E5E4DE] aspect-video"
                      >
                        <VehicleImage
                          src={img}
                          alt={`Bike photo ${idx + 1}`}
                          brand={brand}
                          model={model}
                          bikeType={bikeType}
                          className="w-full h-full object-cover"
                        />
                        {idx === 0 && (
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#29483B] text-white font-semibold text-[9px] flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-current" /> Cover
                          </div>
                        )}
                        <div className="absolute inset-0 bg-[#202522]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                          {idx !== 0 && (
                            <button
                              type="button"
                              disabled={uploadingPhotos}
                              onClick={() => handleSetPrimaryImage(idx)}
                              className="px-2 py-1 rounded bg-white text-[#202522] text-[10px] font-medium hover:bg-[#EFEEE8] disabled:opacity-50"
                            >
                              Set Cover
                            </button>
                          )}
                          <label
                            className={`px-2 py-1 rounded bg-white text-[#202522] text-[10px] font-medium hover:bg-[#EFEEE8] inline-flex items-center gap-1 ${
                              uploadingPhotos
                                ? 'opacity-50 pointer-events-none'
                                : 'cursor-pointer'
                            }`}
                            title="Replace Photo"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Replace</span>
                            <input
                              type="file"
                              disabled={uploadingPhotos}
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => handleReplaceImage(idx, e)}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={uploadingPhotos}
                            onClick={() => handleRemoveImage(idx)}
                            className="p-1 rounded bg-[#B44242] text-white disabled:opacity-50"
                            title="Remove Photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      disabled={
                        uploadingPhotos ||
                        images.length >= MAX_BIKE_IMAGES_PER_LISTING
                      }
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={
                        uploadingPhotos ||
                        images.length >= MAX_BIKE_IMAGES_PER_LISTING
                      }
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-lg border border-dashed border-[#D4D2C8] hover:border-[#29483B] bg-white text-xs text-[#202522] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Upload className="w-4 h-4 text-[#29483B]" />
                      <span>
                        {uploadingPhotos
                          ? 'Uploading Photo...'
                          : images.length >= MAX_BIKE_IMAGES_PER_LISTING
                          ? 'Max 6 Photos Reached'
                          : 'Upload Photos from Device'}
                      </span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={customImageUrl}
                      disabled={
                        uploadingPhotos ||
                        images.length >= MAX_BIKE_IMAGES_PER_LISTING
                      }
                      onChange={(e) => {
                        setCustomImageUrl(e.target.value);
                        if (photoError) setPhotoError('');
                      }}
                      placeholder="Paste https:// image URL..."
                      className="rp-input py-2 text-xs flex-1"
                    />
                    <button
                      type="button"
                      disabled={
                        uploadingPhotos ||
                        images.length >= MAX_BIKE_IMAGES_PER_LISTING
                      }
                      onClick={handleAddCustomUrl}
                      className="rp-btn rp-btn-secondary px-3 py-2 text-xs"
                    >
                      Add URL
                    </button>
                  </div>
                </div>
              </div>

              {/* Public Visibility Toggles */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs text-[#202522] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={approvedByAdmin}
                    onChange={(e) => setApprovedByAdmin(e.target.checked)}
                    className="accent-[#29483B] w-4 h-4 rounded"
                  />
                  <span>Approved for public marketplace catalog</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#202522] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={displayRegistrationToPublic}
                    onChange={(e) =>
                      setDisplayRegistrationToPublic(e.target.checked)
                    }
                    className="accent-[#29483B] w-4 h-4 rounded"
                  />
                  <span>Show registration number on public cards</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E4DE]">
                <button
                  type="button"
                  disabled={saving || uploadingPhotos}
                  onClick={() => setModalOpen(false)}
                  className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingPhotos}
                  className="rp-btn rp-btn-primary px-6 py-2 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {uploadingPhotos
                      ? 'Uploading Photo...'
                      : saving
                      ? 'Saving...'
                      : editingBike
                      ? 'Save Vehicle Changes'
                      : 'Add Vehicle to Fleet'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deletingBike && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E5E4DE] rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FCEEEE] border border-[#B44242]/25 flex items-center justify-center text-[#B44242] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-semibold text-base text-[#202522]">
                  Remove Vehicle from Fleet?
                </h3>
                <p className="text-xs text-[#70756F] leading-relaxed">
                  Are you sure you want to permanently remove{' '}
                  <strong className="text-[#202522]">
                    {deletingBike.brand} {deletingBike.model}
                  </strong>{' '}
                  ({deletingBike.registrationNumber}) from the campus inventory?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setDeletingBike(null)}
                disabled={deleteBusy}
                className="rp-btn rp-btn-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBike}
                disabled={deleteBusy}
                className="rp-btn rp-btn-danger px-4 py-2 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteBusy ? 'Removing...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
