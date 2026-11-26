'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login, postAuth, register, validPassword } from '../../lib/auth.mjs';
import { useAuth } from '../../components/marketplace/AuthProvider';

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const { refreshAccount, loading: sessionLoading } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || sessionLoading) return;
    setBusy(true); setError('');
    try {
      await login(email.trim(), password);
      try { await refreshAccount(); } catch { /* Login succeeded; the in-memory token can load the account on navigation. */ }
      router.replace(returnTo);
      router.refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'We could not sign you in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" maxLength={191} required value={email} onChange={event => setEmail(event.target.value)} />
    <div className="label-row"><label htmlFor="login-password">Password</label><a href="/forgot-password">Forgot password?</a></div><input id="login-password" type="password" autoComplete="current-password" maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} />
    {error && <p role="alert" className="error">{error}</p>}
    <button className="button" disabled={busy || sessionLoading}>{busy ? 'Signing in…' : sessionLoading ? 'Checking session…' : 'Sign in'}</button>
  </form>;
}

export function RegisterForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [complete, setComplete] = useState(false); const [verificationSent, setVerificationSent] = useState(false);
  async function sendVerification() {
    setBusy(true); setError('');
    try { setVerificationSent((await postAuth('verify-email/request', { email: email.trim() })) === 200); }
    catch { setError('We could not request the verification email. Please try again.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError('');
    if (!validPassword(password)) { setError('Use at least 12 characters and no more than 256 UTF-8 bytes.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      setComplete(true);
      try { setVerificationSent((await postAuth('verify-email/request', { email: email.trim() })) === 200); }
      catch { setError('Your request was received, but we could not request a verification email.'); }
      setPassword(''); setConfirm('');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'We could not create your account. Please try again.'); }
    finally { setBusy(false); }
  }
  if (complete) return <div className="auth-complete" aria-live="polite"><span className="auth-success-mark" aria-hidden="true">✓</span><h2>Check your inbox</h2><p>If eligible, KiliCart has received your registration and verification request.</p>{verificationSent ? <p className="success-note">A verification email has been requested.</p> : <button className="button button--outline" type="button" disabled={busy} onClick={() => void sendVerification()}>{busy ? 'Requesting…' : 'Request verification email again'}</button>}{error && <p role="alert" className="error">{error}</p>}<button type="button" className="text-link" onClick={() => router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`)}>Continue to sign in</button></div>;
  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="register-name">Full name</label><input id="register-name" type="text" autoComplete="name" minLength={2} maxLength={191} required value={name} onChange={event => setName(event.target.value)} />
    <label htmlFor="register-email">Email address</label><input id="register-email" type="email" autoComplete="email" maxLength={191} required value={email} onChange={event => setEmail(event.target.value)} />
    <label htmlFor="register-password">Password</label><input id="register-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} /><span className="field-hint">At least 12 characters.</span>
    <label htmlFor="register-confirm">Confirm password</label><input id="register-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={event => setConfirm(event.target.value)} />
    {error && <p role="alert" className="error">{error}</p>}
    <button className="button" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    <p className="form-legal">Creating an account gives you one KiliCart identity for customer and seller features.</p>
  </form>;
}
