# Testing Strategy - V Fitness

## Testing Philosophy

- **Test Critical User Paths:** Auth, booking, payment flows
- **Prioritize Integration Tests:** Test components with real Firebase
- **E2E for Core Journeys:** Complete user workflows
- **Mobile-First Testing:** Test on actual devices
- **Performance Monitoring:** Track real-world metrics

---

## Testing Stack

```json
{
  "unit": "Vitest",
  "component": "React Testing Library",
  "e2e": "Playwright",
  "firebase": "Firebase Emulators",
  "mobile": "Capacitor + Real Devices"
}
```

---

## Setup

### Install Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event @playwright/test msw
```

### Configuration Files

#### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

#### `tests/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
```

#### `playwright.config.ts`

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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Unit Tests

### Component Testing

#### Example: Button Component

```typescript
// src/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

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

  it('disables button when loading', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies variant styles', () => {
    render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-primary');
  });
});
```

### Hook Testing

```typescript
// src/hooks/useAuth.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('returns null user initially', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('updates user when auth state changes', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
```

### Utility Function Testing

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice, calculateDistance } from './utils';

describe('formatPrice', () => {
  it('formats price with euro symbol', () => {
    expect(formatPrice(10)).toBe('€10.00');
    expect(formatPrice(1234.56)).toBe('€1,234.56');
  });

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('€0.00');
  });
});

describe('calculateDistance', () => {
  it('calculates distance between coordinates', () => {
    const distance = calculateDistance(
      45.4642, 9.1900, // Milan
      41.9028, 12.4964  // Rome
    );

    expect(distance).toBeCloseTo(477, 0); // ~477km
  });
});
```

---

## Integration Tests with Firebase

### Setup Firebase Emulators

```bash
# Start emulators for testing
firebase emulators:start --only auth,firestore,functions
```

### Test with Real Firebase

```typescript
// tests/integration/bookings.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, addDoc, getDocs } from 'firebase/firestore';

let testEnv: any;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vfit-test',
    firestore: {
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Bookings Collection', () => {
  it('allows authenticated user to create booking', async () => {
    const db = testEnv.authenticatedContext('user123').firestore();

    const bookingRef = await addDoc(collection(db, 'bookings'), {
      userId: 'user123',
      venueId: 'venue1',
      status: 'pending',
    });

    expect(bookingRef.id).toBeDefined();
  });

  it('denies unauthenticated access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await expect(
      addDoc(collection(db, 'bookings'), {
        userId: 'user123',
        venueId: 'venue1',
      })
    ).rejects.toThrow();
  });

  it('prevents user from reading other users bookings', async () => {
    const db = testEnv.authenticatedContext('user456').firestore();

    await expect(
      getDocs(collection(db, 'bookings'))
    ).rejects.toThrow();
  });
});
```

---

## E2E Tests

### Critical User Journeys

