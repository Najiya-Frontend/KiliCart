import type { Metadata } from 'next';
import { RegisterForm } from '../../features/customer/AuthForms';
import { safeReturnTo } from '../../lib/auth.mjs';

export const metadata: Metadata = { title: 'Create an account | KiliCart', robots: { index: false, follow: false } };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function RegisterPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  return <section className="auth-layout"><div className="auth-aside auth-aside--register"><span className="eyebrow">MAKE IT PERSONAL</span><h1>A marketplace with a little more meaning.</h1><p>One account makes it easy to explore local makers and keep your KiliCart journey together.</p><span className="auth-aside-mark" aria-hidden="true">K</span></div><div className="auth-card"><span className="eyebrow">JOIN KILICART</span><h2>Create your account</h2><p className="auth-intro">A few details and you’re on your way.</p><RegisterForm returnTo={returnTo} /><p className="auth-switch">Already have an account? <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</a></p></div></section>;
}
