# Testing Strategy - V Fitness

## Overview

This document outlines the comprehensive testing strategy for the V Fitness application, a Next.js 16+ React app with Firebase backend and Capacitor mobile support.

---

## Current Testing Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit/Component | **Vitest** + React Testing Library | Component rendering, hooks, utilities |
| E2E | **Playwright** | Critical user journeys, cross-browser testing |
| Coverage | **Vitest Coverage** | Track test coverage metrics |
| Mobile | Capacitor + Playwright mobile devices | Mobile-specific features |

### Installed Dependencies

```json
// devDependencies
{
  "@playwright/test": "^1.58.0",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/react": "^16.3.2",
  "@testing-library/user-event": "^14.6.1",
  "@vitejs/plugin-react": "^5.1.2",
  "jsdom": "^27.4.0",
  "vite-tsconfig-paths": "^6.0.5",
  "vitest": "^4.0.18"
}
```

---

## Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.ts',
        'out/',
        '.next/',
      ],
    },
  },
});
```

**Key Features:**
- `globals: true` - Enables global test APIs (describe, it, expect)
- `environment: 'jsdom'` - Browser-like environment for component tests
- `tsconfigPaths` - Resolves path aliases (@/components, etc.)

### Test Setup (`tests/setup.ts`)

```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Firebase
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem(key: string) { return store[key] || null; },
    setItem(key: string, value: string) { store[key] = value.toString(); },
    clear() { store = {}; },
    removeItem(key: string) { delete store[key]; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
```

### Playwright Configuration (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Unit Testing Patterns

### 1. Page Component Tests

**Pattern:** Mock Next.js router, context providers, and external stores.

```typescript
// src/app/(main)/home/page.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HomePage from './page';
import { SectionProvider } from '@/contexts/SectionContext';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('HomePage', () => {
  it('renders the SectionSwitcher', () => {
    render(
      <SectionProvider>
        <HomePage />
      </SectionProvider>
    );
    expect(screen.getByText('FIT')).toBeInTheDocument();
    expect(screen.getByText('FUN')).toBeInTheDocument();
    expect(screen.getByText('LIFE')).toBeInTheDocument();
  });

  it('changes section when a button is clicked', () => {
    render(
      <SectionProvider>
        <HomePage />
      </SectionProvider>
    );

    const funButton = screen.getByText('FUN');
    fireEvent.click(funButton);

    // Check if the content for the 'fun' section is rendered
    expect(screen.getByText('Entertainment & Events')).toBeInTheDocument();
  });
});
```

### 2. Auth Page Tests

**Pattern:** Mock auth store with all required state and actions.

```typescript
// src/app/auth/login/page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from './page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock useAuthStore - provide complete mock implementation
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    firebaseUser: null,
    user: null,
    isLoading: false,
    error: null,
    isOtpSent: false,
    phoneNumber: '',
    initPhoneAuth: vi.fn(),
    sendPhoneOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithApple: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders the registration link', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /Registrati/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/auth/register');
  });
});
```

### 3. UI Component Tests

**Pattern:** Test variants, interactions, and accessibility.

```typescript
// src/components/ui/button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables button when isLoading', () => {
    render(<Button isLoading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Caricamento...')).toBeInTheDocument();
  });

  it('applies variant styles', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-section-gradient');

    rerender(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-section-primary');
  });

  it('renders fullWidth correctly', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });
});
```

### 4. Hook Tests

**Pattern:** Use `renderHook` from testing-library/react.

```typescript
// src/hooks/useAuth.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAuth } from './useAuth';

// Mock the auth store
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => selector({
    firebaseUser: null,
    user: null,
    isLoading: false,
    isInitialized: true,
  })),
}));

describe('useAuth', () => {
  it('returns user state from store', () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isInitialized).toBe(true);
  });
});
```

### 5. Utility Function Tests

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice, calculateDistance, formatDate, cn } from './utils';

describe('formatPrice', () => {
  it('formats price with euro symbol', () => {
    expect(formatPrice(10)).toBe('€10,00');
    expect(formatPrice(1234.56)).toBe('€1.234,56');
  });

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('€0,00');
  });
});

describe('calculateDistance', () => {
  it('calculates distance between Milan and Rome', () => {
    const distance = calculateDistance(
      45.4642, 9.1900, // Milan
      41.9028, 12.4964  // Rome
    );
    expect(distance).toBeCloseTo(477, 0); // ~477km
  });
});

describe('cn (tailwind merge)', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});
```

### 6. Context Tests

