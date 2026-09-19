import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  serverTimestamp,
  increment,
  writeBatch,
  QueryConstraint,
  DocumentSnapshot,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./config";
import {
  acceptBooking as acceptBookingFn,
  declineBooking as declineBookingFn,
  cancelBookingAsTrainer as cancelBookingAsTrainerFn,
  completeBooking as completeBookingFn,
  confirmBookingPayment as confirmBookingPaymentFn,
} from "./functions";
import type { PaymentConfirmationMethod } from "@/types/firebase";
import { auth } from "./config";
import {
  DashboardStats,
  ScheduleEvent,
  EarningsData,
  EarningsFilters,
  ProviderClient,
  ClientBookingHistory,
  ClientNote,
  BookingFilters,
  ProviderBooking,
  ProviderNotification,
  Transaction,
  WithdrawalRequest,
  PaymentMethod,
} from "@/types/provider";
import { Booking, BookingStatus, User } from "@/types/firebase";

const PROVIDER_COLLECTION = "providers";
const BOOKINGS_COLLECTION = "bookings";
const CLIENTS_COLLECTION = "clients";
const EARNINGS_COLLECTION = "earnings";
const NOTIFICATIONS_COLLECTION = "notifications";
const USERS_COLLECTION = "users";

// Helper to get current provider ID
async function getCurrentProviderId(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not authenticated");
  
  // Get user document to check role
  const userDoc = await getDoc(doc(db, USERS_COLLECTION, currentUser.uid));
  if (!userDoc.exists()) throw new Error("User not found");
  
  const userData = userDoc.data() as User;
  if (userData.role !== "provider") throw new Error("Not authorized as provider");
  
  return currentUser.uid;
}

// Dashboard Stats
export async function getProviderDashboardStats(): Promise<DashboardStats> {
  const providerId = await getCurrentProviderId();
  
  // Get stats from provider document
  const providerRef = doc(db, PROVIDER_COLLECTION, providerId);
  const providerSnap = await getDoc(providerRef);
  
  if (!providerSnap.exists()) {
    // Return default stats if provider document doesn't exist
    return {
      todayAppointments: 0,
      weekBookings: 0,
      monthEarnings: 0,
      newClients: 0,
      completionRate: 0,
      averageRating: 0,
      chartData: [],
    };
  }

  const data = providerSnap.data();
  
  // Get today's bookings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = Timestamp.fromDate(today);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowTimestamp = Timestamp.fromDate(tomorrow);

  const todayBookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    where("scheduledAt", ">=", todayTimestamp),
    where("scheduledAt", "<", tomorrowTimestamp),
    where("status", "in", ["confirmed", "in_progress", "completed"])
  );

  const todayBookingsSnap = await getDocs(todayBookingsQuery);
  const todayAppointments = todayBookingsSnap.size;

  // Get this week's bookings
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekBookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    where("scheduledAt", ">=", Timestamp.fromDate(weekStart)),
    where("scheduledAt", "<", Timestamp.fromDate(weekEnd)),
    where("status", "in", ["pending", "confirmed", "in_progress", "completed"])
  );

  const weekBookingsSnap = await getDocs(weekBookingsQuery);
  const weekBookings = weekBookingsSnap.size;

  // Get this month's earnings
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const monthEarningsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    where("scheduledAt", ">=", Timestamp.fromDate(monthStart)),
    where("scheduledAt", "<=", Timestamp.fromDate(monthEnd)),
    where("status", "==", "completed")
  );

  const monthEarningsSnap = await getDocs(monthEarningsQuery);
  let monthEarnings = 0;
  monthEarningsSnap.forEach(doc => {
    const booking = doc.data();
    monthEarnings += booking.finalPrice || 0;
  });

  // Get new clients this month
  const newClientsQuery = query(
    collection(db, CLIENTS_COLLECTION),
    where("providerId", "==", providerId),
    where("firstVisit", ">=", Timestamp.fromDate(monthStart))
  );

  const newClientsSnap = await getDocs(newClientsQuery);
  const newClients = newClientsSnap.size;

  // Calculate completion rate (last 30 days)
  const last30Days = new Date(today);
  last30Days.setDate(last30Days.getDate() - 30);

  const recentBookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    where("scheduledAt", ">=", Timestamp.fromDate(last30Days)),
    where("status", "in", ["completed", "cancelled", "no_show"])
  );

  const recentBookingsSnap = await getDocs(recentBookingsQuery);
  let completedCount = 0;
  let totalCount = 0;
  
  recentBookingsSnap.forEach(doc => {
    const booking = doc.data();
    totalCount++;
    if (booking.status === "completed") {
      completedCount++;
    }
  });

  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Get average rating
  const averageRating = data.rating || 0;

  // Generate chart data (last 30 days)
  const chartData = generateChartData(recentBookingsSnap);

  return {
    todayAppointments,
    weekBookings,
    monthEarnings,
    newClients,
    completionRate,
    averageRating,
    chartData,
  };
}

