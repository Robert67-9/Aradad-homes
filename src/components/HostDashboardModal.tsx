import React, { useState, useEffect, useRef } from 'react';
import { AdminSignupRequest, Booking, BlockedDate, Unit, Room, Currency, SiteSettings } from '../lib/types';
import {
  convertCurrencyAmount,
  formatCurrency,
  formatCurrencyIn,
  formatDatePretty,
  getRoomMonthlyRate,
  getRoomWeeklyRate,
  USD_TO_GHS_RATE,
} from '../lib/utils';
import {
  addBlockedDate,
  removeBlockedDate,
  updateBookingStatus,
  deleteBooking,
  createUnit,
  updateUnit,
  deleteUnit,
  addRoomToUnit,
  updateRoomInUnit,
  deleteRoomFromUnit,
  getSiteSettings,
  saveSiteSettings,
  fetchAdminSignupRequests,
  reviewAdminSignupRequest,
  verifyPaystackCheckout,
} from '../lib/supabase';
import { AuthUser, createStaffAccount, fetchStaffAccounts, toggleStaffAccountStatus } from '../lib/auth';
import { BEDROOM_SUITE_IMAGE, LIVING_ROOM_IMAGE, MODERN_KITCHEN_IMAGE } from '../lib/imageAssets';
import { AradadLogo } from './AradadLogo';
import {
  X,
  ShieldCheck,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  Clock,
  DollarSign,
  Building,
  KeyRound,
  LogOut,
  ExternalLink,
  Bed,
  Phone,
  Mail,
  Search,
  CheckCircle2,
  Lock,
  Settings,
  Edit3,
  Save,
  Globe,
  Sliders,
  Check,
  MapPin,
  Sparkles,
  Upload,
  Star,
} from 'lucide-react';

interface HostDashboardModalProps {
  currentUser: AuthUser;
  bookings: Booking[];
  blockedDates: BlockedDate[];
  units: Unit[];
  currency: Currency;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onRefreshData: () => Promise<void> | void;
  siteSettings?: SiteSettings;
  onUpdateSiteSettings?: (newSettings: SiteSettings) => void;
}

const DEFAULT_ROOM_IMAGE = BEDROOM_SUITE_IMAGE;
const MAX_ROOM_IMAGES = 6;

