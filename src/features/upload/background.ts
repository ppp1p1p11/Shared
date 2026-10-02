import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { drainFor } from './engine';
import { useUploads } from './store';

/**
 * iOS/Android periodic background work. The OS decides when (typically ≥15 min apart, more on
 * charge + Wi-Fi). Each run gets ~30 s, which we spend draining the queue; the chunk in flight
 * is a native URLSession/WorkManager-backed transfer that keeps going after we return.
 */
export const UPLOAD_TASK = 'rolo.upload-queue';

TaskManager.defineTask(UPLOAD_TASK, async () => {
  try {
    await drainFor(25_000);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function syncBackgroundUploads() {
  const pending = useUploads.getState().items.some((i) => i.state !== 'done' && i.state !== 'duplicate' && i.state !== 'failed');
  const registered = await TaskManager.isTaskRegisteredAsync(UPLOAD_TASK);
  if (pending && !registered) await BackgroundTask.registerTaskAsync(UPLOAD_TASK, { minimumInterval: 15 }).catch(() => {});
  if (!pending && registered) await BackgroundTask.unregisterTaskAsync(UPLOAD_TASK).catch(() => {});
}
