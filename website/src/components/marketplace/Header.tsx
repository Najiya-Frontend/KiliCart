'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from './AuthProvider';
import LocationSelector from './LocationSelector';
import SearchBar from './SearchBar';

export default function Header() {
  const { account, loading, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(current)}`;
  return (
    <header className="site-header">
      <div className="header-main container">
        <Link className="brand" href="/" aria-label="KiliCart home">
          <span className="brand-mark" aria-hidden="true"><span>K</span><i /></span>
          <span className="brand-word">KiliCart<span className="brand-period">.</span><small>Shop Local · Shop Smart</small></span>
        </Link>
        <div className="header-location"><LocationSelector /></div>
        <div className="header-search"><SearchBar /></div>
        <div className="header-account">
          {account ? <><span className="account-greeting">Hi, {account.fullName.split(' ')[0]}</span><button className="account-link" type="button" onClick={() => void signOut()}>Sign out</button></> : <Link className="account-link" href={loginHref}>{loading ? 'Account' : 'Sign in'} <span aria-hidden="true">↗</span></Link>}
        </div>
      </div>
      <div className="header-bottom"><div className="container header-bottom-inner">
        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/categories">Categories</Link><Link href="/products">Products</Link><Link href="/stores">Local stores</Link>
        </nav>
        <div className="mobile-location"><LocationSelector /></div>
        <div className="mobile-search"><SearchBar compact /></div>
        <Link className="seller-note" href="/login?returnTo=%2F">Discover something made nearby <span aria-hidden="true">→</span></Link>
      </div></div>
    </header>
  );
}
