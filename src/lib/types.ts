export type JoinMode = 'open' | 'approval';
export type MemberRole = 'owner' | 'member';
export type MemberStatus = 'active' | 'pending' | 'removed';
export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'hidden';
export type MediaKind = 'photo' | 'video';

export type Person = { id: string; display_name: string; avatar_color: number };

export type Album = {
  id: string;
  owner_id: string;
  name: string;
  cover_media_id: string | null;
  start_date: string | null;
  end_date: string | null;
  join_mode: JoinMode;
  is_locked: boolean;
  invite_token: string;
  invite_expiry_hours: 24 | 48 | 168 | null;
  invite_expires_at: string | null;
  keep_location: boolean;
  created_at: string;
};

/** Row from list_my_albums(). */
export type AlbumSummary = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  role: MemberRole;
  status: 'active' | 'pending';
  is_locked: boolean;
  owner_id: string;
  owner_name: string;
  item_count: number;
  member_count: number;
  pending_count: number;
  members: Person[];
  cover: { id: string; thumb_path: string; thumbhash: string | null }[];
};

export type Member = {
  album_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  auto_save: boolean;
  joined_at: string | null;
  requested_at: string;
  profile: { display_name: string; avatar_color: number } | null;
};

export type Media = {
  id: string;
  album_id: string;
  uploader_id: string;
  kind: MediaKind;
  storage_path: string;
  thumb_path: string | null;
  thumbhash: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  size_bytes: number;
  live_photo_video_path: string | null;
  original_filename: string | null;
  captured_at: string;
  status: MediaStatus;
  created_at: string;
};

export type AlbumPreview =
  | { state: 'invalid' }
  | {
      state: 'open' | 'locked' | 'expired';
      album_id: string;
      name: string;
      start_date: string | null;
      end_date: string | null;
      join_mode: JoinMode;
      owner_name: string;
      member_count: number;
      item_count: number;
      my_status: MemberStatus | null;
      cover_thumbhashes: string[];
    };

export type Usage = {
  plan: 'free' | 'plus';
  used_bytes: number;
  limit_bytes: number;
  warn_ratio: number;
  album_count: number;
  album_limit: number | null;
  albums: { album_id: string; name: string; bytes: number }[];
};

export type AlbumStorage = {
  album_bytes: number;
  owner_used_bytes: number;
  owner_limit_bytes: number;
  warn_ratio: number;
};
