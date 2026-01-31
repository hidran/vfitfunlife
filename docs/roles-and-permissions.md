# Roles & Permissions Guide

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

### Permissions

| Category | Permission | Description |
|----------|------------|-------------|
| **Users** | Create users | Create accounts for any role |
| | Edit users | Modify any user profile |
| | Delete users | Permanently remove accounts |
| | Manage roles | Assign/change user roles |
| | View all profiles | Access complete user data |
| **Platform** | Configure settings | System-wide configurations |
| | Manage billing | View and manage all transactions |
| | View analytics | Access all platform metrics |
| | Manage admins | Create/remove admin accounts |
| **Content** | Manage all services | CRUD operations on all services |
| | Manage venues | Full venue management |
| | Manage user types | Create/edit provider categories |
| | Moderate reviews | Remove inappropriate content |

### Data Access

```typescript
// Superadmin can access:
- All user documents
- All provider profiles (including private info)
- All bookings and transactions
- System configuration
- Analytics and reports
```

### Access Areas

- Admin Dashboard (full access)
- User Management Panel
- System Configuration
- Billing & Analytics
- Content Moderation

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
| **Platform** | Manage services | Create/edit service categories |
| | Manage venues | Add/edit venue information |
| | Manage user types | Create/edit provider types |
| | View bookings | Access all booking records |
| | View reports | Access platform analytics |
| **Content** | Moderate reviews | Flag/remove reviews |
| | Manage promotions | Create/edit promotional codes |

### Limitations

❌ **Cannot:**
- Create or modify superadmin accounts
- Access system-level configuration
- Delete user accounts (only soft-disable)
- View payment credentials (only transactions)

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
| **Bookings** | View own bookings | See all bookings with them |
| | Confirm bookings | Accept pending bookings |
| | Cancel bookings | Cancel with reason |
| | Reschedule | Move bookings to new slots |
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
| Cancel own booking | ✅ | ✅ | ✅ | ✅ |
| **Content** |
| Moderate reviews | ✅ | ✅ | ❌ | ❌ |
| Write reviews | ✅ | ✅ | ❌ | ✅ |
| **Platform** |
| System settings | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | Own only | Own only |

\* Cannot modify roles or delete accounts
\*\* Public profile information only

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
```

### Collection Access Rules

```javascript
// Users - Restricted
match /users/{userId} {
  allow read: if request.auth.uid == userId || isAdmin();
  allow create: if request.auth.uid == userId;
  allow update: if request.auth.uid == userId || isAdmin();
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
```

---

## Best Practices

### For Developers

1. **Always verify server-side**: Client-side checks are not sufficient
2. **Use Cloud Functions for sensitive operations**: Role changes, payments
3. **Log admin actions**: Audit trail for compliance
4. **Principle of least privilege**: Grant minimum required access

### For Admins

1. **Verify providers carefully**: Check certifications before approval
2. **Regular access reviews**: Audit user roles periodically
3. **Document role changes**: Keep record of why roles were changed
4. **Use separate accounts**: Don't use admin accounts for daily use

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
