import { useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { externalizeWatermarkValue } from '../../lib/albumLogo';

interface Row { id: string; title: string; owner_id: string; value_bytes: number }

const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + ' MB';

/**
 * Хуучин цомгуудад логог base64 болгож тохиргоонд хадгалсан байдаг (цомог бүр 2–16 MB).
 * Цомог нээх бүрт энэ нь бүтнээрээ татагддаг тул логог жижигрүүлж байршуулаад холбоосоор солино.
 */
export default function AlbumLogoFixPanel() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function load() {
    const { data, error } = await supabase.rpc('albums_with_inline_logos');
    if (error) { setSqlMissing(true); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  async function fixOne(r: Row): Promise<boolean> {
    if (!profile) return false;
    const { data: value, error } = await supabase.rpc('admin_album_watermark_value', { p_album_id: r.id });
    if (error || typeof value !== 'string') { setLog(l => [...l, `✗ ${r.title}: уншиж чадсангүй`]); return false; }
    const res = await externalizeWatermarkValue(value, profile.id, r.id);
    if (!res.changed || res.failed) { setLog(l => [...l, `✗ ${r.title}: лого байршуулж чадсангүй`]); return false; }
    const { error: saveErr } = await supabase.rpc('set_album_watermark_value', { p_album_id: r.id, p_value: res.value });
    if (saveErr) { setLog(l => [...l, `✗ ${r.title}: ${saveErr.message}`]); return false; }
    setLog(l => [...l, `✓ ${r.title}: ${mb(r.value_bytes)} → ${(res.value.length / 1024).toFixed(1)} KB`]);
    return true;
  }

  async function fixAll() {
    if (!rows?.length) return;
    setLog([]);
    for (const r of rows) {
      setBusy(r.id);
      await fixOne(r);
    }
    setBusy(null);
    await load();
  }

  if (!rows || (rows.length === 0 && !sqlMissing && log.length === 0)) return null;

  return (
    <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-5">
      <p className="text-white font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-sky-300" /> Цомгийн том логог засах</p>
      {sqlMissing ? (
        <p className="text-sky-100/70 text-sm mt-1">
          SQL (20261129120000_album_speed.sql) ажиллуулаагүй байна. Supabase SQL Editor дээр ажиллуулсны дараа энд гарна.
        </p>
      ) : (
        <>
          <p className="text-sky-100/70 text-sm mt-1 max-w-3xl">
            {rows.length} цомогт лого base64 хэлбэрээр хадгалагдсан тул цомог нээх бүрт нийт {mb(rows.reduce((s, r) => s + r.value_bytes, 0))} татагдаж удаашруулж байна.
            Логог 600px болгож байршуулаад холбоосоор солино. Тамга, зураг өөрчлөгдөхгүй.
          </p>
          {rows.length > 0 && (
            <ul className="mt-3 text-xs text-stone-300 space-y-0.5">
              {rows.map(r => (
                <li key={r.id} className="flex items-center gap-2">
                  {busy === r.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span className="truncate max-w-[16rem]">{r.title || r.id}</span>
                  <span className="text-stone-500">{mb(r.value_bytes)}</span>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <button onClick={fixAll} disabled={!!busy}
              className="mt-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Бүгдийг засах
            </button>
          )}
          {log.length > 0 && (
            <ul className="mt-3 text-xs space-y-0.5">
              {log.map((l, i) => <li key={i} className={l.startsWith('✓') ? 'text-emerald-300' : 'text-red-300'}>{l}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
