/**
 * The demo accounts seeded by `scripts/seed-demo-accounts.mjs`.
 *
 * Fixed uids on purpose: specs can address the provider's documents without first looking
 * the account up, and the same identities exist on the emulator, staging and production, so
 * a failure seen here can be reproduced by hand in the browser on staging.
 *
 * Specs that only need *a* verified provider use these rather than registering a new one —
 * registration is covered once, in journey.spec.ts, and repeating it in every file would buy
 * nothing but runtime.
 */
export const DEMO_CUSTOMER = {
  uid: 'demo-customer-vfit',
  email: 'demo.customer@vitfitdemo.dev',
  password: 'VfitDemo!2026',
  fullName: 'Demo Customer',
};

export const DEMO_PROVIDER = {
  uid: 'demo-provider-vfit',
  email: 'demo.provider@vitfitdemo.dev',
  password: 'VfitDemo!2026',
  fullName: 'Demo Provider',
  serviceId: 'demo-service-personal-training',
  serviceName: 'Personal Training Demo',
  servicePrice: 50,
  categoryId: 'personal_training',
};

/** The emulator superadmin from scripts/seed-emulator.mjs. */
export const SUPERADMIN = { email: 'admin@vfit.dev', password: 'test1234', uid: 'test-admin' };

/** A plain admin — the role the back office runs on. */
export const DEMO_ADMIN = {
  uid: 'demo-admin-vfit',
  email: 'demo.admin@vitfitdemo.dev',
  password: 'VfitDemo!2026',
  fullName: 'Demo Admin',
};

/**
 * A booking document shaped the way `createBooking` writes one, for specs that need bookings
 * to already exist (the dashboard counters, for instance) without walking the booking UI.
 */
export function bookingFixture(opts: {
  instructorId: string;
  userId: string;
  scheduledAt: Date;
  status: string;
  finalPrice?: number;
  durationMinutes?: number;
  serviceName?: string;
}) {
  const duration = opts.durationMinutes ?? 60;
  return {
    instructorId: opts.instructorId,
    userId: opts.userId,
    customerId: opts.userId,
    serviceId: DEMO_PROVIDER.serviceId,
    serviceName: opts.serviceName ?? DEMO_PROVIDER.serviceName,
    status: opts.status,
    scheduledAt: opts.scheduledAt,
    scheduledEndAt: new Date(opts.scheduledAt.getTime() + duration * 60_000),
    durationMinutes: duration,
    finalPrice: opts.finalPrice ?? DEMO_PROVIDER.servicePrice,
    totalPrice: opts.finalPrice ?? DEMO_PROVIDER.servicePrice,
    bookingType: 'in_person',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
