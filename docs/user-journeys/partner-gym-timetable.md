# Partner gym timetable and class booking

This is a separate VFit group class flow. Existing provider courses and their enrollments are unchanged.

## Customer

Open a gym from `/fit/gyms`, then use its **Gym timetable** link. Select the location, room, week and day. Published classes show local start/end times, instructor, available places, regular price and the current partner price. **Book class** opens a review with the final price, discounts, payment method and cancellation deadline. Confirmation rechecks capacity, partnership status, price and the reviewed session revision in a Firestore transaction. Staff changes after review require the customer to review the current class details again. Bookings appear in `/bookings` and may be cancelled before the saved deadline.

All registered customers receive the active gym's `memberDiscountPercent`. If the assigned verified instructor has an active, separately managed `partnerStatus`, `partnerInstructorExtraPercent` is added; the total is capped at 100%. A verified provider does not automatically become a partner. The booking stores regular price, discounts and final price in cents. A changed price requires a fresh review.

Payment is direct to the gym in this release. The gym can record full payment; a cancelled paid booking records a refund obligation for staff to confirm. Free classes are immediately marked paid. No Stripe checkout or payout is initiated by this flow.

## Gym staff and administrators

The venue owner, a user in `venueStaff/{uid}` for that gym, or an administrator may open `/gym/manage?id={venueId}`. Staff create locations and rooms, then publish one class or a weekly pattern for up to eight weeks. They can edit one occurrence, change capacity or price, and cancel it with a reason. The backend rejects invalid local times, room overlaps, instructor overlaps and capacity below booked seats. Booked customers receive a notification when a class moves or is cancelled.

An administrator sets `partnerStatus` (`pending`, `active`, `suspended`), discount percentages and `ownerId` on the venue. Active status is required to publish and book. The administrator links verified instructors to the gym and sets each instructor's separate partner status. Existing venues with only the legacy `isPartner` badge need explicit `partnerStatus: active` before their timetable is bookable.

## Storage and access

- `venues/{venueId}/locations/{locationId}/rooms/{roomId}` stores active locations, IANA timezone and rooms.
- `venues/{venueId}/instructors/{instructorId}` stores the gym's approved instructor link.
- `gymSeries/{seriesId}` records the idempotent creation request and generated session IDs.
- `gymSessions/{sessionId}` stores concrete UTC instants, timezone, room, instructor, capacity, occupied seats and EUR price.
- `gymScheduleLocks/{room or instructor and UTC day}` serializes publication and time edits to prevent overlaps.
- `gymBookings/{bookingId}` stores the private customer booking and immutable price snapshot.
- `gymSessionMembers/{sessionId and customer hash}` enforces one active seat per customer and allows a new booking after cancellation while preserving the old booking record.
- `gymNotifications/{id}` is the server-only notification outbox.

Clients can read public published sessions for active partner gyms and their own bookings. Staff can read their gym's drafts and bookings. All timetable, seat, price, payment and refund writes use callable functions. Firestore rules deny client writes to those records.

No automatic conversion of legacy `venues/{id}/courses` display cards is performed; those records have no authoritative per-occurrence capacity or bookings.
