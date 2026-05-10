"use client";

import { useState, useRef } from "react";

export default function PhotographerProfileSettings() {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCoverUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeCover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCoverUrl(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const copyId = () => {
    navigator.clipboard.writeText("ZUR-59092").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", color: "#fff", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Topbar */}
      <div style={{ background: "#161616", padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: "#f59e0b", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Camera icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            Zuragchin<span style={{ color: "#f59e0b" }}>.mn</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#aaa", background: "#222", padding: "6px 14px", borderRadius: 20 }}>
          terguunasar@g...
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, paddingTop: 16 }}>
          {[
            { label: "Миний зураг", val: "—", color: "#f59e0b" },
            { label: "Тооцоо", val: "—", color: "#22c55e" },
            { label: "Хүлээгдэж буй", val: "₮0", color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.val === "—" ? "#fff" : s.color }}>{s.val}</div>
              </div>
              <svg style={{ marginLeft: "auto", color: "#333" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>

        {/* Combined cover + profile section */}
        <div style={{ marginTop: 16, background: "#1a1a1a", border: "1px solid #252525", borderRadius: 12, overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #222" }}>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: "#f59e0b" }}>⬛</span> Профайл болон арын зураг
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Зурагчингийн нүүр хуудсанд харагдах зургууд</div>
          </div>

          <div style={{ padding: "16px 18px" }}>
            {/* Cover zone */}
            <div
              onClick={() => coverInputRef.current?.click()}
              style={{
                width: "100%", height: 160, background: "#111", borderRadius: 10,
                border: "2px dashed #2a2a2a", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", cursor: "pointer",
                position: "relative", overflow: "hidden",
              }}
            >
              {/* Cover image */}
              {coverUrl && (
                <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              )}

              {/* Actions when cover is set */}
              {coverUrl && (
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => coverInputRef.current?.click()} style={{ background: "rgba(0,0,0,0.7)", border: "1px solid #444", borderRadius: 7, padding: "5px 11px", fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    ✏️ Өөрчлөх
                  </button>
                  <button onClick={removeCover} style={{ background: "rgba(0,0,0,0.7)", border: "1px solid #7f1d1d55", borderRadius: 7, padding: "5px 11px", fontSize: 11, color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    🗑 Устгах
                  </button>
                </div>
              )}

              {/* Placeholder */}
              {!coverUrl && (
                <div style={{ textAlign: "center", zIndex: 1 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1e1e1e", border: "1px dashed #444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: 13, color: "#aaa", marginBottom: 3 }}>Арын зураг оруулах</p>
                  <small style={{ fontSize: 11, color: "#555" }}>JPG, PNG, WebP • Дээд тал 10MB</small>
                  <div>
                    <button style={{ marginTop: 10, background: "#f59e0b", color: "#000", fontSize: 11, fontWeight: 700, padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer" }}>
                      ↑ Зураг сонгох
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile avatar row */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 68, height: 68, borderRadius: "50%", border: "3px solid #0d0d0d", background: "#222", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Профайл" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  }
                </div>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, background: "#f59e0b", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #0d0d0d", zIndex: 2 }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </div>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Батаа</div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>Баяр наадам, Спорт</div>
                <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>JPG, PNG, WebP • Дээд тал 5MB</div>
              </div>
            </div>
          </div>
        </div>

        {/* ZUR-ID */}
        <div style={{ marginTop: 12, background: "#1a1a1a", border: "1px solid #252525", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #222" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", display: "flex", alignItems: "center", gap: 7 }}>
              🪪 Зурагчины ID (ZUR-ID)
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Зохион байгуулагч энэ ID-г ашиглан таныг цомогт нэмнэ.</div>
          </div>
          <div style={{ padding: "16px 18px", display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: "#111", border: "1px solid #f59e0b33", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#f59e0b", letterSpacing: 1 }}>
              ZUR-59092
            </div>
            <button onClick={copyId} style={{ background: "#222", border: "1px solid #333", color: copied ? "#22c55e" : "#ccc", borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              {copied ? "✓ Хуулагдлаа" : "⧉ Хуулах"}
            </button>
          </div>
        </div>

        {/* Visibility */}
        <div style={{ marginTop: 12, marginBottom: 24, background: "#1a1a1a", border: "1px solid #252525", borderRadius: 12 }}>
          <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Нүүр хуудсанд харагдах</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Зурагчингуудын жагсаалтад таны профайл харагдана</div>
            </div>
            <div style={{ background: "#14532d", color: "#86efac", fontSize: 11, padding: "6px 14px", borderRadius: 20, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              👁 Харагдаж байна
            </div>
          </div>
        </div>

      </div>

      {/* Hidden file inputs */}
      <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCover} />
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatar} />
    </div>
  );
}
