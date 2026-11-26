import type { Metadata } from 'next';
import { LoginForm } from '../../features/customer/AuthForms';
import { safeReturnTo } from '../../lib/auth.mjs';

export const metadata: Metadata = { title: 'Sign in | KiliCart', robots: { index: false, follow: false } };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  return <section className="auth-layout"><div className="auth-aside"><span className="eyebrow">WELCOME BACK</span><h1>Good things are closer than you think.</h1><p>Sign in to continue discovering thoughtful products from local businesses.</p><span className="auth-aside-mark" aria-hidden="true">K</span></div><div className="auth-card"><span className="eyebrow">YOUR KILICART ACCOUNT</span><h2>Sign in</h2><p className="auth-intro">Welcome back. Your marketplace is waiting.</p><LoginForm returnTo={returnTo} /><p className="auth-switch">New to KiliCart? <a href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</a></p></div></section>;
}
