# VFit Architecture

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16, React 19, TypeScript | Web application framework |
| Styling | Tailwind CSS, shadcn/ui | Component styling and UI library |
| State Management | Zustand | Global state management |
| Mobile | Capacitor | Native iOS/Android apps |
| Backend | Firebase | Serverless backend platform |
| Maps | Google Maps API | Location services and mapping |

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web App    │  │   iOS App    │  │ Android App  │      │
│  │  (Next.js)   │  │ (Capacitor)  │  │ (Capacitor)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    FIREBASE PLATFORM                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Auth        │  │  Firestore   │  │   Storage    │      │
│  │  (OAuth,     │  │  (NoSQL DB)  │  │   (Files)    │      │
│  │   Phone OTP) │  │              │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│  ┌──────▼─────────────────▼─────────────────▼──────┐      │
│  │              Cloud Functions v2                  │      │
│  │  • Auth handlers    • Booking logic              │      │
│  │  • Payments (Stripe) • Notifications             │      │
│  └────────────────────────┬─────────────────────────┘      │
│                           │                                 │
│  ┌────────────────────────▼─────────────────────────┐      │
│  │           Scheduled Functions                     │      │
│  │  • Reminders  • Analytics  • Cleanup             │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
┌─────────▼────────┐ ┌──────▼──────┐ ┌───────▼───────┐
│   Stripe API     │ │  Google     │ │  Firebase     │
│   (Payments)     │ │  Maps API   │ │  Analytics    │
└──────────────────┘ └─────────────┘ └───────────────┘
```

## Database Schema

### Collections Overview

```
/users/{userId}
  /addresses/{addressId}
  /notifications/{notificationId}
  /pointsTransactions/{transactionId}

/venues/{venueId}
  /services/{serviceId}
  /reviews/{reviewId}

/providers/{providerId}
  /availability/{dateId}
  /reviews/{reviewId}

/userTypes/{userTypeId}

/bookings/{bookingId}

/events/{eventId}
  /registrations/{registrationId}

/challenges/{challengeId}
```

### Users Collection

```typescript
interface User {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  
  // Role-based access
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  userType?: string;          // Provider category (e.g., 'personal_trainer')
  
  // Provider specific
  isVerified?: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  certifications?: string[];  // URLs to certification documents
  
  // VIP/Customer
  isVip: boolean;
  vipExpiresAt?: Timestamp;
  pointsBalance: number;
  walletBalance: number;
  
  // Preferences
  preferredLanguage: 'it' | 'en';
  notificationsEnabled: boolean;
  
  // Referral
  referralCode: string;
  referredBy?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### UserTypes Collection (Provider Categories)

```typescript
interface UserType {
  id: string;
  name: string;           // Display name (e.g., "Personal Trainer")
  category: 'fitness' | 'wellness' | 'beauty' | 'mental_health' | 'education';
  slug: string;           // URL-friendly identifier
  description?: string;
  icon?: string;          // Icon name or emoji
  requirements?: string[]; // Required certifications
  isActive: boolean;
  displayOrder: number;
  
  // Associated services
  defaultServices?: {
    name: string;
    durationMinutes: number;
    basePrice: number;
  }[];
  
  createdAt: Timestamp;
}
```

### Providers Collection

```typescript
interface Provider {
  id: string;
  userId: string;         // Reference to users collection
  
  // Basic Info
  fullName: string;
  avatarUrl?: string;
  coverImage?: string;
  bio: string;
  shortBio: string;
  
  // Professional
  userType: string;       // Reference to userTypes
  specialties: string[];
  certifications: string[];
  experienceYears: number;
  languages: string[];
  
  // Availability
  workingHours: {
    day: number;          // 0-6 (Sunday-Saturday)
    start: string;        // "09:00"
    end: string;          // "18:00"
    isAvailable: boolean;
  }[];
  
  // Services offered
  services: {
    serviceId: string;
    name: string;
    price: number;
    durationMinutes: number;
    isActive: boolean;
  }[];
  
  // Location (for home services)
  homeServiceAvailable: boolean;
  homeServiceRadiusKm: number;
  homeServiceFee: number;
  serviceArea?: {
    center: GeoPoint;
    geohash: string;
  };
  
  // Ratings
  ratingAvg: number;
  reviewCount: number;
  completedBookings: number;
  
  // Status
  isVerified: boolean;
  isActive: boolean;
  acceptingNewClients: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Venues Collection

```typescript
interface Venue {
  id: string;
  name: string;
  type: 'gym' | 'wellness_center' | 'beauty_salon' | 'event_space';
  section: 'fit' | 'fun' | 'life';
  
