import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/services/api';

export function useResource<T>(loader: () => Promise<T>, key = '') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try { setData(await loader()); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [loader]);
  useEffect(() => { void reload(); }, [reload, key]);
  return { data, loading, refreshing, error, reload };
}
