import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firebase Auth
const mockOnAuthStateChanged = vi.fn();
const mockGetRedirectResult = vi.fn();
const mockGetAuth = vi.fn(() => ({
  currentUser: null,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  getRedirectResult: () => mockGetRedirectResult(),
  getAuth: () => mockGetAuth(),
}));

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
}));

// Mock Firebase auth functions
vi.mock('@/lib/firebase/auth', () => ({
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getUserData: vi.fn(),
  isProfileComplete: vi.fn(),
  initRecaptcha: vi.fn(),
  handleAuthRedirect: vi.fn(),
}));

describe('Auth Store Redirect Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle redirect result on auth pages', async () => {
    // Mock being on auth page
    Object.defineProperty(window, 'location', {
      value: { pathname: '/auth/login', href: 'http://localhost:3000/auth/login' },
      writable: true,
    });

    const mockUnsubscribe = vi.fn();
    mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe);
    mockGetRedirectResult.mockResolvedValue(null);

    // Import the store fresh to test initialization
    const { useAuthStore } = await import('./authStore');
    const store = useAuthStore.getState();

    // Initialize auth
    const unsubscribe = store.initialize();

    // Wait for async operations
    await vi.runAllTimersAsync();

    // Cleanup
    unsubscribe();

    // Verify onAuthStateChanged was set up
    expect(mockOnAuthStateChanged).toHaveBeenCalled();
  });

  it('should redirect to home when user is authenticated', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      refreshToken: '',
      tenantId: null,
      delete: vi.fn(),
      getIdToken: vi.fn(),
      getIdTokenResult: vi.fn(),
      reload: vi.fn(),
      toJSON: vi.fn(),
      phoneNumber: null,
      photoURL: null,
      providerId: 'google.com',
    } as unknown as import('firebase/auth').User;

    // Mock authenticated user
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return vi.fn();
    });

    Object.defineProperty(window, 'location', {
      value: { pathname: '/auth/login', href: 'http://localhost:3000/auth/login' },
      writable: true,
    });

    const { useAuthStore } = await import('./authStore');
    
    // Reset store state
    useAuthStore.setState({
      firebaseUser: null,
      user: null,
      isLoading: true,
      isInitialized: false,
      error: null,
    });

    const store = useAuthStore.getState();
    const unsubscribe = store.initialize();

    await vi.runAllTimersAsync();

    // Verify store was updated with firebase user
    const state = useAuthStore.getState();
    expect(state.firebaseUser).toEqual(mockUser);

    unsubscribe();
  });

  it('should handle redirect result before auth state change', async () => {
    const mockRedirectUser = {
      uid: 'redirect-uid',
      email: 'redirect@example.com',
    };

    // Mock redirect result returning a user
    const { handleAuthRedirect } = await import('@/lib/firebase/auth');
    vi.mocked(handleAuthRedirect).mockResolvedValue(mockRedirectUser as unknown as import('firebase/auth').User);

    Object.defineProperty(window, 'location', {
      value: { pathname: '/auth/login', href: 'http://localhost:3000/auth/login' },
      writable: true,
    });

    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      // Simulate auth state changing after redirect
      setTimeout(() => callback(mockRedirectUser), 100);
      return vi.fn();
    });

    const { useAuthStore } = await import('./authStore');
    
    useAuthStore.setState({
      firebaseUser: null,
      user: null,
      isLoading: true,
      isInitialized: false,
      error: null,
    });

    const store = useAuthStore.getState();
    const unsubscribe = store.initialize();

    await vi.advanceTimersByTimeAsync(200);

    const state = useAuthStore.getState();
    expect(state.firebaseUser?.uid).toBe(mockRedirectUser.uid);

    unsubscribe();
  });
});
