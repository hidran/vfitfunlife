# API Integration Guide

## Firebase SDK Setup

### 1. Installation

```bash
npm install firebase
npm install @capacitor/push-notifications
```

### 2. Configuration

Create or verify `/src/lib/firebase/config.ts`:

```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1'); // Adjust region

// Initialize Analytics (only on web)
export const analytics =
  !Capacitor.isNativePlatform() && isSupported().then(yes => yes ? getAnalytics(app) : null);

// Connect to emulators in development
if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { app };
```

---

## Authentication

### Phone Authentication (OTP)

```typescript
import { auth } from '@/lib/firebase/config';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
} from 'firebase/auth';

// 1. Initialize RecaptchaVerifier (web only)
let recaptchaVerifier: RecaptchaVerifier;

if (!Capacitor.isNativePlatform()) {
  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA solved');
    },
  });
}

// 2. Send OTP
export async function sendOTP(phoneNumber: string) {
  try {
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+39${phoneNumber}`;

    const confirmationResult = await signInWithPhoneNumber(
      auth,
      formattedPhone,
      recaptchaVerifier
    );

    // Store verificationId for later
    return {
      verificationId: confirmationResult.verificationId,
      confirmationResult,
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
}

// 3. Verify OTP
export async function verifyOTP(verificationId: string, code: string) {
  try {
    const credential = PhoneAuthProvider.credential(verificationId, code);
    const userCredential = await signInWithCredential(auth, credential);

    return userCredential.user;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
}
```

### Social Authentication

```typescript
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  OAuthProvider,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

// Google Sign-In
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();

  try {
    if (Capacitor.isNativePlatform()) {
      // Use redirect for native apps
      await signInWithRedirect(auth, provider);
    } else {
      // Use popup for web
      const result = await signInWithPopup(auth, provider);
      return result.user;
    }
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
}

// Apple Sign-In
export async function signInWithApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');

  try {
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, provider);
    } else {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    }
  } catch (error) {
    console.error('Apple sign-in error:', error);
    throw error;
  }
}
```

### Auth State Listener

```typescript
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, loading };
}
```

---

## Firestore Operations

### Basic CRUD

```typescript
import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';

// CREATE
export async function createBooking(bookingData: any) {
  const docRef = await addDoc(collection(db, 'bookings'), {
    ...bookingData,
    createdAt: Timestamp.now(),
  });

  return docRef.id;
}

// READ - Single document
export async function getVenue(venueId: string) {
  const docRef = doc(db, 'venues', venueId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Venue not found');
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  };
}

// READ - Query multiple documents
export async function getUserBookings(userId: string) {
  const q = query(
    collection(db, 'bookings'),
    where('userId', '==', userId),
    orderBy('scheduledAt', 'desc'),
    limit(20)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// UPDATE
export async function updateBookingStatus(bookingId: string, status: string) {
  const docRef = doc(db, 'bookings', bookingId);

  await updateDoc(docRef, {
    status,
    updatedAt: Timestamp.now(),
  });
}

// DELETE
export async function deleteAddress(userId: string, addressId: string) {
  const docRef = doc(db, 'users', userId, 'addresses', addressId);
  await deleteDoc(docRef);
}
```

### Real-time Listeners

```typescript
import { onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

// Hook for real-time venue data
export function useVenue(venueId: string) {
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'venues', venueId);

    const unsubscribe = onSnapshot(
      docRef,
      (doc) => {
        if (doc.exists()) {
          setVenue({ id: doc.id, ...doc.data() });
        } else {
          setError(new Error('Venue not found'));
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [venueId]);

  return { venue, loading, error };
}

// Hook for real-time bookings list
export function useUserBookings(userId: string) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', userId),
      orderBy('scheduledAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setBookings(bookingsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { bookings, loading };
}
```

### Geoqueries (Nearby Venues)

```typescript
import { geohashQueryBounds } from 'geofire-common';
import { where, startAt, endAt } from 'firebase/firestore';

export async function getNearbyVenues(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
) {
  const center = [latitude, longitude];
  const radiusInM = radiusKm * 1000;

  // Calculate geohash bounds
  const bounds = geohashQueryBounds(center, radiusInM);
  const promises: Promise<any>[] = [];

  // Query for each geohash range
  for (const b of bounds) {
    const q = query(
      collection(db, 'venues'),
      where('isActive', '==', true),
      orderBy('geohash'),
      startAt(b[0]),
      endAt(b[1])
    );

    promises.push(getDocs(q));
  }

  // Collect results
  const snapshots = await Promise.all(promises);
  const venues: any[] = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const venue = { id: doc.id, ...doc.data() };

      // Calculate actual distance
      const distance = calculateDistance(
        latitude,
        longitude,
        venue.location.latitude,
        venue.location.longitude
      );

      if (distance <= radiusKm) {
        venues.push({ ...venue, distance });
      }
    }
  }

  // Sort by distance
  return venues.sort((a, b) => a.distance - b.distance);
}

// Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

---

## Cloud Functions

### Callable Functions

```typescript
import { functions } from '@/lib/firebase/config';
import { httpsCallable } from 'firebase/functions';

// Type-safe function calls
export const createBooking = httpsCallable<
  {
    venueId: string;
    serviceId: string;
    scheduledAt: string;
    bookingType: 'in_venue' | 'home_service' | 'virtual';
  },
  {
    bookingId: string;
    finalPrice: number;
    depositAmount: number;
  }
>(functions, 'createBooking');

export const cancelBooking = httpsCallable<
  { bookingId: string; reason?: string },
  { success: boolean; refundAmount: number }
>(functions, 'cancelBooking');

export const applyReferralCode = httpsCallable<
  { referralCode: string },
  { success: boolean; pointsEarned: number }
>(functions, 'applyReferralCode');

// Usage example
async function handleBooking() {
  try {
    const result = await createBooking({
      venueId: 'venue123',
      serviceId: 'service456',
      scheduledAt: '2024-02-01T10:00:00Z',
      bookingType: 'in_venue',
    });

    console.log('Booking created:', result.data.bookingId);
    console.log('Final price:', result.data.finalPrice);
  } catch (error: any) {
    if (error.code === 'functions/not-found') {
      console.error('Venue or service not found');
    } else if (error.code === 'functions/unauthenticated') {
      console.error('User not logged in');
    } else {
      console.error('Booking error:', error.message);
    }
  }
}
```

---

## Storage (File Uploads)

```typescript
import { storage } from '@/lib/firebase/config';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// Upload avatar with compression
export async function uploadAvatar(userId: string, file: File) {
  try {
    // Compress image
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 500,
      useWebWorker: true,
    };

    const compressedFile = await imageCompression(file, options);

    // Upload to Storage
    const storageRef = ref(storage, `avatars/${userId}/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedFile);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Upload with progress tracking
export function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (progress: number) => void
) {
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
}

