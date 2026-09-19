import { create } from 'zustand';
import type {
  Booking,
  ProviderSearchResult,
  Service,
  TimeSlot,
  SearchParams,
  BookingData,
  BookingFilters,
} from '@/types/booking';
import {
  searchProviders,
  getProviderAvailability,
  createBooking as createBookingApi,
  getUserBookings,
  getBooking as getBookingApi,
  cancelBooking as cancelBookingApi,
  rescheduleBooking as rescheduleBookingApi,
  applyPromoCode as applyPromoCodeApi,
} from '@/lib/firebookings';

interface BookingState {
  // Search
  searchResults: ProviderSearchResult[];
  searchFilters: SearchParams;
  isSearching: boolean;
  searchError: string | null;

  // Booking flow
  selectedProvider: ProviderSearchResult | null;
  selectedService: Service | null;
  selectedDate: Date | null;
  selectedTime: string | null;
  availability: TimeSlot[];
  isLoadingAvailability: boolean;
  /** Why `availability` is empty when it is not simply a full day. */
  availabilityError: 'signin' | 'failed' | null;

  // Current booking
  currentBooking: Booking | null;
  userBookings: Booking[];
  isLoadingBookings: boolean;
  bookingsError: string | null;

  // Promo code
  appliedPromo: { code: string; discount: number } | null;
  isApplyingPromo: boolean;

  // Actions
  searchProviders: (params: SearchParams) => Promise<void>;
  setSearchFilters: (filters: Partial<SearchParams>) => void;
  clearSearchResults: () => void;

  selectProvider: (provider: ProviderSearchResult | null) => void;
  selectService: (service: Service | null) => void;
  selectDateTime: (date: Date, time: string | null) => Promise<void>;
  fetchAvailability: (providerId: string, serviceId: string, date: Date) => Promise<void>;
  clearSelection: () => void;

  createBooking: (data: BookingData) => Promise<Booking>;
  fetchUserBookings: (userId: string, filters?: BookingFilters) => Promise<void>;
  fetchBooking: (bookingId: string) => Promise<Booking | null>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  rescheduleBooking: (id: string, newDate: Date, newTime: string) => Promise<void>;
  applyPromoCode: (code: string, bookingId?: string) => Promise<void>;
  clearPromoCode: () => void;
  getBooking: (bookingId: string) => Promise<Booking | null>;

  // Local state updates
  updateCurrentBooking: (booking: Booking | null) => void;
  addBookingToList: (booking: Booking) => void;
  updateBookingInList: (booking: Booking) => void;
}

let latestAvailabilityRequest = 0;

