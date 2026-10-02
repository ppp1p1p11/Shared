import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Close the current sheet and open another screen. On web, the sheet's drawer must finish its
 * close animation (it restores the page's scaled background) before the next push.
 */
export function dismissThenPush(href: Href) {
  router.dismiss();
  if (Platform.OS === 'web') setTimeout(() => router.push(href), 450);
  else router.push(href);
}
