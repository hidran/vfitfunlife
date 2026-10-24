import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SECTION_GRADIENT_INK,
  SECTION_GRADIENT_STOPS,
  WCAG_AA_TEXT,
  contrastRatio,
} from '@/styles/sectionTokens';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { Button } from './button';

describe('Button', () => {
  it('labels an outline button with the AA-safe section ink, not the raw section hue (light theme contrast)', () => {
    render(<Button variant="outline">Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveClass('border-section-primary', 'text-section-ink');
    expect(button).not.toHaveClass('text-section-primary');
  });

  it('labels the primary (gradient) button with the dark on-gradient ink, never white', () => {
    render(<Button>Book</Button>);
    const button = screen.getByRole('button', { name: 'Book' });
    expect(button).toHaveClass('bg-section-gradient', 'text-section-on-gradient');
    expect(button).not.toHaveClass('text-white');
  });

  // jsdom resolves no gradients, so the contrast is checked on the token values the CSS mirrors
  // (src/styles/sectionTokens.ts; sectionTokens.test.ts pins globals.css to them).
  it.each(Object.entries(SECTION_GRADIENT_STOPS))(
    'the primary label reaches AA on every stop of the %s gradient',
    (_section, stops) => {
      for (const stop of stops) {
        expect(contrastRatio(stop, SECTION_GRADIENT_INK)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      }
    },
  );
});
