'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Marketplace page error', error.digest); }, [error.digest]);
  return <div className="account-main"><div className="card"><p className="eyebrow">KILICART MARKETPLACE</p><h1>Something went wrong</h1><p className="lead">This page could not be loaded. Please try again.</p><button className="button" type="button" onClick={reset}>Try again</button></div></div>;
}
