import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand"><Link className="brand" href="/" aria-label="KiliCart home"><span className="brand-mark" aria-hidden="true"><span>K</span><i /></span><span className="brand-word">KiliCart<span className="brand-period">.</span><small>Shop Local · Shop Smart</small></span></Link><p>A thoughtful marketplace for the makers, kitchens and small businesses around us.</p></div>
        <div className="footer-links"><strong>Explore</strong><Link href="/categories">Categories</Link><Link href="/products">Products</Link><Link href="/stores">Local stores</Link></div>
        <div className="footer-links"><strong>Your account</strong><Link href="/login">Sign in</Link><Link href="/register">Create account</Link><Link href="/forgot-password">Password help</Link></div>
      </div>
      <div className="container footer-bottom"><span>© {new Date().getFullYear()} KiliCart</span><span>Made for the way we shop, locally.</span></div>
    </footer>
  );
}
