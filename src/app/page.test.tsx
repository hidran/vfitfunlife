import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('public landing page', () => {
  it('features the three VFitFunLife worlds and role-based registration CTAs', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: /^sign up$/i })).toHaveAttribute('href', '/auth/register');

    expect(screen.getByRole('heading', { name: 'VFit', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VFun', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VLife', level: 2 })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /register as a customer/i })).toHaveAttribute(
      'href',
      '/auth/register?as=customer'
    );
    expect(screen.getByRole('link', { name: /register as a provider/i })).toHaveAttribute(
      'href',
      '/auth/register?as=provider'
    );
    expect(screen.queryByText(/tap to continue/i)).not.toBeInTheDocument();
  });
});
