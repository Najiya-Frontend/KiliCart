import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'KiliCart | Account', description: 'Manage your KiliCart account securely.', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell"><header className="header"><a className="brand" href="/" aria-label="KiliCart home"><span className="brand-icon">K</span><span>KiliCart<span className="brand-dot">.</span></span></a><span className="header-note">ACCOUNT CARE</span></header><main>{children}</main><footer className="footer"><span>© KiliCart</span><span>Made for the way we shop, locally.</span></footer></div></body></html>;
}