async function compressRoomImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image.`);
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`${file.name} is larger than 12 MB.`);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error(`Could not process ${file.name}.`);
  }

  let blob: Blob | null = null;
  for (const [maxDimension, quality] of [[1440, 0.78], [1200, 0.66], [960, 0.55]]) {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const candidate = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (candidate && candidate.size <= 480 * 1024) {
      blob = candidate;
      break;
    }
  }
  bitmap.close();
  if (!blob) {
    throw new Error(`${file.name} is too detailed to save. Please choose a smaller image.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}.`));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(blob);
  });
}

export const HostDashboardModal: React.FC<HostDashboardModalProps> = ({
  currentUser,
  bookings,
  blockedDates,
  units,
  currency,
  isOpen,
  onClose,
  onLogout,
  onRefreshData,
  siteSettings,
  onUpdateSiteSettings,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'bookings' | 'calendar' | 'units' | 'rooms' | 'settings' | 'payouts' | 'supabase' | 'staff'
  >('overview');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Rooms inventory derived from units
  const allRooms = units.flatMap(u =>
    (u.rooms || []).map(r => ({ ...r, parentUnit: u }))
  );
  const [selectedRoomFilterApartment, setSelectedRoomFilterApartment] = useState<string>('all');

  // Room Add / Edit state
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomParentUnitId, setRoomParentUnitId] = useState<string>(units[0]?.id || 'aradad-3bed');
  const [roomForm, setRoomForm] = useState({
    name: '',
    bedType: 'Double Bed',
    weeklyRate: 410,
    monthlyRate: 1500,
    preferredPeriod: 'week' as 'week' | 'month',
    currency: 'USD',
    maxGuests: 2,
    hasPrivateBath: true,
    hasAc: true,
    hasWardrobe: true,
    description: '',
    images: [] as string[],
    newImageUrlInput: '',
    isActive: true,
  });
  const roomFileInputRef = useRef<HTMLInputElement | null>(null);
  const [roomImageError, setRoomImageError] = useState('');
  const [isUploadingRoomImages, setIsUploadingRoomImages] = useState(false);

  // Block date form state
  const [blockUnitId, setBlockUnitId] = useState<string>(units[0]?.id || 'aradad-3bed');
  const [blockStart, setBlockStart] = useState<string>('');
  const [blockEnd, setBlockEnd] = useState<string>('');
  const [blockReason, setBlockReason] = useState<string>('Scheduled Maintenance / Inspection');
  const [isBlocking, setIsBlocking] = useState(false);

  // Unit Add / Edit state
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({
    title: '',
    subtitle: '',
    propertyType: '2 Bedroom Short-let',
    category: 'apartment' as 'apartment' | 'room',
    bedrooms: 2,
    bathrooms: 2,
    maxOccupancy: 4,
    nightlyRate: 150,
    weeklyMonthlyRate: 2200,
    prepaidElectricityGhc: 400,
    securityDeposit: 300,
    checkInTime: '15:00',
    checkOutTime: '11:00',
    bookingStyle: 'instant' as 'instant' | 'manual',
    description: '',
    amenitiesStr: 'High-Speed Starlink Wi-Fi, 24/7 Standby Generator, Air Conditioning, 24/7 Gated Security, Parking, Modern Kitchen',
    imageUrl: BEDROOM_SUITE_IMAGE,
    isActive: true,
  });

  // Site Settings state
  const [settingsForm, setSettingsForm] = useState<SiteSettings>(() => getSiteSettings());
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (isOpen) setSettingsForm(siteSettings || getSiteSettings());
  }, [isOpen, siteSettings]);

  const [signupRequests, setSignupRequests] = useState<AdminSignupRequest[]>([]);
  const [signupRequestsLoading, setSignupRequestsLoading] = useState(false);
  const [signupRequestsError, setSignupRequestsError] = useState('');
  const [reviewingSignupRequest, setReviewingSignupRequest] = useState<string | null>(null);
  const [signupRoleById, setSignupRoleById] = useState<Record<string, 'admin' | 'manager' | 'staff'>>({});
  const [newStaffForm, setNewStaffForm] = useState({ fullName: '', email: '', password: '', role: 'staff' as AuthUser['role'] });
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [staffCreateMessage, setStaffCreateMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [staffAccounts, setStaffAccounts] = useState<AuthUser[]>([]);
  const [staffAccountsLoading, setStaffAccountsLoading] = useState(false);
  const [staffAccountsError, setStaffAccountsError] = useState('');
  const [actioningStaffAccountId, setActioningStaffAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || activeTab !== 'staff' || currentUser.role !== 'admin') return;
    let isMounted = true;
    setStaffAccountsLoading(true);
    setStaffAccountsError('');
    fetchStaffAccounts()
      .then(accounts => { if (isMounted) setStaffAccounts(accounts); })
      .catch(error => { if (isMounted) setStaffAccountsError(error instanceof Error ? error.message : 'Could not load management accounts.'); })
      .finally(() => { if (isMounted) setStaffAccountsLoading(false); });
    setSignupRequestsLoading(true);
    setSignupRequestsError('');
    fetchAdminSignupRequests()
      .then(requests => { if (isMounted) setSignupRequests(requests); })
      .catch(error => {
        if (isMounted) setSignupRequestsError(error instanceof Error ? error.message : 'Could not load staff access requests.');
      })
      .finally(() => { if (isMounted) setSignupRequestsLoading(false); });
    return () => { isMounted = false; };
  }, [isOpen, activeTab, currentUser.role]);

  if (!isOpen) return null;

  const handleReviewSignupRequest = async (request: AdminSignupRequest, approve: boolean) => {
    setReviewingSignupRequest(request.id);
    setSignupRequestsError('');
    try {
      await reviewAdminSignupRequest(request.id, approve, signupRoleById[request.id] || 'staff');
      setSignupRequests(requests => requests.filter(item => item.id !== request.id));
      onRefreshData();
    } catch (error) {
      setSignupRequestsError(error instanceof Error ? error.message : 'Could not review this request.');
    } finally {
      setReviewingSignupRequest(null);
    }
  };

  const handleCreateStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreatingStaff(true);
    setStaffCreateMessage(null);
    const result = await createStaffAccount(newStaffForm);
    if (result.success) {
      setNewStaffForm({ fullName: '', email: '', password: '', role: 'staff' });
      setStaffCreateMessage({ success: true, text: 'Management account created. Share the temporary password securely with the team member.' });
      onRefreshData();
    } else {
      setStaffCreateMessage({ success: false, text: result.error || 'Could not create the management account.' });
    }
    setIsCreatingStaff(false);
  };

  const handleToggleStaffAccount = async (account: AuthUser) => {
    setActioningStaffAccountId(account.id);
    setStaffAccountsError('');
    const nextActive = !account.isActive;
    const result = await toggleStaffAccountStatus(account.id, nextActive);
    if (result.success) {
      setStaffAccounts(previous => previous.map(item => item.id === account.id ? { ...item, isActive: nextActive } : item));
      setStaffCreateMessage({
        success: true,
        text: nextActive ? 'Management account reactivated.' : 'Management account deactivated. They can no longer access the portal.',
      });
      onRefreshData();
    } else {
      setStaffAccountsError(result.error || 'Could not update this management account.');
    }
    setActioningStaffAccountId(null);
  };

  // Key metrics
  const usdToGhsRate = Number(siteSettings?.usdToGhsRate) > 0
    ? Number(siteSettings?.usdToGhsRate)
    : USD_TO_GHS_RATE;
  const getGrossPaymentAmount = (booking: Booking) => booking.paymentPreference === 'deposit'
    ? Math.round((Number(booking.subtotalAmount) * 0.3 + Number(booking.securityDeposit)) * 100) / 100
    : Number(booking.totalAmount) || 0;
  const receivedPaymentStatuses = [
    'paid',
    'verified',
    'refund_pending',
    'refund_processing',
    'refund_needs_attention',
    'refund_failed',
    'refunded',
  ];
  const refundReviewableStatuses = new Set<string>([
    'paid',
    'verified',
    'refund_pending',
    'refund_processing',
    'refund_needs_attention',
    'refund_failed',
  ]);
  const refundsNeedingReconciliation = bookings.filter(b =>
    b?.paymentStatus === 'refunded' && b.refundedAmount === null
  ).length;
  const totalPaymentsReceived = bookings.reduce((sum, booking) => {
    if (!booking || !receivedPaymentStatuses.includes(booking.paymentStatus)) return sum;
    if (booking.paymentStatus === 'refunded' && booking.refundedAmount === null) return sum;

    const grossPayment = getGrossPaymentAmount(booking);
    const retainedPayment = Math.max(0, grossPayment - Number(booking.refundedAmount || 0));
    return sum + convertCurrencyAmount(retainedPayment, booking.currency, currency, usdToGhsRate);
  }, 0);

  const confirmedCount = bookings.filter(b => b && (b.bookingStatus === 'confirmed' || (b as any).booking_status === 'confirmed')).length;
  const pendingCount = bookings.filter(b => b && (b.bookingStatus === 'pending_approval' || (b as any).booking_status === 'pending_approval')).length;
  const cancelledCount = bookings.filter(b => b && (b.bookingStatus === 'cancelled' || (b as any).booking_status === 'cancelled')).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingBookings = bookings
    .filter(booking => {
      const status = booking.bookingStatus || (booking as any).booking_status || 'confirmed';
      return status !== 'cancelled' && booking.checkOutDate >= todayKey;
    })
    .sort((first, second) => first.checkInDate.localeCompare(second.checkInDate));
  const activeUnitCount = units.filter(unit => unit.isActive !== false).length;
  const activeRoomCount = allRooms.filter(room => room.isActive !== false).length;
  const attentionCount = pendingCount + refundsNeedingReconciliation;

  const filteredBookings = bookings.filter(b => {
    if (!b) return false;
    const bStatus = b.bookingStatus || (b as any).booking_status || 'confirmed';
    const matchesFilter = filterStatus === 'all' || bStatus === filterStatus;
    const cleanSearch = (searchQuery || '').trim().toLowerCase();
    const bCode = (b.bookingCode || (b as any).booking_code || '').toLowerCase();
    const bGuest = (b.guestName || (b as any).guest_name || '').toLowerCase();
    const bEmail = (b.guestEmail || (b as any).guest_email || '').toLowerCase();
    const bPhone = (b.guestPhone || (b as any).guest_phone || '').toLowerCase();
    const matchesSearch =
      !cleanSearch ||
      bCode.includes(cleanSearch) ||
      bGuest.includes(cleanSearch) ||
      bEmail.includes(cleanSearch) ||
      bPhone.includes(cleanSearch);
    return matchesFilter && matchesSearch;
  });

  const handleUpdateStatus = async (
    bookingId: string,
    bookingStatus?: any,
    paymentStatus?: any,
    refundedAmount?: number,
  ) => {
    const updated = await updateBookingStatus(bookingId, { bookingStatus, paymentStatus, refundedAmount });
    if (!updated) {
      alert('Could not update that reservation. Check your management access and try again.');
      return;
    }
    onRefreshData();
  };

  const handleVerifyPaystackPayment = async (booking: Booking) => {
    if (!booking.paymentReference) {
      alert('This reservation does not have a Paystack reference yet. Ask the guest to complete checkout or retry payment.');
      return;
    }
    const result = await verifyPaystackCheckout(booking.paymentReference);
    if (!result.success) {
      alert(result.error || 'Paystack has not confirmed this payment yet.');
      return;
    }
    onRefreshData();
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStart || !blockEnd) return;
    setIsBlocking(true);
    try {
      await addBlockedDate({
        unitId: blockUnitId,
        startDate: blockStart,
        endDate: blockEnd,
        reason: blockReason,
      });
      setBlockStart('');
      setBlockEnd('');
      onRefreshData();
      alert('Dates blocked successfully!');
    } catch {
      alert('Failed to block dates.');
    } finally {
      setIsBlocking(false);
    }
  };

  const handleRemoveBlock = async (id: string) => {
    if (confirm('Remove this blocked date range from the calendar?')) {
      const removed = await removeBlockedDate(id);
      if (!removed) {
        alert('Could not remove that date range. Check your management access and try again.');
        return;
      }
      onRefreshData();
    }
  };

  // Open modal to add a brand new room / apartment
  const handleOpenAddUnit = () => {
    setEditingUnitId(null);
    setUnitForm({
      title: '',
      subtitle: '',
      propertyType: '2 Bedroom Short-let',
      category: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      maxOccupancy: 4,
      nightlyRate: 150,
      weeklyMonthlyRate: 2200,
      prepaidElectricityGhc: 400,
      securityDeposit: settingsForm.defaultSecurityDeposit,
      checkInTime: settingsForm.defaultCheckInTime,
      checkOutTime: settingsForm.defaultCheckOutTime,
      bookingStyle: 'instant',
      description: '',
      amenitiesStr: 'High-Speed Starlink Wi-Fi, 24/7 Standby Generator, Air Conditioning, 24/7 Gated Security, Parking, Modern Kitchen',
      imageUrl: BEDROOM_SUITE_IMAGE,
      isActive: true,
    });
    setIsUnitModalOpen(true);
  };

  // Open modal to edit an existing unit
  const handleOpenEditUnit = (unit: Unit) => {
    setEditingUnitId(unit.id);
    setUnitForm({
      title: unit.title,
      subtitle: unit.subtitle,
      propertyType: unit.propertyType,
      category: unit.category || 'apartment',
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      maxOccupancy: unit.maxOccupancy,
      nightlyRate: unit.nightlyRate,
      weeklyMonthlyRate: unit.weeklyMonthlyRate,
      prepaidElectricityGhc: unit.prepaidElectricityGhc,
      securityDeposit: unit.securityDeposit,
      checkInTime: unit.checkInTime || '15:00',
      checkOutTime: unit.checkOutTime || '11:00',
      bookingStyle: unit.bookingStyle || 'instant',
      description: unit.description,
      amenitiesStr: (unit.amenities || []).join(', '),
      imageUrl: unit.images?.[0] || BEDROOM_SUITE_IMAGE,
      isActive: unit.isActive !== false,
    });
    setIsUnitModalOpen(true);
  };

  // Save new or edited unit
  const handleSaveUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitForm.title.trim()) {
      alert('Please enter a title for this apartment/room.');
      return;
    }

    const amenitiesList = unitForm.amenitiesStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const payload = {
      apartmentId: 'aradad-adjiringanor',
      title: unitForm.title.trim(),
      subtitle: unitForm.subtitle.trim() || `${unitForm.bedrooms} Bedrooms · ${unitForm.bathrooms} Baths`,
      propertyType: unitForm.propertyType,
      category: unitForm.category,
      bedrooms: Number(unitForm.bedrooms),
      bathrooms: Number(unitForm.bathrooms),
      maxOccupancy: Number(unitForm.maxOccupancy),
      nightlyRate: Number(unitForm.nightlyRate),
      weeklyMonthlyRate: Number(unitForm.weeklyMonthlyRate),
      currency: 'USD',
      minimumStay: 1,
      maximumStay: 30,
      cleaningFee: 0,
      securityDeposit: Number(unitForm.securityDeposit),
      prepaidElectricityGhc: Number(unitForm.prepaidElectricityGhc),
      checkInTime: unitForm.checkInTime,
      checkOutTime: unitForm.checkOutTime,
      bookingStyle: unitForm.bookingStyle,
      description: unitForm.description.trim(),
      amenities: amenitiesList,
      images: [
        unitForm.imageUrl.trim() || BEDROOM_SUITE_IMAGE,
        LIVING_ROOM_IMAGE,
        MODERN_KITCHEN_IMAGE,
      ],
      isActive: unitForm.isActive,
    };

    try {
      if (editingUnitId) {
        await updateUnit(editingUnitId, payload);
      } else {
        await createUnit(payload, currentUser.role === 'admin');
      }

      setIsUnitModalOpen(false);
      onRefreshData();
      alert(editingUnitId ? 'Apartment/Room updated successfully!' : 'New Apartment/Room added successfully!');
    } catch (error) {
      console.error('Could not save apartment/room:', error);
      alert(error instanceof Error ? `Could not save the apartment/room: ${error.message}` : 'Could not save the apartment/room. Check your connection and management access, then try again.');
    }
  };

  // Delete unit
  const handleDeleteUnit = async (unitId: string, unitTitle: string) => {
    if (confirm(`Are you sure you want to delete "${unitTitle}"? This will remove it from guest listings.`)) {
      await deleteUnit(unitId);
      onRefreshData();
    }
  };

  // -------------------------------------------------------------
  // ROOM-SPECIFIC HANDLERS (ADD / EDIT / DELETE ROOMS & IMAGES)
  // -------------------------------------------------------------
  const handleOpenAddRoom = (defaultUnitId?: string) => {
    if (units.length === 0) {
      alert('Add an apartment or room listing before adding an individual room.');
      return;
    }
    setEditingRoomId(null);
    setRoomParentUnitId(defaultUnitId || units[0].id);
    setRoomForm({
      name: '',
      bedType: 'Double Bed',
      weeklyRate: 410,
      monthlyRate: 1500,
      preferredPeriod: 'week',
      currency: 'USD',
      maxGuests: 2,
      hasPrivateBath: true,
      hasAc: true,
      hasWardrobe: true,
      description: 'Comfortable guest bedroom with en-suite shower, fitted closet, and high thread-count linens.',
      images: [],
      newImageUrlInput: '',
      isActive: true,
    });
    setRoomImageError('');
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoom = (unitId: string, room: Room) => {
    setEditingRoomId(room.id);
    setRoomParentUnitId(unitId);
    setRoomForm({
      name: room.name,
      bedType: room.bedType || 'Double Bed',
      weeklyRate: getRoomWeeklyRate(room),
      monthlyRate: getRoomMonthlyRate(room),
      preferredPeriod: room.preferredPeriod === 'month' ? 'month' : 'week',
      currency: room.currency || 'USD',
      maxGuests: room.maxGuests || 2,
      hasPrivateBath: room.hasPrivateBath !== false,
      hasAc: room.hasAc !== false,
      hasWardrobe: room.hasWardrobe !== false,
      description: room.description || '',
      images: room.images || [],
      newImageUrlInput: '',
      isActive: room.isActive !== false,
    });
    setRoomImageError('');
    setIsRoomModalOpen(true);
  };

  // Image Upload handler for Room
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    const availableSlots = Math.max(0, MAX_ROOM_IMAGES - roomForm.images.length);
    if (availableSlots === 0) {
      setRoomImageError(`You can add up to ${MAX_ROOM_IMAGES} images to a room.`);
      input.value = '';
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    setRoomImageError(files.length > availableSlots ? `Only ${MAX_ROOM_IMAGES} images can be added to a room.` : '');
    setIsUploadingRoomImages(true);
    try {
      const uploadedImages = await Promise.all(selectedFiles.map(compressRoomImage));
      setRoomForm(prev => ({ ...prev, images: [...prev.images, ...uploadedImages] }));
    } catch (error) {
      setRoomImageError(error instanceof Error ? error.message : 'Could not upload the selected image.');
    } finally {
      setIsUploadingRoomImages(false);
      input.value = '';
    }
  };

  const handleAddImageUrl = () => {
    if (!roomForm.newImageUrlInput.trim()) return;
    if (roomForm.images.length >= MAX_ROOM_IMAGES) {
      setRoomImageError(`You can add up to ${MAX_ROOM_IMAGES} images to a room.`);
      return;
    }
    setRoomForm(prev => ({
      ...prev,
      images: [...prev.images, prev.newImageUrlInput.trim()],
      newImageUrlInput: '',
    }));
    setRoomImageError('');
  };

  const handleRemoveRoomImage = (indexToRemove: number) => {
    setRoomForm(prev => {
      const remaining = prev.images.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        images: remaining,
      };
    });
  };

  const handleSetPrimaryImage = (indexToPrimary: number) => {
    setRoomForm(prev => {
      const selected = prev.images[indexToPrimary];
      const rest = prev.images.filter((_, idx) => idx !== indexToPrimary);
      return {
        ...prev,
        images: [selected, ...rest],
      };
    });
  };

  const handleSaveRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomForm.name.trim()) {
      alert('Please enter a title or name for this room.');
      return;
    }
    if (roomForm.weeklyRate <= 0 || roomForm.monthlyRate <= 0) {
      alert('Enter a weekly and monthly rate greater than zero.');
      return;
    }

    const finalImages = roomForm.images.length > 0
      ? roomForm.images
      : [DEFAULT_ROOM_IMAGE];

    const payload = {
      name: roomForm.name.trim(),
      bedType: roomForm.bedType,
      weeklyRate: Number(roomForm.weeklyRate),
      monthlyRate: Number(roomForm.monthlyRate),
      preferredPeriod: roomForm.preferredPeriod,
      currency: 'USD',
      maxGuests: Number(roomForm.maxGuests),
      hasPrivateBath: roomForm.hasPrivateBath,
      hasAc: roomForm.hasAc,
      hasWardrobe: roomForm.hasWardrobe,
      description: roomForm.description.trim(),
      images: finalImages,
      isActive: roomForm.isActive,
    };

    try {
      if (editingRoomId) {
        await updateRoomInUnit(roomParentUnitId, editingRoomId, payload);
      } else {
        await addRoomToUnit(roomParentUnitId, payload);
      }
      await onRefreshData();
      setIsRoomModalOpen(false);
      alert(editingRoomId ? 'Room updated successfully!' : 'New room added to apartment successfully!');
    } catch (error) {
      console.error('Could not save room:', error);
      alert(error instanceof Error ? `Could not save the room: ${error.message}` : 'Could not save the room. Check your connection and management access, then try again.');
    }
  };

  const handleDeleteRoom = async (unitId: string, roomId: string, roomName: string) => {
    if (confirm(`Are you sure you want to delete room "${roomName}"? This will permanently remove it from the apartment and website room listings.`)) {
      const removed = await deleteRoomFromUnit(unitId, roomId);
      if (removed) onRefreshData();
      else alert('Could not remove that room. It may have reservations or your account may not have permission.');
    }
  };

  // Delete Reservation from database
  const handleDeleteBooking = async (bookingId: string, bookingCode: string, guestName: string) => {
    if (confirm(`Are you sure you want to permanently delete reservation ${bookingCode} for guest "${guestName}"? This record will be erased from the database.`)) {
      const deleted = await deleteBooking(bookingId);
      if (!deleted) {
        alert('Could not delete that reservation. Only an active admin can delete bookings.');
        return;
      }
      onRefreshData();
      alert(`Reservation ${bookingCode} deleted successfully.`);
    }
  };

  // Save Site Settings
  const handleSaveSiteSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSaveError('');
    setSettingsSavedToast(false);
    try {
      const updated = await saveSiteSettings(settingsForm);
      onUpdateSiteSettings?.(updated);
      setSettingsForm(updated);
      setSettingsSavedToast(true);
      onRefreshData();
      setTimeout(() => setSettingsSavedToast(false), 3000);
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : 'Site settings could not be saved.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleExportCSV = () => {
    const csvCell = (value: unknown) => {
      const text = String(value ?? '');
      const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const headers = [
      'BookingCode', 'Unit', 'GuestName', 'Email', 'Phone', 'CheckIn', 'CheckOut', 'Nights',
      'TotalAmount', 'RefundedAmount', 'Currency', 'PaymentGateway', 'PaymentStatus', 'BookingStatus',
    ].map(csvCell).join(',') + '\n';
    const rows = bookings
      .map(b => [
        b.bookingCode, b.unitName, b.guestName, b.guestEmail, b.guestPhone, b.checkInDate,
        b.checkOutDate, b.nights, b.totalAmount, b.refundedAmount, b.currency, b.paymentGateway, b.paymentStatus,
        b.bookingStatus,
      ].map(csvCell).join(','))
      .join('\r\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adradhomesgh_reservations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950 flex flex-col animate-in fade-in duration-200">
      {/* Top Admin Header Bar */}
      <header className="h-16 bg-[#0E0D0C] border-b border-stone-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <AradadLogo size="sm" />
          <div className="h-5 w-px bg-stone-800 hidden sm:block" />
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-bold text-white font-serif">
              Host Management Portal
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              adradhomesgh.com · Admin Console
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-stone-900 border border-stone-800 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-stone-300 font-medium">{currentUser.name}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-[#DFB76C] font-bold">
              {currentUser.role}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-[#C89B3C]">
            <span>Powered by</span>
            <strong className="text-white">JAMS TECH</strong>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>Exit to Site</span>
          </button>

          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            title="Sign out of Admin session"
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-red-950 text-stone-400 hover:text-red-300 border border-stone-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Workspace with Sidebar Navigation */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-stone-900 text-stone-100">
        {/* Left Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-[#0D0D0C] border-b md:border-b-0 md:border-r border-stone-800 p-3 sm:p-4 shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto">
          <div className="flex md:flex-col gap-1 w-full">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 px-3 py-2 hidden md:block">
              Operations Menu
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <Building className="w-4 h-4" />
              <span>Overview & KPIs</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'bookings'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Reservations</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeTab === 'bookings' ? 'bg-stone-950 text-white' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {bookings.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'calendar'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4" />
                <span>Block Calendar</span>
              </div>
              {blockedDates.length > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    activeTab === 'calendar' ? 'bg-stone-950 text-white' : 'bg-stone-800 text-amber-400'
                  }`}
                >
                  {blockedDates.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('units')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'units'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Building className="w-4 h-4" />
                <span>Apartments</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeTab === 'units' ? 'bg-stone-950 text-white' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {units.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'rooms'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bed className="w-4 h-4" />
                <span>Rooms Management</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeTab === 'rooms' ? 'bg-stone-950 text-white' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {allRooms.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Site Settings</span>
            </button>

            <button
              onClick={() => setActiveTab('payouts')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'payouts'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Bank Settlement</span>
            </button>

            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 px-3 pt-4 pb-1 hidden md:block">
              Technical & Access
            </div>

            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === 'staff'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:bg-stone-900 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Staff Accounts</span>
            </button>
          </div>

          {/* Powered by JAMS TECH attribution at bottom */}
          <div className="hidden md:block p-3 bg-stone-950 rounded-xl border border-stone-800 text-[11px] text-stone-400 mt-4 space-y-1">
            <div className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
              Engineering
            </div>
            <div className="flex items-center gap-1.5 text-stone-300">
              <Sparkles className="w-3.5 h-3.5 text-[#C89B3C]" />
              <span className="font-semibold text-white">Powered by JAMS TECH</span>
            </div>
            <div className="text-[10px] text-stone-500">v2.4 Production Suite</div>
          </div>
        </aside>

        {/* Content Body Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="max-w-6xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-800">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">
                    Property Operations Dashboard
                  </h2>
                  <p className="text-xs text-stone-400">
                    {settingsForm.siteName} · {settingsForm.address}, {settingsForm.neighborhood}, {settingsForm.city} · {settingsForm.domain}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenAddUnit}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Room / Apartment</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Total Reservations</span>
                  <div className="font-mono text-3xl font-bold text-white tabular-nums">
                    {bookings.length}
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">Lifetime stays booked</span>
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Confirmed Stays</span>
                  <div className="font-mono text-3xl font-bold text-emerald-400 tabular-nums">
                    {confirmedCount}
                  </div>
                  <span className="text-[11px] text-emerald-500/80 mt-1 block">Active / Approved</span>
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Pending Approval / Payment</span>
                  <div className="font-mono text-3xl font-bold text-amber-400 tabular-nums">
                    {pendingCount}
                  </div>
                  <span className="text-[11px] text-amber-500/80 mt-1 block">Requires staff verification</span>
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Net Payments Retained</span>
                  <div className="font-mono text-3xl font-bold text-[#DFB76C] tabular-nums">
                    {formatCurrencyIn(totalPaymentsReceived, currency)}
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    Recorded refunds deducted; amounts converted from each booking currency.
                  </span>
                  {refundsNeedingReconciliation > 0 && (
                    <span className="text-[11px] text-amber-400 mt-1 block">
                      {refundsNeedingReconciliation} older refund{refundsNeedingReconciliation === 1 ? '' : 's'} need amount reconciliation.
                    </span>
                  )}
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Upcoming Arrivals</span>
                  <div className="font-mono text-3xl font-bold text-sky-300 tabular-nums">
                    {upcomingBookings.length}
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    Confirmed and pending stays from today
                  </span>
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Live Inventory</span>
                  <div className="font-mono text-3xl font-bold text-white tabular-nums">
                    {activeUnitCount + activeRoomCount}
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    {activeUnitCount} apartments · {activeRoomCount} rooms active
                  </span>
                </div>

                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-400 block mb-1">Needs Attention</span>
                  <div className={`font-mono text-3xl font-bold tabular-nums ${attentionCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {attentionCount}
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    Pending approvals or refund checks
                  </span>
                </div>
              </div>

              {/* Quick Actions & Recent Bookings */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-lg font-bold text-white">
                      Recent Reservations
                    </h3>
                    <button
                      onClick={() => setActiveTab('bookings')}
                      className="text-xs text-amber-400 hover:underline"
                    >
                      View All &rarr;
                    </button>
                  </div>

                  <div className="divide-y divide-stone-800/80 text-xs">
                    {upcomingBookings.slice(0, 4).map(b => (
                      <div key={b.id} className="py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-white text-sm">{b.guestName}</strong>
                            <span className="font-mono text-stone-500 text-[11px]">
                              {b.bookingCode}
                            </span>
                          </div>
                          <div className="text-stone-400 text-[11px] mt-0.5">
                            {b.unitName} · {formatDatePretty(b.checkInDate)} to{' '}
                            {formatDatePretty(b.checkOutDate)}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-white block">
                            {formatCurrencyIn(
                              convertCurrencyAmount(b.totalAmount, b.currency, currency, usdToGhsRate),
                              currency,
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              b.bookingStatus === 'confirmed'
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {String(b.bookingStatus || 'confirmed').toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {upcomingBookings.length === 0 && (
                      <div className="py-8 text-center text-xs text-stone-500">
                        No upcoming stays. New reservations will appear here.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <h3 className="font-serif text-lg font-bold text-white">Property Status</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                      <span>Starlink Wi-Fi ({settingsForm.starlinkNetworkName})</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Online
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                      <span>Automatic Standby Generator</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Standby Ready
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                      <span>Water Storage Reservoirs</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 100% Capacity
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                      <span>Gate Security Personnel</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Stationed 24/7
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => setActiveTab('units')}
                      className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Bed className="w-3.5 h-3.5" />
                      <span>Manage Rooms & Apartments ({units.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Edit Site Settings & Payouts</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOOKINGS LIST */}
          {activeTab === 'bookings' && (
            <div className="max-w-6xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-800">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">
                    Guest Reservations Database
                  </h2>
                  <p className="text-xs text-stone-400">
                    Review incoming reservations, verify Mobile Money & Bank Swift transfers, and approve stays.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export to Excel/CSV</span>
                </button>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-stone-950 p-3 rounded-xl border border-stone-800">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by code, guest, phone..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="flex gap-1.5 self-start sm:self-auto text-xs">
                  {['all', 'confirmed', 'pending_approval', 'cancelled'].map(status => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                        filterStatus === status
                          ? 'bg-amber-500 text-stone-950 font-bold border-amber-500'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      {String(status || '').replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bookings Table */}
              <div className="border border-stone-800 rounded-xl overflow-x-auto bg-stone-950">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-900/80 border-b border-stone-800 font-semibold text-stone-400">
                    <tr>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Guest Contact</th>
                      <th className="p-3">Apartment / Unit</th>
                      <th className="p-3">Stay Dates</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3">Payment</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-light">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-stone-500">
                          No reservations found matching this query.
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map(b => (
                        <tr key={b.id} className="hover:bg-stone-900/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-white">
                            {b.bookingCode}
                          </td>
                          <td className="p-3">
                            <strong className="block text-white font-medium">{b.guestName}</strong>
                            <span className="text-[11px] text-stone-400 block">{b.guestEmail}</span>
                            <span className="text-[11px] text-amber-400/80 block font-mono">
                              {b.guestPhone}
                            </span>
                          </td>
                          <td className="p-3 max-w-[160px] truncate" title={b.unitName}>
                            {b.unitName}
                          </td>
                          <td className="p-3">
                            <span className="block font-medium text-stone-200">
                              {formatDatePretty(b.checkInDate)}
                            </span>
                            <span className="text-stone-400 block text-[11px]">
                              to {formatDatePretty(b.checkOutDate)} ({b.nights} nights)
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-white">
                              {formatCurrencyIn(
                                convertCurrencyAmount(b.totalAmount, b.currency, currency, usdToGhsRate),
                                currency,
                              )}
                          </td>
                          <td className="p-3">
                            <span className="block capitalize font-medium">
                              {String(b.paymentGateway || (b as any).payment_gateway || 'mobile_money').replace('_', ' ')}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                (b.paymentStatus || (b as any).payment_status) === 'paid' ||
                                (b.paymentStatus || (b as any).payment_status) === 'verified'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-amber-950 text-amber-300'
                              }`}
                            >
                              {String(b.paymentStatus || (b as any).payment_status || 'pending').toUpperCase()}
                            </span>
                            {b.refundedAmount !== null && b.refundedAmount > 0 && (
                              <span className="block text-[10px] text-amber-300 mt-1">
                                Refunded: {formatCurrencyIn(b.refundedAmount, b.currency)}
                              </span>
                            )}
                            {b.paymentStatus === 'refunded' && b.refundedAmount === null && (
                              <span className="block text-[10px] text-amber-300 mt-1">
                                Refund amount needs reconciliation
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                (b.bookingStatus || (b as any).booking_status) === 'confirmed'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : (b.bookingStatus || (b as any).booking_status) === 'cancelled'
                                  ? 'bg-red-950 text-red-300'
                                  : 'bg-amber-950 text-amber-300'
                              }`}
                            >
                              {String(b.bookingStatus || (b as any).booking_status || 'confirmed').toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {b.paymentGateway === 'paystack' && b.paymentStatus !== 'paid' && b.paymentReference && (
                                <button
                                  onClick={() => void handleVerifyPaystackPayment(b)}
                                  title="Verify this Paystack payment"
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded"
                                >
                                  Verify Pay
                                </button>
                              )}
                              {b.bookingStatus === 'pending_approval' && (
                                <button
                                  onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                                  disabled={b.paymentStatus !== 'paid' && b.paymentStatus !== 'verified'}
                                  title={b.paymentStatus !== 'paid' && b.paymentStatus !== 'verified'
                                    ? 'Mark the payment as paid or verified before approval.'
                                    : 'Approve Reservation'}
                                  className="p-1.5 text-emerald-400 hover:bg-emerald-950 rounded disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                              {b.paymentStatus === 'pending' && b.paymentGateway === 'cash' && (
                                <button
                                  onClick={() => handleUpdateStatus(b.id, undefined, 'paid')}
                                  title="Confirm cash received"
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                                >
                                  Mark Cash Paid
                                </button>
                              )}
                              {b.paymentStatus === 'pending' && b.paymentGateway !== 'paystack' && b.paymentGateway !== 'cash' && (
                                <button
                                  onClick={() => handleUpdateStatus(b.id, undefined, 'verified')}
                                  title="Mark manual payment as verified after checking the transfer."
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                                >
                                  Verify Pay
                                </button>
                              )}
                              {b.bookingStatus === 'cancelled'
                                && (refundReviewableStatuses.has(b.paymentStatus)
                                  || (b.paymentStatus === 'refunded' && b.refundedAmount === null)) && (
                                <button
                                  onClick={() => {
                                    const refundRemaining = Math.max(
                                      0,
                                      getGrossPaymentAmount(b) - Number(b.refundedAmount || 0),
                                    );
                                    const amountText = window.prompt(
                                      'Enter the refund amount confirmed for ' + b.bookingCode + ' (' + b.currency + ').',
                                      refundRemaining.toFixed(2),
                                    );
                                    if (amountText === null) return;
                                    const refundAmount = Number(amountText);
                                    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > refundRemaining) {
                                      alert('Enter an amount greater than zero and no more than ' + formatCurrencyIn(refundRemaining, b.currency) + '.');
                                      return;
                                    }
                                    const recordedRefund = Number((Number(b.refundedAmount || 0) + refundAmount).toFixed(2));
                                    if (confirm('Only continue after the provider confirms a refund of ' + formatCurrencyIn(refundAmount, b.currency) + ' has completed.')) {
                                      handleUpdateStatus(b.id, undefined, 'refunded', recordedRefund);
                                    }
                                  }}
                                  title="Record a refund after confirming the amount with the payment provider."
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded"
                                >
                                  Record Refund
                                </button>
                              )}
                              {b.bookingStatus !== 'cancelled' && (
                                <button
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Cancel stay ${b.bookingCode}? Per policy, eligible refund is calculated.`
                                      )
                                    ) {
                                      handleUpdateStatus(b.id, 'cancelled', undefined);
                                    }
                                  }}
                                  title="Cancel Reservation"
                                  className="p-1 text-red-400 hover:bg-red-950 rounded"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteBooking(b.id, b.bookingCode, b.guestName)}
                                title="Permanently Delete Reservation"
                                className="p-1 text-stone-500 hover:text-red-400 hover:bg-red-950/60 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
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
          )}

          {/* TAB 3: CALENDAR & BLOCKED DATES */}
          {activeTab === 'calendar' && (
            <div className="max-w-4xl space-y-6">
              <div className="pb-2 border-b border-stone-800">
                <h2 className="font-serif text-2xl font-bold text-white">
                  Calendar Date Blocker
                </h2>
                <p className="text-xs text-stone-400">
                  Block dates for scheduled property maintenance, private owner stay, or deep cleaning.
                </p>
              </div>

              {/* Form */}
              <form
                onSubmit={handleCreateBlock}
                className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4"
              >
                <h3 className="font-serif text-base font-bold text-white">
                  Add New Blocked Date Range
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold">Apartment</label>
                    <select
                      value={blockUnitId}
                      onChange={e => setBlockUnitId(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white"
                    >
                      {units.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold">Start Date</label>
                    <input
                      type="date"
                      value={blockStart}
                      onChange={e => setBlockStart(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold">End Date</label>
                    <input
                      type="date"
                      value={blockEnd}
                      min={blockStart}
                      onChange={e => setBlockEnd(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold">Reason / Note</label>
                    <input
                      type="text"
                      placeholder="e.g. AC Servicing & Painting"
                      value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isBlocking}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isBlocking ? 'Blocking...' : 'Block on Calendar'}</span>
                </button>
              </form>

              {/* List */}
              <div className="bg-stone-950 p-5 rounded-xl border border-stone-800">
                <h3 className="font-serif text-base font-bold text-white mb-3">
                  Current Calendar Blocks ({blockedDates.length})
                </h3>
                <div className="divide-y divide-stone-800 text-xs">
                  {blockedDates.length === 0 ? (
                    <div className="py-4 text-center text-stone-500">
                      No intervals currently blocked. All units are open for client reservations.
                    </div>
                  ) : (
                    blockedDates.map(d => (
                      <div key={d.id} className="py-3 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">
                            {units.find(u => u.id === d.unitId)?.title || d.unitId}
                          </strong>
                          <span className="font-mono text-stone-400 text-[11px]">
                            {formatDatePretty(d.startDate)} &rarr; {formatDatePretty(d.endDate)}
                          </span>
                          <span className="text-stone-500 text-[11px] block mt-0.5 font-light">
                            {d.reason}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveBlock(d.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950 rounded transition-colors"
                          title="Remove Block"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ROOMS & APARTMENTS (ADD, EDIT, DELETE) */}
          {activeTab === 'units' && (
            <div className="max-w-5xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-800">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">
                    Apartment & Room Inventory
                  </h2>
                  <p className="text-xs text-stone-400">
                    Add new rooms, modify rates, update power allowances, or remove listings.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddUnit}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-2 transition-colors shadow-md self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Apartment / Room</span>
                </button>
              </div>

              {/* Units Grid with Edit & Delete Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {units.map(unit => (
                  <div
                    key={unit.id}
                    className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-stone-900 border border-stone-800 mb-3">
                        <img
                          src={unit.images[0] || BEDROOM_SUITE_IMAGE}
                          alt={unit.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2.5 left-2.5 bg-stone-950/80 text-white text-[11px] font-mono px-2 py-0.5 rounded border border-stone-700">
                          {unit.propertyType}
                        </div>
                        <div className="absolute top-2.5 right-2.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              unit.isActive !== false
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {unit.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-serif text-lg font-bold text-white">{unit.title}</h3>
                      <p className="text-xs text-stone-400 mt-1 line-clamp-2">{unit.subtitle}</p>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono bg-stone-900 p-3 rounded-lg border border-stone-800 mt-3">
                        <div>Nightly: <strong className="text-white">${unit.nightlyRate}</strong></div>
                        <div>Monthly: <strong className="text-white">${unit.weeklyMonthlyRate}</strong></div>
                        <div>Bedrooms: <strong className="text-white">{unit.bedrooms}</strong></div>
                        <div>Bathrooms: <strong className="text-white">{unit.bathrooms}</strong></div>
                        <div>Max Guests: <strong className="text-white">{unit.maxOccupancy}</strong></div>
                        <div>Power: <strong className="text-amber-400">GH₵ {unit.prepaidElectricityGhc}</strong></div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-800 flex items-center justify-between">
                      <span className="text-[11px] text-stone-500 font-mono">
                        ID: {unit.id}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEditUnit(unit)}
                          className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(unit.id, unit.title)}
                          className="p-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 rounded-lg transition-colors"
                          title="Delete Listing"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ROOMS MANAGEMENT (ADD / EDIT / DELETE ROOMS) */}
          {activeTab === 'rooms' && (
            <div className="max-w-5xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-800">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
                    <Bed className="w-6 h-6 text-amber-400" />
                    <span>Individual Rooms & En-Suite Chambers</span>
                  </h2>
                  <p className="text-xs text-stone-400">
                    Add new rooms to your apartments, edit room details & rates, or remove rooms from booking inventory.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenAddRoom()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-2 transition-colors shadow-md self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Room</span>
                </button>
              </div>

              {units.length === 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-200">Create a property before adding individual rooms</p>
                    <p className="mt-1 text-xs text-amber-100/70">This gives each room a property to belong to. Inactive properties are also available here.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddUnit}
                    className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400"
                  >
                    <Plus className="mr-1 inline h-4 w-4" />
                    Create Property
                  </button>
                </div>
              )}

              {/* Apartment Filter and Stats */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-950 p-3.5 rounded-xl border border-stone-800">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-400 font-semibold">Filter by Apartment:</span>
                  <select
                    value={selectedRoomFilterApartment}
                    onChange={e => setSelectedRoomFilterApartment(e.target.value)}
                    className="bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-white"
                  >
                    <option value="all">All Apartments ({units.length})</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-xs text-stone-400 flex items-center gap-2">
                  <span>Total Rooms Available:</span>
                  <strong className="text-amber-400 font-mono text-sm">{allRooms.length}</strong>
                </div>
              </div>

              {/* Rooms Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {allRooms
                  .filter(
                    r =>
                      selectedRoomFilterApartment === 'all' ||
                      r.parentUnit.id === selectedRoomFilterApartment
                  )
                  .map(room => (
                    <div
                      key={room.id}
                      className="bg-stone-950 rounded-xl border border-stone-800 overflow-hidden flex flex-col justify-between hover:border-stone-700 transition-colors"
                    >
                      <div>
                        <div className="relative aspect-[4/3] bg-stone-900 overflow-hidden">
                          <img
                            src={room.images[0] || BEDROOM_SUITE_IMAGE}
                            alt={room.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 bg-stone-950/80 backdrop-blur-xs text-stone-200 text-[10px] font-mono px-2 py-0.5 rounded border border-stone-800">
                            {room.parentUnit.title}
                          </div>
                          <div className="absolute top-2 right-2">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                room.isActive !== false
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-red-950 text-red-300 border border-red-800'
                              }`}
                            >
                              {room.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-amber-400 font-mono">
                              {room.bedType}
                            </span>
                            <span className="text-xs text-stone-400 font-mono">
                              Max {room.maxGuests} Guests
                            </span>
                          </div>

                          <h3 className="font-serif text-base font-bold text-white leading-snug">
                            {room.name}
                          </h3>

                          <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed font-light">
                            {room.description || 'Modern en-suite bedroom with luxury amenities.'}
                          </p>

                          <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                            {room.hasPrivateBath && (
                              <span className="px-2 py-0.5 rounded bg-stone-900 text-stone-300 border border-stone-800">
                                En-Suite Bath
                              </span>
                            )}
                            {room.hasAc && (
                              <span className="px-2 py-0.5 rounded bg-stone-900 text-stone-300 border border-stone-800">
                                Split AC
                              </span>
                            )}
                            {room.hasWardrobe && (
                              <span className="px-2 py-0.5 rounded bg-stone-900 text-stone-300 border border-stone-800">
                                Wardrobe
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 pt-3 border-t border-stone-800/80 flex items-center justify-between bg-stone-900/40">
                        <div className="space-y-0.5">
                          <div className="font-mono text-sm font-bold text-white">
                            {formatCurrency(getRoomWeeklyRate(room), currency, siteSettings?.usdToGhsRate || USD_TO_GHS_RATE)} <span className="text-[10px] font-sans font-normal text-stone-500">/ week</span>
                          </div>
                          <div className="font-mono text-xs text-stone-400">
                            {formatCurrency(getRoomMonthlyRate(room), currency, siteSettings?.usdToGhsRate || USD_TO_GHS_RATE)} <span className="text-[10px] font-sans text-stone-500">/ month</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditRoom(room.parentUnit.id, room)}
                            className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteRoom(room.parentUnit.id, room.id, room.name)
                            }
                            className="p-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 rounded-lg transition-colors"
                            title="Delete Room"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="max-w-4xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-800">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">
                    Site Settings & Global Parameters
                  </h2>
                  <p className="text-xs text-stone-400">
                    Configure official contact details, check-in rules, live bank settlements, and currency rates.
                  </p>
                </div>
                {settingsSavedToast && (
                  <div className="px-3 py-1.5 bg-emerald-950 border border-emerald-700 text-emerald-200 text-xs font-semibold rounded-lg flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Settings Saved & Applied!</span>
                  </div>
                )}
              </div>

              {settingsSaveError && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-200">{settingsSaveError}</p>}

              <form onSubmit={handleSaveSiteSettingsSubmit} className="space-y-6">
                {/* 1. Property Identity & Domain */}
                <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-400" />
                    Property Identity & Domain
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <p className="sm:col-span-2 text-stone-400 uppercase tracking-wider font-semibold">Bank Settlement Details</p>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Site / Property Name</label>
                      <input
                        type="text"
                        value={settingsForm.siteName}
                        onChange={e => setSettingsForm({ ...settingsForm, siteName: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Live Domain URL</label>
                      <input
                        type="text"
                        value={settingsForm.domain}
                        onChange={e => setSettingsForm({ ...settingsForm, domain: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold text-xs">Property Tagline</label>
                    <input
                      type="text"
                      value={settingsForm.tagline}
                      onChange={e => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                {/* 2. Location & Neighborhood */}
                <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    Location & Landmark
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Street Address</label>
                      <input
                        type="text"
                        value={settingsForm.address}
                        onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Neighborhood / Area</label>
                      <input
                        type="text"
                        value={settingsForm.neighborhood}
                        onChange={e => setSettingsForm({ ...settingsForm, neighborhood: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">City & Country</label>
                      <input
                        type="text"
                        value={settingsForm.city}
                        onChange={e => setSettingsForm({ ...settingsForm, city: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1 font-semibold text-xs">Primary Landmark (for Drivers & Guests)</label>
                    <input
                      type="text"
                      value={settingsForm.landmarks}
                      onChange={e => setSettingsForm({ ...settingsForm, landmarks: e.target.value })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                {/* 3. Host Contact & Security */}
                <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-400" />
                    Host Contact & Emergency Numbers
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Property Manager Name</label>
                      <input
                        type="text"
                        value={settingsForm.ownerName}
                        onChange={e => setSettingsForm({ ...settingsForm, ownerName: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Direct Phone / WhatsApp</label>
                      <input
                        type="text"
                        value={settingsForm.ownerPhone}
                        onChange={e => setSettingsForm({ ...settingsForm, ownerPhone: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Official Email</label>
                      <input
                        type="email"
                        value={settingsForm.ownerEmail}
                        onChange={e => setSettingsForm({ ...settingsForm, ownerEmail: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <label className="block text-stone-400 font-semibold">
                      Bank Account Name
                      <input type="text" value={settingsForm.bankAccountName} onChange={e => setSettingsForm({ ...settingsForm, bankAccountName: e.target.value })} className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-stone-400 font-semibold">
                      Bank Account Number
                      <input type="text" value={settingsForm.bankAccountNumber} onChange={e => setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })} className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
                    </label>
                    <label className="block text-stone-400 font-semibold">
                      Bank Branch
                      <input type="text" value={settingsForm.bankBranch} onChange={e => setSettingsForm({ ...settingsForm, bankBranch: e.target.value })} className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-stone-400 font-semibold">
                      SWIFT Code
                      <input type="text" value={settingsForm.bankSwiftCode} onChange={e => setSettingsForm({ ...settingsForm, bankSwiftCode: e.target.value })} className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
                    </label>
                  </div>
                </div>

                {/* 4. Operating Rules & Exchange Rates */}
                <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Stay Parameters & Finance Rules
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Default Check-In</label>
                      <input
                        type="text"
                        value={settingsForm.defaultCheckInTime}
                        onChange={e => setSettingsForm({ ...settingsForm, defaultCheckInTime: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Default Check-Out</label>
                      <input
                        type="text"
                        value={settingsForm.defaultCheckOutTime}
                        onChange={e => setSettingsForm({ ...settingsForm, defaultCheckOutTime: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Security Deposit ($)</label>
                      <input
                        type="number"
                        min="0"
                        value={settingsForm.defaultSecurityDeposit}
                        onChange={e => setSettingsForm({ ...settingsForm, defaultSecurityDeposit: Number(e.target.value) })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">USD &rarr; GHS Rate</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={settingsForm.usdToGhsRate}
                        onChange={e => setSettingsForm({ ...settingsForm, usdToGhsRate: Number(e.target.value) })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Quiet Hours Regulation</label>
                      <input
                        type="text"
                        value={settingsForm.quietHours}
                        onChange={e => setSettingsForm({ ...settingsForm, quietHours: e.target.value })}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-400 mb-1 font-semibold">Engineering Platform</label>
                      <input
                        type="text"
                        value={settingsForm.poweredBy}
                        readOnly
                        aria-readonly="true"
                        title="Engineering attribution is managed by the platform and cannot be changed here."
                        className="w-full cursor-not-allowed bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-500 font-semibold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-2 transition-colors shadow-md"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingSettings ? 'Saving…' : 'Save All Site Settings'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: BANK PAYOUT SETTLEMENT */}
          {activeTab === 'payouts' && (
            <div className="max-w-4xl space-y-6">
              <div className="pb-2 border-b border-stone-800">
                <h2 className="font-serif text-2xl font-bold text-white">
                  Bank Settlement & Payout Details
                </h2>
                <p className="text-xs text-stone-400">
                  Official recipient bank details for international wire transfers and guest bookings.
                </p>
              </div>

              <div className="bg-stone-950 p-6 rounded-xl border border-stone-800 space-y-4">
                <div className="flex items-center gap-3">
                  <Building className="w-6 h-6 text-amber-500" />
                  <div>
                    <h3 className="font-serif text-lg font-bold text-white">
                      Official ARADAD HOMES Bank Account
                    </h3>
                    <p className="text-xs text-stone-400">
                      Configured for direct client wire transfers and merchant payouts.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono bg-stone-900 p-4 rounded-lg border border-stone-800">
                  <div>
                    <span className="text-stone-500 block font-sans">Account Name</span>
                    <strong className="text-sm text-white">{settingsForm.bankAccountName}</strong>
                  </div>
                  <div>
                    <span className="text-stone-500 block font-sans">Account Number</span>
                    <strong className="text-sm text-white">{settingsForm.bankAccountNumber}</strong>
                  </div>
                  <div>
                    <span className="text-stone-500 block font-sans">Bank Branch</span>
                    <strong className="text-sm text-white">{settingsForm.bankBranch}</strong>
                  </div>
                  <div>
                    <span className="text-stone-500 block font-sans">SWIFT Code</span>
                    <strong className="text-sm text-white">{settingsForm.bankSwiftCode}</strong>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-950/40 rounded-xl border border-amber-800/80 text-xs text-amber-200 space-y-1.5">
                <span className="font-bold flex items-center gap-1.5 text-amber-300">
                  <ShieldCheck className="w-4 h-4" />
                  Security Deposit (${settingsForm.defaultSecurityDeposit}.00) Processing Rule
                </span>
                <p className="leading-relaxed">
                  The ${settingsForm.defaultSecurityDeposit} damage deposit is held during the guest occupancy. Within 48 hours of departure, conduct the property inspection. Return the deposit within 1–3 business days via original payment method (Mobile Money or Bank Swift).
                </p>
              </div>
            </div>
          )}

          {/* TAB 8: STAFF ACCOUNTS */}
          {activeTab === 'staff' && (
            <div className="max-w-4xl space-y-6">
              <div className="pb-2 border-b border-stone-800">
                <h2 className="font-serif text-2xl font-bold text-white">Staff & Administrative Security</h2>
                <p className="text-xs text-stone-400 mt-1">Verified signup requests remain locked out until an active administrator approves them.</p>
              </div>
              {currentUser.role === 'admin' ? (
                <>
                  <section className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                    <div>
                      <h3 className="font-semibold text-white">Add a management account</h3>
                      <p className="text-xs text-stone-400 mt-1">Create a staff, manager, or co-admin account directly. The email is confirmed automatically.</p>
                    </div>
                    <form onSubmit={handleCreateStaff} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-xs text-stone-300">
                        Full name
                        <input
                          type="text"
                          value={newStaffForm.fullName}
                          onChange={event => setNewStaffForm({ ...newStaffForm, fullName: event.target.value })}
                          minLength={2}
                          maxLength={120}
                          required
                          className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-stone-300">
                        Email address
                        <input
                          type="email"
                          value={newStaffForm.email}
                          onChange={event => setNewStaffForm({ ...newStaffForm, email: event.target.value })}
                          required
                          className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-stone-300">
                        Temporary password
                        <input
                          type="password"
                          value={newStaffForm.password}
                          onChange={event => setNewStaffForm({ ...newStaffForm, password: event.target.value })}
                          minLength={8}
                          required
                          className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-stone-300">
                        Access level
                        <select
                          value={newStaffForm.role}
                          onChange={event => setNewStaffForm({ ...newStaffForm, role: event.target.value as AuthUser['role'] })}
                          className="mt-1 w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="staff">Staff</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Co-admin</option>
                        </select>
                      </label>
                      <div className="md:col-span-2 flex items-center justify-between gap-3">
                        {staffCreateMessage ? (
                          <p role={staffCreateMessage.success ? 'status' : 'alert'} className={`text-xs ${staffCreateMessage.success ? 'text-emerald-300' : 'text-red-300'}`}>
                            {staffCreateMessage.text}
                          </p>
                        ) : <span />}
                        <button
                          type="submit"
                          disabled={isCreatingStaff}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 rounded-lg text-xs font-bold"
                        >
                          {isCreatingStaff ? 'Creating…' : 'Create Account'}
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-white">Management accounts</h3>
                        <p className="text-xs text-stone-400 mt-1">Active staff and administrators who can access the portal.</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-stone-900 text-stone-300 border border-stone-800 text-xs font-semibold">
                        {staffAccounts.filter(account => account.isActive).length} active
                      </span>
                    </div>
                    {staffAccountsError && <div role="alert" className="p-3 bg-red-950/70 border border-red-900 rounded-lg text-xs text-red-200">{staffAccountsError}</div>}
                    {staffAccountsLoading ? (
                      <p className="text-xs text-stone-400 py-4">Loading management accounts…</p>
                    ) : staffAccounts.length === 0 ? (
                      <p className="text-xs text-stone-400 py-4">No management accounts found.</p>
                    ) : (
                      <div className="divide-y divide-stone-800 border border-stone-800 rounded-lg">
                        {staffAccounts.map(account => (
                          <div key={account.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">{account.name}</div>
                              <div className="text-xs text-stone-400 break-all">{account.email}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`self-start sm:self-auto px-2 py-1 rounded text-[10px] font-bold uppercase ${account.isActive ? 'bg-emerald-950 text-emerald-300' : 'bg-stone-800 text-stone-300'}`}>
                                {account.isActive ? 'Active' : 'Inactive'}
                              </span>
                              <span className="self-start sm:self-auto px-2 py-1 rounded bg-amber-950 text-amber-300 text-[10px] font-bold uppercase">
                                {account.role === 'admin' ? 'Co-admin' : account.role}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleStaffAccount(account)}
                                disabled={actioningStaffAccountId === account.id}
                                className="px-2.5 py-1.5 rounded border border-stone-700 bg-stone-900 text-[10px] font-bold uppercase text-white hover:border-stone-500 disabled:opacity-50"
                              >
                                {actioningStaffAccountId === account.id ? 'Updating…' : account.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-white">Pending access requests</h3>
                      <p className="text-xs text-stone-400 mt-1">Review each verified email and assign only the access level it needs.</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-900 text-xs font-semibold">
                      {signupRequests.length} pending
                    </span>
                  </div>
                  {signupRequestsError && (
                    <div role="alert" className="p-3 bg-red-950/70 border border-red-900 rounded-lg text-xs text-red-200">{signupRequestsError}</div>
                  )}
                  {signupRequestsLoading ? (
                    <p className="text-xs text-stone-400 py-4">Loading requests…</p>
                  ) : signupRequests.length === 0 ? (
                    <p className="text-xs text-stone-400 py-4">There are no pending staff requests.</p>
                  ) : (
                    <div className="space-y-3">
                      {signupRequests.map(request => (
                        <div key={request.id} className="rounded-lg border border-stone-800 bg-stone-900 p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white truncate">{request.fullName}</div>
                            <div className="text-xs text-stone-300 break-all">{request.email}</div>
                            <div className="text-[11px] text-stone-500 mt-1">Requested {new Date(request.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`signup-role-${request.id}`}>Role for {request.fullName}</label>
                            <select
                              id={`signup-role-${request.id}`}
                              value={signupRoleById[request.id] || 'staff'}
                              onChange={event => setSignupRoleById(roles => ({
                                ...roles,
                                [request.id]: event.target.value as 'admin' | 'manager' | 'staff',
                              }))}
                              disabled={reviewingSignupRequest === request.id}
                              className="bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-white"
                            >
                              <option value="staff">Staff</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleReviewSignupRequest(request, true)}
                              disabled={reviewingSignupRequest === request.id}
                              className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold"
                            >
                              {reviewingSignupRequest === request.id ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleReviewSignupRequest(request, false)}
                              disabled={reviewingSignupRequest === request.id}
                              className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-red-950 border border-stone-700 hover:border-red-900 disabled:opacity-50 text-stone-200 text-xs font-semibold"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </section>
                </>
              ) : (
                <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-400">
                  Access requests can only be reviewed by an active administrator.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* UNIT ADD / EDIT MODAL DIALOG */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-950">
              <h3 className="font-serif text-xl font-bold text-white">
                {editingUnitId ? 'Edit Apartment / Room' : 'Add New Apartment or Room'}
              </h3>
              <button
                onClick={() => setIsUnitModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUnitSubmit} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Apartment / Room Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. The Presidential Penthouse Suite"
                    value={unitForm.title}
                    onChange={e => setUnitForm({ ...unitForm, title: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Listing Category *</label>
                  <select
                    value={unitForm.category}
                    onChange={e => setUnitForm({ ...unitForm, category: e.target.value as 'apartment' | 'room' })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="apartment">Apartment</option>
                    <option value="room">Room</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Property Type *</label>
                  <input
                    type="text"
                    placeholder="e.g. 3+ Bedroom Luxury / Executive Room"
                    value={unitForm.propertyType}
                    onChange={e => setUnitForm({ ...unitForm, propertyType: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold">Subtitle / Room Highlight</label>
                <input
                  type="text"
                  placeholder="e.g. Private Balcony · En-Suite Bath · Split Air Conditioning"
                  value={unitForm.subtitle}
                  onChange={e => setUnitForm({ ...unitForm, subtitle: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Nightly Rate (USD $)</label>
                  <input
                    type="number"
                    value={unitForm.nightlyRate}
                    onChange={e => setUnitForm({ ...unitForm, nightlyRate: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Monthly Rate (USD $)</label>
                  <input
                    type="number"
                    value={unitForm.weeklyMonthlyRate}
                    onChange={e => setUnitForm({ ...unitForm, weeklyMonthlyRate: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Bedrooms</label>
                  <input
                    type="number"
                    value={unitForm.bedrooms}
                    onChange={e => setUnitForm({ ...unitForm, bedrooms: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Bathrooms</label>
                  <input
                    type="number"
                    value={unitForm.bathrooms}
                    onChange={e => setUnitForm({ ...unitForm, bathrooms: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Max Guests</label>
                  <input
                    type="number"
                    value={unitForm.maxOccupancy}
                    onChange={e => setUnitForm({ ...unitForm, maxOccupancy: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Electricity Credit (GH₵)</label>
                  <input
                    type="number"
                    value={unitForm.prepaidElectricityGhc}
                    onChange={e => setUnitForm({ ...unitForm, prepaidElectricityGhc: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Security Deposit ($)</label>
                  <input
                    type="number"
                    value={unitForm.securityDeposit}
                    onChange={e => setUnitForm({ ...unitForm, securityDeposit: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Booking Style</label>
                  <select
                    value={unitForm.bookingStyle}
                    onChange={e => setUnitForm({ ...unitForm, bookingStyle: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="instant">Instant Booking</option>
                    <option value="manual">Manual Approval</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold">Main Photo Path or URL</label>
                <input
                  type="text"
                  value={unitForm.imageUrl}
                  onChange={e => setUnitForm({ ...unitForm, imageUrl: e.target.value })}
                  placeholder={LIVING_ROOM_IMAGE}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold">Amenities (comma-separated)</label>
                <input
                  type="text"
                  value={unitForm.amenitiesStr}
                  onChange={e => setUnitForm({ ...unitForm, amenitiesStr: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold">Detailed Description</label>
                <textarea
                  rows={3}
                  value={unitForm.description}
                  onChange={e => setUnitForm({ ...unitForm, description: e.target.value })}
                  placeholder="Describe the space, bedding, layout, and comfort..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unitForm.isActive}
                    onChange={e => setUnitForm({ ...unitForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500"
                  />
                  <span>Active & Available for Public Booking</span>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUnitModalOpen(false)}
                  className="px-4 py-2 text-stone-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg transition-colors shadow-sm"
                >
                  {editingUnitId ? 'Save Changes' : 'Create Apartment / Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Room Add / Edit Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-xl w-full p-6 text-stone-200 my-0 sm:my-8 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-stone-800 mb-6">
              <div>
                <h3 className="font-serif text-xl font-bold text-white flex items-center gap-2">
                  <Bed className="w-5 h-5 text-amber-400" />
                  <span>{editingRoomId ? 'Edit Room Details' : 'Add New Room / Suite'}</span>
                </h3>
                <p className="text-xs text-stone-400">
                  {editingRoomId
                    ? 'Update room photos, weekly or monthly pricing, and guest capacity.'
                    : 'Add an individual room or en-suite chamber to an apartment.'}
                </p>
              </div>
              <button
                onClick={() => setIsRoomModalOpen(false)}
                className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoomSubmit} className="space-y-4">
              <div>
                <label className="block text-stone-300 mb-1 font-semibold text-xs">
                  Parent Apartment Property
                </label>
                <select
                  value={roomParentUnitId}
                  onChange={e => setRoomParentUnitId(e.target.value)}
                  disabled={Boolean(editingRoomId)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
                  required
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.title} ({u.propertyType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold text-xs">
                  Room / Suite Name
                </label>
                <input
                  type="text"
                  value={roomForm.name}
                  onChange={e => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder="e.g. Master Bedroom Suite, Deluxe Chamber 2, Garden Bedroom"
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Bed Type</label>
                  <select
                    value={roomForm.bedType}
                    onChange={e => setRoomForm({ ...roomForm, bedType: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="King Bed">King Bed</option>
                    <option value="Queen Bed">Queen Bed</option>
                    <option value="Double Bed">Double Bed</option>
                    <option value="Two Twin Beds">Two Twin Beds</option>
                    <option value="Single Bed">Single Bed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Max Guests</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={roomForm.maxGuests}
                    onChange={e => setRoomForm({ ...roomForm, maxGuests: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="rounded-xl border border-stone-800 bg-stone-950 p-4 space-y-3">
                <div>
                  <span className="block text-xs font-semibold text-stone-300">Room Rates (USD)</span>
                  <span className="text-[11px] text-stone-500">Room bookings are charged by week or month, never by night.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 mb-1 text-xs font-semibold">Weekly Rate</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={roomForm.weeklyRate}
                      onChange={e => setRoomForm({ ...roomForm, weeklyRate: Number(e.target.value) })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-stone-300 mb-1 text-xs font-semibold">Monthly Rate</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={roomForm.monthlyRate}
                      onChange={e => setRoomForm({ ...roomForm, monthlyRate: Number(e.target.value) })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-stone-300 mb-1 text-xs font-semibold">Charge bookings using</label>
                  <select
                    value={roomForm.preferredPeriod}
                    onChange={e => setRoomForm({ ...roomForm, preferredPeriod: e.target.value as 'week' | 'month' })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="week">Weekly rate (7-night periods)</option>
                    <option value="month">Monthly rate (30-night periods)</option>
                  </select>
                  <p className="text-[11px] text-stone-500 mt-1">The selected rate is charged for each full period or part of a period.</p>
                </div>
              </div>

              {/* Toggles */}
              <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 space-y-2.5">
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider block">
                  Room Features & Amenities
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roomForm.hasPrivateBath}
                      onChange={e => setRoomForm({ ...roomForm, hasPrivateBath: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500"
                    />
                    <span>Private En-Suite Bath</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roomForm.hasAc}
                      onChange={e => setRoomForm({ ...roomForm, hasAc: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500"
                    />
                    <span>Split AC</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roomForm.hasWardrobe}
                      onChange={e => setRoomForm({ ...roomForm, hasWardrobe: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500"
                    />
                    <span>Built-In Wardrobe</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-stone-800 bg-stone-950 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-stone-200 font-semibold text-xs">Room Photos</label>
                    <span className="text-[11px] text-stone-500">Upload up to {MAX_ROOM_IMAGES} photos. The first photo is the cover.</span>
                  </div>
                  <span className="text-[11px] text-stone-500 font-mono">{roomForm.images.length}/{MAX_ROOM_IMAGES}</span>
                </div>
                <input
                  ref={roomFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => roomFileInputRef.current?.click()}
                  disabled={isUploadingRoomImages || roomForm.images.length >= MAX_ROOM_IMAGES}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-700 px-4 py-3 text-xs font-semibold text-amber-300 hover:border-amber-500 hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingRoomImages ? 'Preparing images…' : 'Choose images from device'}
                </button>
                {roomForm.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {roomForm.images.map((image, index) => (
                      <div key={`${index}-${image.slice(0, 32)}`} className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-700 bg-stone-900">
                        <img src={image} alt={`Room photo ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 p-1.5">
                          {index === 0 ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300"><Star className="w-3 h-3 fill-amber-300" /> Cover</span>
                          ) : (
                            <button type="button" onClick={() => handleSetPrimaryImage(index)} className="text-[10px] font-semibold text-white hover:text-amber-300">Make cover</button>
                          )}
                          <button type="button" onClick={() => handleRemoveRoomImage(index)} aria-label={`Remove photo ${index + 1}`} className="rounded p-1 text-stone-200 hover:bg-red-900 hover:text-white">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {roomImageError && <p role="alert" className="text-xs text-red-300">{roomImageError}</p>}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomForm.newImageUrlInput}
                    onChange={e => setRoomForm({ ...roomForm, newImageUrlInput: e.target.value })}
                    placeholder="Or paste an image URL"
                    className="min-w-0 flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <button type="button" onClick={handleAddImageUrl} className="rounded-lg border border-stone-700 px-3 text-xs font-semibold text-stone-200 hover:bg-stone-800">Add URL</button>
                </div>
              </div>

              <div>
                <label className="block text-stone-300 mb-1 font-semibold text-xs">
                  Room Description & Guest Notes
                </label>
                <textarea
                  rows={2}
                  value={roomForm.description}
                  onChange={e => setRoomForm({ ...roomForm, description: e.target.value })}
                  placeholder="En-suite bedroom with private luxury bathroom, split air conditioning, wardrobe, and Starlink Wi-Fi."
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-stone-300 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={roomForm.isActive}
                    onChange={e => setRoomForm({ ...roomForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500"
                  />
                  <span>Active & Available for Booking</span>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRoomModalOpen(false)}
                  className="px-4 py-2 text-xs text-stone-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs transition-colors shadow-sm"
                >
                  {editingRoomId ? 'Save Room Changes' : 'Add Room to Apartment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