#### 1. Authentication Flow

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can sign in with phone number', async ({ page }) => {
    await page.goto('/auth/login');

    // Enter phone number
    await page.fill('[data-testid="phone-input"]', '1234567890');
    await page.click('[data-testid="send-otp"]');

    // Wait for OTP screen
    await expect(page.locator('[data-testid="otp-input"]')).toBeVisible();

    // Enter OTP (use test code in emulator)
    await page.fill('[data-testid="otp-input"]', '123456');

    // Should redirect to home
    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
  });

  test('user can sign in with Google', async ({ page }) => {
    await page.goto('/auth/login');

    await page.click('[data-testid="google-signin"]');

    // Handle Google OAuth popup (mocked in test environment)
    // ...

    await expect(page).toHaveURL('/');
  });
});
```

#### 2. Booking Flow

```typescript
// e2e/booking.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Booking Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    // ... perform login
  });

  test('user can book a gym service', async ({ page }) => {
    // Navigate to gym
    await page.goto('/venue/test-gym-id');

    // Select service
    await page.click('[data-testid="service-massage"]');

    // Choose date and time
    await page.click('[data-testid="date-picker"]');
    await page.click('[data-testid="date-tomorrow"]');
    await page.click('[data-testid="time-10am"]');

    // Proceed to booking
    await page.click('[data-testid="book-now"]');

    // Confirm booking details
    await expect(page.locator('[data-testid="booking-summary"]')).toBeVisible();
    await page.click('[data-testid="confirm-booking"]');

    // Verify success
    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();

    // Check booking appears in list
    await page.goto('/bookings');
    await expect(page.locator('[data-testid="booking-item"]').first()).toBeVisible();
  });

  test('user can cancel booking', async ({ page }) => {
    await page.goto('/bookings');

    // Find and click first booking
    await page.click('[data-testid="booking-item"]');

    // Cancel booking
    await page.click('[data-testid="cancel-booking"]');
    await page.click('[data-testid="confirm-cancel"]');

    // Verify cancellation
    await expect(page.locator('[data-testid="booking-cancelled"]')).toBeVisible();
  });
});
```

#### 3. Search & Filter

```typescript
// e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Search & Filter', () => {
  test('user can search for gyms', async ({ page }) => {
    await page.goto('/fit/gyms');

    // Search by name
    await page.fill('[data-testid="search-input"]', 'Test Gym');
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForSelector('[data-testid="gym-card"]');

    // Verify results contain search term
    const firstResult = page.locator('[data-testid="gym-card"]').first();
    await expect(firstResult).toContainText('Test Gym');
  });

  test('user can filter gyms by amenities', async ({ page }) => {
    await page.goto('/fit/gyms');

    // Open filters
    await page.click('[data-testid="filter-button"]');

    // Select amenities
    await page.check('[data-testid="filter-parking"]');
    await page.check('[data-testid="filter-wifi"]');

    // Apply filters
    await page.click('[data-testid="apply-filters"]');

    // Verify filtered results
    await expect(page.locator('[data-testid="gym-card"]')).toHaveCount(3);
  });
});
```

---

## Mobile Testing

### Capacitor Testing

```typescript
// e2e/mobile.spec.ts
import { test, expect, devices } from '@playwright/test';

test.use(devices['iPhone 12']);

test.describe('Mobile Features', () => {
  test('camera upload works', async ({ page, context }) => {
    await context.grantPermissions(['camera']);

    await page.goto('/profile/edit');

    // Trigger camera
    await page.click('[data-testid="upload-avatar"]');
    await page.click('[data-testid="take-photo"]');

    // Verify image preview
    await expect(page.locator('[data-testid="avatar-preview"]')).toBeVisible();
  });

  test('geolocation works', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);

    // Mock location
    await context.setGeolocation({ latitude: 45.4642, longitude: 9.1900 });

    await page.goto('/');

    // Verify nearby venues loaded
    await expect(page.locator('[data-testid="nearby-venues"]')).toBeVisible();
  });
});
```

### Real Device Testing

Use tools like:
- **BrowserStack** or **Sauce Labs** for cloud devices
- **Physical devices** for final testing

```bash
# iOS
npx cap run ios --target="iPhone 14"

# Android
npx cap run android --target="Pixel_5_API_31"
```

---

## Performance Testing

### Lighthouse CI

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on: [push]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci && npm run build
      - run: npm install -g @lhci/cli
      - run: lhci autorun
```

### Performance Metrics

```typescript
// tests/performance/metrics.test.ts
import { test, expect } from '@playwright/test';

test('homepage loads within performance budget', async ({ page }) => {
  const start = Date.now();

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const loadTime = Date.now() - start;

  expect(loadTime).toBeLessThan(3000); // 3s budget
});
```

---

## Test Coverage

### Generate Coverage Report

```bash
# Run tests with coverage
npm run test:coverage

# View HTML report
open coverage/index.html
```

### Coverage Requirements

```json
{
  "coverage": {
    "lines": 80,
    "functions": 75,
    "branches": 70,
    "statements": 80
  }
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install
      - run: npm run build
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Testing Checklist

Before each release:

- [ ] All unit tests pass
- [ ] Integration tests with Firebase emulators pass
- [ ] E2E tests for critical flows pass
- [ ] Mobile tests on iOS and Android
- [ ] Performance metrics meet targets
- [ ] Coverage above 80%
- [ ] Manual testing on real devices
- [ ] Security rules tested
- [ ] Payment flow tested (test mode)
- [ ] Offline functionality tested

---

## Package Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:firebase": "firebase emulators:exec 'npm run test'",
    "test:all": "npm run test && npm run test:e2e"
  }
}
```
