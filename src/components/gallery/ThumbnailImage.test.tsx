import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThumbnailImage } from './ThumbnailImage';

const BASE = 'https://firebasestorage.googleapis.com/v0/b/b/o/';
const FULL = `${BASE}venues%2Fv%2Fgallery%2F1-a_w1200.jpg?alt=media&token=t`;
const THUMB = `${BASE}venues%2Fv%2Fgallery%2F1-a_w320.jpg?alt=media`;

describe('ThumbnailImage', () => {
  it('uses the thumbnail, lazy and async-decoded, for small tiles', () => {
    render(<ThumbnailImage src={FULL} alt="p" />);
    const img = screen.getByAltText('p');
    expect(img).toHaveAttribute('src', THUMB);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('offers thumb + full as a srcset when sizes is given', () => {
    render(<ThumbnailImage src={FULL} alt="p" sizes="288px" />);
    const img = screen.getByAltText('p');
    expect(img).toHaveAttribute('src', FULL);
    expect(img.getAttribute('srcset')).toBe(`${THUMB} 320w, ${FULL} 1200w`);
  });

  it('falls back to the full image when the thumbnail fails to load', () => {
    render(<ThumbnailImage src={FULL} alt="p" />);
    const img = screen.getByAltText('p');
    fireEvent.error(img);
    expect(screen.getByAltText('p')).toHaveAttribute('src', FULL);
  });

  it('renders legacy photos (no thumbnail) as-is', () => {
    const legacy = `${BASE}venues%2Fv%2Fgallery%2F1.jpg?alt=media&token=t`;
    render(<ThumbnailImage src={legacy} alt="p" sizes="288px" />);
    const img = screen.getByAltText('p');
    expect(img).toHaveAttribute('src', legacy);
    expect(img).not.toHaveAttribute('srcset');
  });
});
