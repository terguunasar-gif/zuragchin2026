// help-bot — сайтын ухаалаг туслах (update-92)
// Хэрэглэгч / зурагчин / зохион байгуулагч «хаана, яаж хийх вэ» гэж асуухад
// сайтын замыг (линк) зааж, хийх алхмыг хэлнэ.
//
// Нэг файлтай (Supabase Dashboard-ын Code засварлагчаар ч deploy хийж болно).
// Мэдлэгийг засах: supabase/functions/help-bot/knowledge.md → `node scripts/build-help-bot.mjs`
//
// Secrets: GEMINI_API_KEY (аль хэдийн байгаа), HELP_BOT_MODEL (заавал биш)
// Deploy:  supabase functions deploy help-bot --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Эхнийх нь ажиллахгүй (загвар хаагдсан г.м.) бол дараагийнхыг оролдоно.
const MODEL_CHAIN = [
  Deno.env.get("HELP_BOT_MODEL") ?? "",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter((m, i, a) => m && a.indexOf(m) === i);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// <KNOWLEDGE> — scripts/build-help-bot.mjs энэ хэсгийг knowledge.md-ээс дахин үүсгэнэ
const KNOWLEDGE = "# Zuragchin.mn — сайтын гарын авлага (чатботын мэдлэг)\n\n\n## Ерөнхий\n- Zuragchin.mn нь арга хэмжээний зургийн платформ. Зохион байгуулагч цомог үүсгэнэ, зурагчид зураг оруулна, зочид линкээр орж зургаа олж худалдан авна эсвэл үнэгүй татна.\n- Үүрэг: Худалдан авагч (бүх хэрэглэгч), Зурагчин, Зохион байгуулагч, Админ. Бүртгүүлэхэд «Худалдан авагч» байна.\n- Нэвтрэх: /auth/login (Google-ээр эсвэл имэйлээр). Бүртгүүлэх: /auth/register. Нууц үг мартсан: /auth/forgot-password.\n- Хяналтын самбар: /dashboard. Дээд талд үүргийн табууд: «Худалдан авагч», «Зурагчин», «Зохион байгуулагч».\n- Цэс (нүүр хуудасны дээд хэсэг): Гэрэл зурагчид (/photographers), Гэрэл зургийн студи (/studios), Зургийн цомгууд (/explore), AI загвар (/ai-booth), Холбоо барих (/contact).\n- Бүх төлбөрийг QPay-ээр (банкны апп-аар QR уншуулж) төлнө. Компьютер дээр бол утасныхаа банкны апп-аар дэлгэц дээрх QR-ыг уншуулна. Гадаад карт одоогоор боломжгүй.\n- Messenger/Facebook доторх хөтчөөр орсон бол ••• → «Chrome / Safari-д нээх» гэж нээвэл зураг хадгалах, худалдан авалт найдвартай.\n- Хэл солих: цомгийн хуудасны дээд буланд «Хэл» (Монгол, Русский, 中文, English).\n\n## Зурагчин / Зохион байгуулагч болох\n- /dashboard → баруун дээд талын «Зурагчин болох» эсвэл «Зохион байгуулагч болох» товч. Дарахад үүрэг шууд нэмэгдэнэ.\n- Хоёуланг нь нэг дор авч болно; самбарын табаар хооронд нь шилжинэ.\n\n## Цомог үүсгэх (зохион байгуулагч)\n- /dashboard → «Шинэ цомог» (эсвэл /dashboard/albums/create).\n- Бөглөх хэсгүүд: Үндсэн мэдээлэл (Цомгийн нэр, Арга хэмжээний огноо, Төлөв, Тайлбар) → Орлогын загвар («Зурагчинтай хуваах» эсвэл «Бүрэн өмчлөх») → Зурагчин нэмэх (зурагчны ZUR-ID-ээр) → Усан тэмдэг (Текст, Лого/зураг, Битүү давтагдах тамга) → Үнэлгээ → Холбоо барих мэдээлэл.\n- Үнэлгээ хэсэгт хоёр горим:\n  - «Худалдах» — зочид зураг худалдаж авна, усан тэмдэг автоматаар тавигдана.\n  - «Үнэгүй хуваалцах» — зочид эх зургийг үнэгүй татна, сайт зөвхөн багцын төлбөр авна. Цомгоо үүсгээд зургаа оруулсны дараа самбар дээрх «🎁 Багц сонгож идэвхжүүлэх» товчоор багц сонгож QPay-ээр төлнө (/dashboard/albums/<id>/activate). Идэвхжүүлэх хүртэл зочид цомгийг харахгүй. Нэг цомогт нэг удаа үнэгүй туршилтын багц байна.\n- «Битүү тамга» анхдагчаар унтраалттай; хүсвэл өөрөө асаана.\n\n## Миний цомгууд — самбарын цомгийн карт\n/dashboard → «Зохион байгуулагч» таб → «Миний цомгууд». Карт бүрийн доод мөрөнд товчнууд (зүүнээс баруун тийш):\n- ✏️ (харандаа) — Цомог засах (/dashboard/albums/<id>/edit): нэр, огноо, тайлбар, Төлөв, үнэ, усан тэмдэг, зурагчдыг засна.\n- «Зураг нэмэх» — зураг байршуулах (/dashboard/albums/<id>/upload).\n- 📁 (хавтас) — «Зураг ба хавтас удирдах» (/dashboard/albums/<id>/photos).\n- «Харах» — зочдод харагдах цомгийн хуудас.\n- ✨ — AI бүүт тохиргоо (/dashboard/albums/<id>/ai-booth).\n- QR — цомгийн линк, QR код. Энэ цонхонд мөн «Цомгийг кодоор түгжих» болон «Зочдын зураг» тохиргоо байна.\n- 🗑 — цомог устгах (бүх зураг устна, буцаахгүй).\nКартын дээд хэсэгт: төлөв (Ноорог / Идэвхтэй / Хаагдсан), «N хоног үлдлээ · Хугацаа сунгах», худалдах цомог бол «📣 Нүүр хуудсанд нийтлэх», үнэгүй цомог бол «🎁 Багц сонгож идэвхжүүлэх».\n\n## Цомгийн төлөв\n- Ноорог — бэлтгэж байгаа, зочдод нээгдээгүй. Идэвхтэй — зочид үзнэ. Хаагдсан — зочдод хаалттай.\n- Өөрчлөх: самбар → цомгийн карт дээрх ✏️ → «Төлөв» → сонгоод хадгална.\n\n## Цомгийн линк хуваалцах\n- Самбар → цомгийн карт дээрх QR товч → «Хуулах» эсвэл QR-ыг татаж хуваалцана. Линк: zuragchin.mn/album/<id>.\n- LED дэлгэц / зурагт дээр слайдшоу: цомгийн линкийн ард /screen нэмнэ (zuragchin.mn/album/<id>/screen). Буланд нь цомгийн QR гарна, үнэ харагдахгүй.\n\n## Цомгийг кодоор түгжих\n- Самбар → цомгийн карт → QR товч → «Цомгийг кодоор түгжих». Нэг цомогт нэг удаа төлнө, дараа нь 4 оронтой кодоо хүссэнээрээ сольж, асааж унтрааж болно. Унтраалттай үед линктэй хэн ч үзнэ.\n- Зочин цомог руу орох бүрд код асууна. Түгжээтэй цомог нүүр хуудсанд харагдахгүй.\n\n## Зочдын зураг (зочид өөрсдөө зураг оруулах)\n- Самбар → цомгийн карт → QR товч → «Зочдын зураг». Багц сонгож нэг удаа төлнө. Зочид утсаараа авсан зургаа цомогт үнэгүй хуваалцана; эдгээр зураг зарагдахгүй. Оруулалтыг түр зогсоож болно.\n\n## Цомгийн хугацаа ба сунгалт\n- Цомог арга хэмжээнээс хойш тодорхой хоног (үнийн хэсгийг үз) нээлттэй. Сүүлийн 7 хоногт сануулга гарна.\n- Сунгах: самбар → цомгийн карт → «Хугацаа сунгах» (эсвэл «Хугацаа дууссан · Сунгах →») → хугацаа сонгож QPay. Үлдсэн хоног дээр нэмэгдэнэ.\n- Хугацаа дууссан цомгийг зочин ч цомгийн линк дээрээс төлж сунгаж болно.\n- Хаагдсанаас хойш тодорхой хоногт сунгаагүй бол зургууд бүрмөсөн устна.\n- Админ ямар ч цомгийн хугацааг гараар сунгаж чадна — шаардлагатай бол /contact-оор холбогдоно.\n\n## Нүүр хуудсанд нийтлэх (/explore, нүүрний «Зургийн цомгууд»)\n- Зөвхөн «Худалдах» горимын, идэвхтэй, хугацаа дуусаагүй, зурагтай цомог.\n- Самбар → цомгийн карт → «📣 Нүүр хуудсанд нийтлэх» (эсвэл ✏️ Цомог засах хуудасны дээд талын «📣 Нүүр хуудсанд нийтлэх») → 1. Ангилал, байршил, нүүр зураг сонгоод «Мэдээлэл хадгалах» → 2. Хугацаа сонгож QPay-ээр төлнө. Төлмөгц автоматаар гарна. Дахин төлбөл одоогийн хугацаан дээр нэмэгдэнэ.\n- Нүүр хуудаснаас НУУХ/хасах: эзэнд тусдаа «нуух» товч байхгүй. Арга замууд:\n  1. Хугацаа нь дуусахыг хүлээх — нийтлэлийн хугацаа дуусахад автоматаар буурна.\n  2. Самбар → цомгийн карт → ✏️ → «Төлөв»-ийг «Ноорог» эсвэл «Хаагдсан» болгож хадгалах — тэр даруй нүүр хуудаснаас алга болно. Гэхдээ зочид цомгийг үзэх боломжгүй болно (буцааж «Идэвхтэй» болгоход дахин гарна, нийтлэлийн хугацаа дуусаагүй бол).\n  3. Цомгийг кодоор түгжих (QR товч → «Цомгийг кодоор түгжих») — цомог нүүрээс нуугдана, кодтой хүмүүс л үзнэ.\n  4. Админд хандах (/contact) — админ «Цомгууд» таб дээрээс «Нуух» дарна.\n- Нийтлэлийг админ хаасан бол нийтлэх хуудсанд «админ хаасан» гэж гарна — админтай холбогдоно.\n\n## Зураг оруулах (зурагчин, эзэн)\n- Самбар → цомгийн карт → «Зураг нэмэх» (/dashboard/albums/<id>/upload). Хавтас сонгох/шинээр үүсгэх, зургаа чирж оруулах эсвэл дарж сонгох. JPG, PNG, WebP, нэг файл 20MB хүртэл.\n- Цомгийн зургийн үнэгүй хязгаар бий; хэтэрвэл илүү зургийг QPay-ээр төлсний дараа нэмнэ (хуудсан дээр үлдсэн эрх харагдана).\n- Хуудсаа хаалгүй хүлээнэ.\n\n## Зураг ба хавтас удирдах (/dashboard/albums/<id>/photos — самбарын 📁 товч)\n- Хавтас үүсгэх, нэр солих, устгах; зургийг хавтас руу зөөх эсвэл «Хавтасгүй болгох».\n- Зураг бүрт татах үнэ тавих: зураг доорх ₮ дээр дарж засна, ↺ = цомгийн үнэ рүү буцаах. Олон зургийг ☐-ээр сонгоод «Үнэ тавих». Доод үнэ бий.\n- Зураг нэр өгөх («+ Нэр өгөх») — нүүр хуудасны хайлтаар олдоно.\n- «Үнэ ба үнийн санал» хэсэг: санал хүлээн авах эсэх, «X%-иас дээш саналыг автоматаар зөвшөөрөх». «Ирсэн саналууд →».\n- «Царайгаар хайх» асаах/унтраах, «Царай уншуулах» — зочид selfie-ээр өөрсдийн зургаа олдог болно.\n- Зураг устгах, нуух.\n- «🛡️ Зургаа хулгайлахаас хамгаалах» тайлбар.\n\n## Үнийн санал (зурагчин)\n- Самбар → «Үнийн санал (хариулаагүй)» карт → /dashboard/offers: Зөвшөөрөх / Татгалзах / Эсрэг үнэ санал болгох. Тодорхой цагийн дотор хариулна.\n- Мөн тэнд «Зураг шалгах» — олдсон файлаа оруулахад худалдсан захиалгын дугаар (ZM-…) гарна.\n\n## Угаалгах (хэвлэх) хүсэлт\n- Зочин цомог дээр зураг сонгоод «Угаалгуулах» → хэмжээ, тоо, нэр, утас илгээнэ. Одоо төлбөр төлөхгүй.\n- Зохион байгуулагч/зурагчин: самбар → «Угаалгах хүсэлт (шинэ)» карт → /dashboard/print-requests. Төлөвийг Шинэ / Холбогдсон / Хүлээлгэж өгсөн / Цуцалсан болгоно. Тооцоог хоорондоо хийнэ.\n\n## Зурагчин цомогт нэгдэх\n- Арга 1: зохион байгуулагч цомог үүсгэх/засах үед зурагчны ZUR-ID-ийг нэмнэ (шууд зөвшөөрөгдөнө). Зурагчны ZUR-ID: самбар → «Зурагчин» таб → профайл хэсэгт.\n- Арга 2: зурагчин /albums («Цомог хайх») хуудсанд цомог хайж «Зурагчнаар нэгдэх» → «Хүсэлт илгээх». Зохион байгуулагч самбар → «Хүлээгдэж буй хүсэлт» карт → /dashboard/requests-ээс зөвшөөрнө.\n\n## Зурагчны профайл\n- Самбар → «Зурагчин» таб → доош гүйлгэхэд профайл: профайл ба арын зураг, Дэлгэцийн нэр, Байршил, Танилцуулга, Утас, Мэргэшил, портфолио. «Нүүр хуудсанд харагдах» асаавал /photographers жагсаалтад гарна.\n\n## Орлого ба мөнгө татах\n- Самбар → «Татах боломжтой · Мөнгө татах →» карт → /dashboard/wallet. Банк сонгож, дансны эзний нэр, дүн оруулаад «Мөнгө татах» хүсэлт илгээнэ. Админ шилжүүлмэгц «Олгосон» болно (ихэвчлэн 1–2 ажлын өдөр). Доод дүн бий.\n- Борлуулалтын задаргаа: самбар → Зурагчин эсвэл Зохион байгуулагч таб → борлуулалтын хэсэг.\n- Сайтын шимтгэл 3%, QPay 1%. Орлогын хуваарилалт цомгийн «Орлогын загвар»-аас хамаарна.\n\n## AI бүүт (зохион байгуулагч)\n- Самбар → цомгийн карт → ✨ → «AI бүүт идэвхтэй» асаах, лого, логоны байрлал, арга хэмжээний нэр (зураг дээр), темплет сонгох → «Хадгалах».\n- «Постер хэвлэх» — QR-тай A4 постер. Утасны линк ба Kiosk дэлгэцийн линк (?kiosk=1, Chrome бүтэн дэлгэцээр).\n- Зочин: QR уншуулна → темплет сонгоно → QPay → 1–4 хүн зургаа дарна → AI зураг утсанд ирнэ. 1 төлбөр = 1 зураг; AI алдаа гарвал нэмэлт төлбөргүй дахин оролдоно.\n- «Зочин зөвшөөрвөл зургийг энэ цомогт нэмэх» тохиргоо. QR алдагдвал ↻ «Шинэ QR» — хуучин нь тэр даруй ажиллахаа болино.\n- Зохион байгуулагч борлуулалтаас хувь авна (тохиргооны хуудсанд «Таны хувь»). Үнийг зөвхөн платформ тогтооно.\n- Бүх AI темплетийг /ai-booth хуудаснаас харна.\n\n## AI видео (цомгийн эзэн)\n- Цомгийн хуудас («Харах») дээр эзэнд «AI видео: Нээлттэй/Хаалттай» товч гарна. Нээлттэй үед зураг бүрийн доор «Видео үүсгэх».\n- «✨ Glam Motion» (удаашруулсан кино маягийн) эсвэл «🎬 Хөгжилтэй үйлдэл» темплет сонгож QPay-ээр төлнө. 40–70 секундэд бэлэн болж цомгийн «🎬 AI видео» хавтсанд орно.\n- Хүүхэд (18-аас доош) орсон зурагнаас видео үүсэхгүй, ийм тохиолдолд төлбөр буцаагдахгүй. Темплетүүдийг /ai-video хуудаснаас харна.\n\n## Зочин — зураг олох, худалдаж авах, татах\n- Цомгийн линк эсвэл QR-аар орно. Хавтсаар эсвэл «Өөрийн зургийг хайх» (selfie-ээр царайгаар хайх — selfie серверт хадгалагдахгүй).\n- Худалдах цомог: зураг дээр «Татах» → «Сагс» → «Төлөх» → нэр, утас → QPay. Төлсний дараа баримт хуудаснаас усан тэмдэггүй зургаа татна.\n- Худалдаж авсан зургийг тодорхой хоногийн дотор татаж авна (дараа нь линк ажиллахаа болино). «Хувийн хэрэглээний лиценз» — дахин зарахгүй.\n- Өмнөх худалдан авалт: /my-purchases («Миний худалдан авалт»), эсвэл нэвтэрсэн бол самбар → «Худалдан авагч» таб.\n- Утсанд хадгалах: зурган дээр удаан дараад «Зургийг хадгалах / Save to Photos».\n- Үнийн санал: зураг доорх «Үнийн санал илгээх» (үнийн хамгийн багадаа хувь бий). Зурагчин зөвшөөрвөл /offer/... хуудсаар тодорхой цагийн дотор төлнө.\n- Үнэгүй цомог: «Үнэгүй татах».\n\n## Студи\n- /studios — студиуд газрын зурагтай. Өөрийн студи бүртгүүлэх: самбар → «Миний студи» (/studios/mine) → «Студи бүртгүүлэх» (/studios/new): нэр, танилцуулга, чиглэл, утас, хаяг, газрын зураг дээр цэг, лого, зураг. Админ баталсны дараа нийтлэгдэнэ. «Хайлтад харуулах»-аар түр нууж болно.\n\n## Профайл, бүртгэл\n- Гарах: самбарын баруун дээд талын нэр → «Гарах».\n- Апп болгон суулгах: нүүр хуудасны «Апп» хэсэг (утасны нүүр дэлгэцэд нэмэх).\n\n## Админ (зөвхөн админ эрхтэй)\n- /admin табууд: Нэгдсэн, Хэрэглэгч (үүрэг өөрчлөх), Цомог (хугацаа сунгах, нүүрээс «Нуух», цэвэрлэх), Мөнгө татах (хүсэлт олгох), Платформ (бүх үнэ, багц, журам, холбоо барих, нүүр видео), AI темплет, AI видео, Студи (батлах), Чатбот (асуултууд, нэмэлт мэдлэг).\n\n## Холбоо барих\n- /contact — цомгийн хандалт, төлбөр, татах хугацаа, зураг устгуулах, хамтын ажиллагаа. Нууцлал: /privacy, Нөхцөл: /terms.";
// </KNOWLEDGE>

const PRICING_KEYS = [
  "photo_quota_free", "photo_quota_packages", "free_packages", "listing_packages", "guest_photo_packages",
  "album_open_days", "album_extend_options", "album_extend_price", "album_extend_days", "album_purge_after_days",
  "album_lock_price", "ai_booth_price", "ai_album_price", "ai_video_enabled", "album_video_enabled", "album_video_price",
  "min_photo_price", "purchase_download_days", "offer_min_ratio", "offer_response_hours", "offer_pay_hours", "payout_min",
];
const BOT_KEYS = ["help_bot_enabled", "help_bot_notes", "help_bot_hourly_limit", "help_bot_daily_cap"];

type Settings = Record<string, unknown>;
let settingsCache: { at: number; data: Settings } | null = null;

async function loadSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < 5 * 60_000) return settingsCache.data;
  const { data } = await db.from("platform_settings").select("key, value").in("key", [...PRICING_KEYS, ...BOT_KEYS]);
  const m: Settings = Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  settingsCache = { at: Date.now(), data: m };
  return m;
}

