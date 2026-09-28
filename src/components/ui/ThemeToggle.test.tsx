import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

const changeLocale = vi.fn();
vi.mock('@/hooks/useChangeLocale', () => ({ useChangeLocale: () => changeLocale }));

describe('ThemeToggle', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; ThemeProvider reads prefers-color-scheme through it.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('segmented: selecting light flips data-theme on <html>', () => {
    render(
      <ThemeProvider>
        <ThemeToggle compact />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chiaro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Chiaro' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('cycle: one button steps light → dark → system with a descriptive label', () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="cycle" />
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    // Default preference is system → next is light.
    expect(button).toHaveAttribute('aria-label', 'Tema: Sistema. Passa a Chiaro');
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(button).toHaveAttribute('aria-label', 'Tema: Chiaro. Passa a Scuro');
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('LanguageSwitcher icon variant', () => {
  it('exposes a labelled select that changes locale', () => {
    render(<LanguageSwitcher variant="icon" />);
    const select = screen.getByRole('combobox', { name: 'Lingua' });
    fireEvent.change(select, { target: { value: 'en' } });
    expect(changeLocale).toHaveBeenCalledWith('en');
  });
});
