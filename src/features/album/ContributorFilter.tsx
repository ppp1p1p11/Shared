import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { haptics } from '@/lib/haptics';
import { space } from '@/theme/tokens';

export type ContributorFilterValue = 'all' | 'mine' | string;

export function ContributorFilter({
  value,
  onChange,
  people,
}: {
  value: ContributorFilterValue;
  onChange: (v: ContributorFilterValue) => void;
  people: { id: string; name: string; color: number; count: number }[];
}) {
  const { t } = useTranslation();
  const set = (v: ContributorFilterValue) => {
    if (v !== value) haptics.tick();
    onChange(v);
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}
    >
      <Chip label={t('album.everyone')} selected={value === 'all'} onPress={() => set('all')} />
      <Chip label={t('album.onlyMine')} selected={value === 'mine'} onPress={() => set('mine')} />
      {people.map((p) => (
        <Chip
          key={p.id}
          label={p.name}
          selected={value === p.id}
          onPress={() => set(p.id)}
          leading={<Avatar name={p.name} color={p.color} size={20} />}
        />
      ))}
    </ScrollView>
  );
}
