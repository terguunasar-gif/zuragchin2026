import { useEffect, useState } from 'react';
import { publicDb } from './supabase';
import { DEFAULT_FREE_PACKAGES, FreePackage, normalizePackages } from './freePackages';
import { DEFAULT_LISTING_PACKAGES, ListingPackage, normalizeListingPackages } from './listing';
import { DEFAULT_GUEST_PACKAGES, GuestPackage, normalizeGuestPackages } from './guestPhotos';
import { ExtendOption, normalizeExtendOptions } from './albumExtend';

/** Нүүр хуудасны «Үнэ, төлбөр» хэсэгт харуулах бүх үнэ — бүгд platform_settings-ээс (админ засна) */
export interface QuotaPackage { code: string; name: string; photos: number; price: number }

export interface SitePricing {
  enabled: boolean;
  photoQuotaFree: number;
  quotaPackages: QuotaPackage[];
  freePackages: FreePackage[];
  listingPackages: ListingPackage[];
  guestPackages: GuestPackage[];
  albumOpenDays: number;
  albumExtendPrice: number;
  albumExtendDays: number;
  extendOptions: ExtendOption[];
  albumLockPrice: number;
  aiBoothPrice: number;
  aiAlbumPrice: number;
  aiVideoEnabled: boolean;
  aiVideoPrice: number;
  albumVideoEnabled: boolean;
  albumVideoPrice: number;
  minPhotoPrice: number;
  downloadDays: number;
  payoutMin: number;
}

export const PRICING_KEYS = [
  'home_pricing_enabled', 'photo_quota_free', 'photo_quota_packages', 'free_packages', 'listing_packages', 'guest_photo_packages',
  'album_open_days', 'album_extend_price', 'album_extend_days', 'album_extend_options', 'album_lock_price',
  'ai_booth_price', 'ai_album_price', 'ai_video_enabled', 'ai_video_price',
  'album_video_enabled', 'album_video_price', 'min_photo_price', 'purchase_download_days', 'payout_min',
] as const;

const num = (v: unknown, d: number) => { const n = Number(typeof v === 'string' ? v : v ?? NaN); return Number.isFinite(n) ? n : d; };
const bool = (v: unknown, d: boolean) => (v === undefined ? d : v === true || v === 'true');

function quotaPackages(v: unknown): QuotaPackage[] {
  if (!Array.isArray(v)) return [{ code: 'p500', name: '+500 зураг', photos: 500, price: 5000 }, { code: 'p2000', name: '+2,000 зураг', photos: 2000, price: 15000 }];
  return v.map((p: Record<string, unknown>) => ({ code: String(p.code ?? ''), name: String(p.name ?? ''), photos: Number(p.photos), price: Number(p.price) }))
    .filter(p => p.photos > 0 && p.price >= 0);
}

export function usePricing(): SitePricing | null {
  const [p, setP] = useState<SitePricing | null>(null);
  useEffect(() => {
    publicDb.from('platform_settings').select('key, value').in('key', [...PRICING_KEYS]).then(({ data }) => {
      const m = Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map(r => [r.key, r.value]));
      setP({
        enabled: bool(m.home_pricing_enabled, true),
        photoQuotaFree: num(m.photo_quota_free, 1000),
        quotaPackages: quotaPackages(m.photo_quota_packages),
        freePackages: m.free_packages ? normalizePackages(m.free_packages) : DEFAULT_FREE_PACKAGES,
        listingPackages: m.listing_packages ? normalizeListingPackages(m.listing_packages) : DEFAULT_LISTING_PACKAGES,
        guestPackages: m.guest_photo_packages ? normalizeGuestPackages(m.guest_photo_packages) : DEFAULT_GUEST_PACKAGES,
        albumOpenDays: num(m.album_open_days, 30),
        albumExtendPrice: num(m.album_extend_price, 10000),
        albumExtendDays: num(m.album_extend_days, 30),
        extendOptions: m.album_extend_options
          ? normalizeExtendOptions(m.album_extend_options)
          : [{ days: num(m.album_extend_days, 30), price: num(m.album_extend_price, 10000) }],
        albumLockPrice: num(m.album_lock_price, 10000),
        aiBoothPrice: num(m.ai_booth_price, 5000),
        aiAlbumPrice: num(m.ai_album_price, 3000),
        aiVideoEnabled: bool(m.ai_video_enabled, true),
        aiVideoPrice: num(m.ai_video_price, 5000),
        albumVideoEnabled: bool(m.album_video_enabled, true),
        albumVideoPrice: num(m.album_video_price, 10000),
        minPhotoPrice: num(m.min_photo_price, 1000),
        downloadDays: num(m.purchase_download_days, 14),
        payoutMin: num(m.payout_min, 10000),
      });
    });
  }, []);
  return p;
}
