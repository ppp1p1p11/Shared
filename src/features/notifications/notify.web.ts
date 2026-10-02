export async function notify(_n: { title: string; body?: string; data?: Record<string, unknown> }) {}
export async function askNotificationPermission() {
  return false;
}
