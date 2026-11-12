import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, ThumbsDown, ThumbsUp, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** Админ → Чатбот (update-92): тохиргоо, нэмэлт мэдлэг, хэрэглэгчдийн асуултууд */

interface Row {
  id: string; created_at: string; question: string; answer: string | null; path: string | null;
  lang: string | null; helpful: boolean | null; error: string | null; user_id: string | null;
}
type Filter = 'all' | 'bad' | 'error';

const KEYS = ['help_bot_enabled', 'help_bot_notes', 'help_bot_hourly_limit', 'help_bot_daily_cap'];

export default function AdminHelpBotTab() {
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState('');
  const [hourly, setHourly] = useState(30);
  const [daily, setDaily] = useState(3000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [stats, setStats] = useState<{ today: number; week: number; bad: number; good: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('platform_settings').select('key, value').in('key', KEYS).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
      setEnabled(m.help_bot_enabled !== false && m.help_bot_enabled !== 'false');
      setNotes(typeof m.help_bot_notes === 'string' ? m.help_bot_notes : '');
      setHourly(Number(m.help_bot_hourly_limit ?? 30) || 30);
      setDaily(Number(m.help_bot_daily_cap ?? 3000) || 3000);
    });
    loadStats();
  }, []);

  useEffect(() => { loadRows(); }, [filter]);

  async function loadRows() {
    setLoading(true);
    let q = supabase.from('help_bot_messages')
      .select('id, created_at, question, answer, path, lang, helpful, error, user_id')
      .order('created_at', { ascending: false }).limit(100);
    if (filter === 'bad') q = q.eq('helpful', false);
    if (filter === 'error') q = q.not('error', 'is', null);
    const { data, error: err } = await q;
    if (err) setError(err.message.includes('help_bot_messages') ? 'SQL (20261119120000_help_bot.sql) ажиллуулаагүй байна.' : err.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  async function loadStats() {
    const day = new Date(Date.now() - 86400_000).toISOString();
    const week = new Date(Date.now() - 7 * 86400_000).toISOString();
    const c = (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => f(base()).then(r => r.count ?? 0);
    function base() { return supabase.from('help_bot_messages').select('id', { count: 'exact', head: true }); }
    const [today, w, bad, good] = await Promise.all([
      c(q => q.gte('created_at', day)), c(q => q.gte('created_at', week)),
      c(q => q.gte('created_at', week).eq('helpful', false)), c(q => q.gte('created_at', week).eq('helpful', true)),
    ]);
    setStats({ today, week: w, bad, good });
  }

  async function save() {
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('platform_settings').upsert([
      { key: 'help_bot_enabled', value: enabled, updated_at: now },
      { key: 'help_bot_notes', value: notes.trim(), updated_at: now },
      { key: 'help_bot_hourly_limit', value: Math.max(1, Math.round(hourly)), updated_at: now },
      { key: 'help_bot_daily_cap', value: Math.max(10, Math.round(daily)), updated_at: now },
    ]);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function purge() {
    if (!confirm('90 хоногоос хуучин асуултуудыг устгах уу?')) return;
    const { data, error: err } = await supabase.rpc('help_bot_purge_old', { p_days: 90 });
    if (err) { alert(err.message); return; }
    alert(`${data ?? 0} мөр устлаа`);
    loadRows(); loadStats();
  }

  return (
    <div className="space-y-6">
      {/* Тохиргоо */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-amber-400" />
          <h3 className="text-white font-semibold">Туслах чатбот</h3>
        </div>
        <p className="text-stone-500 text-xs mb-4">
          Сайтын бүх хуудасны буланд «Туслах» товч гарна. Хариултыг Gemini өгнө; үнийг «Платформ» табын тохиргооноос автоматаар авна.
        </p>

        <label className="flex items-center gap-3 mb-4 cursor-pointer w-fit">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          <span className="text-white text-sm">Чатбот идэвхтэй</span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-stone-400 text-xs">Нэг хүн (IP) цагт хамгийн ихдээ хэдэн асуулт</span>
            <input type="number" min={1} value={hourly} onChange={e => setHourly(Number(e.target.value))}
              className="mt-1 w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </label>
          <label className="block">
            <span className="text-stone-400 text-xs">Нийт өдөрт хамгийн ихдээ (зардлын хязгаар)</span>
            <input type="number" min={10} value={daily} onChange={e => setDaily(Number(e.target.value))}
              className="mt-1 w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </label>
        </div>

        <label className="block">
          <span className="text-stone-400 text-xs">Нэмэлт мэдлэг / засвар (бот үүнийг гарын авлагаас илүүд үзнэ)</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 8000))} rows={7}
            placeholder={'Жишээ:\n- Шинэ жилийн хямдрал: 12-р сарын 20–31-нд AI бүүт 4,000₮.\n- «Цомог устгасан, сэргээж болох уу?» → Үгүй, устгасан цомог сэргэхгүй.'}
            className="mt-1 w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-600 outline-none font-mono" />
          <span className="text-stone-600 text-[11px]">{notes.length}/8000 · Энэ текст нийтэд нээлттэй тохиргоонд хадгалагдана — нууц мэдээлэл бүү бич. Өөрчлөлт 5 минутын дотор ботод тусна.</span>
        </label>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <button onClick={save} disabled={saving}
          className="mt-4 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
        </button>
      </div>

      {/* Статистик */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Сүүлийн 24 цаг', stats.today],
            ['Сүүлийн 7 хоног', stats.week],
            ['👍 (7 хоног)', stats.good],
            ['👎 (7 хоног)', stats.bad],
          ].map(([l, v]) => (
            <div key={l as string} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-stone-500 text-xs">{l}</p>
              <p className="text-white text-2xl font-bold">{v as number}</p>
            </div>
          ))}
        </div>
      )}

      {/* Асуултууд */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <h3 className="text-white font-semibold mr-auto">Хэрэглэгчдийн асуултууд</h3>
          {([['all', 'Бүгд'], ['bad', '👎 Тус болоогүй'], ['error', 'Алдаа']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${filter === k ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/10 text-stone-300 hover:bg-white/5'}`}>{l}</button>
          ))}
          <button onClick={() => { loadRows(); loadStats(); }} title="Шинэчлэх" className="p-1.5 rounded-lg border border-white/10 text-stone-300 hover:bg-white/5"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={purge} title="90 хоногоос хуучныг устгах" className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        <p className="text-stone-500 text-xs mb-3">👎 авсан асуултыг уншиж, зөв хариултыг дээрх «Нэмэлт мэдлэг»-т нэмбэл бот дараа нь зөв хариулна.</p>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
        ) : rows.length === 0 ? (
          <p className="text-stone-500 text-sm py-8 text-center">Асуулт алга.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map(r => (
              <div key={r.id} className="py-3">
                <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="w-full text-left flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0">
                    {r.error ? <AlertTriangle className="w-4 h-4 text-red-400" />
                      : r.helpful === true ? <ThumbsUp className="w-4 h-4 text-emerald-400" />
                      : r.helpful === false ? <ThumbsDown className="w-4 h-4 text-red-400" />
                      : <MessageCircle className="w-4 h-4 text-stone-600" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-white text-sm block">{r.question}</span>
                    <span className="text-stone-500 text-[11px]">
                      {new Date(r.created_at).toLocaleString('mn-MN')} · {r.path || '/'} · {r.lang || 'mn'}{r.user_id ? ' · нэвтэрсэн' : ''}
                    </span>
                  </span>
                </button>
                {openId === r.id && (
                  <div className="mt-2 ml-7 bg-stone-900 border border-white/10 rounded-lg p-3 text-sm text-stone-300 whitespace-pre-wrap">
                    {r.error ? <span className="text-red-300 font-mono text-xs">{r.error}</span> : r.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
