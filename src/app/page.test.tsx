import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('public landing page', () => {
  it('features the Vfitfunlife brand, docs-backed product pillars and role-based registration CTAs', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: /^sign up$/i })).toHaveAttribute('href', '/auth/register');
    expect(screen.getAllByText('Vfitfunlife').length).toBeGreaterThan(0);
    expect(screen.getByText('#DOitDIFFERENTLY')).toBeInTheDocument();
    expect(screen.getByText(/Connect, train, transform/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'VFit', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VFun', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VLife', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Gyms, classes, personal trainers and home workouts/i)).toBeInTheDocument();
    expect(screen.getByText(/Events, parties, VR experiences and social moments/i)).toBeInTheDocument();
    expect(screen.getByText(/Spa, aesthetics, massage and mental wellness/i)).toBeInTheDocument();

    screen.getAllByRole('link', { name: /register as a customer/i }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/auth/register?as=customer');
    });
    screen.getAllByRole('link', { name: /register as a provider/i }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/auth/register?as=provider');
    });
    expect(screen.getByRole('heading', { name: /For customers/i })).toBeInTheDocument();
    expect(screen.getByText(/Search by category, price, availability, rating and distance/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /For providers/i })).toBeInTheDocument();
    expect(screen.getByText(/Choose service categories, set availability and submit for verification/i)).toBeInTheDocument();
    expect(screen.getByAltText('Vfitfunlife home screen showing the VFit hub')).toBeInTheDocument();
    expect(screen.queryByText(/tap to continue/i)).not.toBeInTheDocument();
    expect(screen.queryByText('VFitFunLife')).not.toBeInTheDocument();
  });
});
