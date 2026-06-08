import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agora Muse — Reddit over Bluesky',
  description:
    'Follow topics, not communities. Intelligent aggregation of Bluesky content powered by in-browser AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-dark">{children}</body>
    </html>
  );
}
