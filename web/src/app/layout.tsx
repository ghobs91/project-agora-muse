import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegistrator from '@/components/pwa/PwaRegistrator';
import AutoLoadLLM from '@/components/llm/AutoLoadLLM';
import MobileDock from '@/components/layout/MobileDock';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

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
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('agora-muse-theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-surface-dark">
        <ThemeProvider>
          <PwaRegistrator />
          <AutoLoadLLM />
          <div className="pb-24 lg:pb-0">
            {children}
          </div>
          <MobileDock />
        </ThemeProvider>
      </body>
    </html>
  );
}
