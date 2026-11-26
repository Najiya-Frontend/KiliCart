import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getAccount, login as apiLogin, logout as apiLogout, refreshSession, register as apiRegister } from '@/services/auth';
import type { Account } from '@/services/auth';

type AuthValue = { account: Account | null; loading: boolean; signIn: (email: string, password: string) => Promise<void>; createAccount: (name: string, email: string, password: string) => Promise<void>; signOut: () => Promise<void>; reload: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!await refreshSession()) { setAccount(null); return; }
    setAccount(await getAccount());
  }, []);
  useEffect(() => { let live = true; void reload().catch(() => { if (live) setAccount(null); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [reload]);
  const signIn = useCallback(async (email: string, password: string) => { await apiLogin(email, password); setAccount(await getAccount()); }, []);
  const createAccount = useCallback(async (name: string, email: string, password: string) => { await apiRegister(name, email, password); }, []);
  const signOut = useCallback(async () => { try { await apiLogout(); } finally { setAccount(null); } }, []);
  return <AuthContext.Provider value={{ account, loading, signIn, createAccount, signOut, reload }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error('useAuth requires AuthProvider'); return auth; }
