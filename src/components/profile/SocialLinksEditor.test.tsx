import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const updateSocialLinks = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock('@/lib/firebase/auth', () => ({ updateSocialLinks }));

import { SocialLinksEditor } from './SocialLinksEditor';

describe('SocialLinksEditor (read-only view)', () => {
  it('links safe URLs and shows a javascript: value as plain text', () => {
    render(
      <SocialLinksEditor
        userId="u1"
        socialLinks={{ website: 'javascript:alert(1)', linkedin: 'linkedin.com/in/anna' } as never}
      />,
    );

    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
    const link = screen.getByText('linkedin.com/in/anna').closest('a');
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/anna');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not link a platform pill to a foreign host', () => {
    render(
      <SocialLinksEditor
        userId="u1"
        socialLinks={{ instagram: 'https://evil.example/anna', linkedin: 'https://linkedin.com.evil.example/in/a' } as never}
      />,
    );

    expect(screen.getByText('evil.example/anna').closest('a')).toBeNull();
    expect(screen.getByText('linkedin.com.evil.example/in/a').closest('a')).toBeNull();
  });
});

describe('SocialLinksEditor (edit mode: the same validator as the profile editor)', () => {
  beforeEach(() => updateSocialLinks.mockClear());

  const edit = () => {
    const onUpdate = vi.fn();
    render(<SocialLinksEditor userId="u1" socialLinks={{}} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button'));
    return onUpdate;
  };
  const type = (placeholder: string, value: string) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
  const save = () => fireEvent.click(screen.getAllByRole('button')[1]);

  it('accepts bare hosts and handles, stores them normalised, TikTok included', async () => {
    const onUpdate = edit();
    type('tuosito.com', 'yourwebsite.com');
    type('linkedin.com/in/username', 'linkedin.com/in/x');
    type('tiktok.com/@username', 'tiktok.com/@mia');
    fireEvent.change(document.getElementById('social-instagram') as HTMLElement, { target: { value: '@mia.rossi' } });
    save();

    await waitFor(() => expect(updateSocialLinks).toHaveBeenCalledTimes(1));
    const expected = {
      website: 'https://yourwebsite.com/',
      linkedin: 'https://linkedin.com/in/x',
      tiktok: 'https://tiktok.com/@mia',
      instagram: '@mia.rossi',
    };
    expect(updateSocialLinks).toHaveBeenCalledWith('u1', expected);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expected));
  });

  it('refuses javascript: and a bare word: aria-invalid, described error, focus on the first, no write', async () => {
    edit();
    type('tuosito.com', 'javascript:alert(1)');
    type('linkedin.com/in/username', 'rossi');
    save();

    const linkedin = screen.getByPlaceholderText('linkedin.com/in/username');
    await waitFor(() => expect(linkedin).toHaveFocus());
    for (const input of [linkedin, screen.getByPlaceholderText('tuosito.com')]) {
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(input.getAttribute('aria-describedby') as string)).toHaveTextContent(/non valido/);
    }
    expect(updateSocialLinks).not.toHaveBeenCalled();
  });
});
