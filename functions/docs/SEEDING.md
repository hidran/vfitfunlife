# Demo Data Seeding — Endpoint Reference

> Code-adjacent reference for the seed HTTP endpoints. Full guide (UI usage, data examples, troubleshooting) lives at [`docs/backend/seeding.md`](../../docs/backend/seeding.md).

All endpoints are HTTPS-callable, deployed in `europe-west1`. Auth: `Authorization: Bearer <firebase-id-token>`.

## `POST /seedAllData` — admin/superadmin

Seeds all collections. Body (optional, defaults shown):
```json
{
  "providers": 10,
  "customers": 15,
  "venues": 8,
  "classes": 20,
  "bookings": 30,
  "reviews": 20
}
```

Response:
```json
{
  "success": true,
  "summary": { "totalCollections": 6, "successful": 6, "failed": 0, "totalRecords": 103 },
  "details": [
    { "success": true, "collection": "providers", "count": 10 }
  ],
  "seededBy": "user_uid",
  "timestamp": "2026-01-31T10:00:00Z"
}
```

## `POST /seedQuickData` — admin/superadmin

Minimal data for quick testing (3 providers, 2 customers, 3 venues, 5 classes, 5 bookings, 3 reviews). No body required.

## `POST /clearAllData` — superadmin only

**Destructive.** Deletes all documents from: `users`, `venues`, `classes`, `bookings`, `reviews`, `providers`, `clients`, `earnings`.

Response includes `totalDeleted` and per-collection results.

---

For full documentation including:
- Admin Panel UI walkthrough
- Frontend / cURL examples
- Generated data details (providers, customers, venues, classes, bookings, reviews)
- Troubleshooting (401, 403, timeouts, partial success)

See [`docs/backend/seeding.md`](../../docs/backend/seeding.md).
