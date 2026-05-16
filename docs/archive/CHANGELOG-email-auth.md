# Changelog - Email/Password Authentication

## [Unreleased] - Email/Password Authentication

### Added

#### 🔐 Email/Password Login
- New login method selection screen with options for Phone, Email, or Social
- Complete email/password login form with validation
- Password visibility toggle (show/hide) for better UX
- "Remember me" checkbox option
- "Forgot password?" link with dedicated reset flow
- Form validation with user-friendly error messages
- Loading states during authentication

#### 📝 Email/Password Registration
- Registration method selection (Email / Google / Apple / Phone)
- Full email registration form with:
  - Full name input
  - Email address validation
  - Password input (minimum 6 characters)
  - Password confirmation matching
  - Date of birth (optional)
  - Section preference selection (VFit/VFun/VLife)
  - Terms & Privacy acceptance
- Real-time password visibility toggle
- Client-side form validation
- Error handling with specific Firebase error messages

#### 🔄 Password Reset Flow
- Dedicated forgot password page (`/auth/forgot-password`)
- Email input for password reset link
- Success confirmation screen after email sent
- Resend option for reset email
- Back navigation to login page
- Error handling for invalid/non-existent emails

#### 🛡️ Firebase Auth Integration
New Firebase auth functions:
- `registerWithEmail()` - Create account with email/password
- `signInWithEmail()` - Authenticate with email/password
- `resetPassword()` - Send password reset email
- `sendEmailVerification()` - Verify email address
- `changePassword()` - Update password (with reauthentication)
- `isEmailVerified()` - Check verification status
- `isEmailProvider()` - Check auth provider type

#### 🎯 Auth Store Enhancements
- `loginWithEmail()` action with comprehensive error handling
- `registerWithEmail()` action with automatic profile creation
- `resetPassword()` action for password recovery
- User-friendly error message mapping for Firebase error codes
- Loading state management during auth operations

### Changed

#### 📱 Login Page Redesign
- **Before**: Phone-only with social login options
- **After**: Method selection screen with three paths:
  1. **Phone**: Existing SMS-based authentication
  2. **Email**: New email/password authentication
  3. **Social**: Google/Apple sign-in (unchanged)

#### 🎨 Registration Page Updates
- **Before**: Only for completing social auth profiles
- **After**: Supports both:
  1. **Email registration**: Create new account with email/password
  2. **Social registration**: Complete profile after Google/Apple sign-in

### Technical Details

#### Error Handling
Mapped Firebase error codes to user-friendly messages:

| Error Code | User Message |
|------------|-------------|
| `auth/user-not-found` | "No account found with this email" |
| `auth/wrong-password` | "Incorrect password" |
| `auth/invalid-email` | "Invalid email address" |
| `auth/email-already-in-use` | "An account with this email already exists" |
| `auth/weak-password` | "Password is too weak. Use at least 6 characters" |
| `auth/user-disabled` | "This account has been disabled" |
| `auth/too-many-requests` | "Too many failed attempts. Please try again later" |

#### Security Features
- Password minimum length: 6 characters
- Password confirmation matching
- Form validation before submission
- Secure Firebase Auth integration
- CSRF protection via Firebase

### Testing

#### Unit Tests Added
- `page.email-auth.test.tsx` - Login email auth flow
- `page.email-register.test.tsx` - Registration validation
- `authStore.redirect.test.tsx` - Redirect handling (updated)

#### Test Coverage
- Login method selection
- Email form validation
- Password visibility toggle
- Registration form validation
- Password matching verification
- Error message display
- Navigation between auth screens

### Documentation

#### Updated Files
- `docs/features.md` - Marked auth features as complete
- Added new section 3.4 for Password Reset

### Migration Notes

For existing users:
- Social authentication continues to work unchanged
- Phone authentication continues to work unchanged
- New email authentication is additive only
- No breaking changes to existing auth flows

### Future Enhancements

Potential additions for future releases:
- Email verification requirement before login
- Password strength indicator (weak/medium/strong)
- Password reset via SMS
- Remember me functionality (persistent sessions)
- Account linking (connect email to social account)
