# Firebase Functions Demo Data Seeding

This document describes the HTTP endpoints for seeding demo data into Firestore.

## Endpoints

### 1. Seed All Demo Data
```
POST https://europe-west1-<project-id>.cloudfunctions.net/seedAllData
```

Seeds comprehensive demo data into all collections.

**Headers:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Body (optional - uses defaults if not provided):**
```json
{
  "providers": 10,    // Number of providers to create
  "customers": 15,    // Number of customers to create
  "venues": 8,        // Number of venues to create
  "classes": 20,      // Number of classes to create
  "bookings": 30,     // Number of bookings to create
  "reviews": 20       // Number of reviews to create
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalCollections": 6,
    "successful": 6,
    "failed": 0,
    "totalRecords": 103
  },
  "details": [
    { "success": true, "collection": "providers", "count": 10 },
    { "success": true, "collection": "customers", "count": 15 },
    ...
  ],
  "seededBy": "user_uid",
  "timestamp": "2026-01-31T10:00:00Z"
}
```

**Required Role:** Admin or Superadmin

---

### 2. Seed Quick Minimal Data
```
POST https://europe-west1-<project-id>.cloudfunctions.net/seedQuickData
```

Seeds minimal data for quick testing (3 providers, 2 customers, etc.)

**Headers:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Body:** None required

**Response:**
```json
{
  "success": true,
  "message": "Quick seed completed - 3 providers, 2 customers, 3 venues, 5 classes, 5 bookings, 3 reviews",
  "details": [...],
  "seededBy": "user_uid",
  "timestamp": "2026-01-31T10:00:00Z"
}
```

**Required Role:** Admin or Superadmin

---

### 3. Clear All Demo Data
```
POST https://europe-west1-<project-id>.cloudfunctions.net/clearAllData
```

**⚠️ WARNING:** Deletes ALL documents from the following collections:
- users
- venues
- classes
- bookings
- reviews
- providers
- clients
- earnings

**Headers:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Body:** None required

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalCollections": 8,
    "successful": 8,
    "failed": 0,
    "totalDeleted": 250
  },
  "details": [...],
  "clearedBy": "user_uid",
  "timestamp": "2026-01-31T10:00:00Z"
}
```

**Required Role:** Superadmin only

---

## How to Call from Frontend

### Using fetch API

```typescript
// Get Firebase ID token
const idToken = await auth.currentUser?.getIdToken();

// Seed quick data
const response = await fetch(
  'https://europe-west1-YOUR-PROJECT.cloudfunctions.net/seedQuickData',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  }
);

const result = await response.json();
console.log(result);
```

### Using the Admin UI

Add a button in your admin panel:

```tsx
function SeedDataButton() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const seedData = async () => {
    setLoading(true);
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch(
        'https://europe-west1-YOUR-PROJECT.cloudfunctions.net/seedQuickData',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();
      alert(`Seeded ${result.summary.totalRecords} records!`);
    } catch (error) {
      alert('Error seeding data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={seedData} disabled={loading}>
      {loading ? 'Seeding...' : 'Seed Demo Data'}
    </button>
  );
}
```

---

## How to Call from cURL

```bash
# Get ID token first (from Firebase Auth or use Firebase CLI)
ID_TOKEN="your-firebase-id-token"

# Seed quick data
curl -X POST \
  https://europe-west1-YOUR-PROJECT.cloudfunctions.net/seedQuickData \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"

# Seed all data with custom counts
curl -X POST \
  https://europe-west1-YOUR-PROJECT.cloudfunctions.net/seedAllData \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providers": 20,
    "customers": 50,
    "venues": 10,
    "classes": 30,
    "bookings": 100,
    "reviews": 40
  }'

# Clear all data (superadmin only)
curl -X POST \
  https://europe-west1-YOUR-PROJECT.cloudfunctions.net/clearAllData \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Data Generated

### Providers (10-20 created)
- Mix of fitness trainers and wellness professionals
- Specialties: Personal Training, Yoga, Pilates, HIIT, CrossFit, Nutrition, Massage, etc.
- Each has 1-3 services with pricing (€30-€120)
- Some verified, some pending
- Realistic ratings (3.5-5.0 stars)

### Customers (15-50 created)
- Regular and VIP members
- Points balance (0-1000)
- Addresses in Milano area
- Mix of email/phone verified

### Venues (8-10 created)
- Fitness gyms and wellness centers
- Locations in Milano neighborhoods
- Ratings and amenities
- Opening hours

### Classes (20-30 created)
- Scheduled over next 7 days
- Various levels (Beginner, Intermediate, Advanced)
- Linked to venues and instructors
- Max capacity and current bookings

### Bookings (30-100 created)
- Mix of past and future dates
- Status: completed (60%), confirmed (25%), pending (10%), cancelled (5%)
- Realistic pricing with 5% platform fee
- Notes and cancellation reasons

### Reviews (20-40 created)
- Linked to completed bookings
- 4-5 star ratings
- Realistic Italian comments

---

## Security

- All endpoints require Firebase Authentication
- Admin endpoints require `role === "admin"` or `"superadmin"`
- Clear endpoint requires `role === "superadmin"`
- CORS enabled for frontend access
- Functions run in `europe-west1` region
- Max 1 concurrent instance per function
- 5 minute timeout for seedAll/clearAll, 2 minutes for seedQuick

---

## Troubleshooting

### 401 Unauthorized
- Ensure user is logged in
- Token may have expired - refresh it
- User must have admin/superadmin role

### 403 Forbidden
- User is authenticated but lacks required role
- Check user document in Firestore has `role: "admin"` or `"superadmin"`

### Timeout
- Large seeding operations may timeout
- Reduce counts or seed collections separately
- Retry with smaller batches

### Partial Success
- Some collections may fail due to dependencies
- Check the `details` array in response
- Retry seeding if needed (won't duplicate due to unique IDs)