function generateChartData(bookingsSnap: any): { date: string; bookings: number; earnings: number }[] {
  const data: Record<string, { bookings: number; earnings: number }> = {};
  
  // Initialize last 30 days with zeros
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    data[dateStr] = { bookings: 0, earnings: 0 };
  }

  bookingsSnap.forEach((doc: any) => {
    const booking = doc.data();
    const date = booking.scheduledAt.toDate().toISOString().split('T')[0];
    if (data[date]) {
      data[date].bookings++;
      if (booking.status === "completed") {
        data[date].earnings += booking.finalPrice || 0;
      }
    }
  });

  return Object.entries(data).map(([date, values]) => ({
    date,
    bookings: values.bookings,
    earnings: values.earnings,
  }));
}

// Get Provider Bookings
export async function getProviderBookings(filters?: BookingFilters): Promise<ProviderBooking[]> {
  const providerId = await getCurrentProviderId();
  
  let constraints: QueryConstraint[] = [where("instructorId", "==", providerId)];
  
  if (filters?.status && filters.status !== 'all') {
    constraints.push(where("status", "==", filters.status));
  }
  
  if (filters?.startDate) {
    constraints.push(where("scheduledAt", ">=", Timestamp.fromDate(filters.startDate)));
  }
  
  if (filters?.endDate) {
    constraints.push(where("scheduledAt", "<=", Timestamp.fromDate(filters.endDate)));
  }
  
  constraints.push(orderBy("scheduledAt", "desc"));

  const bookingsQuery = query(collection(db, BOOKINGS_COLLECTION), ...constraints);
  const snapshot = await getDocs(bookingsQuery);

  const bookings: ProviderBooking[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    bookings.push({
      id: doc.id,
      ...data,
      scheduledAt: data.scheduledAt?.toDate(),
      scheduledEndAt: data.scheduledEndAt?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
      confirmedAt: data.confirmedAt?.toDate(),
      completedAt: data.completedAt?.toDate(),
      cancelledAt: data.cancelledAt?.toDate(),
    } as ProviderBooking);
  });

  // Apply client search filter in memory if provided
  if (filters?.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    return bookings.filter(booking => 
      booking.userName.toLowerCase().includes(query) ||
      booking.serviceName.toLowerCase().includes(query)
    );
  }

  return bookings;
}