  // Contact
  phone: string;
  email: string;
  website?: string;
  
  // Location
  address: string;
  city: string;
  location: GeoPoint;
  geohash: string;
  
  // Details
  description: string;
  amenities: string[];
  openingHours: Record<string, { open: string; close: string; isClosed: boolean }>;
  
  // Media
  coverImage: string;
  images: string[];
  
  // Status
  isPartner: boolean;
  isFeatured: boolean;
  isActive: boolean;
  
  ratingAvg: number;
  reviewCount: number;
  
  createdAt: Timestamp;
}
```

### Bookings Collection

```typescript
interface Booking {
  id: string;
  
  // References
  customerId: string;     // User who made the booking
  providerId?: string;    // Provider (for direct bookings)
  venueId?: string;       // Venue (for in-venue bookings)
  serviceId: string;
  
  // Denormalized data
  customerName: string;
  customerPhone: string;
  providerName?: string;
  venueName?: string;
  serviceName: string;
  
  // Booking details
  bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
  serviceAddress?: {
    street: string;
    city: string;
    location: GeoPoint;
  };
  
  // Schedule
  scheduledAt: Timestamp;
  scheduledEndAt: Timestamp;
  durationMinutes: number;
  
  // Status lifecycle
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  
  // Pricing
  originalPrice: number;
  finalPrice: number;
  depositAmount: number;
  depositPaid: boolean;
  
  // Payment
  paymentStatus: 'pending' | 'deposit_paid' | 'paid' | 'refunded';
  stripePaymentIntentId?: string;
  
  // Metadata
  customerNotes?: string;
  providerNotes?: string;
  cancellationReason?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Security

### Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function hasRole(role) {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
    
    function isAdmin() {
      return hasRole('superadmin') || hasRole('admin');
    }
    
    function isProvider() {
      return hasRole('provider');
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isAdmin();
    }
    
    // Provider profiles - public read, restricted write
    match /providers/{providerId} {
      allow read: if true;  // Public profiles
      allow create: if isAdmin() || 
        (isProvider() && request.auth.uid == resource.data.userId);
      allow update: if isAdmin() || 
        (isProvider() && request.auth.uid == resource.data.userId);
    }
    
    // User types - admin managed
    match /userTypes/{typeId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Venues - public read, admin write
    match /venues/{venueId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Bookings
    match /bookings/{bookingId} {
      allow read: if isAuthenticated() && (
        resource.data.customerId == request.auth.uid ||
        resource.data.providerId == request.auth.uid ||
        isAdmin()
      );
      allow create: if isAuthenticated();
      allow update: if isAdmin() || 
        resource.data.customerId == request.auth.uid ||
        resource.data.providerId == request.auth.uid;
    }
  }
}
```

### Authentication Methods

| Method | Flow | Use Case |
|--------|------|----------|
| Email/Password | Email + password verification | Standard registration |
| Google OAuth | Popup/Redirect OAuth | Quick signup/login |
| Apple OAuth | Sign in with Apple | iOS users |
| Phone OTP | SMS verification code | Mobile-first users |

### Security Best Practices

1. **Role-based access control** - All data access validated by role
2. **Server-side validation** - Critical operations via Cloud Functions
3. **Input sanitization** - All user inputs validated before processing
4. **Rate limiting** - Firebase handles DDoS protection
5. **Secure file uploads** - Storage rules enforce ownership

## Environment Configuration

```typescript
// Development
const devConfig = {
  projectId: 'vfit-dev',
  useEmulators: true,
  stripeMode: 'test',
};

// Staging
const stagingConfig = {
  projectId: 'vfit-staging',
  useEmulators: false,
  stripeMode: 'test',
};

// Production
const prodConfig = {
  projectId: 'vfit-prod',
  useEmulators: false,
  stripeMode: 'live',
};
```