```typescript
// src/contexts/SectionContext.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionProvider, useSection } from './SectionContext';

const TestComponent = () => {
  const { section, setSection } = useSection();
  return (
    <div>
      <span data-testid="section">{section}</span>
      <button onClick={() => setSection('fun')}>Set Fun</button>
    </div>
  );
};

describe('SectionContext', () => {
  it('provides default section', () => {
    render(
      <SectionProvider>
        <TestComponent />
      </SectionProvider>
    );
    expect(screen.getByTestId('section')).toHaveTextContent('fit');
  });

  it('updates section when setSection is called', () => {
    render(
      <SectionProvider>
        <TestComponent />
      </SectionProvider>
    );
    fireEvent.click(screen.getByText('Set Fun'));
    expect(screen.getByTestId('section')).toHaveTextContent('fun');
  });

  it('throws error when useSection is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => render(<TestComponent />)).toThrow();
    
    consoleSpy.mockRestore();
  });
});
```

---

## Mocking Strategies

### Firebase Mock Patterns

#### 1. Basic Firebase Config Mock

```typescript
// Already in tests/setup.ts
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));
```

#### 2. Auth Store Mock with State Variations

```typescript
// Helper for mocking auth store with different states
export const createAuthStoreMock = (overrides = {}) => ({
  firebaseUser: null,
  user: null,
  isLoading: false,
  isInitialized: true,
  error: null,
  isOtpSent: false,
  phoneNumber: null,
  recaptchaVerifier: null,
  initialize: vi.fn(() => vi.fn()),
  loginWithGoogle: vi.fn(),
  loginWithApple: vi.fn(),
  initPhoneAuth: vi.fn(),
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn(),
  setUser: vi.fn(),
  loadUserData: vi.fn(),
  refreshUserProfile: vi.fn(),
  ...overrides,
});

// Usage in test
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => selector(createAuthStoreMock({
    user: { id: '123', fullName: 'Test User' },
  }))),
}));
```

#### 3. Firestore Operations Mock

```typescript
// Mock Firestore operations
vi.mock('@/lib/firebase/firestore', () => ({
  getDocument: vi.fn(),
  getCollection: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  subscribeToDocument: vi.fn(() => vi.fn()), // Returns unsubscribe
  subscribeToCollection: vi.fn(() => vi.fn()),
  Timestamp: {
    fromDate: vi.fn((date: Date) => date),
    now: vi.fn(() => new Date()),
  },
}));
```

#### 4. Firebase Auth Operations Mock

```typescript
vi.mock('@/lib/firebase/auth', () => ({
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  onAuthChange: vi.fn(() => vi.fn()),
  isProfileComplete: vi.fn(),
  completeRegistration: vi.fn(),
  getUserData: vi.fn(),
  initRecaptcha: vi.fn(),
  handleAuthRedirect: vi.fn(),
}));
```

### Next.js Mock Patterns

```typescript
// Router mock with full control
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    pathname: '/test',
    query: {},
  }),
  usePathname: () => '/test',
  useSearchParams: () => new URLSearchParams(),
}));

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

### Capacitor Mock Patterns

```typescript
// Mock Capacitor for native platform testing
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

// Test native behavior
import { Capacitor } from '@capacitor/core';

it('uses redirect on web', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  // Test redirect flow
});

it('uses popup on native', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  // Test popup flow
});
```

---

## E2E Testing Strategy

### Current E2E Tests (`e2e/home.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.describe('HomePage', () => {
  test('should show refresher when pulling down', async ({ page }) => {
    await page.goto('/home');

    // Simulate a pull-to-refresh gesture
    await page.mouse.move(150, 150);
    await page.mouse.down();
    await page.mouse.move(150, 400, { steps: 10 });

    // Check if the refresher is visible
    const refresher = await page.locator('.animate-spin');
    await expect(refresher).toBeVisible();

    await page.mouse.up();
  });
});
```

### Recommended E2E Test Coverage

#### 1. Authentication Flows

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can navigate to login page', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /benvenuto/i })).toBeVisible();
    await expect(page.getByPlaceholder(/numero di telefono/i)).toBeVisible();
  });

  test('login page shows social login buttons', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText(/continua con google/i)).toBeVisible();
    await expect(page.getByText(/continua con apple/i)).toBeVisible();
  });

  test('registration link works', async ({ page }) => {
    await page.goto('/auth/login');
    await page.click('a[href="/auth/register"]');
    await expect(page).toHaveURL(/.*register.*/);
  });
});
```

#### 2. Section Switching

