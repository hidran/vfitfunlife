import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://vfit-funlife.web.app'),
  title: {
    default: 'Vfitfunlife | Fitness, Fun & Life',
    template: '%s | Vfitfunlife',
  },
  description:
    'Vfitfunlife connects customers with fitness, events, wellness and beauty services across VFit, VFun and VLife.',
  keywords: [
    'Vfitfunlife',
    'VFit',
    'VFun',
    'VLife',
    'fitness services',
    'wellness services',
    'events and experiences',
    'providers and bookings',
  ],
  alternates: {
    canonical: '/',
    languages: {
      'it-IT': '/',
      'en-US': '/',
      'es-ES': '/',
      'fr-FR': '/',
      'de-DE': '/',
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Vfitfunlife',
    title: 'Vfitfunlife | Fitness, Fun & Life',
    description:
      'Discover and book fitness, events, wellness and beauty services in one place.',
    images: [{ url: '/landing/home.png', width: 414, height: 896, alt: 'Vfitfunlife app preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vfitfunlife | Fitness, Fun & Life',
    description:
      'Discover and book fitness, events, wellness and beauty services in one place.',
    images: ['/landing/home.png'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VFit',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1D29',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background-dark text-text-inverse min-h-screen">
        {/* Set theme before hydration to avoid a flash of the wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('vfit.theme');var s=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:s;}catch(e){document.documentElement.dataset.theme='dark';}})();",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