const num = (v: unknown, d: number) => {
  const n = Number(typeof v === "string" ? v : v ?? NaN);
  return Number.isFinite(n) ? n : d;
};
const mnt = (n: unknown) => `${Number(n).toLocaleString("en-US")}₮`;

/** Одоогийн үнийг хүнд ойлгомжтой мөр болгоно (админ өөрчлөхөд шууд тусна) */
function pricingText(s: Settings): string {
  const lines: string[] = [];
  const pk = (v: unknown, f: (p: Record<string, unknown>) => string) =>
    Array.isArray(v) ? v.map((p) => f(p as Record<string, unknown>)).join("; ") : "";

  if (s.free_packages) lines.push(`«Үнэгүй хуваалцах» цомгийн багц: ${pk(s.free_packages, (p) => `${p.name ?? ""} ${p.photos} зураг ${p.days ?? 30} хоног ${Number(p.price) ? mnt(p.price) : "үнэгүй"}`)}`);
  if (s.listing_packages) lines.push(`Нүүр хуудсанд нийтлэх: ${pk(s.listing_packages, (p) => `${p.days} хоног ${mnt(p.price)}`)}`);
  if (s.guest_photo_packages) lines.push(`Зочдын зургийн багц: ${pk(s.guest_photo_packages, (p) => `${p.photos} зураг ${mnt(p.price)}`)}`);
  lines.push(`Цомог нээлттэй байх: арга хэмжээнээс хойш ${num(s.album_open_days, 30)} хоног`);
  if (Array.isArray(s.album_extend_options)) lines.push(`Цомог сунгах: ${pk(s.album_extend_options, (p) => `${p.days} хоног ${mnt(p.price)}`)}`);
  else lines.push(`Цомог сунгах: ${num(s.album_extend_days, 30)} хоног ${mnt(num(s.album_extend_price, 10000))}`);
  lines.push(`Хаагдсанаас хойш ${num(s.album_purge_after_days, 60)} хоногт сунгаагүй бол зургууд устна`);
  lines.push(`Цомгийн зургийн үнэгүй хязгаар: ${num(s.photo_quota_free, 1000)} зураг` +
    (Array.isArray(s.photo_quota_packages) ? `; нэмэлт: ${pk(s.photo_quota_packages, (p) => `${p.name ?? `+${p.photos}`} ${mnt(p.price)}`)}` : ""));
  lines.push(`Цомгийг кодоор түгжих: ${mnt(num(s.album_lock_price, 10000))} (нэг удаа)`);
  lines.push(`AI бүүт: нэг зураг ${mnt(num(s.ai_booth_price, 5000))}; цомог дахь AI бүүтийн зургийн татах үнэ ${mnt(num(s.ai_album_price, 3000))}`);
  if (s.album_video_enabled !== false && s.album_video_enabled !== "false") lines.push(`Цомгийн AI видео: ${mnt(num(s.album_video_price, 10000))}`);
  lines.push(`Зураг тус бүрийн доод үнэ: ${mnt(num(s.min_photo_price, 1000))}`);
  lines.push(`Худалдаж авсан зургийг татах хугацаа: төлснөөс хойш ${num(s.purchase_download_days, 14)} хоног`);
  lines.push(`Үнийн санал: үнийн хамгийн багадаа ${Math.round(num(s.offer_min_ratio, 0.5) * 100)}%, зурагчин ${num(s.offer_response_hours, 48)} цагт хариулна, зөвшөөрсний дараа ${num(s.offer_pay_hours, 24)} цагт төлнө`);
  if (s.payout_min !== undefined) lines.push(`Мөнгө татах доод дүн: ${mnt(num(s.payout_min, 0))}`);
  lines.push("Сайтын шимтгэл 3%, QPay 1%");
  return lines.map((l) => `- ${l}`).join("\n");
}

