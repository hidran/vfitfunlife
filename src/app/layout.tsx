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

const SITE_URL = 'https://vfit-funlife.web.app';
const SITE_NAME = 'Vfitfunlife';
const SITE_DESCRIPTION =
  'Prenota palestre, corsi, personal trainer, eventi, spa e trattamenti di bellezza. ' +
  'Vfitfunlife è il marketplace italiano di fitness, divertimento e benessere.';
const SITE_TITLE = 'Vfitfunlife | Palestre, personal trainer, eventi e benessere';
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Vfitfunlife',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: 'fitness',
  keywords: [
    // Brand, including the spellings people actually type.
    'Vfitfunlife',
    'Vfit Fun Life',
    'vfit-funlife',
    'VFit',
    'VFun',
    'VLife',
    // Italian discovery terms the product is built around.
    'palestre',
    'corsi fitness',
    'lezioni di gruppo',
    'personal trainer',
    'allenamento a domicilio',
    'fitness online',
    'eventi',
    'feste',
    'esperienze VR',
    'spa',
    'benessere',
    'massaggi',
    'estetica',
    'centri estetici',
    'prenotazione servizi fitness',
    'marketplace fitness Italia',
    'app fitness Italia',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  // No `alternates.canonical` here: metadata is inherited by every route, so a"/" here
  // made every page canonicalise to the homepage (the category pages were duplicates
  // of `/`). Public pages declare their own canonical; the rest use the URL Google finds.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'it_IT',
    alternateLocale: ['en_US', 'es_ES', 'fr_FR', 'de_DE'],
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/landing/home.png', width: 414, height: 896, alt: 'Vfitfunlife app preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/landing/home.png'],
  },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION from Search Console to emit the meta tag;
  // without it the tag is simply absent (see .env.example).
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
  manifest: '/manifest.json',
  // Generated from resources/brand/vfit-mark.svg by scripts/generate-brand-assets.mjs.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vfitfunlife',
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
        {/* Staging only: hide the page until StagingGate has decided whether this visitor may
            see it (allowlisted) or is being sent to production — no flash of app content.
            Hostname-based, like the gate itself; StagingGate also has a reveal failsafe. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(location.hostname.indexOf('vfit-app-staging.')===0){document.documentElement.setAttribute('data-staging-gate','pending');}}catch(e){}})();",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