export const useBookingStore = create<BookingState>((set, get) => ({
  // Initial state
  searchResults: [],
  searchFilters: {},
  isSearching: false,
  searchError: null,

  selectedProvider: null,
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  availability: [],
  isLoadingAvailability: false,
  availabilityError: null,

  currentBooking: null,
  userBookings: [],
  isLoadingBookings: false,
  bookingsError: null,

  appliedPromo: null,
  isApplyingPromo: false,

  // Search actions
  searchProviders: async (params: SearchParams) => {
    set({ isSearching: true, searchError: null });
    try {
      const results = await searchProviders(params);
      set({ searchResults: results, isSearching: false });
    } catch (error: any) {
      set({
        searchError: error.message || 'Failed to search providers',
        isSearching: false,
      });
    }
  },

  setSearchFilters: (filters: Partial<SearchParams>) => {
    set((state) => ({
      searchFilters: { ...state.searchFilters, ...filters },
    }));
  },

  clearSearchResults: () => {
    set({ searchResults: [], searchFilters: {} });
  },

  // Selection actions
  selectProvider: (provider: ProviderSearchResult | null) => {
    set({
      selectedProvider: provider,
      selectedService: null,
      selectedDate: null,
      selectedTime: null,
      availability: [],
      availabilityError: null,
    });
  },

  selectService: (service: Service | null) => {
    set({
      selectedService: service,
      selectedDate: null,
      selectedTime: null,
      availability: [],
      availabilityError: null,
    });
  },

  selectDateTime: async (date: Date, time: string | null) => {
    set({ selectedDate: date, selectedTime: time });
  },

  fetchAvailability: async (providerId: string, serviceId: string, date: Date) => {
    // Tapping through dates quickly must not let a slow, older answer overwrite a newer one.
    const request = ++latestAvailabilityRequest;
    set({ isLoadingAvailability: true, availabilityError: null });
    try {
      const slots = await getProviderAvailability(providerId, serviceId, date);
      if (request !== latestAvailabilityRequest) return;
      // A chosen time that is no longer offered (just taken, say) is no longer chosen.
      const { selectedTime } = get();
      const stillOffered = !selectedTime || slots.some((s) => s.time === selectedTime);
      set({
        availability: slots,
        isLoadingAvailability: false,
        ...(stillOffered ? {} : { selectedTime: null }),
      });
    } catch (error) {
      if (request !== latestAvailabilityRequest) return;
      const code = (error as { code?: string } | null)?.code;
      set({
        availability: [],
        isLoadingAvailability: false,
        availabilityError: code === 'functions/unauthenticated' ? 'signin' : 'failed',
      });
    }
  },

  clearSelection: () => {
    set({
      selectedProvider: null,
      selectedService: null,
      selectedDate: null,
      selectedTime: null,
      availability: [],
      appliedPromo: null,
    });
  },

  // Booking actions
  createBooking: async (data: BookingData) => {
    const booking = await createBookingApi(data);
    set({ currentBooking: booking });
    // Add to user bookings list
    set((state) => ({
      userBookings: [booking, ...state.userBookings],
    }));
    return booking;
  },

  fetchUserBookings: async (userId: string, filters?: BookingFilters) => {
    set({ isLoadingBookings: true, bookingsError: null });
    try {
      const bookings = await getUserBookings(userId, filters);
      set({ userBookings: bookings, isLoadingBookings: false });
    } catch (error: any) {
      set({
        bookingsError: error.message || 'Failed to fetch bookings',
        isLoadingBookings: false,
      });
    }
  },

  fetchBooking: async (bookingId: string) => {
    try {
      const booking = await getBookingApi(bookingId);
      if (booking) {
        set({ currentBooking: booking });
      }
      return booking;
    } catch (error) {
      return null;
    }
  },

  cancelBooking: async (id: string, reason?: string) => {
    await cancelBookingApi(id, reason);
    
    // Update local state
    set((state) => {
      const updatedBookings = state.userBookings.map((b) =>
        b.id === id
          ? { ...b, status: 'cancelled_by_client' as const, cancellationReason: reason }
          : b
      );
      const updatedCurrent =
        state.currentBooking?.id === id
          ? { ...state.currentBooking, status: 'cancelled_by_client' as const, cancellationReason: reason }
          : state.currentBooking;
      
      return {
        userBookings: updatedBookings,
        currentBooking: updatedCurrent,
      };
    });
  },

  rescheduleBooking: async (id: string, newDate: Date, newTime: string) => {
    await rescheduleBookingApi(id, newDate, newTime);
    
    // Update local state
    set((state) => {
      const updatedBookings = state.userBookings.map((b) =>
        b.id === id
          ? {
              ...b,
              scheduledAt: { toDate: () => newDate } as any,
            }
          : b
      );
      
      return { userBookings: updatedBookings };
    });
  },

  applyPromoCode: async (code: string, bookingId?: string) => {
    set({ isApplyingPromo: true });
    try {
      const discount = await applyPromoCodeApi(code, bookingId || 'temp');
      set({
        appliedPromo: {
          code: discount.code,
          discount: discount.amount,
        },
        isApplyingPromo: false,
      });
    } catch (error: any) {
      set({ isApplyingPromo: false });
      throw error;
    }
  },

  clearPromoCode: () => {
    set({ appliedPromo: null });
  },

  getBooking: async (bookingId: string) => {
    try {
      const booking = await getBookingApi(bookingId);
      if (booking) {
        set({ currentBooking: booking });
      }
      return booking;
    } catch (error) {
      return null;
    }
  },

  // Local state updates
  updateCurrentBooking: (booking: Booking | null) => {
    set({ currentBooking: booking });
  },

  addBookingToList: (booking: Booking) => {
    set((state) => ({
      userBookings: [booking, ...state.userBookings],
    }));
  },

  updateBookingInList: (booking: Booking) => {
    set((state) => ({
      userBookings: state.userBookings.map((b) =>
        b.id === booking.id ? booking : b
      ),
    }));
  },
}));
