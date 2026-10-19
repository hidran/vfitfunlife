import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { ProviderTabBar, type ProviderTab } from './ProviderTabsContent';

function Harness({ initial = 'overview' as ProviderTab }) {
  const [active, setActive] = useState<ProviderTab>(initial);
  return <ProviderTabBar active={active} onChange={setActive} />;
}

describe('ProviderTabBar', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it('does not scroll anything on mount', () => {
    render(<Harness />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls the newly active tab into view, horizontally only as needed', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button')[3]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getAllByRole('button')[3]);
  });

  it('works where scrollIntoView does not exist (jsdom)', () => {
    // @ts-expect-error simulate an environment without it
    delete Element.prototype.scrollIntoView;
    render(<Harness />);
    expect(() => fireEvent.click(screen.getAllByRole('button')[1])).not.toThrow();
  });

  it('pads the row so a focus ring is not clipped by the scroll container', () => {
    const { container } = render(<Harness />);
    const row = container.querySelector('button')!.parentElement!;
    expect(row.className).toMatch(/\bpx-1\b/);
    expect(row.className).toMatch(/\bpt-1\b/);
    expect(row.parentElement!.className).toMatch(/overflow-x-auto/);
  });
});
