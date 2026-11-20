import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/verify-email?token=test-secret' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { render, screen, cleanup, fireEvent, waitFor } = await import('@testing-library/react');
const { default: VerifyEmail } = await import('../src/app/verify-email/page');
const { default: ForgotPassword } = await import('../src/app/forgot-password/page');
const { default: ResetPassword } = await import('../src/app/reset-password/page');
const originalFetch = globalThis.fetch;

test('verification succeeds once and removes token from URL', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.deepEqual(JSON.parse(String(options?.body)), { token: 'test-secret' }); return new Response('{}', { status: 200 }); };
  try { render(<React.StrictMode><VerifyEmail /></React.StrictMode>); assert.ok(await screen.findByText('Email verified.')); assert.equal(calls, 1); assert.doesNotMatch(window.location.href, /test-secret|token=/); }
  finally { cleanup(); globalThis.fetch = originalFetch; }
});
test('invalid verification response shows safe message', async () => {
  window.history.replaceState(null, '', '/verify-email#token=invalid-token');
  globalThis.fetch = async () => new Response('{}', { status: 400 });
  try { render(<VerifyEmail />); assert.ok(await screen.findByText('This link has expired.')); assert.doesNotMatch(document.body.textContent || '', /invalid-token/); }
  finally { cleanup(); globalThis.fetch = originalFetch; }
});
test('reset request sends email and displays generic response', async () => {
  globalThis.fetch = async (url, options) => { assert.match(String(url), /\/auth\/password-reset\/request$/); assert.deepEqual(JSON.parse(String(options?.body)), { email: 'fixture@example.invalid' }); return new Response('{}', { status: 200 }); };
  try { render(<ForgotPassword />); fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fixture@example.invalid' } }); fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!); await waitFor(() => assert.ok(screen.getByText('Check your inbox.'))); }
  finally { cleanup(); globalThis.fetch = originalFetch; }
});
test('reset consumes fragment token and submits the backend contract', async () => {
  window.history.replaceState(null, '', '/reset-password#token=reset-secret');
  globalThis.fetch = async (url, options) => { assert.match(String(url), /\/auth\/password-reset\/confirm$/); assert.deepEqual(JSON.parse(String(options?.body)), { token: 'reset-secret', password: 'a long passphrase' }); return new Response('{}', { status: 200 }); };
  try { render(<ResetPassword />); const password = await screen.findByLabelText('New password'); fireEvent.change(password, { target: { value: 'a long passphrase' } }); fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a long passphrase' } }); fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form')!); assert.ok(await screen.findByText('Password updated.')); assert.doesNotMatch(window.location.href, /reset-secret|token=/); }
  finally { cleanup(); globalThis.fetch = originalFetch; }
});
