import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/auth', () => ({ updateSocialLinks: vi.fn() }));

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
