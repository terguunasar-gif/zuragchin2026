import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Eye, EyeOff, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
    });
  }, []);

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
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Нууц үг шинэчлэгдлээ!</h2>
          <p className="text-stone-400">Хяналтын самбар руу шилжиж байна...</p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h2 className="text-white text-2xl font-bold mb-2">Холбоос хүчингүй болсон</h2>
          <p className="text-stone-400 mb-6">Энэ нууц үг сэргээх холбоос дууссан эсвэл хүчингүй байна.</p>
          <Link
            to="/auth/forgot-password"
            className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
          >
            Шинэ холбоос авах
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <Camera className="w-6 h-6 text-stone-950" />
          </div>
          <div>
            <span className="text-white font-bold text-xl tracking-tight">Zuragchin</span>
            <span className="text-amber-400 font-bold text-xl">.mn</span>
          </div>
        </div>

        <h1 className="text-white text-3xl font-bold mb-2">Шинэ нууц үг тохируулах</h1>
        <p className="text-stone-400 mb-8">Бүртгэлдээ хүчтэй нууц үг сонгоно уу.</p>

        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-stone-300 text-sm font-medium mb-2">Шинэ нууц үг</label>
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
          </div>

          <div>
            <label className="block text-stone-300 text-sm font-medium mb-2">Шинэ нууц үг давтах</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Нууц үгээ давтан оруулна уу"
                required
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-11 pr-4 py-3 outline-none transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-xl py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
            ) : 'Нууц үг шинэчлэх'}
          </button>
        </form>
      </div>
    </div>
  );
}
