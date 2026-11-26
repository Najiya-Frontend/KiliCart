import type { Metadata } from 'next';
import { Suspense } from 'react';
import './styles.css';
import '../styles/marketplace.css';
import { AuthProvider } from '../components/marketplace/AuthProvider';
import Header from '../components/marketplace/Header';
import Footer from '../components/marketplace/Footer';

export const metadata: Metadata = {
  title: { default: 'KiliCart | Shop Local · Shop Smart', template: '%s | KiliCart' },
  description: 'Discover thoughtful products from local makers and small businesses.',
  referrer: 'no-referrer',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider><div className="shell"><Suspense fallback={<div className="header-placeholder" aria-hidden="true" />}><Header /></Suspense><main className="main-content">{children}</main><Footer /></div></AuthProvider></body></html>;
}
