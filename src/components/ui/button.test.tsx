import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { Button } from './button';

describe('Button', () => {
  it('labels an outline button with the AA-safe section ink, not the raw section hue (light theme contrast)', () => {
    render(<Button variant="outline">Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveClass('border-section-primary', 'text-section-ink');
    expect(button).not.toHaveClass('text-section-primary');
  });
});