const LANG_NAME: Record<string, string> = { mn: "Mongolian (Cyrillic)", en: "English", ru: "Russian", zh: "Simplified Chinese" };

function systemPrompt(s: Settings, ctx: { path: string; lang: string; roles: string[] | null }): string {
  const notes = typeof s.help_bot_notes === "string" ? s.help_bot_notes.trim() : "";
  const who = ctx.roles === null
    ? "Нэвтрээгүй зочин."
    : `Нэвтэрсэн хэрэглэгч. Үүрэг: ${ctx.roles.join(", ") || "buyer"}.`;
  return `Чи бол Zuragchin.mn сайтын «Туслах» — хэрэглэгч, зурагчин, зохион байгуулагчид сайтыг ашиглахад тусалдаг найрсаг туслах.

ҮҮРЭГ:
- Хүн «яаж хийх вэ, хаана байна» гэж асуувал ГАРЫН АВЛАГА-аас хариулж, тодорхой алхмуудыг дугаарлан бичнэ: аль хуудас, аль таб, аль товч (товчны нэрийг «» дотор яг сайт дээрх шиг).
- Хуудас руу заахдаа заавал markdown линк ашиглана: [Хяналтын самбар](/dashboard). Зөвхөн ГАРЫН АВЛАГА-д байгаа замыг ашигла, зам зохиож болохгүй. <id> орсон замд линк бүү тавь — оронд нь хаанаас орохыг тайлбарла.
- Үнэ асуувал зөвхөн ОДООГИЙН ҮНЭ хэсгээс ав. Тэнд байхгүй бол «Нүүр хуудасны «Үнэ, төлбөр» хэсгээс харна уу» гэ.
- Гарын авлагад байхгүй, мэдэхгүй зүйлийг таамаглаж бүү хариул. «Энэ талаар надад тодорхой мэдээлэл алга» гээд [Холбоо барих](/contact) руу чиглүүл.
- Хүний хувийн мэдээлэл, захиалга, төлбөрийн төлөвийг чи харж чадахгүй. «Төлбөр орсон уу, миний зураг хаана» гэвэл хаанаас өөрөө шалгахыг заа ([Миний худалдан авалт](/my-purchases), самбар) эсвэл холбоо барихыг санал болго.
- Нууц үг, банкны карт, код зэргийг хэзээ ч бүү асуу.
- Zuragchin.mn-тэй холбоогүй асуултад эелдгээр «Би зөвхөн Zuragchin.mn-ийг ашиглахад тусална» гэж хариул.
- Админы хэсгийг зөвхөн хэрэглэгч админ бол тайлбарла.

ХЭЛБЭР:
- Богино, ойлгомжтой: ихэвчлэн 2–6 мөр эсвэл дугаартай алхам. Удиртгал, давталт хэрэггүй.
- Хариултыг ${LANG_NAME[ctx.lang] ?? "Mongolian (Cyrillic)"} хэлээр бич. (Хэрэглэгч өөр хэлээр бичвэл тэр хэлээр.) Товчны нэрийг сайт дээрх монгол нэрээр нь үлдээж, хаалтанд орчуулж болно.
- Зөвхөн **тод**, жагсаалт, линк ашигла; гарчиг, хүснэгт бүү ашигла.

ХЭРЭГЛЭГЧ: ${who}
ОДОО НЭЭСЭН ХУУДАС: ${ctx.path || "/"}

ОДООГИЙН ҮНЭ (админ тохируулсан, үнэн зөв):
${pricingText(s)}

ГАРЫН АВЛАГА:
${KNOWLEDGE}
${notes ? `\nАДМИНЫ НЭМЭЛТ ТЭМДЭГЛЭЛ (гарын авлагаас давуу):\n${notes}\n` : ""}`;
}

