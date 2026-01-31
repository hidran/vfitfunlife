# VFit Roles and Permissions System

## Overview
This document describes the comprehensive roles and permissions system implemented for the VFit Firebase project.

## User Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `superadmin` | Full system access | Can do everything including manage other admins |
| `admin` | Staff access | Can manage configurations, services, venues, providers, but not user roles |
| `provider` | Service provider | Trainers, stylists, coaches - can manage own profile, view assigned bookings |
| `customer` | Regular user | Can book services, manage own profile, view own bookings |

## File Structure

### TypeScript Types
- **`functions/src/types.ts`** - Contains role, permission, and user type definitions

### Utility Functions
- **`functions/src/utils/roles.ts`** - Role checking and permission validation utilities

### Cloud Functions
- **`functions/src/users/roles.ts`** - Role management functions
- **`functions/src/users/index.ts`** - Updated with role checks
- **`functions/src/bookings/index.ts`** - Updated with permission checks

### Security Rules
- **`firestore.rules`** - Comprehensive security rules for all collections

## API Reference

### Role Management Functions

#### `setUserRole`
Sets a user's role (superadmin only).
```typescript
// Request
{
  userId: string;
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  customPermissions?: string[];
  reason?: string;
}
```

#### `getUserPermissions`
Gets current user's permissions and role info.
```typescript
// Response
{
  userId: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  userType: string | null;
  isProvider: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canAccessAdminPanel: boolean;
}
```

### Provider Management Functions

#### `createProviderProfile`
Creates a new provider profile (admin/superadmin) or submits application (customer).
```typescript
// Request
{
  email: string;
  fullName: string;
  phone: string;
  userType: UserType;
  providerProfile?: {
    bio?: string;
    specialties?: string[];
    yearsExperience?: number;
    certifications?: string[];
    languages?: string[];
    hourlyRate?: number;
  };
  sendWelcomeEmail?: boolean;
}
```

#### `updateProviderProfile`
Allows providers to update their own profile.

#### `verifyProvider`
Verifies or unverifies a provider (admin/superadmin only).
```typescript
// Request
{
  providerId: string;
  verified: boolean;
  notes?: string;
}
```

#### `listProviders`
Lists providers. Public can view verified providers, staff can view all.
```typescript
// Request
{
  userType?: UserType;
  isVerified?: boolean;
  limit?: number;
  offset?: number;
}
```

#### `listProviderTypes`
Returns list of available provider types.

### User Management Functions

#### `listUsers`
Lists all users (admin/superadmin only).

#### `setUserActiveStatus`
Activates or deactivates a user account (admin/superadmin only).

### Updated Booking Functions

#### `getBooking`
Gets a single booking. Users can view their own, providers can view assigned bookings, admins can view all.

#### `listBookings`
Lists bookings based on user role:
- Customers: Only their own bookings
- Providers: Their assigned bookings (asProvider=true) or their own customer bookings
- Admins: All bookings

#### `cancelBooking`
Cancel a booking. Users can cancel their own, providers can cancel assigned bookings, admins can cancel any.

#### `updateBookingStatus`
Updates booking status (admin/superadmin only).

## Permissions Reference

| Permission | Description | Default Roles |
|------------|-------------|---------------|
| `users:read` | Read user data | superadmin, admin |
| `users:write` | Write user data | superadmin, admin |
| `users:delete` | Delete users | superadmin |
| `users:manage_roles` | Manage user roles | superadmin |
| `providers:read` | Read provider data | superadmin, admin, provider |
| `providers:write` | Write provider data | superadmin, admin |
| `providers:verify` | Verify providers | superadmin, admin |
| `bookings:read` | Read bookings | superadmin, admin, provider, customer |
| `bookings:write` | Create bookings | superadmin, admin, customer |
| `bookings:cancel` | Cancel bookings | superadmin, admin, provider, customer |
| `bookings:confirm` | Confirm bookings | superadmin, admin |
| `venues:read` | Read venues | All roles |
| `venues:write` | Write venues | superadmin, admin |
| `venues:delete` | Delete venues | superadmin |
| `services:read` | Read services | All roles |
| `services:write` | Write services | superadmin, admin |
| `services:delete` | Delete services | superadmin |
| `config:read` | Read configuration | superadmin, admin |
| `config:write` | Write configuration | superadmin, admin |
| `reports:read` | Read reports | superadmin, admin |
| `content:read` | Read content | All roles |
| `content:write` | Write content | superadmin, admin |
| `promotions:read` | Read promotions | All roles |
| `promotions:write` | Write promotions | superadmin, admin |
| `financial:read` | Read financial data | superadmin, admin |
| `financial:write` | Write financial data | superadmin |

## Firestore Security Rules Summary

### Users Collection
- **Read**: Owner, Admin, or (provider reading another provider)
- **Create**: Superadmin (any role) or self (customer/provider only)
- **Update**: Owner (limited fields), Superadmin (any), Admin (non-superadmin only, no role changes)
- **Delete**: Superadmin only

### Bookings Collection
- **Read**: Owner, assigned provider, or admin
- **Create**: Authenticated users (own bookings only)
- **Update**: Owner (limited), assigned provider (status), or admin
- **Delete**: Admin only

### Providers
- **Read**: Public (verified only), Staff (all)
- **Write**: Admin or the provider themselves

### Provider Applications
- **Read**: Owner (applicant) or admin
- **Create**: Authenticated users
- **Update**: Admin only

## User Data Structure

```typescript
interface User {
  // Core fields
  uid: string;
  email: string;
  phone: string;
  fullName: string;
  
  // Role and permissions
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  userType?: string; // For providers
  permissions: string[];
  
  // Provider profile
  providerProfile?: {
    bio: string;
    specialties: string[];
    certifications: string[];
    yearsExperience: number;
    languages: string[];
    isVerified: boolean;
    rating: number;
    reviewCount: number;
    hourlyRate?: number;
  };
  
  // Status
  isActive: boolean;
  isVerified: boolean;
  isVip: boolean;
  
  // ... other fields
}
```

## Provider Types

Available provider types:
- `trainer`
- `hairstylist`
- `yoga_teacher`
- `psychologist`
- `pronunciation_coach`
- `nutritionist`
- `massage_therapist`
- `personal_trainer`
- `pilates_instructor`
- `dance_instructor`
- `other`

## Audit Logging

The system logs the following actions:
- Role changes (`roleChangeLogs` collection)
- Provider verifications (`verificationLogs` collection)
- User status changes (`userStatusLogs` collection)

## Migration Notes

When migrating existing users:
1. Default role is `customer`
2. Default permissions are calculated based on role
3. Existing providers should be updated with `userType` and `providerProfile`

## Usage Example

```javascript
// Set user as provider (superadmin only)
const setRole = firebase.functions().httpsCallable('setUserRole');
await setRole({
  userId: 'user123',
  role: 'provider',
  reason: 'New trainer hired'
});

// Create provider profile (admin/superadmin)
const createProvider = firebase.functions().httpsCallable('createProviderProfile');
await createProvider({
  email: 'trainer@example.com',
  fullName: 'John Doe',
  phone: '+1234567890',
  userType: 'personal_trainer',
  providerProfile: {
    bio: 'Certified personal trainer with 5 years experience',
    specialties: ['weight loss', 'muscle building'],
    yearsExperience: 5
  }
});

// Get current user permissions
const getPerms = firebase.functions().httpsCallable('getUserPermissions');
const result = await getPerms();
console.log(result.data); // { role: 'customer', permissions: [...], ... }
```
