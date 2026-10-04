import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditProfilePage from './page';

/**
 * How the profile editor hosts the company profile (plan 2026-10-04, B6): only for a company,
 * on the Professional tab, inside the page's unsaved-changes guard and its Save button. The
 * section itself is stubbed — its own behaviour is covered in BusinessProfileSection.test.tsx.
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

const updateUserProfile = vi.fn(async () => {});
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

// The stub reports itself dirty when its button is pressed and saves through `mockSectionSave`.
const mockSectionSave = vi.fn<() => Promise<boolean>>();
vi.mock('@/components/provider/BusinessProfileSection', () => ({
  BusinessProfileSection: forwardRef<
    { save: () => Promise<boolean> },
    { onDirtyChange?: (dirty: boolean) => void }
  >(function StubSection({ onDirtyChange }, ref) {
    useImperativeHandle(ref, () => ({ save: () => mockSectionSave() }));
    return (
      <div data-testid="business-section-stub">
        <button type="button" onClick={() => onDirtyChange?.(true)}>
          edit company
        </button>
      </div>
    );
  }),
}));

const professionalTab = () => screen.getByRole('button', { name: 'Professionale' });
const personalTab = () => screen.getByRole('button', { name: 'Personale' });
const pageSave = () => screen.getByRole('button', { name: 'Salva modifiche' });

describe('profile editor — company profile section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'u1',
      uid: 'u1',
      fullName: 'Mia Rossi',
      role: 'provider',
      providerStatus: 'verified',
      providerType: 'business',
    };
    mockSectionSave.mockResolvedValue(true);
  });

  it('is shown to a company on the Professional tab only', async () => {
    render(<EditProfilePage />);

    // Mounted (to keep unsaved edits) but hidden while the Personal tab is open.
    const stub = screen.getByTestId('business-section-stub');
    expect(stub).not.toBeVisible();

    fireEvent.click(await waitFor(() => professionalTab()));
    expect(screen.getByTestId('business-section-stub')).toBeVisible();

    fireEvent.click(personalTab());
    expect(screen.getByTestId('business-section-stub')).not.toBeVisible();
  });

  it('is not there for an individual provider', async () => {
    mockUser = { ...mockUser, providerType: undefined };
    render(<EditProfilePage />);

    fireEvent.click(await waitFor(() => professionalTab()));
    expect(screen.queryByTestId('business-section-stub')).toBeNull();
  });

  it("counts the section's unsaved edits in the page guard", async () => {
    render(<EditProfilePage />);
    fireEvent.click(await waitFor(() => professionalTab()));

    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'edit company' }));
    expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('heading', { name: 'Modifiche non salvate' })).toBeInTheDocument();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('saves the company edits with the page Save button, before the personal data', async () => {
    render(<EditProfilePage />);
    fireEvent.click(await waitFor(() => professionalTab()));
    fireEvent.click(screen.getByRole('button', { name: 'edit company' }));

    fireEvent.click(pageSave());

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(mockSectionSave).toHaveBeenCalledTimes(1);
    expect(mockSectionSave.mock.invocationCallOrder[0]).toBeLessThan(
      updateUserProfile.mock.invocationCallOrder[0]
    );
  });

  it('stops and shows the Professional tab when the company edits cannot be saved', async () => {
    mockSectionSave.mockResolvedValue(false);
    render(<EditProfilePage />);
    fireEvent.click(await waitFor(() => professionalTab()));
    fireEvent.click(screen.getByRole('button', { name: 'edit company' }));
    fireEvent.click(personalTab());

    fireEvent.click(pageSave());

    await waitFor(() => expect(screen.getByTestId('business-section-stub')).toBeVisible());
    expect(mockSectionSave).toHaveBeenCalledTimes(1);
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Errore di salvataggio')).toBeInTheDocument();
  });

  it('does not call the section when it has nothing to save', async () => {
    render(<EditProfilePage />);

    fireEvent.click(pageSave());

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(mockSectionSave).not.toHaveBeenCalled();
  });
});
