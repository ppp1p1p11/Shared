import { Image, type ImageContentFit } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useMediaSource } from '@/lib/storage/useMediaSource';
import { useColors } from '@/theme/ThemeProvider';

/**
 * Remote media with an instant thumbhash placeholder. Never a spinner: the blurred colours of
 * the photo show immediately, then the real pixels cross-fade in.
 */
export const MediaImage = memo(function MediaImage({
  path,
  thumbhash,
  localUri,
  contentFit = 'cover',
  style,
  transition = 180,
  priority = 'normal',
  recyclingKey,
  accessibilityLabel,
}: {
  path?: string | null;
  thumbhash?: string | null;
  /** Optimistic local preview (ph://, content://, file://, blob:) while uploading. */
  localUri?: string | null;
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const remote = useMediaSource(localUri ? null : path);
  const source = localUri ? { uri: localUri } : remote;
  return (
    <View style={[styles.wrap, { backgroundColor: c.skeleton }, style]}>
      <Image
        source={source}
        placeholder={thumbhash ? { thumbhash } : undefined}
        placeholderContentFit="cover"
        contentFit={contentFit}
        transition={transition}
        priority={priority}
        recyclingKey={recyclingKey}
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { overflow: 'hidden' } });