// Get Provider Schedule
export async function getProviderSchedule(startDate: Date, endDate: Date): Promise<ScheduleEvent[]> {
  const providerId = await getCurrentProviderId();
  
  // Get bookings in the date range
  const bookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    where("scheduledAt", ">=", Timestamp.fromDate(startDate)),
    where("scheduledAt", "<=", Timestamp.fromDate(endDate))
  );

  const bookingsSnap = await getDocs(bookingsQuery);

  const events: ScheduleEvent[] = [];

  // Convert bookings to schedule events
  bookingsSnap.forEach(doc => {
    const booking = doc.data();
    events.push({
      id: `booking-${doc.id}`,
      title: `${booking.serviceName} - ${booking.userName}`,
      start: booking.scheduledAt.toDate(),
      end: booking.scheduledEndAt.toDate(),
      type: 'booking',
      status: booking.status,
      clientName: booking.userName,
      serviceName: booking.serviceName,
      clientPhotoUrl: booking.clientPhotoUrl,
      bookingId: doc.id,
      location: booking.venueName,
      meetingLink: booking.meetingLink,
    });
  });

  // Get blocked time slots
  const blockedQuery = query(
    collection(db, PROVIDER_COLLECTION, providerId, "blocked_times"),
    where("start", ">=", Timestamp.fromDate(startDate)),
    where("start", "<=", Timestamp.fromDate(endDate))
  );

  const blockedSnap = await getDocs(blockedQuery);

  blockedSnap.forEach(doc => {
    const blocked = doc.data();
    events.push({
      id: `blocked-${doc.id}`,
      title: blocked.title || 'Blocked Time',
      start: blocked.start.toDate(),
      end: blocked.end.toDate(),
      type: 'blocked',
      notes: blocked.notes,
    });
  });

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Trainer booking actions.
 *
 * These used to `updateDoc` the status straight from the browser. firestore.rules now
 * denies that, and the authorization + transition rules live server-side in one place.
 */

// Accept a requested session
export async function confirmBooking(bookingId: string): Promise<void> {
  await acceptBookingFn({ bookingId });
}

// Decline a requested session
export async function declineBooking(bookingId: string, note?: string): Promise<void> {
  await declineBookingFn({ bookingId, note });
}

// Mark a session as done ("Sessione svolta")
export async function completeBooking(bookingId: string): Promise<void> {
  await completeBookingFn({ bookingId });
}

// Record a no-show: deliberately awards no points and does not stamp completedAt
export async function markBookingNoShow(bookingId: string): Promise<void> {
  await completeBookingFn({ bookingId, noShow: true });
}

// Cancel a session the trainer had accepted
export async function cancelBooking(bookingId: string, reason?: string): Promise<void> {
  await cancelBookingAsTrainerFn({ bookingId, reason });
}

// Record an off-platform payment received from the client
export async function confirmBookingPayment(
  bookingId: string,
  method: PaymentConfirmationMethod,
  amount: number
): Promise<void> {
  await confirmBookingPaymentFn({ bookingId, method, amount });
}

// Get Provider Earnings
export async function getProviderEarnings(filters?: EarningsFilters): Promise<EarningsData> {
  const providerId = await getCurrentProviderId();
  
  // Get provider earnings document
  const earningsRef = doc(db, EARNINGS_COLLECTION, providerId);
  const earningsSnap = await getDoc(earningsRef);

  let earningsData: any = {};
  if (earningsSnap.exists()) {
    earningsData = earningsSnap.data();
  }

  // Build query for transactions
  let constraints: QueryConstraint[] = [];
  
  if (filters?.startDate) {
    constraints.push(where("createdAt", ">=", Timestamp.fromDate(filters.startDate)));
  }
  
  if (filters?.endDate) {
    constraints.push(where("createdAt", "<=", Timestamp.fromDate(filters.endDate)));
  }
  
  if (filters?.type) {
    constraints.push(where("type", "==", filters.type));
  }
  
  if (filters?.status) {
    constraints.push(where("status", "==", filters.status));
  }

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(100));

  const transactionsQuery = query(
    collection(db, EARNINGS_COLLECTION, providerId, "transactions"),
    ...constraints
  );

  const transactionsSnap = await getDocs(transactionsQuery);
  const transactions: Transaction[] = [];

  transactionsSnap.forEach(doc => {
    const data = doc.data();
    transactions.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      processedAt: data.processedAt?.toDate(),
    } as Transaction);
  });

  return {
    availableBalance: earningsData.availableBalance || 0,
    pendingAmount: earningsData.pendingAmount || 0,
    monthTotal: earningsData.monthTotal || 0,
    yearTotal: earningsData.yearTotal || 0,
    lifetimeTotal: earningsData.lifetimeTotal || 0,
    transactions,
  };
}

