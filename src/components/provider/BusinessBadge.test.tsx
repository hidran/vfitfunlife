import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BusinessBadge, BusinessWebsiteLink } from './BusinessBadge';

describe('BusinessBadge', () => {
  it('shows the text label, not just a colour', () => {
    render(<BusinessBadge />);
    expect(screen.getByText('Azienda')).toBeInTheDocument();
  });
});

describe('BusinessWebsiteLink', () => {
  it('opens http(s) sites in a new tab without opener access', () => {
    render(<BusinessWebsiteLink website="https://palestra.it/info" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://palestra.it/info');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('palestra.it');
  });

  it('renders nothing for other schemes or no website', () => {
    const { container, rerender } = render(<BusinessWebsiteLink website="javascript:alert(1)" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BusinessWebsiteLink website={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
