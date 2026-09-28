import type Stripe from "stripe";

/**
 * Lazily-created, process-wide cached Stripe client.
 *
 * `stripe` (the npm package) costs ~25-50ms to `require()` on a cold start
 * (see P2-1 measurements). Because `payments/index.ts` and `payments/admin.ts`
 * used to instantiate their own `new Stripe(...)` at module scope, and both
 * files are transitively `require()`'d by every single Cloud Function
 * instance via `functions/src/index.ts`'s `export * from "./payments"`,
 * *every* function paid that cost even when it never touches Stripe.
 *
 * Loading the SDK here, on first actual use, means only instances that
 * handle a payments-related invocation ever pay for it, and only once per
 * warm instance (the client is memoized below). Keep this the *only* place
 * that constructs a `Stripe` client so callers always share one instance.
 */
let stripePromise: Promise<Stripe> | null = null;

export function getStripe(): Promise<Stripe> {
  if (!stripePromise) {
    stripePromise = import("stripe").then(({ default: StripeCtor }) => {
      return new StripeCtor(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2023-10-16",
      });
    });
  }
  return stripePromise;
}