// Get Provider Clients
export async function getProviderClients(): Promise<ProviderClient[]> {
  const providerId = await getCurrentProviderId();
  
  const clientsQuery = query(
    collection(db, CLIENTS_COLLECTION),
    where("providerId", "==", providerId),
    orderBy("lastVisit", "desc")
  );

  const clientsSnap = await getDocs(clientsQuery);
  const clients: ProviderClient[] = [];

  clientsSnap.forEach(doc => {
    const data = doc.data();
    clients.push({
      id: doc.id,
      ...data,
      lastVisit: data.lastVisit?.toDate(),
      firstVisit: data.firstVisit?.toDate(),
    } as ProviderClient);
  });

  return clients;
}

// Get Client Details
//
// When `isAdmin` is true (caller is admin/superadmin), the provider-role
// requirement and the per-client ownership check are skipped, so staff can
// open any client. Booking history is then scoped to the client's own
// providerId rather than the (non-provider) caller's uid.
export async function getClientDetails(
  clientId: string,
  isAdmin = false
): Promise<{
  client: ProviderClient;
  bookingHistory: ClientBookingHistory[];
  notes: ClientNote[];
}> {
  // Admins are not required to hold the provider role.
  const callerId = isAdmin
    ? auth.currentUser?.uid
    : await getCurrentProviderId();
  if (!callerId) {
    throw new Error("Not authenticated");
  }

  // Get client document
  const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
  const clientSnap = await getDoc(clientRef);

  if (!clientSnap.exists()) {
    throw new Error("Client not found");
  }

  const clientData = clientSnap.data();
  if (!isAdmin && clientData.providerId !== callerId) {
    throw new Error("Not authorized to view this client");
  }

  const client: ProviderClient = {
    id: clientSnap.id,
    ...clientData,
    lastVisit: clientData.lastVisit?.toDate(),
    firstVisit: clientData.firstVisit?.toDate(),
  } as ProviderClient;

  // Get notes (computed before the booking query so the early-return below
  // can include them).
  const notesQuery = query(
    collection(db, CLIENTS_COLLECTION, clientId, "notes"),
    orderBy("createdAt", "desc")
  );

  const notesSnap = await getDocs(notesQuery);
  const notes: ClientNote[] = [];

  notesSnap.forEach(doc => {
    const note = doc.data();
    notes.push({
      id: doc.id,
      ...note,
      createdAt: note.createdAt?.toDate(),
      updatedAt: note.updatedAt?.toDate(),
    } as ClientNote);
  });

  // Scope booking history to the owning provider (admins use the client's
  // providerId; owners use their own uid).
  const bookingProviderId = isAdmin ? (clientData.providerId ?? null) : callerId;
  if (!bookingProviderId) {
    // Admin opening a client that has no providerId: cannot scope bookings.
    return { client, bookingHistory: [], notes };
  }

  // Get booking history. Bookings store the provider as `instructorId` (the
  // field both the schema and the /bookings read rule use), so we filter on
  // that. Wrapped defensively: a failure here (e.g. missing index or a denied
  // query) must NOT block loading the client's goals/plans/notes — the meetings
  // list simply comes back empty.
  const bookingHistory: ClientBookingHistory[] = [];
  try {
    const bookingsQuery = query(
      collection(db, BOOKINGS_COLLECTION),
      where("instructorId", "==", bookingProviderId),
      where("userId", "==", client.userId),
      orderBy("scheduledAt", "desc")
    );
    const bookingsSnap = await getDocs(bookingsQuery);
    bookingsSnap.forEach(doc => {
      const booking = doc.data();
      bookingHistory.push({
        booking: { id: doc.id, ...booking } as Booking,
        serviceName: booking.serviceName,
        date: booking.scheduledAt.toDate(),
        status: booking.status,
        amount: booking.finalPrice,
      });
    });
  } catch (err) {
    console.error("[getClientDetails] booking history query failed", err);
  }

  return { client, bookingHistory, notes };
}

