import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessProfileSection, type BusinessProfileSectionHandle } from './BusinessProfileSection';

/**
 * The company profile editor (plan 2026-10-04, B6). Firestore is mocked at the SDK boundary so
 * the assertions read the exact `updateDoc` call — the payload is what the rules judge.
 */

const SERVER_TS = { __serverTimestamp: true };
const getDoc = vi.fn();
const updateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: (...args: unknown[]) => getDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  serverTimestamp: () => SERVER_TS,
  // No setDoc on purpose: dotted keys are only safe through updateDoc.
}));

const uploadGalleryPhoto = vi.fn();
vi.mock('@/lib/firebase/photos', () => ({
  uploadGalleryPhoto: (...args: unknown[]) => uploadGalleryPhoto(...args),
}));

type MockUser = { uid: string; providerType?: string; providerStatus?: string };
let mockUser: MockUser | null;
vi.mock('@/stores/authStore', () => {
  const state = () => ({ user: mockUser });
  const useAuthStore = (selector?: (s: unknown) => unknown) => (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});

const STORED_BUSINESS = {
  legalName: 'Karate Club Roma SRL',
  vatNumber: '00743110157',
  legalForm: 'association',
  affiliationNumber: 'CONI 12345',
  displayName: 'Karate Club Roma',
  description: 'Karate per bambini e adulti',
  website: 'https://karateroma.it',
  logoUrl: null,
  city: 'Roma',
};

const LOGO_URL =
  'https://firebasestorage.googleapis.com/v0/b/vfit.appspot.com/o/instructors%2Fu1%2Fgallery%2F1-abc_w1200.jpg?alt=media&token=t';

const REVIEWED_KEYS = ['legalName', 'vatNumber', 'legalForm', 'affiliationNumber'];

function instructorSnap(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data ?? undefined };
}

function renderSection(onDirtyChange?: (dirty: boolean) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ref = createRef<BusinessProfileSectionHandle>();
  render(
    <QueryClientProvider client={client}>
      <BusinessProfileSection ref={ref} onDirtyChange={onDirtyChange} />
    </QueryClientProvider>
  );
  return { ref };
}

/** Render a company and wait for its stored details to be in the form. */
async function renderCompany(onDirtyChange?: (dirty: boolean) => void) {
  const result = renderSection(onDirtyChange);
  await screen.findByRole('group', { name: "Dati dell'attività" });
  return result;
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });
const saveButton = () => screen.getByRole('button', { name: "Salva i dati dell'attività" });

function lastUpdate(): { path: string; payload: Record<string, unknown> } {
  expect(updateDoc).toHaveBeenCalledTimes(1);
  const [ref, payload] = updateDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
  return { path: ref.path, payload };
}

