import React, { useState, useEffect, useCallback } from 'react';
import { ComplexityMetricsResponse } from '../types';
import { api } from '../lib/api';
import {
  RefreshCw,
  Cpu,
  ArrowRight,
  Layers,
  Activity,
  CheckCircle2,
  Package,
  Gauge,
} from 'lucide-react';

export const AlgorithmsLabView: React.FC = () => {
  const [metrics, setMetrics] = useState<ComplexityMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getComplexityMetrics();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat diagnostik engine Big O & FIFO');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loading && !metrics) {
    return (
      <div className="py-12 text-center text-xs text-[#686D66]">
        Memuat telemetri struktur data Big O & FIFO...
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] p-6 text-center space-y-2">
        <p className="text-xs text-[#A84B45] font-medium">{error}</p>
        <button
          type="button"
          onClick={loadMetrics}
          className="px-4 py-2 bg-[#26362E] text-white text-xs font-semibold rounded-[8px]"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div id="algorithms-lab-view" className="space-y-4">
      {/* Engine Summary Strip */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E5E5DF]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-[#E8ECE8] text-[#26362E] flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-[#20231F] truncate">
                {metrics.engine}
              </h3>
              <p className="text-[10px] text-[#686D66]">
                Policy: <span className="font-mono font-semibold text-[#26362E]">{metrics.fifo_queue_state.policy}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadMetrics}
            className="px-2.5 py-1.5 bg-[#F1F1EC] hover:bg-[#E5E5DF] text-[#20231F] text-xs font-medium rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Uji Ulang</span>
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 bg-[#F7F6F2] rounded-[8px] border border-[#E5E5DF]">
            <span className="text-[10px] text-[#686D66] block">Hash Lookup</span>
            <p className="font-mono font-bold text-[#4F7A5A] mt-0.5">
              O(1) • {(metrics.measured_lookup_ns / 1000).toFixed(2)} µs
            </p>
          </div>
          <div className="p-2.5 bg-[#F7F6F2] rounded-[8px] border border-[#E5E5DF]">
            <span className="text-[10px] text-[#686D66] block">Antrean FIFO</span>
            <p className="font-mono font-bold text-[#20231F] mt-0.5">
              {metrics.fifo_queue_state.size} Node
            </p>
          </div>
          <div className="p-2.5 bg-[#F7F6F2] rounded-[8px] border border-[#E5E5DF]">
            <span className="text-[10px] text-[#686D66] block">Batch HPP FIFO</span>
            <p className="font-mono font-bold text-[#26362E] mt-0.5">
              {metrics.dataset_sizes.hpp_batches} Lot
            </p>
          </div>
          <div className="p-2.5 bg-[#F7F6F2] rounded-[8px] border border-[#E5E5DF] col-span-3 sm:col-span-1">
            <span className="text-[10px] text-[#686D66] block">Transaksi / User</span>
            <p className="font-mono font-bold text-[#20231F] mt-0.5">
              {metrics.dataset_sizes.transactions} / {metrics.dataset_sizes.users}
            </p>
          </div>
        </div>
      </div>

      {/* Live Doubly-Linked FIFO Queue Visualizer */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#26362E]" />
            <h3 className="text-xs font-semibold text-[#20231F]">
              Visualisasi Linked Queue Antrean FIFO (Head → Tail)
            </h3>
          </div>
          <span className="text-[10px] font-mono bg-[#E8ECE8] text-[#26362E] px-2 py-0.5 rounded-full font-semibold">
            Enqueue/Dequeue O(1)
          </span>
        </div>

        {metrics.fifo_queue_state.nodes.length === 0 ? (
          <div className="p-4 bg-[#F7F6F2] border border-dashed border-[#E5E5DF] rounded-[10px] text-center">
            <p className="font-mono text-xs text-[#686D66]">
              head = null | tail = null | size = 0
            </p>
            <p className="text-[11px] text-[#92968F] mt-1">
              Tambahkan tamu online atau walk-in untuk melihat rantai node FIFO bekerja secara live.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {metrics.fifo_queue_state.nodes.map((node, idx) => (
              <React.Fragment key={node.id}>
                <div
                  className={`min-w-[155px] p-3 rounded-[10px] border shrink-0 space-y-1 ${
                    node.is_head
                      ? 'bg-[#E8ECE8]/70 border-[#26362E] ring-1 ring-[#26362E]'
                      : 'bg-[#F7F6F2] border-[#E5E5DF]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold text-[#20231F]">
                      #{node.queue_number}
                    </span>
                    <div className="flex items-center gap-1">
                      {node.is_head && (
                        <span className="text-[9px] font-mono font-bold bg-[#26362E] text-white px-1.5 py-0.5 rounded">
                          HEAD
                        </span>
                      )}
                      {node.is_tail && (
                        <span className="text-[9px] font-mono font-bold bg-[#A47C45] text-white px-1.5 py-0.5 rounded">
                          TAIL
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-[#20231F] truncate">{node.customer_name}</p>
                  <p className="text-[10px] text-[#686D66] truncate">{node.service_name || 'Layanan'}</p>
                  <p className="text-[9px] font-mono text-[#4F7A5A]">
                    FIFO Rank: #{node.fifo_rank}
                  </p>
                </div>

                {idx < metrics.fifo_queue_state.nodes.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-[#92968F] shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Live FIFO Inventory Batch Costing State */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-[#A47C45]" />
            <h3 className="text-xs font-semibold text-[#20231F]">
              Antrean Batch Stok Bahan HPP (FIFO Inventory Costing)
            </h3>
          </div>
          <span className="text-[10px] font-mono bg-[#F7F2EA] text-[#A47C45] px-2 py-0.5 rounded-full font-semibold">
            O(1) Amortized
          </span>
        </div>

        {metrics.hpp_fifo_batches.length === 0 ? (
          <p className="text-xs text-[#686D66] py-3 text-center">
            Belum ada komponen HPP terdaftar.
          </p>
        ) : (
          <div className="space-y-2.5">
            {metrics.hpp_fifo_batches.map((hpp) => (
              <div key={hpp.hpp_id} className="p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#20231F] truncate">{hpp.item_name}</p>
                    <p className="text-[10px] text-[#686D66]">
                      Total Stok: <strong>{hpp.total_remaining} {hpp.unit_type}</strong> • {hpp.active_batches_count} Batch Aktif
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-[#686D66] block">Tarif FIFO Head</span>
                    <span className="text-xs font-bold text-[#26362E]">
                      Rp {(hpp.fifo_head_batch?.unit_cost ?? hpp.standard_unit_cost).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {hpp.batches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {hpp.batches.map((b) => (
                      <span
                        key={b.id}
                        className={`text-[10px] font-mono px-2 py-1 rounded-[6px] border ${
                          b.is_fifo_head
                            ? 'bg-[#26362E] text-white border-[#26362E] font-semibold'
                            : b.quantity_remaining <= 0
                            ? 'bg-[#F1F1EC] text-[#92968F] border-[#E5E5DF] line-through'
                            : 'bg-[#FFFFFF] text-[#20231F] border-[#E5E5DF]'
                        }`}
                      >
                        {b.is_fifo_head ? 'HEAD ' : ''}
                        {b.batch_code}: {b.quantity_remaining}/{b.quantity_initial} @ Rp {b.unit_cost.toLocaleString('id-ID')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Big O Complexity Matrix */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center gap-1.5 pb-2 border-b border-[#E5E5DF]">
          <Gauge className="w-4 h-4 text-[#4F7A5A]" />
          <h3 className="text-xs font-semibold text-[#20231F]">
            Matriks Evaluasi Kompleksitas Algoritma (Big O)
          </h3>
        </div>

        <div className="space-y-2">
          {metrics.complexity_matrix.map((row) => (
            <div
              key={row.module}
              className="p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-[#20231F]">{row.module}</p>
                <span className="font-mono text-[11px] font-bold bg-[#E8ECE8] text-[#4F7A5A] px-2 py-0.5 rounded-full shrink-0">
                  {row.after_complexity}
                </span>
              </div>
              <p className="text-[11px] text-[#26362E] font-medium">
                Struktur Data: <span className="font-mono">{row.data_structure}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#686D66]">
                <span className="line-through text-[#A84B45]">Sebelum: {row.before_complexity}</span>
                <span>→</span>
                <span className="text-[#4F7A5A] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Sesudah: {row.after_complexity}
                </span>
              </div>
              <p className="text-[11px] text-[#686D66] leading-snug">{row.benefit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ring Buffer Telemetry Trace */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#26362E]" />
            <h3 className="text-xs font-semibold text-[#20231F]">
              Log Operasi FIFO & Kompleksitas Real-Time (Ring Buffer O(1))
            </h3>
          </div>
          <span className="text-[10px] text-[#686D66]">{metrics.recent_traces.length} Event Terakhir</span>
        </div>

        <div className="divide-y divide-[#E5E5DF] max-h-60 overflow-y-auto no-scrollbar">
          {metrics.recent_traces.length === 0 ? (
            <p className="text-xs text-[#686D66] py-4 text-center">Belum ada jejak operasi terekam.</p>
          ) : (
            metrics.recent_traces.map((tr) => (
              <div key={tr.id} className="py-2 flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px] font-bold bg-[#F1F1EC] text-[#20231F] px-1.5 py-0.5 rounded">
                      {tr.operation}
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-[#E8ECE8] text-[#4F7A5A] px-1.5 py-0.5 rounded">
                      {tr.complexity}
                    </span>
                    <span className="text-[10px] text-[#92968F]">{tr.duration_us} µs</span>
                  </div>
                  <p className="text-[11px] text-[#686D66] leading-snug">{tr.detail}</p>
                </div>
                <span className="text-[10px] font-mono text-[#92968F] shrink-0">
                  {new Date(tr.timestamp).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
