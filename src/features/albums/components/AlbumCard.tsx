import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AvatarStack } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { formatDateRange } from '@/lib/format';
import type { AlbumSummary } from '@/lib/types';
import { useColors } from '@/theme/ThemeProvider';
import { elevation, radius, space } from '@/theme/tokens';
import { CoverMosaic } from './CoverMosaic';

export function AlbumCard({ album, width }: { album: AlbumSummary; width: number }) {
  const { t } = useTranslation();
  const c = useColors();
  const pending = album.status === 'pending';
  const range = formatDateRange(album.start_date, album.end_date);
  const href = pending ? (`/waiting/${album.id}` as const) : (`/album/${album.id}` as const);
  const mosaicH = Math.round(width * 0.62);

  const meta = [range, pending ? null : t('common.items', { count: album.item_count })].filter(Boolean).join(' · ');

  return (
    <Link href={href} asChild>
      <PressableScale
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={t('home.a11yAlbumCard', {
          name: album.name,
          items: t('common.items', { count: album.item_count }),
          members: t('common.members', { count: album.member_count }),
        })}
        accessibilityHint={pending ? t('home.pending') : undefined}
        style={StyleSheet.flatten([styles.card, elevation.card, { backgroundColor: c.surfaceRaised, borderColor: c.separator }])}
      >
        <Link.AppleZoom>
          <View style={{ height: mosaicH, opacity: pending ? 0.5 : 1 }}>
            <CoverMosaic tiles={album.cover} height={mosaicH} />
          </View>
        </Link.AppleZoom>
        <View style={styles.body}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3" numberOfLines={1}>
              {album.name}
            </Text>
            {pending ? (
              <View style={styles.inline}>
                <Icon name="hourglass" size={14} color="textSecondary" />
                <Text variant="footnote" color="textSecondary">
                  {t('home.pending')}
                </Text>
              </View>
            ) : (
              <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                {meta}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: space[1] }}>
            {!pending && <AvatarStack people={album.members} total={album.member_count} ring={c.surfaceRaised} />}
            {album.pending_count > 0 && (
              <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
                <Text variant="caption" color="accent">
                  {t('home.requests', { count: album.pending_count })}
                </Text>
              </View>
            )}
            {album.is_locked && album.pending_count === 0 && !pending && (
              <View style={styles.inline}>
                <Icon name="lock" size={12} color="textTertiary" />
                <Text variant="caption" color="textTertiary">
                  {t('home.locked')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  body: { flexDirection: 'row', alignItems: 'center', padding: space[4], gap: space[3] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  badge: { paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.pill },
});