// Add Client Note
export async function addClientNote(clientId: string, noteContent: string): Promise<void> {
  const providerId = await getCurrentProviderId();
  
  // Verify client belongs to provider
  const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
  const clientSnap = await getDoc(clientRef);
  
  if (!clientSnap.exists() || clientSnap.data().providerId !== providerId) {
    throw new Error("Not authorized to add notes to this client");
  }

  const notesRef = collection(db, CLIENTS_COLLECTION, clientId, "notes");
  await addDoc(notesRef, {
    content: noteContent,
    createdBy: providerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Request Withdrawal
export async function requestWithdrawal(amount: number): Promise<void> {
  const providerId = await getCurrentProviderId();
  
  // Check available balance
  const earningsRef = doc(db, EARNINGS_COLLECTION, providerId);
  const earningsSnap = await getDoc(earningsRef);
  
  if (!earningsSnap.exists()) {
    throw new Error("No earnings record found");
  }

  const earnings = earningsSnap.data();
  if (earnings.availableBalance < amount) {
    throw new Error("Insufficient balance");
  }

  // Create withdrawal request
  const withdrawalsRef = collection(db, EARNINGS_COLLECTION, providerId, "withdrawals");
  await addDoc(withdrawalsRef, {
    amount,
    status: "pending",
    method: "bank_transfer",
    requestedAt: serverTimestamp(),
  });

  // Deduct from available balance
  await updateDoc(earningsRef, {
    availableBalance: increment(-amount),
    pendingWithdrawal: increment(amount),
  });
}

// Get Provider Notifications
export async function getProviderNotifications(): Promise<ProviderNotification[]> {
  const providerId = await getCurrentProviderId();
  
  const notificationsQuery = query(
    collection(db, PROVIDER_COLLECTION, providerId, NOTIFICATIONS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const notificationsSnap = await getDocs(notificationsQuery);
  const notifications: ProviderNotification[] = [];

  notificationsSnap.forEach(doc => {
    const data = doc.data();
    notifications.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
    } as ProviderNotification);
  });

  return notifications;
}

// Mark Notification as Read
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const providerId = await getCurrentProviderId();
  
  const notificationRef = doc(
    db, 
    PROVIDER_COLLECTION, 
    providerId, 
    NOTIFICATIONS_COLLECTION, 
    notificationId
  );
  
  await updateDoc(notificationRef, {
    isRead: true,
    readAt: serverTimestamp(),
  });
}

// Subscribe to real-time updates
export function subscribeToProviderBookings(
  providerId: string,
  callback: (bookings: ProviderBooking[]) => void
): () => void {
  const bookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where("instructorId", "==", providerId),
    orderBy("scheduledAt", "desc"),
    limit(50)
  );

  return onSnapshot(bookingsQuery, (snapshot) => {
    const bookings: ProviderBooking[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        ...data,
        scheduledAt: data.scheduledAt?.toDate(),
        scheduledEndAt: data.scheduledEndAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as ProviderBooking);
    });
    callback(bookings);
  });
}

export function subscribeToProviderNotifications(
  providerId: string,
  callback: (notifications: ProviderNotification[]) => void
): () => void {
  const notificationsQuery = query(
    collection(db, PROVIDER_COLLECTION, providerId, NOTIFICATIONS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  return onSnapshot(notificationsQuery, (snapshot) => {
    const notifications: ProviderNotification[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
      } as ProviderNotification);
    });
    callback(notifications);
  });
}
