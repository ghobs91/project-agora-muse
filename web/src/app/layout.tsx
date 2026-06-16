import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegistrator from '@/components/pwa/PwaRegistrator';

export const metadata: Metadata = {
  title: 'Agora Muse — Reddit over Bluesky',
  description:
    'Follow topics, not communities. Intelligent aggregation of Bluesky content powered by in-browser AI.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Agora Muse',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
    { media: '(prefers-color-scheme: light)', color: '#0b1120' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-dark">
        <PwaRegistrator />
        {children}
      </body>
    </html>
  );
}
