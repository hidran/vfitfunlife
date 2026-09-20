# Roles & Permissions Guide

## Table of Contents
- [Overview](#overview)
- [Superadmin](#superadmin)
- [Admin](#admin)
- [Provider](#provider)
- [Customer](#customer)
- [Permission Matrix](#permission-matrix)
- [User Profile Permissions](#user-profile-permissions)
- [Booking Permissions](#booking-permissions)
- [Admin Permissions](#admin-permissions)
- [Firestore Security Rules](#firestore-security-rules)
- [Best Practices](#best-practices)
- [FAQ](#faq)

---

## Overview

VFit uses a role-based access control (RBAC) system with four main roles. Each role has specific permissions that determine what actions users can perform and what data they can access.

```
┌─────────────────────────────────────────────────────────────┐
│                     ROLE HIERARCHY                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────────┐                                         │
│    │ Superadmin  │  ← Full system access                   │
│    └──────┬──────┘                                         │
│           │                                                 │
│    ┌──────▼──────┐                                         │
│    │    Admin    │  ← Platform management                  │
│    └──────┬──────┘                                         │
│           │                                                 │
│    ┌──────▼──────┐    ┌─────────────┐                     │
│    │   Provider  │    │   Customer  │                     │
│    │  (Business) │    │  (Consumer) │                     │
│    └─────────────┘    └─────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Superadmin

### Description
The highest level of access in the system. Superadmins have unrestricted access to all features, settings, and data.

### Who can be a superadmin (locked)

Only two accounts may ever hold `role: 'superadmin'`: **hidran@gmail.com** and **admin@vfit.com**.
The allowlist lives in `functions/src/lib/superadmins.ts` (`PROTECTED_SUPERADMIN_UIDS`) and is
mirrored — rules cannot import code — in `firestore.rules` (`isAllowedSuperadminUid`). Keep both
lists in sync if the accounts ever change.

A superadmin account is **immutable and undeletable through the app**:

| Attempt | Result |
|---|---|
| Promote any other account to superadmin | Refused (rules + `setUserRole`) |
| Change a superadmin's role or permissions | Refused, including by the other superadmin |
| Suspend / deactivate a superadmin | Refused (`setUserActiveStatus`, rules) |
| Delete a superadmin (single or bulk) | Refused (`adminDeleteUser`, bulk job skips with reason `superadmin`) |
| Overwrite a superadmin via `createProviderProfile` or `decideProviderApplication` | Refused |
| A superadmin editing their own name, language, avatar… | Allowed |

The admin UI hides these controls for a superadmin row and shows
`admin.users.superadminProtected` instead; the server refuses the writes regardless. Changing a
superadmin therefore requires the Firebase console or a deliberate server-side script, never the app.
Coverage: `functions/test/superadmin-rules.test.ts` and `functions/src/lib/superadmins.test.ts`.

### Permissions

| Category | Permission | Description |
|----------|------------|-------------|
| **Users** | Create users | Create accounts for any role |
| | Edit users | Modify any user profile |
| | Delete users | Permanently remove accounts |
| | Manage roles | Assign/change user roles |
| | View all profiles | Access complete user data |
| | Suspend/activate | Enable or disable accounts |
| **Platform** | Configure settings | System-wide configurations |
| | Manage billing | View and manage all transactions |
| | View analytics | Access all platform metrics |
| | Manage admins | Create/remove admin accounts |
| | View system logs | Access audit logs and system events |
| **Content** | Manage all services | CRUD operations on all services |
| | Manage venues | Full venue management |
| | Manage user types | Create/edit provider categories |
| | Moderate reviews | Remove inappropriate content |
| **Bookings** | View all bookings | Access any booking record |
| | Modify bookings | Cancel, reschedule any booking |
| | Process refunds | Issue full or partial refunds |

### Data Access

```typescript
// Superadmin can access:
- All user documents
- All provider profiles (including private info)
- All bookings and transactions
- System configuration
- Analytics and reports
- Audit logs
- System settings
```

### Access Areas

- Admin Dashboard (full access)
- User Management Panel
- System Configuration
- Billing & Analytics
- Content Moderation
- System Logs

---

## Admin

### Description
Platform administrators responsible for day-to-day management. They have broad access but cannot modify system-level settings or manage superadmins.

### Permissions

| Category | Permission | Description |
|----------|------------|-------------|
| **Users** | View users | Browse and search user list |
| | Edit users | Modify customer/provider profiles |
| | Verify providers | Approve/reject provider applications |
| | Suspend users | Temporarily disable accounts |
| **Platform** | Manage services | Create/edit service categories |
| | Manage venues | Add/edit venue information |
| | Manage user types | Create/edit provider types |
| | View bookings | Access all booking records |
| | View reports | Access platform analytics |
| **Content** | Moderate reviews | Flag/remove reviews |
| | Manage promotions | Create/edit promotional codes |
| **Bookings** | View all bookings | Access booking details |
| | Cancel bookings | Cancel with refund processing |
| | Process refunds | Issue refunds (limited amounts) |

### Limitations

❌ **Cannot:**
- Create or modify superadmin accounts
- Access system-level configuration (e.g., commission rates)
- Delete user accounts (only soft-disable/suspend)
- View payment credentials (only transactions)
- Manage role hierarchy
- Access raw system logs

### Data Access

```typescript
// Admin can access:
- All user documents (except admin role management)
- All provider profiles (excluding sensitive financial data)
- All bookings and basic transaction info
- Platform configuration (non-system level)
- Analytics and reports
```

### Access Areas

- Admin Dashboard (restricted areas)
- Provider Verification Panel
- Content Management
- Customer Support Tools

---

## Provider

### Description
Service providers who offer fitness, wellness, beauty, or educational services. Providers can manage their own business profile and bookings.

### Permissions

| Category | Permission | Description |
|----------|------------|-------------|
| **Profile** | Edit own profile | Update bio, photos, services |
| | Manage services | Add/edit offered services |
| | Set availability | Configure working hours |
| | Upload portfolio | Add work samples |
| | Upload certifications | Add professional credentials |
| **Bookings** | View own bookings | See all bookings with them |
| | Confirm bookings | Accept pending bookings |
| | Cancel bookings | Cancel with reason |
| | Reschedule | Move bookings to new slots |
| | Complete bookings | Mark as finished |
| **Customers** | View customer info | Name, contact for their bookings |
| | Contact customers | Message via platform |
| | View history | Past bookings with customer |
| **Analytics** | View own stats | Bookings, ratings, earnings |

### Data Access

```typescript
// Provider can access:
interface ProviderAccess {
  // Own data - Full Read/Write
  ownProfile: 'read' | 'write';
  ownServices: 'read' | 'write';
  ownAvailability: 'read' | 'write';
  ownBookings: 'read' | 'write';
  ownEarnings: 'read';
  ownPortfolio: 'read' | 'write';
  
  // Customer data - Limited Read
  customerBasicInfo: 'read';  // Name, phone for bookings only
  customerBookingHistory: 'read';  // Only with this provider
  
  // Public data - Read only
  publicVenues: 'read';
  publicUserTypes: 'read';
}
```

### Provider Onboarding Flow

```
1. User registers with provider role
         ↓
2. Complete provider profile
         ↓
3. Upload certifications
         ↓
4. [ADMIN] Verify documents
         ↓
5. [ADMIN] Approve/Reject
         ↓
6. Provider sets availability
         ↓
7. Provider goes live ✓
```

### Access Areas

- Provider Dashboard
- Profile Management
- Booking Calendar
- Customer Directory (limited)
- Earnings Reports

---

## Customer

### Description
End users who book services. Customers have access to their own data and can discover and book services from providers.

### Permissions

| Category | Permission | Description |
|----------|------------|-------------|
| **Profile** | Edit own profile | Update personal information |
| | Manage addresses | Add/edit service locations |
| | Upload avatar | Profile photo |
| | Update preferences | Notifications, privacy |
| **Bookings** | Create bookings | Book services |
| | View own bookings | Booking history and details |
| | Cancel own bookings | Cancel with refund rules |
| | Reschedule | Change booking time (if available) |
| **Reviews** | Write reviews | Rate completed bookings |
| | Edit own reviews | Modify within 24 hours |
| | Upload photos | Add images to reviews |
| **Rewards** | View points | Check point balance |
| | Redeem points | Use for discounts |
| | View VIP status | Manage subscription |

### Data Access

```typescript
// Customer can access:
interface CustomerAccess {
  // Own data - Full Read/Write
  ownProfile: 'read' | 'write';
  ownAddresses: 'read' | 'write';
  ownBookings: 'read' | 'write';
  ownPoints: 'read';
  ownReviews: 'read' | 'write';
  
  // Public data - Read only
  providerProfiles: 'read';     // Public information only
  venues: 'read';
  services: 'read';
  userTypes: 'read';
  reviews: 'read';
}
```

### Access Areas

- Customer Dashboard
- Booking History
- Profile Settings
- Rewards/VIP Section
- Service Discovery

---

## Permission Matrix

### Actions by Role

| Action | Superadmin | Admin | Provider | Customer |
|--------|:----------:|:-----:|:--------:|:--------:|
| **User Management** |
| Create users | ✅ | ❌ | ❌ | ❌ |
| Edit any user | ✅ | ✅* | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ | ❌ |
| Manage roles | ✅ | ❌ | ❌ | ❌ |
| Suspend users | ✅ | ✅ | ❌ | ❌ |
| **Provider Management** |
| Verify providers | ✅ | ✅ | ❌ | ❌ |
| Edit any provider | ✅ | ✅ | ❌ | ❌ |
| View provider details | ✅ | ✅ | ✅** | ✅** |
| **Services** |
| Create service types | ✅ | ✅ | ❌ | ❌ |
| Edit service types | ✅ | ✅ | ❌ | ❌ |
| Create own services | ✅ | ✅ | ✅ | ❌ |
| Edit own services | ✅ | ✅ | ✅ | ❌ |
| **Bookings** |
| View all bookings | ✅ | ✅ | ❌ | ❌ |
| View own bookings | ✅ | ✅ | ✅ | ✅ |
| Create bookings | ✅ | ✅ | ✅ | ✅ |
| Cancel any booking | ✅ | ✅ | ❌ | ❌ |
| Cancel own booking | ✅ | ✅ | ✅*** | ✅*** |
| Reschedule bookings | ✅ | ✅ | Own only | Own only |
| **Content** |
| Moderate reviews | ✅ | ✅ | ❌ | ❌ |
| Write reviews | ✅ | ✅ | ❌ | ✅ |
| **Platform** |
| System settings | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | Own only | Own only |
| Process refunds | ✅ | Limited | ❌ | ❌ |

\* Cannot modify roles or delete accounts
\*\* Public profile information only
\*\*\* Subject to cancellation policy

---

## User Profile Permissions

### Permission Matrix

| Action | Customer | Provider | Admin | Superadmin |
|--------|----------|----------|-------|------------|
| **Own Profile** |
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ |
| Change avatar | ✅ | ✅ | ✅ | ✅ |
| Update preferences | ✅ | ✅ | ✅ | ✅ |
| **Other Profiles** |
| View public profiles | ✅ | ✅ | ✅ | ✅ |
| View full profile details | ❌ | ❌ | ✅ | ✅ |
| Edit other profiles | ❌ | ❌ | Limited | ✅ |
| Delete other profiles | ❌ | ❌ | ❌ | ✅ |
| **Provider-Specific** |
| Upload certifications | ❌ | Own only | ❌ | ❌ |
| View own certifications | ❌ | Own only | ✅ | ✅ |
| Verify certifications | ❌ | ❌ | ✅ | ✅ |
| Manage availability | ❌ | Own only | ❌ | ❌ |
| **Privacy Controls** |
| Set profile visibility | ✅ | ✅ | ✅ | ✅ |
| Control contact info visibility | ✅ | ✅ | ✅ | ✅ |

### Permission Descriptions

- **Customer**: Can view public profiles only. Cannot see private information like contact details unless booking is confirmed.
- **Provider**: Same as customer for other profiles. Full control over own provider profile including certifications and availability.
- **Admin**: Can view all profile details for support purposes. Can edit basic information but not sensitive data like passwords.
- **Superadmin**: Full access to all profiles. Can edit, suspend, or delete any account.

---

## Booking Permissions

### Permission Matrix

| Action | Customer | Provider | Admin | Superadmin |
|--------|----------|----------|-------|------------|
| **Create & View** |
| Create booking | ✅ | ❌ | ✅ | ✅ |
| View own bookings | ✅ | Own only | All | All |
| View booking details | Own only | Own bookings | All | All |
| Search all bookings | ❌ | ❌ | ✅ | ✅ |
| **Modify Bookings** |
| Cancel booking | Own only | Own bookings | All | All |
| Reschedule booking | Own only | Own bookings | All | All |
| Modify any booking | ❌ | ❌ | ✅ | ✅ |
| **Booking Actions** |
| Confirm booking | ❌ | Own bookings | ✅ | ✅ |
| Reject booking | ❌ | Own bookings | ✅ | ✅ |
| Mark complete | ❌ | Own bookings | ✅ | ✅ |
| Mark no-show | ❌ | Own bookings | ✅ | ✅ |
| **Financial** |
| Process payment | Own only | ❌ | ✅ | ✅ |
| Process refund | ❌ | ❌ | ✅ | ✅ |
| View payment details | Own only | Own earnings | All | All |

### Cancellation Permissions by Status

| Booking Status | Customer Cancel | Provider Cancel | Admin Cancel |
|----------------|-----------------|-----------------|--------------|
| Pending | ✅ | ✅ | ✅ |
| Confirmed | ✅* | ✅* | ✅ |
| In Progress | ❌ | ❌ | ✅ |
| Completed | ❌ | ❌ | ❌ |
| Cancelled | ❌ | ❌ | ❌ |

\* Subject to cancellation policy time limits

### Refund Permissions

| Refund Type | Customer Request | Provider Issue | Admin Issue | Superadmin Issue |
|-------------|------------------|----------------|-------------|------------------|
| Full refund | ❌ | ❌ | ✅ | ✅ |
| Partial refund | ❌ | ❌ | ✅ | ✅ |
| Policy-based | Automatic | ❌ | ✅ | ✅ |
| Goodwill | ❌ | ❌ | ✅ | ✅ |

---

## Admin Permissions

### Permission Matrix

| Action | Admin | Superadmin |
|--------|-------|------------|
| **Dashboard Access** |
| View dashboard | ✅ | ✅ |
| View all statistics | Limited | ✅ |
| View system health | ❌ | ✅ |
| **User Management** |
| View all users | ✅ | ✅ |
| Edit user profiles | ✅ | ✅ |
| Change user roles | Limited | ✅ |
| Create admin accounts | ❌ | ✅ |
| Delete user accounts | ❌ | ✅ |
| Manage permissions | ❌ | ✅ |
| **Provider Management** |
| View provider queue | ✅ | ✅ |
| Verify providers | ✅ | ✅ |
| Edit provider profiles | ✅ | ✅ |
| Suspend providers | ✅ | ✅ |
| **Booking Management** |
| View all bookings | ✅ | ✅ |
| Cancel any booking | ✅ | ✅ |
| Modify bookings | ✅ | ✅ |
| Process refunds | ✅ (Limited amount) | ✅ (Unlimited) |
| Override policies | ❌ | ✅ |
| **Content Management** |
| Manage user types | ✅ | ✅ |
| Manage venues | ✅ | ✅ |
| Moderate reviews | ✅ | ✅ |
| Manage promotions | ✅ | ✅ |
| **Finance** |
| View transactions | ✅ | ✅ |
| Process payouts | Limited | ✅ |
| View commission reports | ✅ | ✅ |
| Change commission rates | ❌ | ✅ |
| **System** |
| View system logs | ❌ | ✅ |
| Manage settings | Limited | ✅ |
| Deploy updates | ❌ | ✅ |
| Database access | ❌ | ✅ |

### Admin Limitations

Admins **CANNOT**:
- Create or modify other admin/superadmin accounts
- Access system logs and audit trails
- Change platform commission rates or core business rules
- Access raw payment credentials or sensitive financial data
- Delete user accounts (only suspend)
- Modify role hierarchy or permission definitions

---

## Firestore Security Rules

### Role Checking Helper

```javascript
function hasRole(role) {
  return request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
}

function isAdmin() {
  return hasRole('superadmin') || hasRole('admin');
}

function isProvider() {
  return hasRole('provider');
}

function isOwner(userId) {
  return request.auth != null && request.auth.uid == userId;
}
```

### Collection Access Rules

```javascript
// Users - Restricted
match /users/{userId} {
  allow read: if isOwner(userId) || isAdmin();
  allow create: if isOwner(userId);
  allow update: if isOwner(userId) || isAdmin();
  allow delete: if hasRole('superadmin');
}

// Providers - Public read, restricted write
match /providers/{providerId} {
  allow read: if true;  // Public profiles
  allow create: if isAdmin() || 
    (isProvider() && request.auth.uid == resource.data.userId);
  allow update: if isAdmin() || 
    (isProvider() && request.auth.uid == resource.data.userId);
}

// Provider Certifications
match /providers/{providerId}/certifications/{certId} {
  allow read: if isProvider() && isOwner(providerId) || isAdmin();
  allow write: if isProvider() && isOwner(providerId);
}

// User Types - Admin managed
match /userTypes/{typeId} {
  allow read: if true;
  allow write: if isAdmin();
}

// Bookings
match /bookings/{bookingId} {
  allow read: if request.auth != null && (
    resource.data.customerId == request.auth.uid ||
    resource.data.providerId == request.auth.uid ||
    isAdmin()
  );
  allow create: if request.auth != null;
  allow update: if isAdmin() || 
    resource.data.customerId == request.auth.uid ||
    resource.data.providerId == request.auth.uid;
}

// Payments - Restricted
match /payments/{paymentId} {
  allow read: if request.auth != null && (
    resource.data.customerId == request.auth.uid ||
    resource.data.providerId == request.auth.uid ||
    isAdmin()
  );
  allow write: if isAdmin();
}

// Admin Logs - Superadmin only
match /logs/{logId} {
  allow read: if hasRole('superadmin');
  allow write: if isAdmin();
}

// System Settings - Admin only
match /settings/{settingId} {
  allow read: if isAdmin();
  allow write: if hasRole('superadmin');
}
```

---

## Best Practices

### For Developers

1. **Always verify server-side**: Client-side checks are not sufficient
2. **Use Cloud Functions for sensitive operations**: Role changes, payments
3. **Log admin actions**: Audit trail for compliance
4. **Principle of least privilege**: Grant minimum required access
5. **Validate inputs**: Sanitize all user inputs
6. **Check permissions at every layer**: Client, Firestore rules, and Cloud Functions
7. **Use transaction for multi-step operations**: Ensure data consistency

### For Admins

1. **Verify providers carefully**: Check certifications before approval
2. **Regular access reviews**: Audit user roles periodically
3. **Document role changes**: Keep record of why roles were changed
4. **Use separate accounts**: Don't use admin accounts for daily use
5. **Report suspicious activity**: Escalate security concerns
6. **Follow refund policies**: Don't override without good reason
7. **Keep audit records**: Document important decisions

---

## FAQ

**Q: Can a user have multiple roles?**
A: No, each user has a single primary role. Providers who also want to book services need separate customer accounts.

**Q: How do I upgrade a customer to provider?**
A: As admin: 1) Change role to 'provider' 2) Have user complete provider profile 3) Verify and approve.

**Q: Can providers see all my bookings?**
A: No, providers can only see bookings they are involved with.

**Q: What's the difference between admin and superadmin?**
A: Superadmins can manage admins and system settings. Admins manage day-to-day operations.

**Q: Can a suspended user reactivate their account?**
A: Only admins or superadmins can reactivate suspended accounts. Contact support for assistance.

**Q: Who can see my private information?**
A: Only you, platform admins (for support), and providers you book with (limited info) can see your data.

**Q: Can I change my role from provider to customer?**
A: Yes, but you'll lose provider features and any active bookings must be completed or cancelled first.

**Q: How long are admin actions logged?**
A: Admin actions are logged indefinitely for compliance and security purposes.

---

# Developer API Reference

The previous sections are the conceptual guide. The reference below documents the actual code surface: function signatures, permission strings, and data shapes implemented in `functions/`.

## Implementation Files

| Concern | Location |
|---------|----------|
| Role/permission/user types | `functions/src/types.ts` |
| Role checking + permission validation utilities | `functions/src/utils/roles.ts` |
| Role management cloud functions | `functions/src/users/roles.ts` |
| User management cloud functions | `functions/src/users/index.ts` |
| Booking permission checks | `functions/src/bookings/index.ts` |
| Firestore security rules | `firestore.rules` |

## Cloud Function Reference

### Role Management

#### `setUserRole` (superadmin only)
```typescript
{
  userId: string;
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  customPermissions?: string[];
  reason?: string;
}
```

#### `getUserPermissions`
Returns the current user's permissions and role info.
```typescript
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

### Provider Management

#### `createProviderProfile` (admin/superadmin creates; customer submits application)
```typescript
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
Providers update their own profile.

#### `verifyProvider` (admin/superadmin only)
```typescript
{
  providerId: string;
  verified: boolean;
  notes?: string;
}
```

#### `listProviders`
Public sees verified providers; staff sees all.
```typescript
{
  userType?: UserType;
  isVerified?: boolean;
  limit?: number;
  offset?: number;
}
```

#### `listProviderTypes`
Returns the list of available provider types.

### User Management

- `listUsers` (admin/superadmin only) — list all users
- `setUserActiveStatus` (admin/superadmin only) — activate/deactivate accounts

### Booking Functions

- `getBooking` — users see own; providers see assigned; admins see all
- `listBookings` — scoped by role (customer: own; provider: assigned; admin: all)
- `cancelBooking` — users cancel own; providers cancel assigned; admins cancel any
- `updateBookingStatus` — admin/superadmin only

## Permission Strings

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

  // Provider profile (when role === 'provider')
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
}
```

## Provider Types

`trainer`, `hairstylist`, `yoga_teacher`, `psychologist`, `pronunciation_coach`, `nutritionist`, `massage_therapist`, `personal_trainer`, `pilates_instructor`, `dance_instructor`, `other`

## Audit Logging

| Collection | Logs |
|------------|------|
| `roleChangeLogs` | Role assignments and changes |
| `verificationLogs` | Provider verification decisions |
| `userStatusLogs` | User activate/deactivate events |

## Usage Example

```javascript
// Set user as provider (superadmin only)
const setRole = firebase.functions().httpsCallable('setUserRole');
await setRole({
  userId: 'user123',
  role: 'provider',
  reason: 'New trainer hired',
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
    yearsExperience: 5,
  },
});

// Get current user permissions
const getPerms = firebase.functions().httpsCallable('getUserPermissions');
const result = await getPerms();
console.log(result.data); // { role: 'customer', permissions: [...], ... }
```

## Migration Notes

When migrating existing users:
1. Default role is `customer`.
2. Default permissions are calculated based on role.
3. Existing providers must be updated with `userType` and `providerProfile`.
