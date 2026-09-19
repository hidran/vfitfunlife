// Main Firebase exports
export * from "./config";
export * from "./auth";
export * from "./firestore";
export * from "./functions";
export * from "./storage";

// Provider exports (explicit to avoid naming conflicts)
export {
  getProviderDashboardStats,
  getProviderBookings,
  getProviderSchedule,
  confirmBooking as confirmProviderBooking,
  declineBooking as declineProviderBooking,
  completeBooking as completeProviderBooking,
  markBookingNoShow as markProviderBookingNoShow,
  cancelBooking as cancelProviderBooking,
  confirmBookingPayment as confirmProviderBookingPayment,
  getProviderEarnings,
  getProviderClients,
  getClientDetails,
  addClientNote,
  requestWithdrawal,
  getProviderNotifications,
  markNotificationAsRead,
  subscribeToProviderBookings,
  subscribeToProviderNotifications,
} from "./provider";
