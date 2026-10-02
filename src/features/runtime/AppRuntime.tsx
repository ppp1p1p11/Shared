import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType, type NetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/features/auth/session';
import { syncBackgroundUploads } from '@/features/upload/background';
import { startUploadEngine } from '@/features/upload/engine';
import { useUploads, type NetworkGate } from '@/features/upload/store';
import { usePrefs } from '@/stores/prefs';
import { AutoSave } from './AutoSave';

function gate(state: NetworkState, wifiOnly: boolean): NetworkGate {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (wifiOnly && state.type !== NetworkStateType.WIFI && state.type !== NetworkStateType.ETHERNET) return 'wifi';
  return 'ok';
}

/** Long-lived invisible services: upload engine, network gating, background registration, auto-save. */
export function AppRuntime() {
  const ready = useAuth((s) => s.status === 'ready');
  const wifiOnly = usePrefs((s) => s.wifiOnlyUploads);

  useEffect(() => {
    if (!ready) return;
    startUploadEngine();
  }, [ready]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const apply = (s: NetworkState) => useUploads.getState().setNetwork(gate(s, wifiOnly));
    getNetworkStateAsync().then(apply).catch(() => {});
    const sub = addNetworkStateListener(apply);
    return () => sub.remove();
  }, [wifiOnly]);

  // Keep the OS background task registered only while there is queued work.
  useEffect(() => {
    const unsub = useUploads.subscribe((s, prev) => {
      if (s.items.length !== prev.items.length) syncBackgroundUploads();
    });
    const app = AppState.addEventListener('change', (st) => st === 'background' && syncBackgroundUploads());
    return () => {
      unsub();
      app.remove();
    };
  }, []);

  return ready ? <AutoSave /> : null;
}
