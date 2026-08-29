import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../lib/api';
import { playSuccessSound } from '../lib/audio';
import {
  Scissors,
  Lock,
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
  Clock,
  MapPin,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface LoginLandingPageProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginLandingPage: React.FC<LoginLandingPageProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'customer' | 'owner'>('customer');

  // Customer Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Owner/Staff Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Dynamic Open/Close status (09:00 - 21:00 WIB)
  const [isOpenNow, setIsOpenNow] = useState(true);

  useEffect(() => {
    const checkOpenStatus = () => {
      try {
        const jakartaHour = new Date().toLocaleString('en-US', {
          timeZone: 'Asia/Jakarta',
          hour: 'numeric',
          hour12: false,
        });
        const hour = parseInt(jakartaHour, 10);
        setIsOpenNow(hour >= 9 && hour < 21);
      } catch (_) {
        setIsOpenNow(true);
      }
    };
    checkOpenStatus();
    const interval = setInterval(checkOpenStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setCustomerError('Nama lengkap wajib diisi.');
      return;
    }
    if (!customerPhone.trim()) {
      setCustomerError('Nomor WhatsApp / HP wajib diisi.');
      return;
    }

    setCustomerLoading(true);
    setCustomerError(null);

    const email = customerEmail.trim() || `tamu_${Date.now()}@arezbarber.com`;
    try {
      const res = await api.loginGoogleSSO({
        google_id: `guest-${Date.now()}`,
        full_name: customerName.trim(),
        email: email,
        phone: customerPhone.trim(),
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerName.trim())}`,
      });
      playSuccessSound();
      onLoginSuccess(res.user);
    } catch (err: any) {
      setCustomerError(err.message || 'Gagal masuk. Silakan periksa kembali data Anda.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleGoogleSSOClick = async () => {
    setCustomerLoading(true);
    setCustomerError(null);
    try {
      const randomSeed = Math.floor(1000 + Math.random() * 9000);
      const res = await api.loginGoogleSSO({
        google_id: `g-sso-${Date.now()}`,
        full_name: customerName.trim() || `Pelanggan Arez #${randomSeed}`,
        email: customerEmail.trim() || `member${randomSeed}@gmail.com`,
        phone: customerPhone.trim() || '081234567890',
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=Arez${randomSeed}`,
      });
      playSuccessSound();
      onLoginSuccess(res.user);
    } catch (err: any) {
      setCustomerError(err.message || 'Gagal masuk dengan Google SSO.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setOwnerError('Username dan kata sandi wajib diisi.');
      return;
    }

    setOwnerLoading(true);
    setOwnerError(null);

    try {
      const res = await api.loginOwner(username.trim(), password);
      playSuccessSound();
      onLoginSuccess(res.user);
    } catch (err: any) {
      setOwnerError(err.message || 'Login gagal. Periksa kembali username dan kata sandi Anda.');
    } finally {
      setOwnerLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141613] text-[#FDFCFA] flex flex-col justify-between selection:bg-[#C2A878] selection:text-[#141613] relative overflow-hidden font-sans">
      {/* Background Decorative Lighting */}
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-radial from-[#C2A878]/10 via-[#20231F]/30 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-radial from-[#C2A878]/5 to-transparent blur-3xl pointer-events-none" />

      {/* Top Brand Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2A2E28] to-[#1A1D19] border border-white/10 flex items-center justify-center shadow-lg">
            <Scissors className="w-5 h-5 text-[#C2A878]" />
          </div>
          <div>
            <span className="font-serif text-lg tracking-wider font-semibold uppercase block leading-none">
              AREZ
            </span>
            <span className="text-[10px] tracking-[0.25em] text-[#9A9E96] uppercase font-light">
              BARBERSHOP
            </span>
          </div>
        </div>

        {/* Dynamic Status Pill */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#20231F] border border-white/10 text-xs shadow-inner">
          <span className={`w-2 h-2 rounded-full ${isOpenNow ? 'bg-[#22C55E] animate-pulse' : 'bg-[#EF4444]'}`} />
          <span className="text-[#C5C8C0] font-medium text-[11px]">
            {isOpenNow ? 'Buka Sekarang (09:00 - 21:00)' : 'Tutup Sekarang (Buka 09:00 WIB)'}
          </span>
        </div>
      </header>

      {/* Main Hero & Auth Portal */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Brand Story & Experience Info */}
        <div className="lg:col-span-7 space-y-6 text-left">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#C2A878]/10 border border-[#C2A878]/30 text-[#C2A878] text-xs tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Quiet Luxury Grooming & Real-Time Queue</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.15]">
            Presisi Potongan. <br />
            <span className="italic font-normal text-[#C2A878]">Kenyamanan Eksklusif.</span>
          </h1>

          <p className="text-[#A4A89F] text-sm sm:text-base leading-relaxed max-w-xl font-light">
            Selamat datang di portal resmi <strong>Arez Barbershop</strong>. Nikmati kemudahan mengambil nomor antrean secara live tanpa menunggu lama di kursi tunggu, pantau giliran Anda dari mana saja, dan rasakan pelayanan pangkas rambut pria berstandar premium.
          </p>

          {/* Key Value Props */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#1D201C]/80 border border-white/5 space-y-1.5">
              <div className="flex items-center space-x-2 text-[#C2A878]">
                <Clock className="w-4 h-4" />
                <span className="font-medium text-xs tracking-wide uppercase">Live Antrean Instan</span>
              </div>
              <p className="text-xs text-[#8A8E85]">
                Pantau sisa menit antrean Anda secara real-time langsung dari layar smartphone.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#1D201C]/80 border border-white/5 space-y-1.5">
              <div className="flex items-center space-x-2 text-[#C2A878]">
                <MapPin className="w-4 h-4" />
                <span className="font-medium text-xs tracking-wide uppercase">Lokasi Strategis</span>
              </div>
              <p className="text-xs text-[#8A8E85]">
                Jl. Raya Utama Arez Grooming Studio, Parkir Luas & Lounge Ber-AC.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Login Portal */}
        <div className="lg:col-span-5">
          <div
            id="landing-auth-card"
            className="w-full bg-[#1C1F1B] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md"
          >
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C2A878] to-transparent" />

            {/* Portal Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#141613] rounded-xl border border-white/5 mb-6">
              <button
                id="tab-customer-login"
                type="button"
                onClick={() => {
                  setActiveTab('customer');
                  setCustomerError(null);
                  setOwnerError(null);
                }}
                className={`py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center justify-center space-x-2 ${
                  activeTab === 'customer'
                    ? 'bg-[#2A2E28] text-[#FDFCFA] shadow-md border border-white/10'
                    : 'text-[#8A8E85] hover:text-[#C5C8C0]'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Pelanggan</span>
              </button>
              <button
                id="tab-owner-login"
                type="button"
                onClick={() => {
                  setActiveTab('owner');
                  setCustomerError(null);
                  setOwnerError(null);
                }}
                className={`py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center justify-center space-x-2 ${
                  activeTab === 'owner'
                    ? 'bg-[#2A2E28] text-[#FDFCFA] shadow-md border border-white/10'
                    : 'text-[#8A8E85] hover:text-[#C5C8C0]'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Owner & Staf</span>
              </button>
            </div>

            {/* Customer Login Form */}
            {activeTab === 'customer' && (
              <form onSubmit={handleCustomerSubmit} className="space-y-4 text-left">
                <div className="space-y-1">
                  <h3 className="text-lg font-serif font-light text-white">Masuk / Ambil Antrean</h3>
                  <p className="text-xs text-[#8A8E85]">Isi data singkat untuk mengambil tiket antrean Anda.</p>
                </div>

                {customerError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-start space-x-2 text-xs text-[#FCA5A5]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{customerError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#A4A89F] font-medium mb-1">
                      Nama Lengkap <span className="text-[#C2A878]">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686D66]" />
                      <input
                        id="input-landing-customer-name"
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141613] border border-white/10 text-sm text-white placeholder:text-[#50544E] focus:outline-none focus:border-[#C2A878] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#A4A89F] font-medium mb-1">
                      Nomor WhatsApp / HP <span className="text-[#C2A878]">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686D66]" />
                      <input
                        id="input-landing-customer-phone"
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141613] border border-white/10 text-sm text-white placeholder:text-[#50544E] focus:outline-none focus:border-[#C2A878] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#A4A89F] font-medium mb-1">
                      Email <span className="text-[#686D66] font-light">(Opsional untuk struk digital)</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686D66]" />
                      <input
                        id="input-landing-customer-email"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="budi@example.com"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141613] border border-white/10 text-sm text-white placeholder:text-[#50544E] focus:outline-none focus:border-[#C2A878] transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <button
                  id="btn-submit-customer-login"
                  type="submit"
                  disabled={customerLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-[#C2A878] text-[#141613] font-medium text-sm hover:bg-[#D4BE8F] active:scale-[0.99] transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  <span>{customerLoading ? 'Memproses Masuk...' : 'Masuk / Ambil Tiket Antrean'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-white/10 w-full" />
                  <span className="bg-[#1C1F1B] px-3 text-[11px] text-[#686D66] uppercase tracking-widest">Atau</span>
                </div>

                <button
                  id="btn-google-sso-login"
                  type="button"
                  onClick={handleGoogleSSOClick}
                  disabled={customerLoading}
                  className="w-full py-2.5 rounded-xl bg-[#141613] border border-white/10 text-white text-xs font-medium hover:bg-[#20231F] transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Masuk Instan dengan Google SSO</span>
                </button>
              </form>
            )}

            {/* Owner & Staff Login Form */}
            {activeTab === 'owner' && (
              <form onSubmit={handleOwnerSubmit} className="space-y-4 text-left">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-[#C2A878]" />
                    <h3 className="text-lg font-serif font-light text-white">Portal Staf & Owner</h3>
                  </div>
                  <p className="text-xs text-[#8A8E85]">Akses kasir POS, antrean aktif, dan laporan operasional.</p>
                </div>

                {ownerError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-start space-x-2 text-xs text-[#FCA5A5]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{ownerError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#A4A89F] font-medium mb-1">
                      Username <span className="text-[#C2A878]">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686D66]" />
                      <input
                        id="input-landing-owner-username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Contoh: CEO POTONG atau username staf"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141613] border border-white/10 text-sm text-white placeholder:text-[#50544E] focus:outline-none focus:border-[#C2A878] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#A4A89F] font-medium mb-1">
                      Kata Sandi <span className="text-[#C2A878]">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686D66]" />
                      <input
                        id="input-landing-owner-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141613] border border-white/10 text-sm text-white placeholder:text-[#50544E] focus:outline-none focus:border-[#C2A878] transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <button
                  id="btn-submit-owner-login"
                  type="submit"
                  disabled={ownerLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-[#C2A878] to-[#DFC89C] text-[#141613] font-medium text-sm hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{ownerLoading ? 'Memverifikasi...' : 'Masuk ke Sistem POS'}</span>
                </button>

                <div className="pt-2 text-center">
                  <p className="text-[11px] text-[#686D66]">
                    Super Admin default: <code className="text-[#A4A89F]">CEO POTONG</code>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Footer Bar */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#686D66]">
        <p>© 2026 Arez Barbershop — Quiet Luxury Grooming & Real-Time Queue</p>
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#C2A878]" />
            <span>Supabase Cloud Engine</span>
          </span>
          <span>•</span>
          <span>WhatsApp Notifikasi</span>
        </div>
      </footer>
    </div>
  );
};