```typescript
// e2e/sections.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Section Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
  });

  test('can switch between FIT, FUN, and LIFE sections', async ({ page }) => {
    // Default to FIT
    await expect(page.getByText(/vfit/i).first()).toBeVisible();

    // Switch to FUN
    await page.click('text=FUN');
    await expect(page.getByText(/entertainment/i)).toBeVisible();

    // Switch to LIFE
    await page.click('text=LIFE');
    await expect(page.getByText(/wellness/i)).toBeVisible();
  });

  test('section preference persists after reload', async ({ page }) => {
    await page.click('text=FUN');
    await page.reload();
    await expect(page.getByText(/entertainment/i)).toBeVisible();
  });
});
```

#### 3. Venue Navigation

```typescript
// e2e/venues.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Venue Navigation', () => {
  test('can navigate to gym details', async ({ page }) => {
    await page.goto('/fit/gyms');
    await page.click('[data-testid="gym-card"]').first();
    await expect(page).toHaveURL(/.*venue.*/);
  });

  test('venue detail page shows correct information', async ({ page }) => {
    await page.goto('/venue/carosello');
    await expect(page.getByRole('heading')).toBeVisible();
    await expect(page.getByText(/rating/i) || page.getByText(/★/)).toBeVisible();
  });
});
```

#### 4. Mobile-Specific Tests

```typescript
// e2e/mobile.spec.ts
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } }); // iPhone X dimensions

test.describe('Mobile Experience', () => {
  test('bottom navigation is visible on mobile', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('section switcher is accessible', async ({ page }) => {
    await page.goto('/home');
    const switcher = page.locator('[data-section-switcher]');
    await expect(switcher).toBeVisible();
  });
});
```

---

## Integration Testing with Firebase

### Firestore Rules Testing

```typescript
// tests/integration/firestore-rules.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv: any;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'vfit-test',
      firestore: {
        rules: readFileSync('./firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('allows users to read their own profile', async () => {
    const db = testEnv.authenticatedContext('user123').firestore();
    const userDoc = doc(db, 'users', 'user123');
    await expect(getDoc(userDoc)).resolves.toBeDefined();
  });

  it('denies users from reading other profiles', async () => {
    const db = testEnv.authenticatedContext('user123').firestore();
    const otherUserDoc = doc(db, 'users', 'user456');
    await expect(getDoc(otherUserDoc)).rejects.toThrow();
  });
});
```

### Firebase Auth Integration

```typescript
// tests/integration/auth-flow.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';

describe('Auth Flow Integration', () => {
  it('initializes auth state correctly', async () => {
    const { result } = renderHook(() => useAuthStore());
    
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isInitialized).toBe(false);

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });
  });

  it('handles login error state', async () => {
    const { result } = renderHook(() => useAuthStore());
    
    act(() => {
      result.current.loginWithGoogle();
    });

    // Should set loading state
    expect(result.current.isLoading).toBe(true);
  });
});
```

---

## Current Test Coverage Analysis

### Existing Tests

| File | Coverage | Notes |
|------|----------|-------|
| `src/app/(main)/home/page.test.tsx` | Basic rendering | Tests section switcher rendering and section change |
| `src/app/auth/login/page.test.tsx` | Basic rendering | Tests registration link presence |
| `e2e/home.spec.ts` | Pull-to-refresh | Tests mobile gesture interaction |

### Coverage Gaps

#### Critical Gaps (High Priority)

1. **Auth Store** (`src/stores/authStore.ts`)
   - No tests for Google/Apple login
   - No tests for phone OTP flow
   - No tests for logout
   - No tests for user data loading

2. **Firebase Utils** (`src/lib/firebase/`)
   - No tests for auth.ts functions
   - No tests for firestore.ts CRUD operations
   - No tests for storage operations

3. **UI Components** (`src/components/ui/`)
   - Most components lack tests
   - Button, Input, Card, Avatar, etc.

4. **Hooks** (`src/hooks/`)
   - useAuth hook needs tests

#### Medium Priority Gaps

5. **Context Providers**
   - AuthContext
   - SectionContext (partially tested via page tests)

6. **Form Components**
   - OTP Input
   - Country Code Picker
   - Form validation

7. **Venue-related Pages**
   - Venue detail page
   - Gym listing page
   - Search functionality

#### Lower Priority

8. **Utility Functions** (`src/lib/utils.ts`)
   - formatDate, debounce, platform detection

9. **Profile & Settings**
   - Profile page
   - Bookings page

---

## Recommended Test Templates

### Template 1: New Page Component

