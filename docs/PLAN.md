# Rolo — implementation plan

Rolo is a set of private, shared photo albums that people join through a link. There is no sign-up, and every photo and video stays in its original quality.

## Stack (confirmed)

| Concern | Choice | Note |
|---|---|---|
| App | Expo SDK 57, React Native 0.86, TypeScript, Expo Router (routes in `src/app`) | Development build (`expo-dev-client`), not Expo Go |
| Web fallback | Expo Router web (`output: "single"`) | The same `/j/[token]` route serves as the join page. Native-only modules have `.web.ts` shims |
| Backend | Supabase: Postgres, RLS, anonymous auth, Storage (TUS resumable), Realtime | Local stack through the Supabase CLI |
| Server state | TanStack Query | Caching, optimistic updates, and realtime invalidation |
| Client state | Zustand, persisted | Upload queue, preferences, last display name |
| Lists | FlashList v2 | Virtualized grid with sticky day headers |
| Motion | Reanimated 4 and Gesture Handler | Springs. Respects Reduce Motion |
| Media | `expo-media-library` (the new object API), `expo-image-picker`, `expo-image` (thumbhash placeholders), `expo-video`, `expo-image-manipulator`, `expo-file-system` (the `File`/`UploadTask` API) | |
| i18n | i18next, react-i18next, expo-localization | pt-BR and en, with a test that checks both have the same keys |

The brief's suggested libraries were changed in four places:
- **Thumbhash instead of blurhash.** Thumbhash is smaller, keeps the aspect ratio and alpha, and gives better colour. `expo-image` supports it natively, and it encodes in pure JS from a 32px thumbnail.
- **Viewer transition.** Shared-element transitions in Reanimated 4 are still behind an experimental flag. The viewer is therefore a Reanimated overlay that animates from the measured rect of the thumbnail. This works the same on iOS, Android and web.
- **Album card → album.** Uses Expo Router's native `Link.AppleZoom` on iOS 18+ and falls back to a standard push elsewhere.
- **Content hash.** Uses native MD5 plus the byte size, computed by `expo-file-system`. This is used only for dedup, not for security. Hashing a 2 GB video with SHA-256 in JS would block the thread.

## Data model

The full model is in `supabase/migrations/*_init.sql`:

- `profiles` (id, display_name, avatar_color, is_anonymous, plan, nudge_dismissed_at)
- `albums` (…brief fields…, `auto_save` stays per member, `invite_token` of 144 bits in url-safe base64, `invite_expires_at`, `deleted_at`)
- `album_members` (album_id, user_id, role, status `active|pending|removed`, `auto_save`, joined_at)
- `media` (…brief fields…, `thumbhash`, `live_photo_video_path`, status `uploading|processing|ready|hidden`)
- `reports` and `plan_limits`, which holds the configurable free-tier constants
- `owner_storage_usage` view, plus the `get_my_usage()` RPC

All writes that cross trust boundaries go through `SECURITY DEFINER` RPCs:
- `create_album`, which enforces the album limit
- `get_album_preview(token)`, which shows non-members only the name, creator, member count and blurred thumbhashes
- `join_album(token, name)`
- `approve_member`, `remove_member`, `update_album_settings`, `reset_invite_link`
- `begin_upload`, which checks the quota and dedup and creates the media row and storage path
- `finalize_upload`, which runs the moderation hook before the item becomes `ready`
- `delete_my_data`

RLS covers the rest: only active members read an album or its media, and only the uploader or the owner can delete. Storage policies key off the `albums/<album_id>/…` path and the membership tables.

## Screens

- Home (my albums)
- Create album sheet
- Share / QR
- Join (app and web)
- Waiting for approval
- Album grid, with a contributor filter, multi-select, and pinch to change density
- Viewer
- Upload review, with a smart date-range suggestion
- Upload progress sheet
- Album settings and members
- Storage full / Plus paywall
- App settings
- QR scanner

## Phases

1. **Foundation.** Tokens and theme, i18n, router skeleton, migration with RLS, anonymous auth bootstrap, and RLS/RPC tests against the local stack.
2. **Albums core.** Create, home, share/QR, join (link and QR), approval with realtime, and owner controls.
3. **Media.** Upload queue, grid, viewer, and realtime updates:
   - The queue does TUS chunked uploads. Each chunk is a native `UploadTask` in an iOS background session. Uploads can resume after a restart, dedup by content hash, strip GPS, and send Live Photo pairs.
   - Thumbnails and thumbhash are generated on the client.
4. **Save to device.** Single, multi, "all from others", and auto-save.
5. **Limits and settings.** Usage bars, the 80% and 100% states, the paywall, app settings, delete my data, reporting, and the moderation hook.
6. **Polish.** States on every screen, dark mode, accessibility, a seed of 5,000 items, and screenshots taken through the web build in Playwright.

## Platform trade-offs

- **iOS background uploads.** Each chunk is handed to an `NSURLSession` background session, so the chunk in flight finishes even when the app is suspended. Starting the next chunk needs JS, which runs while the app has background time. `expo-background-task` also wakes the app periodically to drain the queue. If the OS kills the app, the queue resumes from the last confirmed TUS offset on the next launch. Nothing is lost, but it is not guaranteed to finish while the app stays closed.
- **Android.** Uploads continue while the process is alive. A foreground service would be the next step; the README covers it.
- **Live Photos.** Both resources are uploaded, and the motion plays on long-press. Saving one back into the camera roll as a *Live Photo* needs `PHAssetCreationRequest` with paired resources, which Expo does not expose, so the still is saved. This is listed as a known limitation.
- **Stripping GPS without re-encoding.** Originals must stay byte-identical apart from the location. The GPS IFD is therefore zeroed in place inside the EXIF/TIFF block, which works for JPEG and HEIC. QuickTime `©xyz` and ISO 6709 location atoms are blanked in videos. Nothing is re-encoded.
