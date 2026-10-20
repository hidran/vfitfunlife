# Partner gym timetable and class booking (superseded)

> **This flow is superseded.** Gym, school and studio classes are now ordinary group courses linked to a venue, with rooms, instructors, partner discounts, a waitlist and a public weekly timetable. Read [group-courses.md](group-courses.md) for the current journeys (owner and staff set-up, venue-linked authoring, price review, waitlist, substitution, timetable).

The separate partner-gym flow (the `/gym/manage` screen and the gym booking cards in My bookings, the `gymSessions` / `gymBookings` collections and the `saveGymSchedule`, `bookGymClass` and related callables) is **being removed** in the last task group of the unified-courses plan ([plan](../superpowers/plans/2026-10-19-unified-courses.md), Group L). Until that removal is deployed the code still exists, but nothing in the unified flow uses it and it should not be used or extended. This page will be deleted with it.

What replaced each part of the old journey:

| Old partner-gym flow | Unified flow |
|---|---|
| Manager builds a gym timetable (`/gym/manage`) | Venue owner or staff create courses for the venue (`/provider/courses?venue=<id>`) |
| Locations and rooms | Same locations and rooms, now managed in the **Locations and rooms** panel (`saveGymSpace`) |
| Gym class booking with a member price (`bookGymClass`) | Course booking with a server-computed price review (`quoteCourse`, `enrollInCourse`) |
| Weekly gym timetable | Public weekly venue timetable, `/fit/gyms/timetable?id=<venue>` |
| Waiting for a place | Lesson waitlist with automatic promotion |
