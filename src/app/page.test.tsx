import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('public landing page', () => {
  it('features the Vfitfunlife brand, docs-backed product pillars and role-based registration CTAs', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: /accedi/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: /^registrati$/i })).toHaveAttribute('href', '/auth/register');
    expect(screen.getAllByText('Vfitfunlife').length).toBeGreaterThan(0);
    expect(screen.getByText('#DOitDIFFERENTLY')).toBeInTheDocument();
    expect(screen.getByText(/Connetti, allenati, trasformati/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'VFit', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VFun', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VLife', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Palestre, corsi, personal trainer e allenamenti a casa/i)).toBeInTheDocument();
    expect(screen.getByText(/Eventi, feste, esperienze VR e momenti social/i)).toBeInTheDocument();
    expect(screen.getByText(/Spa, estetica, massaggi e benessere mentale/i)).toBeInTheDocument();

    screen.getAllByRole('link', { name: /registrati come cliente/i }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/auth/register?as=customer');
    });
    screen.getAllByRole('link', { name: /registrati come provider/i }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/auth/register?as=provider');
    });
    expect(screen.getByRole('heading', { name: /Per i clienti/i })).toBeInTheDocument();
    expect(screen.getByText(/Cerca per categoria, prezzo, disponibilità, valutazione e distanza/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Per i professionisti/i })).toBeInTheDocument();
    expect(screen.getByText(/Scegli le categorie, imposta la disponibilità e invia il profilo/i)).toBeInTheDocument();
    expect(screen.getByAltText('Vfitfunlife home screen showing the VFit hub')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /lingua/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /aspetto/i })).toBeInTheDocument();
    expect(screen.queryByText(/tap to continue/i)).not.toBeInTheDocument();
    expect(screen.queryByText('VFitFunLife')).not.toBeInTheDocument();
  });
});
