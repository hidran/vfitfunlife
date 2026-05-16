# VFit Demo Data Reference

This document describes all the demo data that gets seeded into Firestore by the **local seed scripts** (see [`scripts/README.md`](README.md)). The Cloud Functions seeder ([`docs/backend/seeding.md`](../docs/backend/seeding.md)) generates a similar but separately defined dataset.

## Collections

### 1. Users Collection

#### Providers (15 generated)

| Name | Specialty | Experience | Rating | Verified |
|------|-----------|------------|--------|----------|
| Marco Rossi | Personal Training | 8 years | 4.8 | ✅ |
| Elena Bianchi | Yoga | 10 years | 4.9 | ✅ |
| Luca Ferrari | HIIT | 3 years | 4.5 | ✅ |
| Giulia Romano | Nutrition | 7 years | 4.7 | ✅ |
| Francesco Galli | CrossFit | 5 years | 4.6 | ✅ |
| Sofia Costa | Pilates | 6 years | 4.8 | ✅ |
| Alessandro Fontana | Strength Training | 12 years | 4.9 | ✅ |
| Chiara Conti | Functional Training | 4 years | 4.4 | ❌ |
| Matteo Esposito | Boxe | 9 years | 4.7 | ✅ |
| Anna Ricci | Yoga Therapy | 8 years | 4.8 | ✅ |
| Davide Marino | Fisioterapia | 6 years | 4.6 | ✅ |
| Laura Greco | Massaggio | 4 years | 4.5 | ✅ |
| Andrea Bruno | Mental Coaching | 10 years | 4.9 | ✅ |
| Valentina Moretti | Psicologia | 7 years | 4.7 | ✅ |
| Simone Marchetti | Nutrizione Sportiva | 5 years | 4.6 | ✅ |

Each provider has:
- 1-3 service offerings with pricing (€30-€120/session)
- Weekly availability schedule
- 0-3 certifications
- 0-1 education entries
- Performance metrics (bookings, revenue)

#### Customers (20 generated)

Sample customers:
- **Luca Verdi** - Regular member, 150 points
- **Anna Neri** - VIP member, 500 points
- Plus 18 more with randomized profiles

### 2. Venues Collection (10 generated)

#### Fitness Centers

| Name | Location | Rating | Partner |
|------|----------|--------|---------|
| Carosello Fitness | Milano Centro | 4.8 | ✅ |
| Urban Core Gym | Porta Nuova | 4.6 | ❌ |
| Village Fit Club | Navigli | 4.7 | ✅ |
| Olympic Gym | Garibaldi | 4.5 | ❌ |
| Body Center | Loreto | 4.4 | ✅ |
| Fit Space | Isola | 4.6 | ❌ |

#### Wellness Centers

| Name | Location | Rating | Partner |
|------|----------|--------|---------|
| Wellness Spa Milano | Brera | 4.9 | ✅ |
| Centro Benessere Navigli | Navigli | 4.7 | ❌ |
| Beauty & Wellness Hub | Porta Venezia | 4.8 | ✅ |
| Oasi del Relax | Centro | 4.5 | ❌ |

Each venue includes:
- Full address with coordinates (Milano area)
- Opening hours
- Amenities list
- Contact info

### 3. Classes Collection (30 generated)

Sample classes scheduled over next 7 days:

| Class | Instructor | Time | Capacity | Level |
|-------|------------|------|----------|-------|
| HIIT Power | Marco R. | 07:30 | 15/15 | Intermedio |
| Pilates Flow | Elena B. | 09:00 | 18/20 | Tutti |
| Yoga Morning | Anna R. | 10:00 | 12/15 | Principiante |
| Functional 360 | Francesco G. | 18:00 | 10/12 | Avanzato |
| Boxe Fit | Matteo E. | 19:30 | 8/10 | Intermedio |

### 4. Bookings Collection (50 generated)

Booking distribution:
- **Status**: 60% completed, 25% confirmed, 10% pending, 5% cancelled
- **Time**: 40% past (last 30 days), 60% future (next 30 days)
- **Location**: 50% provider location, 30% client location, 20% virtual

Sample bookings:

| Customer | Provider | Service | Date | Status | Price |
|----------|----------|---------|------|--------|-------|
| Luca Verdi | Marco Rossi | Sessione Individuale | Tomorrow | Confirmed | €73.50 |
| Anna Neri | Elena Bianchi | Lezione Yoga | 5 days ago | Completed | €63.00 |
| Francesco M. | Giulia Romano | Consulenza | Next week | Pending | €84.00 |

### 5. Reviews Collection (30 generated)

Review distribution:
- **5 stars**: 60%
- **4 stars**: 30%
- **3 stars**: 10%

Sample reviews:

> "Esperienza fantastica! Professionale e preparato." ⭐⭐⭐⭐⭐

> "Ottima sessione, ho imparato molto. Consigliatissimo!" ⭐⭐⭐⭐⭐

> "Molto professionale e puntuale. Tornerò sicuramente." ⭐⭐⭐⭐

## Usage Examples

### Quick Test Data (3 providers, 2 customers)

```bash
npm run seed:quick
```

This creates minimal data for quick testing:
- 3 providers (Trainer, Yoga, Nutritionist)
- 2 customers
- 3 venues
- 3 classes
- 3 bookings
- 2 reviews

### Full Demo Data (15+ providers, 20+ customers)

```bash
npm run seed:demo
```

This creates comprehensive demo data for full app testing.

### Clear All Data

```bash
npm run seed:demo:clear
```

This removes all seeded data before re-seeding.

## Testing Scenarios

### Provider Flow
1. Login as provider (use any provider email pattern: `firstname.lastname@domain.com`)
2. View dashboard with stats
3. Check upcoming bookings
4. Update availability
5. View client list

### Customer Flow
1. Login as customer (use emails like `user1@test.com`)
2. Browse providers on home page
3. Book a service
4. View bookings page
5. Leave a review after completed booking

### Admin Flow
1. Access admin panel
2. View dashboard stats
3. Manage users list
4. Verify pending providers
5. View all bookings

## Important Notes

- All demo data uses Italian names and Milano locations
- Passwords are not set (use Firebase Auth for actual authentication)
- Provider services are priced between €30-€120
- Platform fee is 5% of service price
- All dates are relative to current date (some past, some future)
- Images/avatars are null (would need Firebase Storage uploads)
