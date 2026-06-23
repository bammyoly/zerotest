// Explorer.jsx
import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import { useWatchContractEvent } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

import PaymentRouterArtifact from '../contracts/PaymentRouter.json';
import DonationVaultArtifact from '../contracts/DonationVault.json';
import addresses             from '../contracts/addresses.json';

// ─── Addresses / ABI ──────────────────────────────────────────────────────────
const ROUTER_ADDRESS = addresses.PaymentRouter;
const VAULT_ADDRESS  = addresses.DonationVault;
const ROUTER_ABI     = PaymentRouterArtifact.abi;
const VAULT_ABI      = DonationVaultArtifact.abi;

// ─── Standalone Sepolia client (uses VITE_SEPOLIA_RPC_URL) ────────────────────
const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;

const explorerClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL, {
    retryCount: 3,
    retryDelay: ({ count }) => Math.min(1000 * 2 ** count, 10_000),
    timeout: 60_000,
  }),
});

// ─── Tuning ────────────────────────────────────────────────────────────────────
const MAX_BLOCK_RANGE       = 9_999n;
const SEPOLIA_GENESIS_BLOCK = 3_000_000n;
const LOOKBACK_BLOCKS       = 100_000n;
const INTER_CHUNK_MS        = 150;
const INTER_EVENT_MS        = 200;

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single',  'Multi'];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => !a || a === '0x0000000000000000000000000000000000000000'
  ? '—' : `${a.slice(0,6)}…${a.slice(-4)}`;
const shortHash = h => !h ? '—' : `${h.slice(0,10)}…${h.slice(-6)}`;

const timeAgo = ts => {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const findEvent = (abi, name) => abi.find(x => x.type === 'event' && x.name === name);

// Rate-limit-aware log fetcher with proper retry on 429/limit errors
async function safeGetLogs(params, fromBlock, toBlock) {
  const results = [];
  let start = fromBlock;
  let chunkCount = 0;
  let failedChunks = 0;

  while (start <= toBlock) {
    const end = start + MAX_BLOCK_RANGE - 1n < toBlock
      ? start + MAX_BLOCK_RANGE - 1n
      : toBlock;
    chunkCount++;

    let retries = 4;
    let delay = 1000;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const logs = await explorerClient.getLogs({
          ...params, fromBlock: start, toBlock: end,
        });
        results.push(...logs);
        success = true;
      } catch (err) {
        const msg = (err?.message || '').toLowerCase();
        const isRate = msg.includes('429') || msg.includes('rate') ||
          msg.includes('too many') || msg.includes('limit') ||
          msg.includes('forbidden') || msg.includes('compute');
        retries--;
        if (retries > 0) {
          console.warn(`[logs] chunk [${start}–${end}] retrying after ${delay}ms (${isRate ? 'rate-limited' : 'error'})`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        } else {
          failedChunks++;
          console.error(`[logs] chunk [${start}–${end}] FAILED after retries:`, err.shortMessage || err.message);
        }
      }
    }

    await new Promise(r => setTimeout(r, INTER_CHUNK_MS));
    start = end + 1n;
  }

  if (failedChunks > 0) {
    console.warn(`[logs] ${failedChunks}/${chunkCount} chunks failed for event — data may be incomplete`);
  }
  return results;
}

