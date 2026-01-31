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
  updateAvailability,
  confirmBooking as confirmProviderBooking,
  completeBooking as completeProviderBooking,
  cancelBooking as cancelProviderBooking,
  getProviderEarnings,
  getProviderClients,
  getClientDetails,
  addClientNote,
  getProviderServices,
  updateService,
  createService,
  deleteService,
  requestWithdrawal,
  getProviderNotifications,
  markNotificationAsRead,
  subscribeToProviderBookings,
  subscribeToProviderNotifications,
} from "./provider";
