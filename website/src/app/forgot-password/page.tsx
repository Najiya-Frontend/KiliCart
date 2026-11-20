'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { postAuth } from '../../lib/auth.mjs';
export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [state, setState] = useState<'idle'|'loading'|'done'|'error'>('idle');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (state === 'loading') return; setState('loading'); try { const status = await postAuth('password-reset/request', { email: email.trim() }); setState(status === 200 ? 'done' : 'error'); } catch { setState('error'); } }
  return <div className="card"><p className="eyebrow">ACCOUNT RECOVERY</p><h1>{state === 'done' ? 'Check your inbox.' : 'Forgot your password?'}</h1><p className="lead">{state === 'done' ? 'If an account exists for that email, we’ve sent instructions to reset your password.' : 'No worries. Enter your email and we’ll help you find your way back.'}</p>{state !== 'done' && <form onSubmit={submit}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={191} value={email} onChange={e => setEmail(e.target.value)} required /><button className="button" disabled={state === 'loading'}>{state === 'loading' ? 'Sending…' : 'Send reset link'}</button>{state === 'error' && <p className="error" role="alert">We couldn’t send your request. Please try again.</p>}</form>}<a className="text-link" href="/">Back to KiliCart</a></div>;
}
