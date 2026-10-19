import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditProfilePage from './page';

/**
 * Social links in the profile editor: validated and normalised BEFORE anything is written, so the
 * values satisfy firestore.rules (https URL or @handle) and a bad link cannot cause a partial save.
 */

const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));

type MockUser = {
  id: string;
  uid: string;
  fullName: string;
  role: string;
  providerStatus?: string;
  providerType?: string;
  socialLinks?: Record<string, string>;
};
let mockUser: MockUser;
vi.mock('@/stores/authStore', () => {
  const state = () => ({
    user: mockUser,
    firebaseUser: { uid: mockUser.uid, emailVerified: true },
    refreshUserProfile: vi.fn(async () => {}),
    isLoading: false,
    resendVerificationEmail: vi.fn(),
  });
  const useAuthStore = (selector?: (s: unknown) => unknown) => (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});

const updateUserProfile = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/firebase/auth', () => ({
  updateUserProfile: (...args: unknown[]) => updateUserProfile(...(args as [])),
  updateProviderProfile: vi.fn(async () => {}),
  updateSocialLinks: vi.fn(async () => {}),
  isProvider: vi.fn(async () => true),
  verifyPhoneNumber: vi.fn(),
}));

vi.mock('@/hooks/useProviders', () => ({
  useProvider: () => ({ data: undefined }),
  useProviderServices: () => ({ data: [] }),
}));
vi.mock('@/hooks/useMyLocation', () => ({ useMyLocation: () => ({ data: undefined }) }));
vi.mock('@/components/provider/MissingLocationBanner', () => ({ MissingLocationBanner: () => null }));
vi.mock('@/components/provider/CategoryLeafPicker', () => ({ CategoryLeafPicker: () => null }));
vi.mock('@/components/profile', () => ({ ProfilePhotoUploader: () => null }));
vi.mock('@/components/profile/AvatarUploader', () => ({ AvatarUploader: () => null }));
vi.mock('@/components/profile/SocialLinksForm', () => ({ SocialLinksForm: () => null }));
vi.mock('@/components/profile/NotificationSettingsForm', () => ({ NotificationSettingsForm: () => null }));
vi.mock('@/components/profile/PrivacySettingsForm', () => ({ PrivacySettingsForm: () => null }));


vi.mock('@/components/provider/BusinessProfileSection', () => ({ BusinessProfileSection: () => null }));

const pageSave = () => screen.getByRole('button', { name: 'Salva modifiche' });
const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

describe('profile editor — social links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', uid: 'u1', fullName: 'Mia Rossi', role: 'customer' };
  });

  it('stores placeholder-style input as https URLs, in the same write as the profile', async () => {
    render(<EditProfilePage />);
    type('tuosito.com', 'yourwebsite.com');
    type('linkedin.com/in/username', 'linkedin.com/in/x');
    type('facebook.com/username', 'facebook.com/mia');
    fireEvent.click(pageSave());

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(updateUserProfile.mock.calls[0][1]).toMatchObject({
      fullName: 'Mia Rossi',
      socialLinks: {
        website: 'https://yourwebsite.com/',
        linkedin: 'https://linkedin.com/in/x',
        facebook: 'https://facebook.com/mia',
      },
    });
  });

  it('keeps an @handle, drops a cleared field and carries over keys it has no field for', async () => {
    mockUser = { ...mockUser, socialLinks: { instagram: 'https://instagram.com/old', tiktok: 'https://tiktok.com/@mia' } } as MockUser;
    render(<EditProfilePage />);
    fireEvent.change(screen.getAllByPlaceholderText('@username')[0], { target: { value: '@mia.rossi' } });
    fireEvent.click(pageSave());

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect((updateUserProfile.mock.calls[0][1] as { socialLinks: unknown }).socialLinks).toEqual({
      instagram: '@mia.rossi',
      tiktok: 'https://tiktok.com/@mia',
    });
  });

  it('shows an inline error for javascript: and writes nothing at all', async () => {
    render(<EditProfilePage />);
    type('tuosito.com', 'javascript:alert(1)');
    fireEvent.click(pageSave());

    expect(await screen.findByText('Formato sito web non valido')).toBeInTheDocument();
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it('refuses a bare word and a foreign host on a platform field, again with no write', async () => {
    render(<EditProfilePage />);
    type('tuosito.com', 'rossi');
    type('linkedin.com/in/username', 'https://evil.example/linkedin.com');
    fireEvent.click(pageSave());

    expect(await screen.findByText('Formato sito web non valido')).toBeInTheDocument();
    expect(screen.getByText('Formato LinkedIn non valido')).toBeInTheDocument();
    expect(updateUserProfile).not.toHaveBeenCalled();
  });
});
