import { useNavigate } from 'react-router-dom';
import { Image, MapPin } from 'lucide-react';
import { PublicAlbum, albumHref } from '../lib/listing';

const FALLBACK = 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop';

/** Нийтлэгдсэн цомгийн карт — нүүр хуудас, «Бүх цомог», зурагчны профайл */
export default function PublicAlbumCard({ album, photographerId }: { album: PublicAlbum; photographerId?: string }) {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(albumHref(album.share_link) + (photographerId ? `?ph=${photographerId}` : ''))} className="group cursor-pointer">
      <div className="relative rounded-2xl overflow-hidden mb-3 aspect-video bg-stone-800">
        <img src={album.cover_url || FALLBACK} alt={album.name} loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-transparent to-transparent" />
        {album.category && (
          <span className="absolute top-3 left-3 bg-stone-950/70 backdrop-blur text-white text-[11px] font-medium px-2 py-1 rounded-lg">{album.category}</span>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{album.name}</p>
            {album.photographers && <p className="text-stone-300 text-xs truncate">{album.photographers}</p>}
          </div>
          {album.price > 0 && (
            <div className="bg-amber-500 text-stone-950 font-bold text-xs px-2.5 py-1 rounded-lg whitespace-nowrap">
              ₮{Math.round(album.price).toLocaleString('en-US')}<span className="font-medium"> / зураг</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-stone-500 text-xs">
        <span className="flex items-center gap-1.5"><Image className="w-3.5 h-3.5" />{album.photo_count} зураг</span>
        {album.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5" />{album.location}</span>}
      </div>
    </div>
  );
}
