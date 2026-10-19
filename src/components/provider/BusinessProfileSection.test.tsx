import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Provider } from '@/types/instructor';

const fetchProvider = vi.fn();
const updateBusinessDetails = vi.fn();
const uploadBusinessLogo = vi.fn();
vi.mock('@/lib/firebase/providers', () => ({ fetchProvider: (id: string) => fetchProvider(id) }));
vi.mock('@/lib/firebase/business', () => ({
  updateBusinessDetails: (uid: string, patch: unknown) => updateBusinessDetails(uid, patch),
  uploadBusinessLogo: (uid: string, file: File) => uploadBusinessLogo(uid, file),
}));

import { BusinessProfileSection } from './BusinessProfileSection';

const provider: Provider = {
  id: 'u1',
  fullName: 'Palestra Rossi',
  avatarUrl: null,
  rating: 0,
  reviewCount: 0,
  isVerified: true,
  isActive: true,
  specialties: [],
  yearsOfExperience: 0,
  languages: [],
  providerType: 'business',
  business: {
    legalName: 'Palestra Rossi S.r.l.',
    vatNumber: '01234567897',
    displayName: 'Palestra Rossi',
    description: 'Dal 1990',
    website: 'https://rossi.it',
    logoUrl: 'https://storage.example/logo.jpg',
    city: 'Milano',
    venueType: 'gym',
    address: 'Via Roma 1',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchProvider.mockResolvedValue(provider);
  updateBusinessDetails.mockResolvedValue(undefined);
});

describe('BusinessProfileSection', () => {
  it('prefills the form from the stored company, with the P.IVA read-only and the logo shown', async () => {
    render(<BusinessProfileSection uid="u1" />);

    const vat = (await screen.findByLabelText('Partita IVA')) as HTMLInputElement;
    expect(fetchProvider).toHaveBeenCalledWith('u1');
    expect(vat.value).toBe('01234567897');
    expect(vat).toHaveAttribute('readonly');
    expect((screen.getByLabelText('Ragione sociale') as HTMLInputElement)).toHaveAttribute('readonly');
    expect((screen.getByLabelText('Nome pubblico') as HTMLInputElement).value).toBe('Palestra Rossi');
    expect((screen.getByLabelText('Descrizione (facoltativa)') as HTMLTextAreaElement).value).toBe('Dal 1990');
    expect((screen.getByLabelText('Città') as HTMLInputElement).value).toBe('Milano');
    expect((screen.getByLabelText('Sito web (facoltativo)') as HTMLInputElement).value).toBe('https://rossi.it');
    expect(screen.getByRole('img', { name: 'Logo aziendale' })).toHaveAttribute('src', 'https://storage.example/logo.jpg');
  });

  it('saves the editable fields only and confirms', async () => {
    render(<BusinessProfileSection uid="u1" />);
    await screen.findByLabelText('Partita IVA');

    fireEvent.change(screen.getByLabelText('Nome pubblico'), { target: { value: ' Rossi Fitness ' } });
    fireEvent.change(screen.getByLabelText('Città'), { target: { value: 'Torino' } });
    fireEvent.change(screen.getByLabelText('Sito web (facoltativo)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva dati aziendali' }));

    await waitFor(() => expect(updateBusinessDetails).toHaveBeenCalledTimes(1));
    expect(updateBusinessDetails).toHaveBeenCalledWith('u1', {
      displayName: 'Rossi Fitness',
      description: 'Dal 1990',
      website: '',
      city: 'Torino',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Dati aziendali salvati');
  });

  it('does not save an empty public name', async () => {
    render(<BusinessProfileSection uid="u1" />);
    await screen.findByLabelText('Partita IVA');

    fireEvent.change(screen.getByLabelText('Nome pubblico'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva dati aziendali' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Il nome pubblico è obbligatorio');
    expect(updateBusinessDetails).not.toHaveBeenCalled();
  });

  it('shows an error when the write fails', async () => {
    updateBusinessDetails.mockRejectedValueOnce(new Error('permission-denied'));
    render(<BusinessProfileSection uid="u1" />);
    await screen.findByLabelText('Partita IVA');

    fireEvent.click(screen.getByRole('button', { name: 'Salva dati aziendali' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossibile salvare i dati aziendali');
  });

  it('uploads a new logo and stores its URL', async () => {
    uploadBusinessLogo.mockResolvedValue('https://storage.example/new-logo.jpg');
    render(<BusinessProfileSection uid="u1" />);
    await screen.findByLabelText('Partita IVA');

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Cambia logo'), { target: { files: [file] } });

    await waitFor(() => expect(updateBusinessDetails).toHaveBeenCalledWith('u1', { logoUrl: 'https://storage.example/new-logo.jpg' }));
    expect(uploadBusinessLogo).toHaveBeenCalledWith('u1', file);
    expect(screen.getByRole('img', { name: 'Logo aziendale' })).toHaveAttribute('src', 'https://storage.example/new-logo.jpg');
  });

  it('says when the company could not be loaded', async () => {
    fetchProvider.mockResolvedValue(null);
    render(<BusinessProfileSection uid="u1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossibile caricare i dati aziendali');
  });
});
