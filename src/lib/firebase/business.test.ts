import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}));
vi.mock('./storage', () => ({
  uploadImageWithThumbnail: vi.fn().mockResolvedValue({
    url: 'https://storage.example/logo_w500.jpg',
    path: 'instructors/u1/gallery/logo-1_w500.jpg',
    thumbUrl: null,
    thumbPath: 'instructors/u1/gallery/logo-1_w128.jpg',
  }),
}));

import { updateDoc } from 'firebase/firestore';
import { uploadImageWithThumbnail } from './storage';
import { AVATAR_DERIVATIVES } from './thumbnails';
import { updateBusinessDetails, uploadBusinessLogo } from './business';

beforeEach(() => vi.clearAllMocks());

describe('updateBusinessDetails', () => {
  it('writes the five editable business paths and mirrors the public name to name/fullName', async () => {
    await updateBusinessDetails('u1', {
      displayName: 'Palestra Rossi',
      description: 'Dal 1990',
      website: 'https://rossi.it',
      logoUrl: 'https://storage.example/logo.jpg',
      city: 'Milano',
    });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      {
        'business.displayName': 'Palestra Rossi',
        'business.description': 'Dal 1990',
        'business.website': 'https://rossi.it',
        'business.logoUrl': 'https://storage.example/logo.jpg',
        'business.city': 'Milano',
        name: 'Palestra Rossi',
        fullName: 'Palestra Rossi',
        updatedAt: 'TS',
      }
    );
  });

  it('leaves out undefined fields (and the name mirror when the public name is not in the patch)', async () => {
    await updateBusinessDetails('u1', { logoUrl: 'https://storage.example/logo.jpg', website: undefined });

    expect(updateDoc).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      { 'business.logoUrl': 'https://storage.example/logo.jpg', updatedAt: 'TS' }
    );
  });

  it('never writes a frozen field, whatever the caller passes', async () => {
    await updateBusinessDetails('u1', {
      displayName: 'Palestra Rossi',
      // Not part of the patch type; a sloppy caller must not be able to smuggle these in.
      ...({ vatNumber: '99999999999', legalName: 'X', venueType: 'none', providerType: 'individual' } as object),
    });

    const written = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['business.displayName', 'fullName', 'name', 'updatedAt']);
  });
});

describe('uploadBusinessLogo', () => {
  it('uploads to the owner-writable gallery folder with a logo stem and returns the URL', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });

    const url = await uploadBusinessLogo('u1', file);

    expect(url).toBe('https://storage.example/logo_w500.jpg');
    expect(uploadImageWithThumbnail).toHaveBeenCalledWith({
      dir: 'instructors/u1/gallery',
      stem: 'logo-1700000000000',
      file,
      spec: AVATAR_DERIVATIVES,
      maxSizeMB: 0.5,
    });
  });
});
