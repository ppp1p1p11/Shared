import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { storageProvider } from '@/lib/storage';

/** Inline video: plays when its page is active, pauses otherwise. Streams the original. */
export function VideoPage({ path, localUri, active, width, height }: { path?: string | null; localUri?: string | null; active: boolean; width: number; height: number }) {
  const [uri, setUri] = useState<string | null>(localUri ?? null);
  useEffect(() => {
    if (!localUri && path && active && !uri) storageProvider.downloadUrl(path, 3600).then(setUri).catch(() => {});
  }, [path, localUri, active, uri]);

  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (!uri) return;
    if (active && status === 'readyToPlay') player.play();
    if (!active) player.pause();
  }, [active, status, uri, player]);

  return (
    <View style={{ width, height }} pointerEvents="box-none">
      {uri && <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={active} />}
    </View>
  );
}

/** Live Photo motion, shown only while the user presses and holds. */
export function LiveMotion({ path, playing }: { path: string; playing: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (playing && !uri) storageProvider.downloadUrl(path, 3600).then(setUri).catch(() => {});
  }, [playing, uri, path]);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = false;
    p.muted = false;
  });
  useEffect(() => {
    if (!uri) return;
    if (playing) {
      player.currentTime = 0;
      player.play();
    } else player.pause();
  }, [playing, uri, player]);
  if (!uri || !playing) return null;
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}
