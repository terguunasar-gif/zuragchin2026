import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle2, Check } from 'lucide-react';
import { supabase, UserRole } from '../../lib/supabase';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // buyer is always included; user can toggle photographer and organizer
  const [extraRoles, setExtraRoles] = useState<Set<UserRole>>(new Set());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordStrength = getPasswordStrength(password);

  function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const labels = ['', 'Сул', 'Дунд', 'Сайн', 'Маш сайн'];
    const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-green-500'];
    return { score, label: labels[score] || '', color: colors[score] || '' };
  }

  function toggleRole(role: UserRole) {
    setExtraRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Нууц үгнүүд таарахгүй байна');
      return;
    }
    if (password.length < 8) {
      setError('Нууц үг дор хаяж 8 тэмдэгт байх ёстой');
      return;
    }
    setLoading(true);
    const roles: UserRole[] = ['buyer', ...Array.from(extraRoles)];
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, roles: JSON.stringify(roles) },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    }
  }

  const optionalRoles: { value: UserRole; label: string; desc: string }[] = [
    { value: 'photographer', label: 'Зурагчин', desc: 'Цомогт нэгдэж, зураг байршуулах' },
    { value: 'organizer',   label: 'Зохион байгуулагч', desc: 'Цомог үүсгэж, удирдах' },
  ];

  if (success) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Бүртгэл амжилттай үүслээ!</h2>
          <p className="text-stone-400">Хяналтын самбар руу шилжиж байна...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.pexels.com/photos/3379934/pexels-photo-3379934.jpeg"
          alt="Photography event"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-stone-950/80 via-stone-950/40 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <Camera className="w-6 h-6 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold text-xl">.mn</span>
            </div>
          </div>
          <div>
            <h2 className="text-white text-4xl font-bold leading-tight mb-4">
              Монголын зургийн<br />платформд нэгдэнэ үү.
            </h2>
            <p className="text-stone-300 text-lg leading-relaxed max-w-sm">
              Шилдэг зурагчидтай холбогдож, дурсамжаа мөнхлөөрэй.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <Camera className="w-6 h-6 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold text-xl">.mn</span>
            </div>
          </div>

          <h1 className="text-white text-3xl font-bold mb-2">Бүртгэл үүсгэх</h1>
          <p className="text-stone-400 mb-8">Zuragchin.mn-д нэгдэнэ үү</p>

          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role multi-select */}
            <div>
              <label className="block text-stone-300 text-sm font-medium mb-3">
                Би дараах байдлаар нэгдэх
              </label>

              {/* Buyer — always selected, not toggleable */}
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-500/10 border-amber-500/40 mb-2 cursor-default">
                <div className="w-5 h-5 rounded-md bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-stone-950" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-amber-400 font-medium text-sm">Худалдан авагч</p>
                  <p className="text-stone-500 text-xs">Зураг үзэж, худалдан авах — үргэлж идэвхтэй</p>
                </div>
              </div>

              {/* Optional roles */}
              {optionalRoles.map(r => {
                const checked = extraRoles.has(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRole(r.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 mb-2 text-left ${
                      checked
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      checked ? 'bg-amber-500 border-amber-500' : 'border-stone-600'
                    }`}>
                      {checked && <Check className="w-3.5 h-3.5 text-stone-950" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${checked ? 'text-amber-400' : 'text-stone-300'}`}>
                        {r.label}
                      </p>
                      <p className="text-stone-500 text-xs">{r.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-2">Бүтэн нэр</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Таны бүтэн нэр"
                  required
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-11 pr-4 py-3 outline-none transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-2">Имэйл хаяг</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-11 pr-4 py-3 outline-none transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-2">Нууц үг</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Хамгийн багадаа 8 тэмдэгт"
                  required
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-11 pr-12 py-3 outline-none transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength.score ? passwordStrength.color : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-stone-500">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-2">Нууц үг давтах</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Нууц үгээ давтан оруулна уу"
                  required
                  className={`w-full bg-white/5 border focus:ring-2 text-white placeholder-stone-600 rounded-xl pl-11 pr-12 py-3 outline-none transition-all duration-200 ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                      : 'border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-xl py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
              ) : 'Бүртгүүлэх'}
            </button>

            <p className="text-stone-600 text-xs text-center leading-relaxed">
              Бүртгэл үүсгэснээр та манай Үйлчилгээний нөхцөл болон Нууцлалын бодлогыг зөвшөөрч байна.
            </p>
          </form>

          <p className="text-stone-500 text-center mt-6 text-sm">
            Бүртгэлтэй юу?{' '}
            <Link to="/auth/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
              Нэвтрэх
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
