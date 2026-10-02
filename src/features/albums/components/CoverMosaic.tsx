import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { MediaImage } from '@/components/media/MediaImage';
import { useColors } from '@/theme/ThemeProvider';

type Tile = { id: string; thumb_path: string | null; thumbhash: string | null };

const GAP = 2;

/** 1 → full bleed · 2 → halves · 3 → hero + two stacked · 4 → hero + three. */
export function CoverMosaic({ tiles, height }: { tiles: Tile[]; height: number }) {
  const c = useColors();
  if (tiles.length === 0) {
    return (
      <View style={[styles.empty, { height, backgroundColor: c.surface }]}>
        <View style={[styles.emptyWell, { backgroundColor: c.accentSoft }]}>
          <Icon name="aperture" size="xl" color="accent" strokeWidth={1.25} />
        </View>
      </View>
    );
  }
  const img = (t: Tile, style: object) => (
    <MediaImage key={t.id} path={t.thumb_path} thumbhash={t.thumbhash} style={style} recyclingKey={t.id} />
  );
  if (tiles.length === 1) return <View style={{ height }}>{img(tiles[0], { flex: 1 })}</View>;
  if (tiles.length === 2) {
    return (
      <View style={[styles.row, { height }]}>
        {img(tiles[0], { flex: 1 })}
        {img(tiles[1], { flex: 1 })}
      </View>
    );
  }
  const rest = tiles.slice(1, 4);
  return (
    <View style={[styles.row, { height }]}>
      {img(tiles[0], { flex: 2 })}
      <View style={{ flex: 1, gap: GAP }}>{rest.map((t) => img(t, { flex: 1 }))}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyWell: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