type Msg = { role: "user" | "model"; text: string };

let workingModel = ""; // ажилласан загварыг санана — дараагийн асуултад 404-ийг давтахгүй

async function callGemini(system: string, msgs: Msg[]): Promise<{ text: string; model: string }> {
  let lastErr = "";
  const chain = workingModel ? [workingModel, ...MODEL_CHAIN.filter((m) => m !== workingModel)] : MODEL_CHAIN;
  for (const model of chain) {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      lastErr = `${model}: ${res.status} ${body.slice(0, 300)}`;
      // Загвар олдоогүй / дэмжигдээгүй бол дараагийнхыг оролдоно
      if (res.status === 404 || (res.status === 400 && /not found|not supported|unknown model/i.test(body))) continue;
      throw new Error(lastErr);
    }
    const j = JSON.parse(body);
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!text) {
      lastErr = `${model}: empty (${j?.candidates?.[0]?.finishReason ?? j?.promptFeedback?.blockReason ?? "?"})`;
      throw new Error(lastErr);
    }
    workingModel = model;
    return { text, model };
  }
  throw new Error(lastErr || "no model");
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Нэвтэрсэн хэрэглэгчийн id, үүрэг (anon түлхүүр бол null) */
async function whoIs(req: Request): Promise<{ id: string; roles: string[] } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  try {
    const { data } = await db.auth.getUser(token);
    if (!data?.user) return null;
    const { data: u } = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
    const r = u?.role;
    return { id: data.user.id, roles: Array.isArray(r) ? r.map(String) : r ? [String(r)] : ["buyer"] };
  } catch {
    return null;
  }
}

