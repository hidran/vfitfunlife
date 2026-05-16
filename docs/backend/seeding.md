# Demo Data Seeding (Firebase Functions)

## Overview

Three HTTP-triggered Firebase Functions seed and manage demo data for testing and development.

**Related docs:**
- [`functions/docs/SEEDING.md`](../../functions/docs/SEEDING.md) — code-adjacent endpoint reference with response JSON examples
- [`scripts/README.md`](../../scripts/README.md) — alternative local Node.js seed scripts (run from a dev machine, useful with the Firebase emulator)
- [`scripts/DEMO_DATA.md`](../../scripts/DEMO_DATA.md) — reference of what the local scripts generate

## Functions Created

### 1. `seedAllData` - Full Demo Data Seeding
**Region:** `europe-west1`  
**Timeout:** 5 minutes  
**Access:** Admin/Superadmin only

Seeds comprehensive demo data into all collections:
- **Providers** (default: 10) - Fitness & wellness professionals
- **Customers** (default: 15) - Regular & VIP users
- **Venues** (default: 8) - Gyms & wellness centers
- **Classes** (default: 20) - Group fitness classes
- **Bookings** (default: 30) - Past & future bookings
- **Reviews** (default: 20) - Customer reviews

### 2. `seedQuickData` - Quick Minimal Seeding
**Region:** `europe-west1`  
**Timeout:** 2 minutes  
**Access:** Admin/Superadmin only

Seeds minimal data for quick testing:
- 3 Providers
- 2 Customers
- 3 Venues
- 5 Classes
- 5 Bookings
- 3 Reviews

### 3. `clearAllData` - Clear All Collections
**Region:** `europe-west1`  
**Timeout:** 5 minutes  
**Access:** Superadmin only

**⚠️ WARNING:** Deletes ALL documents from:
- users
- venues
- classes
- bookings
- reviews
- providers
- clients
- earnings

## How to Use

### From Admin Panel

Navigate to **Admin → Settings → Demo Data Management**

Three action cards are available:
1. **Quick Seed** - Minimal data for quick testing
2. **Full Seed** - Comprehensive demo dataset
3. **Clear All** - Remove all demo data (superadmin only)

### From API/Scripts

```bash
# Get Firebase ID token
ID_TOKEN=$(firebase auth:token)

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

### From Frontend (TypeScript)

```typescript
const seedDemoData = async () => {
  const idToken = await auth.currentUser?.getIdToken();
  
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
  console.log('Seeded:', result.summary.totalRecords, 'records');
};
```

## Deployment

To deploy the new functions:

```bash
cd functions
firebase deploy --only functions:seedAllData,functions:seedQuickData,functions:clearAllData
```

Or deploy all functions:

```bash
cd functions
firebase deploy --only functions
```

## Data Examples

### Sample Providers
| Name | Specialty | Experience | Rating | Verified |
|------|-----------|------------|--------|----------|
| Marco Rossi | Personal Training | 8 years | 4.8 ⭐ | ✅ |
| Elena Bianchi | Yoga | 10 years | 4.9 ⭐ | ✅ |
| Giulia Romano | Nutrition | 7 years | 4.7 ⭐ | ✅ |

### Sample Venues
- **Carosello Fitness** - Milano Centro (4.8 ⭐)
- **Urban Core Gym** - Porta Nuova (4.6 ⭐)
- **Wellness Spa Milano** - Brera (4.9 ⭐)

### Services & Pricing
- Sessione Individuale: €50-€120
- Pacchetto 5 Sessioni: €200-€500
- Consulenza Online: €30-€60

## Files Created/Modified

### Firebase Functions
- `functions/src/seed/seedData.ts` - Main seeding logic
- `functions/src/index.ts` - Export seed functions
- `functions/docs/SEEDING.md` - Function documentation

### Frontend Components
- `src/components/admin/SeedDataPanel.tsx` - Admin UI for seeding
- `src/components/admin/index.ts` - Export SeedDataPanel
- `src/app/admin/settings/page.tsx` - Add SeedDataPanel to settings

### Scripts (Optional Local Seeding)
- `scripts/seed-demo-data.js` - Full Node.js seeding script
- `scripts/seed-quick.js` - Quick minimal seeding script
- `scripts/README.md` - Script documentation
- `scripts/DEMO_DATA.md` - Data reference

## Security

- All endpoints require Firebase Authentication
- Admin endpoints require `role === "admin"` or `"superadmin"`
- Clear endpoint requires `role === "superadmin"`
- CORS enabled for frontend access
- Functions run in `europe-west1` region

## Troubleshooting

### 401 Unauthorized
- User must be logged in
- Token may have expired
- User must have admin/superadmin role

### 403 Forbidden
- User is authenticated but lacks required role
- Check user document has `role: "admin"` or `"superadmin"`

### Timeout
- Large seeding operations may timeout
- Reduce counts or retry with smaller batches

### Partial Success
- Some collections may fail due to dependencies
- Check the `details` array in response
- Retry seeding if needed
