import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { EmptyArt } from '@/components/ui/EmptyArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAlbum } from '@/features/albums/api';
import { AlbumTopBar } from '@/features/album/AlbumTopBar';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatDateRange } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const album = useAlbum(id);

  if (album.isError) {
    const code = errorCode(album.error);
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <EmptyState icon={code === 'offline' ? 'offline' : 'lock'} tone="warning" title={t('album.errorTitle')} body={errorMessage(album.error)}>
          {code === 'offline' ? <Button label={t('common.retry')} variant="secondary" onPress={() => album.refetch()} /> : <Button label={t('join.goHome')} variant="secondary" onPress={() => router.replace('/')} />}
        </EmptyState>
      </View>
    );
  }

  const a = album.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AlbumTopBar albumId={id} title={a?.name ?? ''} subtitle={a ? formatDateRange(a.start_date, a.end_date) ?? undefined : undefined} overPhotos={false} />
      <View style={[styles.center, { paddingTop: insets.top + 56 }]}>
        <EmptyState art={<EmptyArt size={140} />} title={t('album.emptyTitle')} body={t('album.emptyBody')}>
          <Button label={t('album.add')} icon="addPhoto" onPress={() => router.push(`/album/${id}/upload`)} />
          <Button label={t('album.inviteCta')} icon="userAdd" variant="secondary" onPress={() => router.push(`/album/${id}/share`)} />
        </EmptyState>
      </View>
      <View style={{ height: insets.bottom + space[4] }} />
    </View>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center' } });
