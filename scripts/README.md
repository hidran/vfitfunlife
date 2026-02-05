# VFit Demo Data Seeding

This folder contains scripts to populate Firestore with demo data for testing and development.

## Prerequisites

Set up your Firebase environment variables (same as the main app):

```bash
export NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
export NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
export NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
```

Or create a `.env` file in the project root.

## Usage

### Option 1: Using Node.js Script (Recommended)

```bash
# Install dependencies (if not already installed)
npm install firebase

# Run the seeding script
node scripts/seed-demo-data.js

# To clear all collections first
node scripts/seed-demo-data.js --clear
```

### Option 2: Using Firebase CLI

If you have Firebase Admin SDK set up with `GOOGLE_APPLICATION_CREDENTIALS`:

```bash
# Set the path to your service account key
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"

# Run the script
node scripts/seed-demo-data.js
```

## What Gets Seeded

### Providers (15)
- Fitness trainers (Personal Training, Yoga, Pilates, HIIT, CrossFit, etc.)
- Wellness professionals (Massage, Physiotherapy, Osteopathy, Psychology, Nutrition)
- Each with realistic profiles, certifications, services, and pricing

### Customers (20)
- Regular users with profiles, addresses, and preferences
- Mix of VIP and regular members

### Venues (10)
- 6 Fitness gyms/centers
- 4 Wellness/beauty centers
- Each with addresses, amenities, opening hours

### Classes (30)
- Group fitness classes scheduled over next 7 days
- Linked to venues and instructors
- Various levels (Beginner, Intermediate, Advanced)

### Bookings (50)
- Mix of past and future bookings
- Various statuses (completed, confirmed, pending, cancelled)
- Realistic pricing with platform fees

### Reviews (30)
- 4-5 star ratings with comments
- Linked to completed bookings

## Demo Data Highlights

### Sample Providers
- **Marco Rossi** - Personal Trainer (verified, 5+ years experience)
- **Elena Bianchi** - Yoga Instructor (verified, 10 years experience)
- **Luca Ferrari** - HIIT Specialist (verified, 3 years experience)
- **Giulia Romano** - Nutritionist (verified, 7 years experience)

### Sample Venues
- **Carosello Fitness** - Premium gym in Milano Centro
- **Wellness Spa Milano** - Full-service wellness center
- **Urban Core Gym** - Modern fitness facility

### Sample Classes
- HIIT Power (Mon-Fri mornings)
- Pilates Flow (daily)
- Yoga Morning (weekends)
- Functional 360 (evenings)

## Customizing Data

Edit the constants at the top of `seed-demo-data.js`:

```javascript
const FITNESS_SPECIALTIES = ['Personal Training', 'Yoga', ...];
const GYM_NAMES = ['Carosello Fitness', 'Urban Core Gym', ...];
const CLASS_NAMES = ['HIIT Power', 'Pilates Flow', ...];
```

## Resetting Data

To completely reset and start fresh:

```bash
node scripts/seed-demo-data.js --clear
node scripts/seed-demo-data.js
```

## Notes

- The script uses Firestore's `writeBatch` for efficient bulk writes
- Timestamps are generated relative to current date
- Data is randomized but realistic (Italian names, Milano locations, etc.)
- Provider ratings and review counts are auto-generated
- Service pricing ranges from €30 to €120 per session