// Delete file
export async function deleteFile(fileUrl: string) {
  const fileRef = ref(storage, fileUrl);
  await deleteObject(fileRef);
}
```

---

## Error Handling

### Comprehensive Error Handler

```typescript
import { FirebaseError } from 'firebase/app';

export function handleFirebaseError(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      // Auth errors
      case 'auth/invalid-phone-number':
        return 'Invalid phone number format';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later';
      case 'auth/invalid-verification-code':
        return 'Invalid OTP code';

      // Firestore errors
      case 'permission-denied':
        return 'You don\'t have permission to access this resource';
      case 'not-found':
        return 'Resource not found';
      case 'already-exists':
        return 'Resource already exists';

      // Functions errors
      case 'functions/unauthenticated':
        return 'Please log in to continue';
      case 'functions/permission-denied':
        return 'You don\'t have permission to perform this action';
      case 'functions/not-found':
        return 'Resource not found';
      case 'functions/invalid-argument':
        return 'Invalid request data';

      default:
        console.error('Firebase error:', error.code, error.message);
        return 'An error occurred. Please try again';
    }
  }

  return 'An unexpected error occurred';
}
```

---

## Offline Support

### Enable Persistence

```typescript
import { enableIndexedDbPersistence } from 'firebase/firestore';

// Enable offline persistence (web only)
if (!Capacitor.isNativePlatform()) {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence enabled in first tab only');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser doesn\'t support persistence');
    }
  });
}
```

### Offline-Aware Queries

```typescript
import { getDocFromCache, getDocFromServer } from 'firebase/firestore';

export async function getVenueOfflineFirst(venueId: string) {
  const docRef = doc(db, 'venues', venueId);

  try {
    // Try cache first
    const cachedDoc = await getDocFromCache(docRef);
    if (cachedDoc.exists()) {
      return { id: cachedDoc.id, ...cachedDoc.data(), fromCache: true };
    }
  } catch (e) {
    console.log('No cached data, fetching from server');
  }

  // Fallback to server
  const serverDoc = await getDocFromServer(docRef);
  if (serverDoc.exists()) {
    return { id: serverDoc.id, ...serverDoc.data(), fromCache: false };
  }

  throw new Error('Venue not found');
}
```

---

## Testing with Emulators

### Start Emulators

```bash
firebase emulators:start
```

### Seed Test Data

```typescript
// scripts/seed-emulator.ts
import { db } from '../src/lib/firebase/config';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

async function seedData() {
  // Add test venues
  await addDoc(collection(db, 'venues'), {
    name: 'Test Gym',
    type: 'gym',
    section: 'fit',
    isActive: true,
    ratingAvg: 4.5,
    createdAt: Timestamp.now(),
  });

  console.log('Emulator data seeded!');
}

seedData();
```
