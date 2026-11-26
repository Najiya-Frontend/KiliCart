'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clearSession, getAccount, logout, refreshSession } from '../../lib/auth.mjs';

type Account = { id: number; email: string; fullName: string; roles: string[] };
type AuthContextValue = { account: Account | null; loading: boolean; refreshAccount: () => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);
  const refreshAccount = useCallback(async () => {
    const current = await getAccount();
    setAccount(current as Account | null);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try { await refreshSession(); await refreshAccount(); }
      catch { clearSession(); setAccount(null); }
      finally { setLoading(false); }
    })();
  }, [refreshAccount]);

  const signOut = useCallback(async () => {
    try { await logout(); } catch { /* Clear the local session even when the API is unreachable. */ }
    finally { clearSession(); setAccount(null); }
  }, []);

  return <AuthContext.Provider value={{ account, loading, refreshAccount, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
