import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TORINO_LANDINGS } from '@/lib/seo/torinoLandings';
import { TorinoLandingPage, torinoLandingMetadata } from './TorinoLandingPage';

describe('Torino landing page shell', () => {
  it.each(TORINO_LANDINGS.map((page) => [page.slug, page] as const))(
    'renders %s with its heading, FAQ and internal links',
    (_slug, landing) => {
      const { container } = render(<TorinoLandingPage landing={landing} />);

      expect(screen.getByRole('heading', { level: 1, name: landing.h1 })).toBeInTheDocument();
      landing.faq.forEach((entry) => {
        expect(screen.getByText(entry.question)).toBeInTheDocument();
        expect(screen.getByText(entry.answer)).toBeInTheDocument();
      });
      landing.sections.forEach((section) => {
        expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeInTheDocument();
      });

      // The CTA into the app and the registration path are the two conversions that matter.
      const main = screen.getAllByRole('link', { name: new RegExp(landing.appLabel, 'i') })[0];
      expect(main).toHaveAttribute('href', landing.appHref);

      // Every other landing page is reachable from this one, so no page is orphaned.
      TORINO_LANDINGS.filter((page) => page.slug !== landing.slug).forEach((page) => {
        expect(
          screen.getAllByRole('link', { name: page.h1 }).length
        ).toBeGreaterThan(0);
      });

      const jsonLd = container.querySelector('script[type="application/ld+json"]');
      expect(jsonLd).not.toBeNull();
      const graph = JSON.parse(jsonLd?.textContent ?? '{}')['@graph'] as Array<{ '@type': string }>;
      expect(graph.map((node) => node['@type'])).toEqual(
        expect.arrayContaining(['WebPage', 'BreadcrumbList', 'FAQPage'])
      );
    }
  );

  it('emits a self-referencing canonical and an indexable robots directive', () => {
    const landing = TORINO_LANDINGS[0];
    const metadata = torinoLandingMetadata(landing);

    expect(metadata.alternates?.canonical).toBe(`https://vfit-funlife.web.app/${landing.slug}/`);
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.title).toBe(landing.title);
  });

  it('renders the breadcrumb back to the homepage', () => {
    const landing = TORINO_LANDINGS[0];
    render(<TorinoLandingPage landing={landing} />);

    const breadcrumb = screen.getByRole('navigation', { name: 'Percorso' });
    expect(within(breadcrumb).getByRole('link', { name: 'Vfitfunlife' })).toHaveAttribute('href', '/');
  });
});