describe('BusinessProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { uid: 'u1', providerType: 'business', providerStatus: 'verified' };
    getDoc.mockResolvedValue(instructorSnap({ uid: 'u1', name: 'Karate Club Roma', business: STORED_BUSINESS }));
    updateDoc.mockResolvedValue(undefined);
  });

  describe('who sees it', () => {
    it('is hidden for an individual provider, without reading the instructors doc', () => {
      mockUser = { uid: 'u1', providerStatus: 'verified' };
      renderSection();

      expect(screen.queryByTestId('business-profile-section')).toBeNull();
      expect(screen.queryByRole('group', { name: "Dati dell'attività" })).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('is hidden for an explicit individual too', () => {
      mockUser = { uid: 'u1', providerType: 'individual', providerStatus: 'verified' };
      renderSection();
      expect(screen.queryByTestId('business-profile-section')).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('is hidden when the instructors doc has no business map', async () => {
      getDoc.mockResolvedValue(instructorSnap({ uid: 'u1', name: 'Mia Rossi' }));
      renderSection();

      await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByText('Caricamento...')).toBeNull());
      expect(screen.queryByTestId('business-profile-section')).toBeNull();
    });

    it('is hidden when there is no instructors doc at all', async () => {
      getDoc.mockResolvedValue(instructorSnap(null));
      renderSection();

      await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByText('Caricamento...')).toBeNull());
      expect(screen.queryByTestId('business-profile-section')).toBeNull();
    });

    it('says so when the company details cannot be loaded', async () => {
      getDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
      renderSection();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Non è stato possibile caricare i dati dell'attività."
      );
      expect(screen.queryByText(/permission-denied/)).toBeNull();
    });
  });

  describe('reviewed fields', () => {
    it('shows legal name, tax id, legal form and affiliation number as text, not as inputs', async () => {
      await renderCompany();

      const reviewed = screen.getByRole('region', { name: 'Dati legali e fiscali' });
      expect(reviewed).toHaveTextContent('Ragione sociale');
      expect(reviewed).toHaveTextContent('Karate Club Roma SRL');
      expect(reviewed).toHaveTextContent('P.IVA / Codice fiscale');
      expect(reviewed).toHaveTextContent('00743110157');
      expect(reviewed).toHaveTextContent('Associazione o ente (ASD, APS…)');
      expect(reviewed).toHaveTextContent('CONI 12345');
      expect(reviewed).toHaveTextContent(
        'Questi dati sono stati verificati dal nostro team: per modificarli contatta il supporto.'
      );

      // Nothing to type into: no control carries a reviewed field.
      expect(screen.queryByLabelText(/Ragione sociale/)).toBeNull();
      expect(screen.queryByLabelText(/P\.IVA/)).toBeNull();
      expect(screen.queryByLabelText(/Forma giuridica/)).toBeNull();
      expect(screen.queryByLabelText(/Numero di affiliazione/)).toBeNull();
      expect(screen.queryByDisplayValue('00743110157')).toBeNull();
    });

    it('says the details are still being checked while the application is pending', async () => {
      mockUser = { uid: 'u1', providerType: 'business', providerStatus: 'pending' };
      await renderCompany();

      expect(
        screen.getByText('Il nostro team sta verificando questi dati: per modificarli contatta il supporto.')
      ).toBeInTheDocument();
    });

    it('prefills the editable fields from the stored details', async () => {
      await renderCompany();

      expect(field(/^Nome pubblico/)).toHaveValue('Karate Club Roma');
      expect(field(/^Nome pubblico/)).toHaveAttribute('aria-required', 'true');
      expect(field(/^Città/)).toHaveValue('Roma');
      expect(field(/^Sito web/)).toHaveValue('https://karateroma.it');
      expect(field(/^Descrizione/)).toHaveValue('Karate per bambini e adulti');
    });
  });

  describe('saving', () => {
    it('sends exactly the changed public name, mirrored to name and fullName, and no reviewed key', async () => {
      await renderCompany();

      type(/^Nome pubblico/, '  Karate Roma  ');
      fireEvent.click(saveButton());

      expect(await screen.findByText("Dati dell'attività salvati.")).toBeInTheDocument();
      const { path, payload } = lastUpdate();
      expect(path).toBe('instructors/u1');
      expect(payload).toEqual({
        'business.displayName': 'Karate Roma',
        name: 'Karate Roma',
        fullName: 'Karate Roma',
        updatedAt: SERVER_TS,
      });
      // Never the whole map (that would replace the reviewed keys too), never a reviewed key.
      expect(payload).not.toHaveProperty('business');
      for (const key of Object.keys(payload)) {
        expect(REVIEWED_KEYS.some((reviewed) => key.endsWith(reviewed))).toBe(false);
      }
      expect(field(/^Nome pubblico/)).toHaveValue('Karate Roma');
    });

    it('adds https:// to a www. website and shows the stored address afterwards', async () => {
      await renderCompany();

      type(/^Sito web/, 'www.karateclubroma.it');
      fireEvent.click(saveButton());

      await screen.findByText("Dati dell'attività salvati.");
      expect(lastUpdate().payload).toEqual({
        'business.website': 'https://www.karateclubroma.it',
        updatedAt: SERVER_TS,
      });
      expect(field(/^Sito web/)).toHaveValue('https://www.karateclubroma.it');
    });

    it('stores a cleared website as null and a cleared city as ""', async () => {
      await renderCompany();

      type(/^Sito web/, '');
      type(/^Città/, '   ');
      fireEvent.click(saveButton());

      await screen.findByText("Dati dell'attività salvati.");
      expect(lastUpdate().payload).toEqual({
        'business.website': null,
        'business.city': '',
        updatedAt: SERVER_TS,
      });
    });

    it('refuses an invalid website on its field, without writing', async () => {
      await renderCompany();

      type(/^Sito web/, 'javascript:alert(1)');
      fireEvent.click(saveButton());

      await waitFor(() => expect(field(/^Sito web/)).toHaveFocus());
      expect(field(/^Sito web/)).toHaveAttribute('aria-invalid', 'true');
      expect(field(/^Sito web/)).toHaveAccessibleDescription(
        'Indirizzo del sito non valido. Esempio: www.tuosito.it'
      );
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('refuses a blank public name, without writing', async () => {
      await renderCompany();

      type(/^Nome pubblico/, '   ');
      fireEvent.click(saveButton());

      await waitFor(() => expect(field(/^Nome pubblico/)).toHaveFocus());
      expect(field(/^Nome pubblico/)).toHaveAccessibleDescription(
        expect.stringContaining('Inserisci il nome pubblico.')
      );
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('writes nothing when nothing changed, and says so', async () => {
      await renderCompany();

      // Spaces around an unchanged value are not a change either.
      type(/^Città/, ' Roma ');
      fireEvent.click(saveButton());

      expect(await screen.findByText('Nessuna modifica da salvare.')).toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('disables the form while saving', async () => {
      let finish!: () => void;
      updateDoc.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      await renderCompany();

      type(/^Nome pubblico/, 'Karate Roma');
      fireEvent.click(saveButton());

      await waitFor(() => expect(screen.getByRole('group', { name: "Dati dell'attività" })).toBeDisabled());
      expect(screen.getByRole('button', { name: /Salvataggio/ })).toBeDisabled();

      await act(async () => finish());
      expect(await screen.findByText("Dati dell'attività salvati.")).toBeInTheDocument();
      expect(screen.getByRole('group', { name: "Dati dell'attività" })).not.toBeDisabled();
    });

    it('shows a localised error, never the raw code, when the rules refuse the write', async () => {
      updateDoc.mockRejectedValue(
        Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
      );
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await renderCompany();

      type(/^Nome pubblico/, 'Karate Roma');
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Non è stato possibile salvare le modifiche. Riprova; se il problema persiste, contatta il supporto.'
        )
      );
      expect(screen.queryByText(/permission-denied/)).toBeNull();
      expect(screen.queryByText(/insufficient permissions/)).toBeNull();
      expect(screen.queryByText("Dati dell'attività salvati.")).toBeNull();
      // The edit is kept, so the user can try again.
      expect(field(/^Nome pubblico/)).toHaveValue('Karate Roma');
      expect(saveButton()).not.toBeDisabled();
      consoleError.mockRestore();
    });

    it('reports unsaved edits and clears them once saved', async () => {
      const onDirtyChange = vi.fn();
      await renderCompany(onDirtyChange);
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);

      type(/^Città/, 'Milano');
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

      fireEvent.click(saveButton());
      await screen.findByText("Dati dell'attività salvati.");
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    });

    it('saves through its handle too (the page Save button)', async () => {
      const { ref } = await renderCompany();
      type(/^Descrizione/, 'Karate e animazione');

      let saved: boolean | undefined;
      await act(async () => {
        saved = await ref.current!.save();
      });

      expect(saved).toBe(true);
      expect(lastUpdate().payload).toEqual({
        'business.description': 'Karate e animazione',
        updatedAt: SERVER_TS,
      });
    });

    it('resolves false through its handle when a field is invalid', async () => {
      const { ref } = await renderCompany();
      type(/^Nome pubblico/, '');

      let saved: boolean | undefined;
      await act(async () => {
        saved = await ref.current!.save();
      });

      expect(saved).toBe(false);
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('logo', () => {
    const pickLogo = (file = new File(['png'], 'logo.png', { type: 'image/png' })) =>
      fireEvent.change(screen.getByTestId('business-logo-input'), { target: { files: [file] } });

    it('uploads to the instructor folder and stores the https download URL on save', async () => {
      uploadGalleryPhoto.mockResolvedValue(LOGO_URL);
      await renderCompany();
      expect(screen.getByRole('button', { name: 'Carica logo' })).toBeInTheDocument();

      const file = new File(['png'], 'logo.png', { type: 'image/png' });
      pickLogo(file);

      expect(await screen.findByRole('img', { name: 'Logo di Karate Club Roma' })).toBeInTheDocument();
      expect(uploadGalleryPhoto).toHaveBeenCalledWith({ scope: 'instructors', entityId: 'u1', file });
      expect(screen.getByRole('button', { name: 'Cambia logo' })).toBeInTheDocument();
      // Uploaded, not yet stored: it goes live with the save.
      expect(updateDoc).not.toHaveBeenCalled();

      fireEvent.click(saveButton());
      await screen.findByText("Dati dell'attività salvati.");
      expect(lastUpdate().payload).toEqual({ 'business.logoUrl': LOGO_URL, updatedAt: SERVER_TS });
    });

    it('shows an error when the upload fails, and stores nothing', async () => {
      uploadGalleryPhoto.mockRejectedValue(new Error('storage/unauthorized'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await renderCompany();

      pickLogo();

      expect(
        await screen.findByText("Caricamento del logo non riuscito. Scegli un'immagine (JPG o PNG) e riprova.")
      ).toBeInTheDocument();
      expect(screen.queryByText(/storage\/unauthorized/)).toBeNull();
      expect(screen.queryByRole('img', { name: /^Logo di/ })).toBeNull();

      fireEvent.click(saveButton());
      expect(await screen.findByText('Nessuna modifica da salvare.')).toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('refuses a download URL the rules would refuse (not https)', async () => {
      uploadGalleryPhoto.mockResolvedValue('http://127.0.0.1:9199/v0/b/x/o/logo.jpg');
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await renderCompany();

      pickLogo();

      expect(await screen.findByText(/Caricamento del logo non riuscito/)).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /^Logo di/ })).toBeNull();
      consoleError.mockRestore();
    });

    it('refuses a file that is not an image without uploading it', async () => {
      await renderCompany();

      pickLogo(new File(['%PDF'], 'visura.pdf', { type: 'application/pdf' }));

      expect(await screen.findByText(/Caricamento del logo non riuscito/)).toBeInTheDocument();
      expect(uploadGalleryPhoto).not.toHaveBeenCalled();
    });

    it('removes a stored logo by saving null', async () => {
      getDoc.mockResolvedValue(
        instructorSnap({ uid: 'u1', business: { ...STORED_BUSINESS, logoUrl: LOGO_URL } })
      );
      await renderCompany();
      expect(screen.getByRole('img', { name: 'Logo di Karate Club Roma' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Rimuovi logo' }));
      fireEvent.click(saveButton());

      await screen.findByText("Dati dell'attività salvati.");
      expect(lastUpdate().payload).toEqual({ 'business.logoUrl': null, updatedAt: SERVER_TS });
    });
  });
});
