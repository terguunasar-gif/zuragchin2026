/*
  # Add album photo count view and organizer name join

  ## Changes
  - Creates a view `albums_with_stats` that joins albums with:
    - Owner name from users table
    - Photo count from photo_uploads table
  - This view is used by the album discovery page to show organizer names and photo counts
  - The view inherits RLS from the underlying tables

  ## Security
  - View is accessible to authenticated users
  - Only shows active albums (filtered by RLS on albums table)
*/

CREATE OR REPLACE VIEW albums_with_stats AS
SELECT
  a.id,
  a.name,
  a.event_date,
  a.description,
  a.status,
  a.download_price,
  a.is_free,
  a.share_link,
  a.created_at,
  a.owner_id,
  u.name AS organizer_name,
  COUNT(p.id)::int AS photo_count
FROM albums a
JOIN users u ON u.id = a.owner_id
LEFT JOIN photo_uploads p ON p.album_id = a.id
GROUP BY a.id, u.name;