const LIMIT_MSG: Record<string, string> = {
  mn: "Түр завсарлая — хэт олон асуулт ирлээ. Хэсэг хугацааны дараа дахин асуугаарай, яаралтай бол [Холбоо барих](/contact).",
  en: "Too many questions for now — please try again a bit later, or use [Contact](/contact).",
  ru: "Слишком много вопросов — попробуйте чуть позже или напишите нам: [Контакты](/contact).",
  zh: "提问太频繁，请稍后再试，或通过[联系我们](/contact)。",
};
const OFF_MSG: Record<string, string> = {
  mn: "Туслах одоогоор түр унтраалттай байна. [Холбоо барих](/contact) хуудсаар холбогдоно уу.",
  en: "The assistant is turned off right now. Please use [Contact](/contact).",
  ru: "Помощник временно отключён. Напишите нам: [Контакты](/contact).",
  zh: "助手暂时关闭，请通过[联系我们](/contact)。",
};
const ERR_MSG: Record<string, string> = {
  mn: "Уучлаарай, яг одоо хариулж чадсангүй. Дахин оролдоно уу эсвэл [Холбоо барих](/contact).",
  en: "Sorry, I couldn't answer right now. Please try again or use [Contact](/contact).",
  ru: "Извините, сейчас не получилось ответить. Попробуйте ещё раз или [Контакты](/contact).",
  zh: "抱歉，暂时无法回答。请重试或[联系我们](/contact)。",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = new URL(req.url);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const sessionId = String(body.session_id ?? "").slice(0, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json({ error: "session" }, 400);

  // ── 👍 / 👎 ─────────────────────────────────────────
  if (url.pathname.endsWith("/feedback")) {
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id" }, 400);
    await db.from("help_bot_messages").update({ helpful: body.helpful === true }).eq("id", id).eq("session_id", sessionId);
    return json({ ok: true });
  }

  // ── Асуулт ─────────────────────────────────────────
  const lang = ["mn", "en", "ru", "zh"].includes(String(body.lang)) ? String(body.lang) : "mn";
  const path = String(body.path ?? "/").slice(0, 200);
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const msgs: Msg[] = raw
    .slice(-12)
    .map((m: Record<string, unknown>) => ({
      role: m.role === "model" || m.role === "assistant" ? "model" as const : "user" as const,
      text: String(m.text ?? "").slice(0, 1500).trim(),
    }))
    .filter((m) => m.text);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "no question" }, 400);
  const question = msgs[msgs.length - 1].text;

  const s = await loadSettings();
  if (s.help_bot_enabled === false || s.help_bot_enabled === "false") return json({ answer: OFF_MSG[lang], off: true });
  if (!GEMINI_API_KEY) return json({ answer: ERR_MSG[lang], error: "GEMINI_API_KEY missing" }, 500);

  const me = await whoIs(req);
  const isAdmin = !!me?.roles.includes("admin");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await sha256(`${ip}|help-bot|${SERVICE_KEY.slice(-12)}`);

  // Хурдны хязгаар: нэг IP цагт N асуулт, нийт өдөрт M (Gemini зардлаас хамгаална)
  if (!isAdmin) {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const [perIp, total] = await Promise.all([
      db.from("help_bot_messages").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
      db.from("help_bot_messages").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    ]);
    if ((perIp.count ?? 0) >= num(s.help_bot_hourly_limit, 30) || (total.count ?? 0) >= num(s.help_bot_daily_cap, 3000)) {
      return json({ answer: LIMIT_MSG[lang], limited: true });
    }
  }

  let answer = "";
  let model = "";
  let error: string | null = null;
  try {
    const r = await callGemini(systemPrompt(s, { path, lang, roles: me ? me.roles : null }), msgs);
    answer = r.text;
    model = r.model;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("help-bot gemini:", error);
    answer = ERR_MSG[lang];
  }

  const { data: row } = await db.from("help_bot_messages").insert({
    session_id: sessionId, user_id: me?.id ?? null, ip_hash: ipHash, path, lang,
    question, answer: error ? null : answer, model: model || null, error,
  }).select("id").maybeSingle();

  return json({ answer, id: error ? null : row?.id ?? null });
});
