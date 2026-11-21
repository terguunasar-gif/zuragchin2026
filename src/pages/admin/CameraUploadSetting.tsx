import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CAMERA_SETTING_KEYS } from '../../lib/cameraUploadSettings';

/**
 * «Зураг байршуулах» хуудсын камерын хэсгүүдийг цомог үүсгэсэн хэрэглэгч/зурагчдад харуулах эсэх (зөвхөн супер админ).
 * Админд үргэлж харагдана (тэмдэглэгээтэй).
 */
export default function CameraUploadSetting() {
  const [local, setLocal] = useState(true);
  const [ftp, setFtp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', [CAMERA_SETTING_KEYS.local, CAMERA_SETTING_KEYS.ftp])
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        for (const r of data ?? []) {
          const v = !(r.value === false || r.value === 'false');
          if (r.key === CAMERA_SETTING_KEYS.local) setLocal(v);
          if (r.key === CAMERA_SETTING_KEYS.ftp) setFtp(v);
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('platform_settings').upsert([
      { key: CAMERA_SETTING_KEYS.local, value: local, updated_at: now },
      { key: CAMERA_SETTING_KEYS.ftp, value: ftp, updated_at: now },
    ]);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const Row = ({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) => (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input type="checkbox" checked={checked} disabled={loading} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
      <span>
        <span className="text-sm text-white font-medium">{title}</span>
        <span className="block text-xs text-stone-500">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Camera className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Камераас шууд оруулах хэсгүүд</p>
          <p className="text-stone-500 text-xs mt-0.5">
            «Зураг байршуулах» хуудсанд цомог үүсгэсэн хэрэглэгч, зурагчдад харагдах эсэх. Чагтлаагүй бол тэдэнд нуугдана.
            Танд (админ) үргэлж харагдана.
          </p>
        </div>
      </div>
      <Row checked={local} onChange={setLocal} title="📁 Компьютерийн хавтаснаас шууд"
        desc="Камер → компьютер (FileZilla Server) → хавтас → цомог" />
      <Row checked={ftp} onChange={setFtp} title="📷 Камераас шууд (FTP)"
        desc="Couchdrop → camera-inbox → цомог" />
      <div className="flex items-center gap-3 mt-2">
        <button onClick={save} disabled={saving || loading}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  );
}