// Run event scans SEQUENTIALLY to stay under rate limits
async function fetchEventsSequential(eventDefs, fromBlock, toBlock) {
  const results = [];
  for (const { name, address, event } of eventDefs) {
    if (!event) {
      console.warn(`[logs] event "${name}" not found in ABI — skipping`);
      results.push([]);
      continue;
    }
    const logs = await safeGetLogs({ address, event }, fromBlock, toBlock);
    console.log(`[logs] ${name}: ${logs.length} events found`);
    results.push(logs);
    await new Promise(r => setTimeout(r, INTER_EVENT_MS));
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIMMER + LOADING SHELL
// ═══════════════════════════════════════════════════════════════════════════════

function ShimmerStyle() {
  return (
    <style>{`
      @keyframes shimmer {
        0%   { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
      }
      .skel-shimmer {
        background: linear-gradient(
          90deg,
          rgba(63,63,70,0) 0%,
          rgba(82,82,91,0.25) 50%,
          rgba(63,63,70,0) 100%
        );
        background-size: 1000px 100%;
        animation: shimmer 1.8s infinite linear;
      }
      .skel-blur {
        filter: blur(8px);
        opacity: 0.55;
        pointer-events: none;
        user-select: none;
      }
    `}</style>
  );
}

function LoadingShell({ loading, children }) {
  return (
    <div className="relative">
      <div className={loading ? 'skel-blur transition-all duration-500' : 'transition-all duration-500'}>
        {children}
      </div>
      {loading && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 skel-shimmer rounded-2xl" />
        </div>
      )}
    </div>
  );
}

function SkeletonRow({ index }) {
  return (
    <tr className={`border-b border-zinc-800/40 ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3"><div className="h-3 w-4 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-14 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI ATOMS
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-zinc-900/40 rounded-2xl p-5 border border-zinc-800/60 hover:border-zinc-700/60 transition-all">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">
        {label}
      </div>
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent || 'text-zinc-100'}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-600 mt-2">{sub}</div>}
    </div>
  );
}

function LiveDot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse"/>;
}

const STATUS_CLS = {
  Pending:   'bg-amber-950/60 text-amber-400 border-amber-900/40',
  Paid:      'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',
  Cancelled: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',
  Expired:   'bg-rose-950/60 text-rose-400 border-rose-900/40',
  Donation:  'bg-indigo-950/60 text-indigo-400 border-indigo-900/40',
};
const STATUS_DOT = {
  Pending: 'bg-amber-400', Paid: 'bg-emerald-400',
  Cancelled: 'bg-zinc-600', Expired: 'bg-rose-500', Donation: 'bg-indigo-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[status] || STATUS_CLS.Pending}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] || STATUS_DOT.Pending}`}/>
      {status}
    </span>
  );
}

function ActivityRow({ event, index }) {
  const base   = 'https://sepolia.etherscan.io';
  const isInv  = event.source === 'invoice';
  const status = isInv ? (INVOICE_STATUS[event.status] ?? 'Pending') : 'Donation';
  const type   = isInv ? (INVOICE_TYPE[Number(event.kind)] ?? 'Single') : 'Donation';

  return (
    <tr className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3 text-xs text-zinc-600 font-mono w-8">{index + 1}</td>
      <td className="px-4 py-3">
        <a href={`${base}/tx/${event.txHash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 group">
          <span className="text-xs font-mono">{shortHash(event.txHash)}</span>
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </a>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-zinc-500 max-w-[140px] truncate">
        {shortHash(event.invoiceId || event.pageId || '—')}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
          type === 'Single' ? 'bg-zinc-800 text-zinc-400' :
          type === 'Multi'  ? 'bg-violet-950/60 text-violet-400' :
                              'bg-indigo-950/60 text-indigo-400'
        }`}>
          {type}
        </span>
      </td>
      <td className="px-4 py-3"><StatusBadge status={status}/></td>
      <td className="px-4 py-3 text-xs text-zinc-600 italic select-none">••••••</td>
      <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
        {timeAgo(event.timestamp)}
      </td>
    </tr>
  );
}

function EmptyState({ query, fetchError }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-20 text-center">
        {fetchError ? (
          <div>
            <div className="text-rose-400/80 text-sm mb-2">Failed to load events</div>
            <div className="text-zinc-700 text-xs font-mono max-w-md mx-auto break-all">
              {fetchError}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-zinc-600 text-sm mb-1">
              {query ? `No results matching "${query}"` : 'No events found yet.'}
            </div>
            {!RPC_URL && (
              <div className="text-amber-500/70 text-xs mt-2">
                ⚠ VITE_SEPOLIA_RPC_URL is not set in .env
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL ACTIVITY GRAPH
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityGraph({ events }) {
  const [range, setRange]   = useState('1M');
  const [filter, setFilter] = useState('Both');
  const [zoom, setZoom]     = useState(1);
  const [hover, setHover]   = useState(null);
  const svgRef = useRef(null);

  const series = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice' && e.timestamp);
    const now = Math.floor(Date.now() / 1000);
    const cutoffs = { '1D': now - 86_400, '1W': now - 7 * 86_400, '1M': now - 30 * 86_400 };
    const steps   = { '1D': 3_600,         '1W': 86_400,           '1M': 86_400 };
    const cutoff  = cutoffs[range];
    const step    = steps[range];

    const start = Math.floor(cutoff / step) * step;
    const end   = Math.floor(now    / step) * step;
    const bk = {};
    for (let k = start; k <= end; k += step) bk[k] = { pending: 0, paid: 0 };

    inv.filter(e => Number(e.timestamp) >= cutoff).forEach(e => {
      const k = Math.floor(Number(e.timestamp) / step) * step;
      if (!bk[k]) bk[k] = { pending: 0, paid: 0 };
      if (e.status === 0) bk[k].pending++;
      if (e.status === 1) bk[k].paid++;
    });

    return Object.keys(bk).map(Number).sort((a, b) => a - b)
      .map(k => ({ t: k, pending: bk[k].pending, paid: bk[k].paid }));
  }, [events, range]);

  const totals = useMemo(() =>
    series.reduce((acc, p) => ({
      pending: acc.pending + p.pending,
      paid:    acc.paid    + p.paid,
    }), { pending: 0, paid: 0 }),
  [series]);

  const hasData = totals.pending > 0 || totals.paid > 0;

  const W = 900;
  const H = 280;
  const PAD = { top: 24, right: 24, bottom: 32, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const showPaid = filter === 'Both' || filter === 'Settled';
  const showPend = filter === 'Both' || filter === 'Pending';

  const max = Math.max(
    ...series.flatMap(p => [
      showPend ? p.pending : 0,
      showPaid ? p.paid    : 0,
    ]),
    4,
  );
  const yMax = Math.ceil(max / 4) * 4 || 4;

  const xFor = i => {
    if (series.length <= 1) return PAD.left + innerW / 2;
    return PAD.left + (i / (series.length - 1)) * innerW;
  };
  const yFor = v => PAD.top + innerH - (v / yMax) * innerH;

  function smoothPath(pts) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  const paidPts = series.map((p, i) => ({ x: xFor(i), y: yFor(p.paid) }));
  const pendPts = series.map((p, i) => ({ x: xFor(i), y: yFor(p.pending) }));
  const paidLine = smoothPath(paidPts);
  const pendLine = smoothPath(pendPts);

  const closeArea = (d, pts) => {
    if (!pts.length) return '';
    const last  = pts[pts.length - 1];
    const first = pts[0];
    return `${d} L ${last.x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} L ${first.x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} Z`;
  };

  const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map(v => Math.round(v));

  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const fmtDay = t => new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const fmtHr  = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit' });

    if (range === '1W') {
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      return series.map((p, i) => ({
        i,
        x: xFor(i),
        label: days[new Date(p.t * 1000).getDay() === 0 ? 6 : new Date(p.t * 1000).getDay() - 1],
      }));
    }

    const fmt = range === '1D' ? fmtHr : fmtDay;
    const targetCount = 6;
    const step = Math.max(1, Math.floor(series.length / targetCount));
    const out = [];
    for (let i = 0; i < series.length; i += step) {
      out.push({ i, x: xFor(i), label: fmt(series[i].t) });
    }
    const last = series.length - 1;
    if (out[out.length - 1]?.i !== last && last >= 0) {
      out.push({ i: last, x: xFor(last), label: fmt(series[last].t) });
    }
    return out;
  }, [series, range]);

  function onMove(e) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px   = ((e.clientX - rect.left) / rect.width) * W;
    const rel  = (px - PAD.left) / innerW;
    const idx  = Math.round(rel * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, idx)));
  }
  function onLeave() { setHover(null); }
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(z => Math.max(1, Math.min(4, z + delta)));
  }

  const viewBox = (() => {
    if (zoom === 1) return `0 0 ${W} ${H}`;
    const visibleW = W / zoom;
    const focusIdx = hover ?? Math.floor(series.length / 2);
    const focusX   = xFor(focusIdx);
    let x = focusX - visibleW / 2;
    x = Math.max(0, Math.min(W - visibleW, x));
    return `${x} 0 ${visibleW} ${H}`;
  })();

  return (
    <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 h-full flex flex-col">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Protocol activity</h3>
          <p className="text-xs text-zinc-500 mt-0.5">All invoices — pending vs settled</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 rounded-full p-1">
            {['1D', '1W', '1M'].map(r => (
              <button key={r} onClick={() => { setRange(r); setZoom(1); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  range === r ? 'bg-white text-zinc-900 shadow' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r}</button>
            ))}
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 rounded-full p-1">
            {['Both', 'Pending', 'Settled'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  filter === f ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-end gap-8 mb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">Pending</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{totals.pending}</span>
            <span className="text-[10px] text-zinc-600 font-medium">{range}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">Settled</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{totals.paid}</span>
            <span className="text-[10px] text-zinc-600 font-medium">{range}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">Total</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{totals.pending + totals.paid}</span>
            <span className="text-[10px] text-zinc-600 font-medium">{range}</span>
          </div>
        </div>
        {zoom > 1 && (
          <button onClick={() => setZoom(1)}
            className="ml-auto px-4 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200
              bg-zinc-800/60 hover:bg-zinc-700/60 rounded-full transition-all">
            Zoom Out
          </button>
        )}
      </div>

      <div className="relative flex-1">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-zinc-600">No payments in this period</p>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-auto cursor-crosshair select-none"
          style={{ maxHeight: 320 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onWheel={onWheel}
        >
          <defs>
            <linearGradient id="exPaidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="exPendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map(v => (
            <g key={`y-${v}`}>
              <line x1={PAD.left} y1={yFor(v)} x2={W - PAD.right} y2={yFor(v)}
                stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
              <text x={PAD.left - 10} y={yFor(v) + 4} textAnchor="end"
                className="fill-zinc-600" fontSize="11" fontWeight="500">{v}</text>
            </g>
          ))}

          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH}
            stroke="#3f3f46" strokeWidth="1" opacity="0.6" />

          {xLabels.map((l, i) => (
            <text key={`x-${i}`} x={l.x} y={H - 8} textAnchor="middle"
              className="fill-zinc-500" fontSize="11" fontWeight="500">{l.label}</text>
          ))}

          {showPaid && paidPts.length > 1 && (
            <path d={closeArea(paidLine, paidPts)} fill="url(#exPaidFill)" />
          )}
          {showPend && pendPts.length > 1 && (
            <path d={closeArea(pendLine, pendPts)} fill="url(#exPendFill)" />
          )}
          {showPaid && (
            <path d={paidLine} fill="none" stroke="#10b981" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}
          {showPend && (
            <path d={pendLine} fill="none" stroke="#f59e0b" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {hover !== null && series[hover] && (
            <g pointerEvents="none">
              <line x1={xFor(hover)} y1={PAD.top} x2={xFor(hover)} y2={PAD.top + innerH}
                stroke="#52525b" strokeWidth="1" strokeDasharray="3 3" />
              {showPaid && (
                <circle cx={xFor(hover)} cy={yFor(series[hover].paid)} r="5"
                  fill="#10b981" stroke="#09090b" strokeWidth="2" />
              )}
              {showPend && (
                <circle cx={xFor(hover)} cy={yFor(series[hover].pending)} r="5"
                  fill="#f59e0b" stroke="#09090b" strokeWidth="2" />
              )}
            </g>
          )}
        </svg>

        {hover !== null && series[hover] && (
          <div className="absolute pointer-events-none bg-zinc-950 border border-zinc-800
            rounded-lg shadow-xl px-3 py-2 text-xs"
            style={{
              left: `${(xFor(hover) / W) * 100}%`,
              top: 8,
              transform: 'translateX(-50%)',
            }}>
            <div className="text-zinc-500 mb-1 font-medium">
              {new Date(series[hover].t * 1000).toLocaleDateString([], {
                month: 'short', day: 'numeric',
                hour: range === '1D' ? '2-digit' : undefined,
              })}
            </div>
            {showPend && (
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Pending: <span className="font-semibold">{series[hover].pending}</span>
              </div>
            )}
            {showPaid && (
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Settled: <span className="font-semibold">{series[hover].paid}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/60">
        <p className="text-[11px] text-zinc-600">Scroll on the chart to zoom in or out.</p>
        <div className="flex items-center gap-4 text-xs">
          {showPend && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pending
            </div>
          )}
          {showPaid && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Settled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = ['All', 'Pending', 'Paid', 'Cancelled', 'Expired', 'Donations'];

export default function Explorer() {
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [fromBlock,   setFromBlock]   = useState(null);
  const [tab,         setTab]         = useState('All');
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');

  // ── Fetch all historical logs SEQUENTIALLY ─────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setFetchError('');

    try {
      if (!RPC_URL) {
        throw new Error('VITE_SEPOLIA_RPC_URL is not set in .env');
      }

      console.log('[explorer] starting fetch…');
      const currentBlock = await explorerClient.getBlockNumber();
      const scanFrom = currentBlock > LOOKBACK_BLOCKS
        ? currentBlock - LOOKBACK_BLOCKS
        : SEPOLIA_GENESIS_BLOCK;
      setFromBlock(scanFrom);

      console.log(`[explorer] scanning blocks ${scanFrom} → ${currentBlock} (${currentBlock - scanFrom} blocks)`);

      // Resolve all event ABIs upfront
      const eventDefs = [
        { name: 'SingleInvoiceCreated', address: ROUTER_ADDRESS, event: findEvent(ROUTER_ABI, 'SingleInvoiceCreated') },
        { name: 'MultiInvoiceCreated',  address: ROUTER_ADDRESS, event: findEvent(ROUTER_ABI, 'MultiInvoiceCreated') },
        { name: 'InvoicePaid',          address: ROUTER_ADDRESS, event: findEvent(ROUTER_ABI, 'InvoicePaid') },
        { name: 'InvoiceCancelled',     address: ROUTER_ADDRESS, event: findEvent(ROUTER_ABI, 'InvoiceCancelled') },
        { name: 'InvoiceExpired',       address: ROUTER_ADDRESS, event: findEvent(ROUTER_ABI, 'InvoiceExpired') },
        { name: 'DonationReceived',     address: VAULT_ADDRESS,  event: findEvent(VAULT_ABI,  'DonationReceived') },
        { name: 'PageCreated',          address: VAULT_ADDRESS,  event: findEvent(VAULT_ABI,  'PageCreated') },
      ];

      // SEQUENTIAL scan — one event type at a time
      const [
        singleCreated, multiCreated,
        paid, cancelled, expired,
        donated, pages,
      ] = await fetchEventsSequential(eventDefs, scanFrom, currentBlock);

      console.log('[explorer] raw counts:', {
        singleCreated: singleCreated.length,
        multiCreated:  multiCreated.length,
        paid:          paid.length,
        cancelled:     cancelled.length,
        expired:       expired.length,
        donated:       donated.length,
        pages:         pages.length,
      });

      // Build status map
      const statusMap = {};
      singleCreated.forEach(l => { statusMap[l.args.invoiceId] = 0; });
      multiCreated.forEach(l  => { statusMap[l.args.invoiceId] = 0; });
      paid.forEach(l          => { statusMap[l.args.invoiceId] = 1; });
      cancelled.forEach(l     => { statusMap[l.args.invoiceId] = 2; });
      expired.forEach(l       => { statusMap[l.args.invoiceId] = 3; });

      const singleEvents = singleCreated.map(l => ({
        source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
        invoiceId: l.args.invoiceId, kind: 0,
        from: l.args.creator, to: l.args.recipient,
        status: statusMap[l.args.invoiceId] ?? 0,
        timestamp: null,
      }));

      const multiEvents = multiCreated.map(l => ({
        source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
        invoiceId: l.args.invoiceId, kind: 1,
        from: l.args.creator, to: null,
        itemCount: Number(l.args.itemCount),
        status: statusMap[l.args.invoiceId] ?? 0,
        timestamp: null,
      }));

      const pageCreatorMap = {};
      pages.forEach(l => { pageCreatorMap[l.args.pageId] = l.args.creator; });
      const donationEvents = donated.map(l => ({
        source: 'donation', txHash: l.transactionHash, blockNumber: l.blockNumber,
        pageId: l.args.pageId,
        from: l.args.donor, to: pageCreatorMap[l.args.pageId] || VAULT_ADDRESS,
        status: 99, timestamp: null,
      }));

      const all = [...singleEvents, ...multiEvents, ...donationEvents]
        .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

      console.log(`[explorer] total events: ${all.length}`);

      // Fetch block timestamps SEQUENTIALLY
      const blockNums = [...new Set(all.slice(0, 50).map(e => e.blockNumber))];
      const blockMap  = {};
      for (const bn of blockNums) {
        try {
          const block = await explorerClient.getBlock({ blockNumber: bn });
          blockMap[bn] = block.timestamp;
        } catch (e) {
          console.warn('[explorer] failed to fetch block', bn, e?.message);
          blockMap[bn] = null;
        }
        await new Promise(r => setTimeout(r, 80));
      }
      all.forEach(e => { e.timestamp = blockMap[e.blockNumber] ?? null; });

      setEvents(all);
    } catch (err) {
      console.error('[explorer] fetch error:', err);
      setFetchError(err.shortMessage || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Live watchers ──────────────────────────────────────────────────────────
  useWatchContractEvent({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, eventName: 'SingleInvoiceCreated',
    onLogs: logs => setEvents(prev => [
      ...logs.map(l => ({
        source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
        invoiceId: l.args.invoiceId, kind: 0,
        from: l.args.creator, to: l.args.recipient, status: 0,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      })),
      ...prev,
    ]),
  });
  useWatchContractEvent({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, eventName: 'MultiInvoiceCreated',
    onLogs: logs => setEvents(prev => [
      ...logs.map(l => ({
        source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
        invoiceId: l.args.invoiceId, kind: 1,
        from: l.args.creator, to: null,
        itemCount: Number(l.args.itemCount), status: 0,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      })),
      ...prev,
    ]),
  });
  useWatchContractEvent({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, eventName: 'InvoicePaid',
    onLogs: logs => setEvents(prev => prev.map(e =>
      e.source === 'invoice' && logs.some(l => l.args.invoiceId === e.invoiceId)
        ? { ...e, status: 1 } : e
    )),
  });
  useWatchContractEvent({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, eventName: 'InvoiceCancelled',
    onLogs: logs => setEvents(prev => prev.map(e =>
      e.source === 'invoice' && logs.some(l => l.args.invoiceId === e.invoiceId)
        ? { ...e, status: 2 } : e
    )),
  });
  useWatchContractEvent({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, eventName: 'InvoiceExpired',
    onLogs: logs => setEvents(prev => prev.map(e =>
      e.source === 'invoice' && logs.some(l => l.args.invoiceId === e.invoiceId)
        ? { ...e, status: 3 } : e
    )),
  });
  useWatchContractEvent({
    address: VAULT_ADDRESS, abi: VAULT_ABI, eventName: 'DonationReceived',
    onLogs: logs => setEvents(prev => [
      ...logs.map(l => ({
        source: 'donation', txHash: l.transactionHash, blockNumber: l.blockNumber,
        pageId: l.args.pageId, from: l.args.donor, to: VAULT_ADDRESS,
        status: 99, timestamp: BigInt(Math.floor(Date.now() / 1000)),
      })),
      ...prev,
    ]),
  });

  // ── Derived stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const inv  = events.filter(e => e.source === 'invoice');
    const don  = events.filter(e => e.source === 'donation');
    const paid = inv.filter(e => e.status === 1);
    const pend = inv.filter(e => e.status === 0);
    const canc = inv.filter(e => e.status === 2);
    const exp  = inv.filter(e => e.status === 3);
    return {
      invoices: inv.length, donations: don.length,
      single: inv.filter(e => e.kind === 0).length,
      multi:  inv.filter(e => e.kind === 1).length,
      paid: paid.length, pending: pend.length,
      cancelled: canc.length, expired: exp.length,
      creators: new Set(events.map(e => e.from).filter(Boolean)).size,
      successRate: inv.length > 0 ? ((paid.length / inv.length) * 100).toFixed(1) : '—',
    };
  }, [events]);

  const tabCount = useMemo(() => ({
    All:       events.length,
    Pending:   events.filter(e => e.source === 'invoice' && e.status === 0).length,
    Paid:      events.filter(e => e.source === 'invoice' && e.status === 1).length,
    Cancelled: events.filter(e => e.source === 'invoice' && e.status === 2).length,
    Expired:   events.filter(e => e.source === 'invoice' && e.status === 3).length,
    Donations: events.filter(e => e.source === 'donation').length,
  }), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (tab === 'Pending')   list = list.filter(e => e.source === 'invoice' && e.status === 0);
    if (tab === 'Paid')      list = list.filter(e => e.source === 'invoice' && e.status === 1);
    if (tab === 'Cancelled') list = list.filter(e => e.source === 'invoice' && e.status === 2);
    if (tab === 'Expired')   list = list.filter(e => e.source === 'invoice' && e.status === 3);
    if (tab === 'Donations') list = list.filter(e => e.source === 'donation');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.txHash    || '').toLowerCase().includes(q) ||
        (e.invoiceId || '').toLowerCase().includes(q) ||
        (e.pageId    || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, tab, search]);

  const handleSearch = e => { e.preventDefault(); setSearch(searchInput.trim()); };
  const clearSearch  = () => { setSearch(''); setSearchInput(''); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 tracking-tight font-sans">
      <ShimmerStyle />

      {/* Hero */}
      <section className="relative pt-24 pb-12 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px]
          bg-indigo-500/8 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none
          bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-xs font-semibold tracking-widest text-indigo-400 uppercase mb-4">
            Protocol explorer
          </div>
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-white leading-tight mb-4">
            Global activity.{' '}
            <span className="bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              Full opacity.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed mb-8">
            Live reads from Zeroremit contracts on Sepolia. Invoice statuses are on-chain.
            Amounts and counterparties stay encrypted — always.
          </p>

          {!RPC_URL && (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-amber-950/30
              border border-amber-900/40 rounded-xl text-xs text-amber-400 max-w-2xl">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span><code className="font-mono">VITE_SEPOLIA_RPC_URL</code> is not set — add your Infura or Alchemy Sepolia endpoint to <code className="font-mono">.env</code> and restart.</span>
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4
                text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search by tx hash or invoice/page ID…"
                className="w-full pl-10 pr-9 py-2.5 bg-zinc-900/80 border border-zinc-800
                  rounded-full text-sm text-zinc-200 placeholder-zinc-600
                  focus:outline-none focus:border-indigo-500/60 focus:ring-1
                  focus:ring-indigo-500/30 transition-all" />
              {searchInput && (
                <button type="button" onClick={clearSearch}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
            <button type="submit"
              className="px-5 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-medium
                rounded-full text-sm transition-all active:scale-95 whitespace-nowrap">
              Search
            </button>
          </form>
          {search && (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span>Results for</span>
              <span className="font-mono text-zinc-300 bg-zinc-800/60 px-2 py-0.5 rounded">{search}</span>
              <button onClick={clearSearch} className="text-indigo-400 hover:text-indigo-300">clear</button>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 space-y-6">

        {/* Stats + Graph (cards LEFT, graph RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 grid grid-cols-2 gap-3 content-start">
            <LoadingShell loading={loading}>
              <StatCard
                label="Total invoices"
                value={loading ? '0' : stats.invoices.toLocaleString()}
                sub={loading ? '— · —' : `${stats.single} single · ${stats.multi} multi`}
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Settled"
                value={loading ? '0' : stats.paid.toLocaleString()}
                sub={loading ? '— success' : (stats.invoices > 0 ? `${stats.successRate}% success` : '—')}
                accent="text-emerald-400"
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Pending"
                value={loading ? '0' : stats.pending.toLocaleString()}
                sub={loading ? '— awaiting' :
                  [stats.cancelled > 0 ? `${stats.cancelled} cancelled` : '',
                   stats.expired   > 0 ? `${stats.expired} expired`     : '']
                  .filter(Boolean).join(' · ') || 'awaiting payment'
                }
                accent="text-amber-400"
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Unique wallets"
                value={loading ? '0' : stats.creators.toLocaleString()}
                sub={loading ? '— donations'
                  : `${stats.donations} donation${stats.donations !== 1 ? 's' : ''}`}
              />
            </LoadingShell>
          </div>

          <div className="lg:col-span-8">
            <LoadingShell loading={loading}>
              <ActivityGraph events={events} />
            </LoadingShell>
          </div>
        </div>

        {/* Activity table */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between
            gap-3 px-5 py-4 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 flex-wrap">
              <LiveDot />
              <span className="text-sm font-medium text-zinc-200">Activity</span>
              {!loading && (
                <span className="text-xs text-zinc-600">
                  {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
              {!loading && fromBlock && (
                <span className="text-[11px] text-zinc-700">
                  · from block {Number(fromBlock).toLocaleString()}
                </span>
              )}
              <button onClick={fetchEvents} disabled={loading}
                className="text-[11px] text-zinc-600 hover:text-zinc-400 disabled:opacity-40
                  transition-colors flex items-center gap-1 ml-1">
                <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading ? 'Scanning…' : 'Refresh'}
              </button>
            </div>

            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1
              border border-zinc-800/60 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    whitespace-nowrap ${tab === t
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}>
                  {t}
                  {!loading && tabCount[t] > 0 && (
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                      tab === t ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-600'
                    }`}>{tabCount[t]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <LoadingShell loading={loading}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-zinc-800/60">
                    {['#', 'Tx Hash', 'Invoice / Page', 'Type', 'Status', 'Amount', 'Time'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold
                        text-zinc-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i} />)
                  ) : filtered.length === 0 ? (
                    <EmptyState query={search} fetchError={fetchError} />
                  ) : (
                    filtered.slice(0, 200).map((ev, i) => (
                      <ActivityRow key={`${ev.txHash}-${i}`} event={ev} index={i} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </LoadingShell>

          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-zinc-800/40">
              <span className="text-xs text-zinc-600">
                {Math.min(filtered.length, 200).toLocaleString()} of {filtered.length.toLocaleString()} events
              </span>
            </div>
          )}
        </div>

        {/* Contract address cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'USDC (Circle)', addr: addresses.USDC },
            { label: 'cUSDC',         addr: addresses.cUSDC },
            { label: 'PaymentRouter', addr: addresses.PaymentRouter },
            { label: 'DonationVault', addr: addresses.DonationVault },
          ].map(c => (
            <a key={c.label} href={`https://sepolia.etherscan.io/address/${c.addr}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between px-4 py-3 bg-zinc-900/40
                rounded-xl border border-zinc-800/40 hover:border-zinc-700/60
                transition-all group">
              <div>
                <div className="text-[11px] text-zinc-600 mb-0.5">{c.label}</div>
                <div className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200">
                  {shortAddr(c.addr)}
                </div>
              </div>
              <svg className="w-3.5 h-3.5 text-zinc-700 group-hover:text-indigo-400 flex-shrink-0"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ))}
        </div>

        <div className="text-center text-xs text-zinc-700">
          Deployed {new Date(addresses.deployedAt).toLocaleDateString('en', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}
          {' · '}Sepolia {addresses.chainId}
          {' · '}PaymentRouter <span className="font-mono">v2.0.0</span>
          {RPC_URL && (
            <span className="ml-2 text-zinc-800">
              · {RPC_URL.includes('infura') ? 'Infura'
                 : RPC_URL.includes('alchemy') ? 'Alchemy'
                 : 'Custom RPC'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}