```typescript
// src/app/(main)/new-page/page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NewPage from './page';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock auth store
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => selector({
    user: { id: '123', fullName: 'Test User' },
    isLoading: false,
  })),
}));

describe('NewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page heading', () => {
    render(<NewPage />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    // Override mock for loading state
    vi.mocked(useAuthStore).mockImplementation((selector) => selector({
      user: null,
      isLoading: true,
    }));
    
    render(<NewPage />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    render(<NewPage />);
    const button = screen.getByRole('button', { name: /action/i });
    await userEvent.click(button);
    // Assert expected behavior
  });
});
```

### Template 2: New UI Component

```typescript
// src/components/ui/new-component.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NewComponent } from './new-component';

describe('NewComponent', () => {
  it('renders correctly', () => {
    render(<NewComponent />);
    expect(screen.getByTestId('new-component')).toBeInTheDocument();
  });

  it('accepts and displays label prop', () => {
    render(<NewComponent label="Test Label" />);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('calls onChange when value changes', async () => {
    const handleChange = vi.fn();
    render(<NewComponent onChange={handleChange} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'test');
    
    expect(handleChange).toHaveBeenCalled();
  });

  it('is accessible', () => {
    render(<NewComponent aria-label="Accessible Label" />);
    expect(screen.getByLabelText('Accessible Label')).toBeInTheDocument();
  });
});
```

### Template 3: New Hook

```typescript
// src/hooks/useNewHook.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useNewHook } from './useNewHook';

describe('useNewHook', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useNewHook());
    
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('updates state on success', async () => {
    const { result } = renderHook(() => useNewHook());
    
    act(() => {
      result.current.fetchData();
    });
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeDefined();
    });
  });
});
```

### Template 4: Firebase Integration Test

```typescript
// tests/integration/new-feature.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

describe('New Feature Integration', () => {
  let testEnv: any;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'vfit-test',
      firestore: { host: 'localhost', port: 8080 },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('creates document with correct structure', async () => {
    const db = testEnv.authenticatedContext('user123').firestore();
    
    await setDoc(doc(db, 'newCollection', 'doc1'), {
      name: 'Test',
      createdAt: new Date(),
    });
    
    const docSnap = await getDoc(doc(db, 'newCollection', 'doc1'));
    expect(docSnap.exists()).toBe(true);
    expect(docSnap.data()?.name).toBe('Test');
  });
});
```

### Template 5: E2E Test

```typescript
// e2e/new-feature.spec.ts
import { test, expect } from '@playwright/test';

test.describe('New Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/new-feature');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('completes user workflow', async ({ page }) => {
    // Step 1: Fill form
    await page.fill('[data-testid="input-field"]', 'test value');
    
    // Step 2: Submit
    await page.click('[data-testid="submit-button"]');
    
    // Step 3: Verify result
    await expect(page.getByText('Success')).toBeVisible();
  });

  test('handles errors gracefully', async ({ page }) => {
    await page.click('[data-testid="submit-button"]');
    await expect(page.getByText(/error/i)).toBeVisible();
  });
});
```

---

## Testing Checklist for New Features

When adding a new feature, ensure:

### Unit Tests
- [ ] Component renders without errors
- [ ] Props are correctly handled
- [ ] User interactions work as expected
- [ ] Loading states are tested
- [ ] Error states are tested
- [ ] Edge cases are covered

### Integration Tests
- [ ] Firebase interactions work correctly
- [ ] Auth state changes are handled
- [ ] Data flows correctly between components

### E2E Tests
- [ ] Complete user journey works end-to-end
- [ ] Mobile experience is tested
- [ ] Cross-browser compatibility verified

### Coverage Requirements
- [ ] Minimum 70% line coverage for new code
- [ ] All critical paths covered
- [ ] Error handling paths covered

---

## Running Tests

```bash
# Run all unit tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E with UI
npm run test:e2e:ui

# Run specific test file
npx vitest src/components/ui/button.test.tsx

# Run E2E specific test
npx playwright test e2e/auth.spec.ts
```

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Best Practices

1. **Test Behavior, Not Implementation** - Focus on what users see and do
2. **Use `data-testid` Sparingly** - Prefer semantic queries (getByRole, getByLabelText)
3. **Mock External Dependencies** - Firebase, APIs, browser APIs
4. **Clean Up After Tests** - Use `afterEach` to reset mocks and state
5. **Test Edge Cases** - Empty states, error states, loading states
6. **Keep Tests Independent** - Each test should work in isolation
7. **Use Realistic Data** - Mock data should resemble production data
8. **Test Accessibility** - Verify ARIA labels, roles, and keyboard navigation

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)
- [Firebase Testing Guide](https://firebase.google.com/docs/rules/unit-tests)
