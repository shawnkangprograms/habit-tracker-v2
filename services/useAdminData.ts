import {useCallback, useEffect, useRef, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {describeAdminError, getAdminDataVersion} from '@/services/admin';

export type AdminLoad<T> =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'ready'; data: T};

// Loads admin data on first focus, and again on focus after any admin write (the data version changed).
// While a reload runs the old data stays on screen. `fetcher` must be a stable function (module level).
export function useAdminData<T>(fetcher: () => Promise<T>) {
  const [load, setLoad] = useState<AdminLoad<T>>({status: 'loading'});
  const loadedVersion = useRef(-1); // adminDataVersion at the last successful load; -1 = never loaded
  const loading = useRef(false); // skip a focus reload while one is already running
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchData = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    const version = getAdminDataVersion();
    fetcher()
      .then((data) => {
        loadedVersion.current = version;
        if (mounted.current) setLoad({status: 'ready', data});
      })
      .catch((err: unknown) => {
        if (mounted.current) setLoad({status: 'error', ...describeAdminError(err)});
      })
      .finally(() => { loading.current = false; });
  }, [fetcher]);

  useFocusEffect(useCallback(() => {
    if (loadedVersion.current !== getAdminDataVersion()) fetchData();
  }, [fetchData]));

  const retry = useCallback(() => {
    setLoad({status: 'loading'});
    fetchData();
  }, [fetchData]);

  return {load, retry};
}
