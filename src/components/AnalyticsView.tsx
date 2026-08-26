import React, { useState } from 'react';
import { AnalyticsRecapResponse, Transaction } from '../types';
import {
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface AnalyticsViewProps {
  analytics: AnalyticsRecapResponse | null;
  transactions: Transaction[];
  onRefreshData: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  analytics,
  transactions,
  onRefreshData,
}) => {
  const [viewScope, setViewScope] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  if (!analytics) {
    return (
      <div className="max-w-[680px] mx-auto px-4 py-12 text-center text-xs text-[#686D66]">
        Memuat data analitik finansial Arez Barbershop...
      </div>
    );
  }

  const { daily, weekly = [], monthly } = analytics;

  const weeklyGross = (weekly || []).reduce((acc, curr) => acc + (curr?.gross || 0), 0);
  const weeklyNet = (weekly || []).reduce((acc, curr) => acc + (curr?.net || 0), 0);
  const weeklyHeads = (weekly || []).reduce((acc, curr) => acc + (curr?.heads || 0), 0);
  const weeklyHpp = Math.max(0, weeklyGross - weeklyNet);

  const currentGross =
    viewScope === 'daily' ? (daily?.gross ?? 0) : viewScope === 'weekly' ? weeklyGross : (monthly?.gross ?? 0);
  const currentNet =
    viewScope === 'daily' ? (daily?.net ?? 0) : viewScope === 'weekly' ? weeklyNet : (monthly?.net ?? 0);
  const currentHpp =
    viewScope === 'daily' ? (daily?.hpp ?? 0) : viewScope === 'weekly' ? weeklyHpp : (monthly?.hpp ?? 0);
  const currentHeads =
    viewScope === 'daily' ? (daily?.heads ?? 0) : viewScope === 'weekly' ? weeklyHeads : (monthly?.heads ?? 0);

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert('Belum ada data transaksi untuk diekspor.');
      return;
    }
    const headers = [
      'ID Transaksi',
      'Tanggal',
      'Pelanggan',
      'Layanan',
      'Harga Jual',
      'Diskon',
      'Pajak',
      'Total HPP',
      'Keuntungan Bersih',
      'Metode Bayar',
    ];
    const rows = transactions.map((t) => [
      t.id,
      t.created_at,
      `"${t.customer_name}"`,
      `"${t.service_name}"`,
      t.total_price,
      t.discount,
      t.tax,
      t.total_hpp,
      t.net_profit,
      t.payment_method,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `arez_barbershop_recap_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData =
    viewScope === 'weekly'
      ? weekly.map((w) => ({
          name: w.day || w.date,
          value: w.gross,
          fill: '#26362E',
        }))
      : [
          { name: 'Omset', value: currentGross, fill: '#26362E' },
          { name: 'HPP Bahan', value: currentHpp, fill: '#E5E5DF' },
          { name: 'Laba Bersih', value: currentNet, fill: '#4F7A5A' },
        ];

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Laporan Finansial
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Analitik & Laba Bersih
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F1F1EC] border border-[#E5E5DF] text-[#20231F] text-xs font-medium rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={onRefreshData}
            title="Refresh Data"
            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scope Segment Control */}
      <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[8px] border border-[#E5E5DF]">
        {(['daily', 'weekly', 'monthly'] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setViewScope(scope)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all capitalize ${
              viewScope === scope
                ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
                : 'text-[#686D66] hover:text-[#20231F]'
            }`}
          >
            {scope === 'daily' ? 'Hari Ini' : scope === 'weekly' ? 'Minggu Ini' : 'Bulan Ini'}
          </button>
        ))}
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3.5 sm:p-4 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#686D66]">Pendapatan Kotor</span>
          <p className="text-base sm:text-lg font-bold text-[#20231F] mt-1 truncate">
            Rp {currentGross.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-[#686D66]">{currentHeads} Tamu Dilayani</span>
        </div>

        <div className="p-3.5 sm:p-4 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#4F7A5A]">Laba Bersih</span>
          <p className="text-base sm:text-lg font-bold text-[#4F7A5A] mt-1 truncate">
            Rp {currentNet.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-[#686D66]">Setelah HPP Bahan</span>
        </div>

        <div className="p-3.5 sm:p-4 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#686D66]">Total Biaya HPP</span>
          <p className="text-base font-semibold text-[#20231F] mt-1 truncate">
            Rp {currentHpp.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-[#686D66]">Bahan Terpakai</span>
        </div>

        <div className="p-3.5 sm:p-4 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#A47C45]">Tamu Selesai</span>
          <p className="text-base font-semibold text-[#A47C45] mt-1">
            {currentHeads} Sesi
          </p>
          <span className="text-[10px] text-[#686D66]">Pangkas & Grooming</span>
        </div>
      </div>

      {/* Chart Visualizer */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
          <h3 className="text-xs font-semibold text-[#20231F]">
            {viewScope === 'weekly' ? 'Tren Pendapatan Mingguan' : 'Perbandingan Struktur Finansial'}
          </h3>
          <span className="text-[10px] text-[#686D66]">Rupiah (IDR)</span>
        </div>

        <div className="h-52 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5DF" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#686D66' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#686D66' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Nominal']}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E5E5DF',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions Feed */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
          <h3 className="text-xs font-semibold text-[#20231F]">
            Transaksi Terakhir ({transactions.length})
          </h3>
          <span className="text-[10px] text-[#686D66]">Live Kasir</span>
        </div>

        <div className="divide-y divide-[#E5E5DF] max-h-64 overflow-y-auto no-scrollbar">
          {transactions.length === 0 ? (
            <p className="text-xs text-[#686D66] py-6 text-center">Belum ada transaksi tercatat.</p>
          ) : (
            transactions.slice(0, 15).map((t) => (
              <div key={t.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-[#20231F] truncate">{t.customer_name}</p>
                    <span className="text-[9px] bg-[#F1F1EC] px-1.5 py-0.2 rounded text-[#686D66] shrink-0">
                      {t.payment_method}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#686D66] truncate">
                    {t.service_name} •{' '}
                    {new Date(t.created_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-semibold text-[#20231F]">
                    Rp {t.total_price.toLocaleString('id-ID')}
                  </span>
                  <p className="text-[9px] text-[#4F7A5A] font-semibold">Laba: Rp {t.net_profit.toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
