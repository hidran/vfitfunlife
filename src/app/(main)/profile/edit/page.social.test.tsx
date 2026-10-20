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

  it('marks the invalid fields (aria-invalid + aria-describedby) and focuses the first one', async () => {
    render(<EditProfilePage />);
    type('tuosito.com', 'javascript:alert(1)');
    type('linkedin.com/in/username', 'rossi');
    fireEvent.click(pageSave());

    const linkedin = await screen.findByPlaceholderText('linkedin.com/in/username');
    const website = screen.getByPlaceholderText('tuosito.com');
    // Field order is instagram, linkedin, website, …: LinkedIn is the first invalid one.
    await waitFor(() => expect(linkedin).toHaveFocus());
    for (const input of [linkedin, website]) {
      expect(input).toHaveAttribute('aria-invalid', 'true');
      const errorId = input.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      expect(document.getElementById(errorId as string)).toHaveTextContent(/non valido/);
    }
    expect(document.getElementById('social-instagram')).not.toHaveAttribute('aria-invalid');
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it('has a single set of social fields: no second social form section and no second Save button', async () => {
    mockUser = { ...mockUser, role: 'provider', providerStatus: 'verified' };
    render(<EditProfilePage />);
    await screen.findByRole('button', { name: 'Professionale' });
    expect(screen.getAllByPlaceholderText('tuosito.com')).toHaveLength(1);
    expect(document.querySelector('section#social')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Salva/ })).toHaveLength(1);
  });

  it('saving from the Professional tab with an invalid link switches to Personal, focuses the field and writes nothing', async () => {
    mockUser = { ...mockUser, role: 'provider', providerStatus: 'verified' };
    render(<EditProfilePage />);
    type('tuosito.com', 'javascript:alert(1)');
    fireEvent.click(await screen.findByRole('button', { name: 'Professionale' }));
    // The Personal inputs are not on screen any more.
    expect(screen.queryByPlaceholderText('tuosito.com')).toBeNull();

    fireEvent.click(pageSave());

    const website = await screen.findByPlaceholderText('tuosito.com');
    await waitFor(() => expect(website).toHaveFocus());
    expect(website).toHaveAttribute('aria-invalid', 'true');
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it('has a TikTok field, stored normalised like the others', async () => {
    render(<EditProfilePage />);
    type('tiktok.com/@username', 'tiktok.com/@mia');
    fireEvent.click(pageSave());
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect((updateUserProfile.mock.calls[0][1] as { socialLinks: unknown }).socialLinks).toEqual({ tiktok: 'https://tiktok.com/@mia' });
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
