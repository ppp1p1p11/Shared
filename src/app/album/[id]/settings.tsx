import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DateRangeCalendar } from '@/components/ui/DateRangeCalendar';
import { SheetHeader } from '@/components/ui/Header';
import { ListGroup, ListRow } from '@/components/ui/List';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { UsageBar } from '@/components/ui/UsageBar';
import {
  useAlbum,
  useAlbumStorage,
  useDeleteAlbum,
  useLeaveAlbum,
  useMembers,
  useRemoveMember,
  useResetLink,
  useRespondToRequest,
  useSetAutoSave,
  useUpdateAlbum,
} from '@/features/albums/api';
import { useAuth } from '@/features/auth/session';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatBytes, formatDateRange, formatShortDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { Member } from '@/lib/types';
import { actionSheet, toast } from '@/stores/overlay';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

const onError = (e: unknown) => toast(errorMessage(e), { icon: 'alert', tone: 'danger' });

export default function AlbumSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const userId = useAuth((s) => s.userId);
  const album = useAlbum(id);
  const members = useMembers(id);
  const storage = useAlbumStorage(id);
  const update = useUpdateAlbum(id);
  const reset = useResetLink(id);
  const respond = useRespondToRequest(id);
  const remove = useRemoveMember(id);
  const autoSave = useSetAutoSave(id);
  const leave = useLeaveAlbum(id);
  const del = useDeleteAlbum(id);

  const a = album.data;
  const isOwner = !!a && a.owner_id === userId;
  const me = members.data?.find((m) => m.user_id === userId);
  const active = (members.data ?? []).filter((m) => m.status === 'active');
  const pending = (members.data ?? []).filter((m) => m.status === 'pending');
  const owner = active.find((m) => m.role === 'owner');

  const [name, setName] = useState('');
  const [editDates, setEditDates] = useState(false);
  useEffect(() => {
    if (a) setName(a.name);
  }, [a?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SheetHeader title={t('settingsAlbum.title')} />
        <View style={{ padding: layout.gutter, gap: space[4] }}>
          {[120, 180, 140].map((h, i) => (
            <Skeleton key={i} height={h} rounded={radius.lg} />
          ))}
        </View>
      </View>
    );
  }

  const set = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onError });

  const memberActions = (m: Member) => {
    const who = m.profile?.display_name || t('common.anonymousName');
    actionSheet({
      title: t('settingsAlbum.removeConfirmTitle', { name: who }),
      message: t('settingsAlbum.removeConfirmBody'),
      cancelLabel: t('common.cancel'),
      actions: [
        { label: t('settingsAlbum.removeKeep'), icon: 'userAdd', onPress: () => remove.mutate({ userId: m.user_id, deleteUploads: false }, { onError }) },
        { label: t('settingsAlbum.removeAndDelete'), icon: 'trash', destructive: true, onPress: () => remove.mutate({ userId: m.user_id, deleteUploads: true }, { onError }) },
      ],
    });
  };

  const expiryOptions = [
    { v: null, label: t('settingsAlbum.expiryNever') },
    { v: 24, label: t('settingsAlbum.expiry24') },
    { v: 48, label: t('settingsAlbum.expiry48') },
    { v: 168, label: t('settingsAlbum.expiry168') },
  ] as const;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + space[10] }} keyboardShouldPersistTaps="handled">
      <SheetHeader title={t('settingsAlbum.title')} />
      <Animated.View layout={LinearTransition} style={styles.body}>
        {/* Details */}
        {isOwner ? (
          <View style={{ gap: space[3] }}>
            <TextField
              label={t('settingsAlbum.name')}
              value={name}
              onChangeText={setName}
              maxLength={60}
              onBlur={() => name.trim() && name.trim() !== a.name && set({ name: name.trim() })}
              returnKeyType="done"
            />
            <ListGroup>
              <ListRow
                icon="calendar"
                title={t('settingsAlbum.dates')}
                value={formatDateRange(a.start_date, a.end_date) ?? t('settingsAlbum.noDates')}
                onPress={() => setEditDates((v) => !v)}
                chevron
              />
            </ListGroup>
            {editDates && (
              <Animated.View entering={FadeIn} style={[styles.card, { backgroundColor: c.surface }]}>
                <DateRangeCalendar
                  value={{ start: a.start_date, end: a.end_date }}
                  onChange={(r) => set({ start_date: r.start, end_date: r.end ?? r.start })}
                />
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={{ gap: space[1] }}>
            <Text variant="title2">{a.name}</Text>
            {formatDateRange(a.start_date, a.end_date) && (
              <Text variant="subhead" color="textSecondary">
                {formatDateRange(a.start_date, a.end_date)}
              </Text>
            )}
          </View>
        )}

        {/* Storage */}
        <View style={[styles.card, { backgroundColor: c.surface, gap: space[3] }]}>
          {storage.data ? (
            <UsageBar
              label={a.name}
              used={storage.data.owner_used_bytes}
              limit={storage.data.owner_limit_bytes}
              warnRatio={storage.data.warn_ratio}
              caption={`${t('settingsAlbum.storageAlbum', { size: formatBytes(storage.data.album_bytes) })}. ${t('settingsAlbum.storageCountsOwner')}`}
            />
          ) : (
            <Skeleton height={44} />
          )}
          {isOwner && <Button size="sm" variant="tinted" icon="sparkles" label={t('album.seePlans')} onPress={() => router.push('/paywall')} style={{ alignSelf: 'flex-start' }} />}
        </View>

        {/* Requests */}
        {isOwner && pending.length > 0 && (
          <ListGroup title={t('settingsAlbum.requests')}>
            {pending.map((m) => (
              <ListRow
                key={m.user_id}
                leading={<Avatar name={m.profile?.display_name} color={m.profile?.avatar_color} size={36} />}
                title={m.profile?.display_name || t('common.anonymousName')}
                subtitle={t('settingsAlbum.requestedOn', { date: formatShortDate(m.requested_at) })}
                trailing={
                  <View style={{ flexDirection: 'row', gap: space[1] }}>
                    <Button size="sm" variant="ghost" label={t('settingsAlbum.decline')} onPress={() => respond.mutate({ userId: m.user_id, approve: false }, { onError })} />
                    <Button
                      size="sm"
                      label={t('settingsAlbum.approve')}
                      onPress={() => {
                        haptics.success();
                        respond.mutate({ userId: m.user_id, approve: true }, { onError });
                      }}
                    />
                  </View>
                }
              />
            ))}
          </ListGroup>
        )}

        {/* People */}
        <ListGroup title={`${t('settingsAlbum.members')} · ${active.length}`}>
          {members.isPending ? (
            <ListRow title={t('common.loading')} />
          ) : (
            active.map((m) => {
              const self = m.user_id === userId;
              const label = m.profile?.display_name || t('common.anonymousName');
              return (
                <ListRow
                  key={m.user_id}
                  leading={<Avatar name={m.profile?.display_name} color={m.profile?.avatar_color} size={36} />}
                  title={self ? `${label} (${t('common.you')})` : label}
                  subtitle={m.role === 'owner' ? t('common.owner') : m.joined_at ? t('settingsAlbum.joinedOn', { date: formatShortDate(m.joined_at) }) : undefined}
                  onPress={isOwner && !self ? () => memberActions(m) : undefined}
                  chevron={isOwner && !self}
                />
              );
            })
          )}
        </ListGroup>

        {/* Access */}
        {isOwner ? (
          <>
            <ListGroup title={t('settingsAlbum.access')}>
              <ListRow
                title={t('settingsAlbum.joinOpen')}
                subtitle={t('settingsAlbum.joinOpenHint')}
                checked={a.join_mode === 'open'}
                onPress={() => set({ join_mode: 'open' })}
              />
              <ListRow
                title={t('settingsAlbum.joinApproval')}
                subtitle={t('settingsAlbum.joinApprovalHint')}
                checked={a.join_mode === 'approval'}
                onPress={() => set({ join_mode: 'approval' })}
              />
            </ListGroup>
            <ListGroup footer={t('settingsAlbum.lockHint')}>
              <ListRow
                icon={a.is_locked ? 'lock' : 'unlock'}
                title={t('settingsAlbum.lock')}
                toggle={{
                  value: a.is_locked,
                  onChange: (v) => {
                    haptics.tick();
                    set({ is_locked: v });
                  },
                }}
              />
            </ListGroup>
            <ListGroup title={t('settingsAlbum.expiry')}>
              {expiryOptions.map((o) => (
                <ListRow key={String(o.v)} title={o.label} checked={a.invite_expiry_hours === o.v} onPress={() => set({ invite_expiry_hours: o.v })} />
              ))}
            </ListGroup>
            <ListGroup footer={t('settingsAlbum.resetLinkHint')}>
              <ListRow
                icon="refresh"
                title={t('settingsAlbum.resetLink')}
                onPress={async () => {
                  const ok = await confirm({ title: t('settingsAlbum.resetConfirmTitle'), message: t('settingsAlbum.resetConfirmBody'), confirmLabel: t('settingsAlbum.resetLink'), destructive: true });
                  if (ok) reset.mutate(undefined, { onSuccess: () => toast(t('settingsAlbum.resetDone'), { icon: 'check', tone: 'success', actionLabel: t('common.share'), onAction: () => router.push(`/album/${id}/share`) }), onError });
                }}
              />
            </ListGroup>
            <ListGroup title={t('settingsAlbum.privacy')} footer={t('settingsAlbum.keepLocationHint')}>
              <ListRow icon={a.keep_location ? 'location' : 'locationOff'} title={t('settingsAlbum.keepLocation')} toggle={{ value: a.keep_location, onChange: (v) => set({ keep_location: v }) }} />
            </ListGroup>
          </>
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, gap: space[1] }]}>
            <Text variant="subhead" weight="600">
              {a.join_mode === 'approval' ? t('settingsAlbum.joinApproval') : t('settingsAlbum.joinOpen')}
              {a.is_locked ? ` · ${t('home.locked')}` : ''}
            </Text>
            <Text variant="footnote" color="textSecondary">
              {t('settingsAlbum.ownerOnly', { name: owner?.profile?.display_name || t('common.owner') })}
            </Text>
          </View>
        )}

        {/* On my phone */}
        <ListGroup title={t('settingsAlbum.myPhone')} footer={t('settingsAlbum.autoSaveHint')}>
          <ListRow icon="download" title={t('settingsAlbum.autoSave')} toggle={{ value: !!me?.auto_save, onChange: (v) => autoSave.mutate(v, { onError }) }} />
        </ListGroup>

        {/* Danger zone */}
        <ListGroup>
          {isOwner ? (
            <ListRow
              icon="trash"
              destructive
              title={t('settingsAlbum.deleteAlbum')}
              onPress={async () => {
                const ok = await confirm({ title: t('settingsAlbum.deleteConfirmTitle', { name: a.name }), message: t('settingsAlbum.deleteConfirmBody'), confirmLabel: t('common.delete'), destructive: true });
                if (ok) del.mutate(undefined, { onSuccess: () => router.dismissTo('/'), onError });
              }}
            />
          ) : (
            <ListRow
              icon="logout"
              destructive
              title={t('settingsAlbum.leave')}
              onPress={async () => {
                const ok = await confirm({ title: t('settingsAlbum.leaveConfirmTitle', { name: a.name }), message: t('settingsAlbum.leaveConfirmBody'), confirmLabel: t('settingsAlbum.leave'), destructive: true });
                if (ok) leave.mutate(undefined, { onSuccess: () => router.dismissTo('/'), onError });
              }}
            />
          )}
        </ListGroup>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[6], paddingTop: space[2], width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
  card: { borderRadius: radius.lg, padding: space[4] },
});
