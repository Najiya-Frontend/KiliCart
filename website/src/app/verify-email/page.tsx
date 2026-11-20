'use client';
import { useEffect, useRef, useState } from 'react';
import { captureToken, postAuth } from '../../lib/auth.mjs';

type State = 'checking' | 'success' | 'invalid' | 'error';
export default function VerifyEmail() {
  const started = useRef(false); const [state, setState] = useState<State>('checking');
  useEffect(() => {
    if (started.current) return; started.current = true;
    const token = captureToken(window.location, window.history);
    if (!token) { setState('invalid'); return; }
    void postAuth('verify-email/confirm', { token }).then((status: number) => setState(status === 200 ? 'success' : status === 400 ? 'invalid' : 'error')).catch(() => setState('error'));
  }, []);
  return <div className="card"><p className="eyebrow">YOUR KILICART ACCOUNT</p><div className={`status-icon ${state}`} aria-hidden="true">{state === 'success' ? '✓' : state === 'checking' ? '✳' : '!'}</div><div aria-live="polite"><h1>{state === 'checking' ? 'Verifying your email' : state === 'success' ? 'Email verified.' : state === 'invalid' ? 'This link has expired.' : 'We couldn’t verify your email.'}</h1><p className="lead">{state === 'checking' ? 'Just a moment while we confirm your email address.' : state === 'success' ? 'Your email address is confirmed. You’re all set for what comes next.' : state === 'invalid' ? 'This link may be invalid, expired, or already used. Request a new verification email to try again.' : 'Something went wrong connecting to KiliCart. Please try again with a new link.'}</p></div><a className="text-link" href="/">Back to KiliCart</a></div>;
}
