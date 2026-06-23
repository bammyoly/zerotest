// Dashboard.jsx
import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import {
  useAccount, usePublicClient, useWalletClient,
} from 'wagmi';
import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';

import PaymentRouterArtifact    from '../contracts/PaymentRouter.json';
import ConfidentialUSDCArtifact from '../contracts/ConfidentialUSDC.json';
import DonationVaultArtifact    from '../contracts/DonationVault.json';
import addresses                from '../contracts/addresses.json';
import { useZamaEncrypt }       from '../hooks/useZamaEncrypt';

// ─── Addresses ─────────────────────────────────────────────────────────────────
const ROUTER_ADDRESS = addresses.PaymentRouter;
const VAULT_ADDRESS  = addresses.DonationVault;
const CUSDC_ADDRESS  = addresses.cUSDC;
const USDC_ADDRESS   = addresses.USDC;

const ROUTER_ABI = PaymentRouterArtifact.abi;
const VAULT_ABI  = DonationVaultArtifact.abi;
const USDC_DECIMALS = 6;

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;
if (!RPC_URL) console.error('[Dashboard] VITE_SEPOLIA_RPC_URL is not set in .env');

let _readClient = null;
function getReadClient() {
  if (!_readClient) {
    _readClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL, { timeout: 30_000, retryCount: 3, retryDelay: 1_500 }),
    });
  }
  return _readClient;
}

const USDC_BALANCE_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}];
const CUSDC_HANDLE_ABI = [{
  name: 'confidentialBalanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bytes32' }],
}];

const CHUNK_SIZE      = 10_000n;
const LOOKBACK_BLOCKS = 50_000n;
const INTER_CHUNK_MS  = 250;
const POLL_INTERVAL   = 30_000;

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled'];
const INVOICE_TYPE   = ['Single',  'Multi'];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
const shortHash = h => h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—';
const eqAddr    = (a, b) => !!(a && b && a.toLowerCase() === b.toLowerCase());

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - Number(ts);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtUsdc(bn) {
  if (bn === null || bn === undefined) return '0.00';
  try {
    return Number(formatUnits(bn, USDC_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  } catch { return '0.00'; }
}

async function safeGetLogs(client, params, fromBlock, toBlock) {
  const results = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = (start + CHUNK_SIZE - 1n < toBlock) ? start + CHUNK_SIZE - 1n : toBlock;
    let retries = 4, delay = 1_000;
    while (retries > 0) {
      try {
        const logs = await client.getLogs({ ...params, fromBlock: start, toBlock: end });
        results.push(...logs);
        break;
      } catch (err) {
        const msg = (err?.message || '').toLowerCase();
        const isRate = msg.includes('429') || msg.includes('rate') ||
          msg.includes('too many') || msg.includes('limit') ||
          msg.includes('forbidden') || msg.includes('403');
        retries--;
        if (isRate && retries > 0) {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        } else if (retries > 0) {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        } else break;
      }
    }
    await new Promise(r => setTimeout(r, INTER_CHUNK_MS));
    start = end + 1n;
  }
  return results;
}

async function fetchAllLogs(client, from, to, evs) {
  const results = [];
  for (const { address: addr, event } of evs) {
    if (!event) { results.push([]); continue; }
    const logs = await safeGetLogs(client, { address: addr, event }, from, to);
    results.push(logs);
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI ATOMS
// ═══════════════════════════════════════════════════════════════════════════════

// Shimmer animation injected once
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

// Wraps content with blur + shimmer overlay while loading
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

function Spinner({ label, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

function LiveDot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />;
}

function BigCard({ label, accent, children }) {
  return (
    <div className="bg-zinc-900/40 rounded-2xl p-5 border border-zinc-800/60 hover:border-zinc-700/60 transition-all">
      <div className={`text-[11px] font-semibold uppercase tracking-widest mb-3 ${accent || 'text-zinc-500'}`}>{label}</div>
      {children}
    </div>
  );
}

function MetricRow({ value, unit, unitColor }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{value}</span>
      <span className={`text-[11px] font-medium uppercase tracking-wider ${unitColor || 'text-zinc-600'}`}>{unit}</span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-zinc-900/40 rounded-2xl p-5 border border-zinc-800/60 hover:border-zinc-700/60 transition-all">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{label}</div>
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent || 'text-zinc-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-2">{sub}</div>}
    </div>
  );
}

const STATUS_CLS = {
  Pending:   'bg-amber-950/60 text-amber-400 border-amber-900/40',
  Paid:      'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',
  Cancelled: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',
  Donation:  'bg-indigo-950/60 text-indigo-400 border-indigo-900/40',
};
const STATUS_DOT = {
  Pending: 'bg-amber-400', Paid: 'bg-emerald-400',
  Cancelled: 'bg-zinc-600', Donation: 'bg-indigo-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[status] || STATUS_CLS.Pending}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] || STATUS_DOT.Pending}`} />
      {status}
    </span>
  );
}

function DirectionPill({ direction }) {
  const s = direction === 'sent';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${s ? 'bg-orange-950/50 text-orange-400' : 'bg-emerald-950/50 text-emerald-400'}`}>
      <svg className={`w-3 h-3 ${s ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
      </svg>
      {s ? 'Sent' : 'Received'}
    </span>
  );
}

function ActivityRow({ event, index }) {
  const base  = 'https://sepolia.etherscan.io';
  const isInv = event.source === 'invoice';
  const status = isInv ? (INVOICE_STATUS[event.status] ?? 'Pending') : 'Donation';
  const type   = isInv ? (INVOICE_TYPE[Number(event.kind)] ?? 'Single') : 'Donation';
  return (
    <tr className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3 text-xs text-zinc-600 font-mono">{index + 1}</td>
      <td className="px-4 py-3"><DirectionPill direction={event.direction} /></td>
      <td className="px-4 py-3">
        <a href={`${base}/tx/${event.txHash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors group">
          <span className="text-xs font-mono">{shortHash(event.txHash)}</span>
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-zinc-500 max-w-[120px] truncate">
        {shortHash(event.invoiceId || event.pageId || '—')}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
          type === 'Single' ? 'bg-zinc-800 text-zinc-400'
          : type === 'Multi' ? 'bg-violet-950/60 text-violet-400'
          : 'bg-indigo-950/60 text-indigo-400'}`}>
          {type}
        </span>
      </td>
      <td className="px-4 py-3">
        <a href={`${base}/address/${event.from}`} target="_blank" rel="noreferrer"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200">
          {shortAddr(event.from)}
        </a>
      </td>
      <td className="px-4 py-3">
        <a href={event.to === 'open' ? '#' : `${base}/address/${event.to}`}
          target="_blank" rel="noreferrer"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200">
          {event.to === 'open' ? 'Open' : shortAddr(event.to)}
        </a>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-600 italic select-none">••••••</td>
      <td className="px-4 py-3"><StatusBadge status={status} /></td>
      <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
        {timeAgo(event.timestamp)}
      </td>
    </tr>
  );
}

// Skeleton row used inside the blur layer
function SkeletonRow({ index }) {
  return (
    <tr className={`border-b border-zinc-800/40 ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3"><div className="h-3 w-4 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-14 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
    </tr>
  );
}

function EmptyState({ connected, fetchError }) {
  return (
    <tr>
      <td colSpan={10} className="px-4 py-20 text-center">
        {!connected ? (
          <p className="text-zinc-600 text-sm">Connect your wallet to view activity.</p>
        ) : fetchError ? (
          <div>
            <p className="text-rose-400/80 text-sm mb-1">Failed to fetch events</p>
            <p className="text-zinc-700 text-xs font-mono break-all">{fetchError}</p>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">No transactions found.</p>
        )}
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL PAYMENT GRAPH (matches reference design)
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentGraph({ events }) {
  const [range, setRange]   = useState('1M');
  const [filter, setFilter] = useState('Both'); // Both | Pending | Settled
  const [zoom, setZoom]     = useState(1);
  const [hover, setHover]   = useState(null);
  const svgRef = useRef(null);

  // ── Build bucketed series ───────────────────────────────────────────────────
  const series = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice' && e.timestamp);
    const now = Math.floor(Date.now() / 1000);
    const cutoffs = { '1D': now - 86_400, '1W': now - 7 * 86_400, '1M': now - 30 * 86_400 };
    const steps   = { '1D': 3_600,         '1W': 86_400,           '1M': 86_400 };
    const cutoff  = cutoffs[range];
    const step    = steps[range];

    // Build full bucket range so the X-axis spans the whole period
    const start = Math.floor(cutoff / step) * step;
    const end   = Math.floor(now / step) * step;
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

  const totals = useMemo(() => {
    return series.reduce((acc, p) => ({
      pending: acc.pending + p.pending,
      paid:    acc.paid + p.paid,
    }), { pending: 0, paid: 0 });
  }, [series]);

  const hasData = totals.pending > 0 || totals.paid > 0;

  // ── Chart geometry ──────────────────────────────────────────────────────────
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
    4, // minimum scale
  );
  const yMax = Math.ceil(max / 4) * 4 || 4;

  const xFor = i => {
    if (series.length <= 1) return PAD.left + innerW / 2;
    return PAD.left + (i / (series.length - 1)) * innerW;
  };
  const yFor = v => PAD.top + innerH - (v / yMax) * innerH;

  // ── Smooth Catmull-Rom → Bezier path ────────────────────────────────────────
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

  // ── Y-axis ticks ───────────────────────────────────────────────────────────
  const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map(v => Math.round(v));

  // ── X-axis labels ──────────────────────────────────────────────────────────
  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const fmtDay = t => new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const fmtHr  = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit' });
    const fmt = range === '1D' ? fmtHr : fmtDay;

    if (range === '1W') {
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      return series.map((p, i) => ({
        i,
        x: xFor(i),
        label: days[new Date(p.t * 1000).getDay() === 0 ? 6 : new Date(p.t * 1000).getDay() - 1],
      }));
    }

    const targetCount = range === '1D' ? 6 : 6;
    const step = Math.max(1, Math.floor(series.length / targetCount));
    const out = [];
    for (let i = 0; i < series.length; i += step) {
      out.push({ i, x: xFor(i), label: fmt(series[i].t) });
    }
    // ensure last point shown
    const last = series.length - 1;
    if (out[out.length - 1]?.i !== last && last >= 0) {
      out.push({ i: last, x: xFor(last), label: fmt(series[last].t) });
    }
    return out;
  }, [series, range]);

  // ── Hover interaction ──────────────────────────────────────────────────────
  function onMove(e) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px   = ((e.clientX - rect.left) / rect.width) * W;
    const rel  = (px - PAD.left) / innerW;
    const idx  = Math.round(rel * (series.length - 1));
    const clamped = Math.max(0, Math.min(series.length - 1, idx));
    setHover(clamped);
  }
  function onLeave() { setHover(null); }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(z => Math.max(1, Math.min(4, z + delta)));
  }

  // Apply zoom via viewBox crop (centered on hover index if available)
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
    <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Invoice activity</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Pending vs settled invoices over time</p>
        </div>

        {/* Range pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 rounded-full p-1">
            {['1D', '1W', '1M'].map(r => (
              <button key={r} onClick={() => { setRange(r); setZoom(1); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  range === r
                    ? 'bg-white text-zinc-900 shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r}</button>
            ))}
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Filter toggles */}
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 rounded-full p-1">
            {['Both', 'Pending', 'Settled'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  filter === f
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats row */}
      <div className="flex items-end gap-8 mb-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">
            Pending
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">
              {totals.pending}
            </span>
            <span className="text-[10px] text-zinc-600 font-medium">{range}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">
            Settled
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">
              {totals.paid}
            </span>
            <span className="text-[10px] text-zinc-600 font-medium">{range}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">
            Total
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-zinc-100 tabular-nums">
              {totals.pending + totals.paid}
            </span>
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

      {/* Chart */}
      <div className="relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-zinc-600">No payments in this period</p>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-auto cursor-crosshair select-none"
          style={{ maxHeight: 340 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onWheel={onWheel}
        >
          <defs>
            <linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis dotted grid + labels */}
          {yTicks.map(v => (
            <g key={`y-${v}`}>
              <line
                x1={PAD.left} y1={yFor(v)}
                x2={W - PAD.right} y2={yFor(v)}
                stroke="#3f3f46"
                strokeWidth="1"
                strokeDasharray="2 4"
                opacity="0.4"
              />
              <text
                x={PAD.left - 10}
                y={yFor(v) + 4}
                textAnchor="end"
                className="fill-zinc-600"
                fontSize="11"
                fontWeight="500"
              >
                {v}
              </text>
            </g>
          ))}

          {/* X-axis baseline */}
          <line
            x1={PAD.left} y1={PAD.top + innerH}
            x2={W - PAD.right} y2={PAD.top + innerH}
            stroke="#3f3f46" strokeWidth="1" opacity="0.6"
          />

          {/* X-axis labels */}
          {xLabels.map((l, i) => (
            <text
              key={`x-${i}`}
              x={l.x}
              y={H - 8}
              textAnchor="middle"
              className="fill-zinc-500"
              fontSize="11"
              fontWeight="500"
            >
              {l.label}
            </text>
          ))}

          {/* Area fills */}
          {showPaid && paidPts.length > 1 && (
            <path d={closeArea(paidLine, paidPts)} fill="url(#paidFill)" />
          )}
          {showPend && pendPts.length > 1 && (
            <path d={closeArea(pendLine, pendPts)} fill="url(#pendFill)" />
          )}

          {/* Lines */}
          {showPaid && (
            <path
              d={paidLine}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showPend && (
            <path
              d={pendLine}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover crosshair + data points */}
          {hover !== null && series[hover] && (
            <g pointerEvents="none">
              <line
                x1={xFor(hover)} y1={PAD.top}
                x2={xFor(hover)} y2={PAD.top + innerH}
                stroke="#52525b" strokeWidth="1" strokeDasharray="3 3"
              />
              {showPaid && (
                <circle
                  cx={xFor(hover)} cy={yFor(series[hover].paid)}
                  r="5" fill="#10b981" stroke="#09090b" strokeWidth="2"
                />
              )}
              {showPend && (
                <circle
                  cx={xFor(hover)} cy={yFor(series[hover].pending)}
                  r="5" fill="#f59e0b" stroke="#09090b" strokeWidth="2"
                />
              )}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && series[hover] && (
          <div
            className="absolute pointer-events-none bg-zinc-950 border border-zinc-800
              rounded-lg shadow-xl px-3 py-2 text-xs"
            style={{
              left: `${(xFor(hover) / W) * 100}%`,
              top: 8,
              transform: 'translateX(-50%)',
            }}
          >
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

      {/* Footer — scroll hint + legend */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-zinc-800/60">
        <p className="text-[11px] text-zinc-600">
          Scroll on the chart to zoom in or out.
        </p>
        <div className="flex items-center gap-4 text-xs">
          {showPend && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Pending
            </div>
          )}
          {showPaid && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              Settled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

const PAGE_TABS     = ['Dashboard', 'Statistics'];
const ACTIVITY_TABS = ['All', 'Pending', 'Paid', 'Cancelled', 'Donations'];

export default function Dashboard() {
  const { data: walletClient }      = useWalletClient();
  const { address, isConnected }    = useAccount();
  const { decryptHandle, sdkReady } = useZamaEncrypt();

  const lastBlockRef = useRef(null);

  const [pageTab, setPageTab] = useState('Dashboard');
  const [actTab,  setActTab]  = useState('All');

  const [events,      setEvents]      = useState([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [fetchError,  setFetchError]  = useState('');
  const [lastBlock,   setLastBlock]   = useState(null);

  const [usdcBal,      setUsdcBal]      = useState(null);
  const [usdcReady,    setUsdcReady]    = useState(false);
  const [cusdcHandle,  setCusdcHandle]  = useState(null);
  const [cusdcReady,   setCusdcReady]   = useState(false);
  const [cusdcVal,     setCusdcVal]     = useState(null);
  const [decrypting,   setDecrypting]   = useState(false);
  const [decryptError, setDecryptError] = useState('');

  const balancesLoading = !usdcReady || !cusdcReady;
  const statsLoading    = !eventsReady;
  const tableLoading    = !eventsReady;

  const evCreated   = useMemo(() => ROUTER_ABI.find(x => x.type === 'event' && x.name === 'SingleInvoiceCreated'), []);
  const evMulti     = useMemo(() => ROUTER_ABI.find(x => x.type === 'event' && x.name === 'MultiInvoiceCreated'),  []);
  const evPaid      = useMemo(() => ROUTER_ABI.find(x => x.type === 'event' && x.name === 'InvoicePaid'),          []);
  const evCancelled = useMemo(() => ROUTER_ABI.find(x => x.type === 'event' && x.name === 'InvoiceCancelled'),     []);
  const evDonate    = useMemo(() => VAULT_ABI.find(x => x.type === 'event' && x.name === 'DonationReceived'),      []);
  const evPage      = useMemo(() => VAULT_ABI.find(x => x.type === 'event' && x.name === 'PageCreated'),           []);

  const refreshUsdc = useCallback(async () => {
    if (!address) { setUsdcReady(true); return; }
    try {
      const client = getReadClient();
      const bal = await client.readContract({
        address: USDC_ADDRESS, abi: USDC_BALANCE_ABI,
        functionName: 'balanceOf', args: [address],
      });
      setUsdcBal(bal);
    } catch (e) { console.warn('[usdc]', e?.message); }
    finally { setUsdcReady(true); }
  }, [address]);

  const refreshCusdcHandle = useCallback(async () => {
    if (!address) { setCusdcReady(true); return; }
    try {
      const client = getReadClient();
      const h = await client.readContract({
        address: CUSDC_ADDRESS, abi: CUSDC_HANDLE_ABI,
        functionName: 'confidentialBalanceOf', args: [address],
      });
      const isZero = BigInt(h) === 0n;
      setCusdcHandle(isZero ? null : h);
      setCusdcVal(null);
    } catch (e) { console.warn('[cusdc]', e?.message); setCusdcHandle(null); }
    finally { setCusdcReady(true); }
  }, [address]);

  const decryptCusdc = useCallback(async () => {
    if (!cusdcHandle || !sdkReady) return;
    setDecryptError('');
    setDecrypting(true);
    try {
      const val = await decryptHandle(cusdcHandle, CUSDC_ADDRESS);
      setCusdcVal(val);
    } catch (e) {
      setDecryptError(e?.shortMessage || e?.message || 'Decryption failed');
    } finally { setDecrypting(false); }
  }, [cusdcHandle, decryptHandle, sdkReady]);

  const fetchAll = useCallback(async () => {
    if (!address) { setEventsReady(true); return; }
    const client = getReadClient();
    setFetchError('');
    try {
      const current = await client.getBlockNumber();
      const from = current > LOOKBACK_BLOCKS ? current - LOOKBACK_BLOCKS : 0n;
      setLastBlock(current);
      lastBlockRef.current = current;

      const [created, multi, paid, cancelled, donated, pages] = await fetchAllLogs(
        client, from, current,
        [
          { address: ROUTER_ADDRESS, event: evCreated },
          { address: ROUTER_ADDRESS, event: evMulti },
          { address: ROUTER_ADDRESS, event: evPaid },
          { address: ROUTER_ADDRESS, event: evCancelled },
          { address: VAULT_ADDRESS,  event: evDonate },
          { address: VAULT_ADDRESS,  event: evPage },
        ]
      );

      const stMap = {};
      [...created, ...multi].forEach(l => { stMap[l.args.invoiceId] = 0; });
      paid.forEach(l      => { stMap[l.args.invoiceId] = 1; });
      cancelled.forEach(l => { stMap[l.args.invoiceId] = 2; });

      const pgMap = {};
      pages.forEach(l => { pgMap[l.args.pageId] = l.args.creator; });

      const singleEvs = created
        .filter(l => eqAddr(l.args.creator, address) || eqAddr(l.args.recipient, address))
        .map(l => ({
          source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
          invoiceId: l.args.invoiceId, kind: 0,
          from: l.args.creator, to: l.args.recipient,
          status: stMap[l.args.invoiceId] ?? 0,
          direction: eqAddr(l.args.recipient, address) ? 'received' : 'sent',
          timestamp: null,
        }));

      const multiEvs = multi
        .filter(l => eqAddr(l.args.creator, address))
        .map(l => ({
          source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
          invoiceId: l.args.invoiceId, kind: 1,
          from: l.args.creator, to: 'open',
          status: stMap[l.args.invoiceId] ?? 0,
          direction: 'sent', timestamp: null,
        }));

      const donEvs = donated
        .filter(l => eqAddr(l.args.donor, address) || eqAddr(pgMap[l.args.pageId], address))
        .map(l => ({
          source: 'donation', txHash: l.transactionHash, blockNumber: l.blockNumber,
          pageId: l.args.pageId, from: l.args.donor,
          to: pgMap[l.args.pageId] || VAULT_ADDRESS,
          status: 3, direction: eqAddr(l.args.donor, address) ? 'sent' : 'received',
          timestamp: null,
        }));

      const all = [...singleEvs, ...multiEvs, ...donEvs]
        .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

      const bns = [...new Set(all.slice(0, 30).map(e => e.blockNumber))];
      const tsM = {};
      for (const bn of bns) {
        try { const b = await client.getBlock({ blockNumber: bn }); tsM[bn] = b.timestamp; }
        catch { tsM[bn] = null; }
        await new Promise(r => setTimeout(r, 100));
      }
      all.forEach(e => { e.timestamp = tsM[e.blockNumber] ?? null; });

      setEvents(all);
    } catch (e) {
      console.error('[fetchAll]', e);
      setFetchError(e?.message || 'Failed to fetch events');
    } finally {
      setEventsReady(true);
    }
  }, [address, evCreated, evMulti, evPaid, evCancelled, evDonate, evPage]);

  const poll = useCallback(async () => {
    if (!address || lastBlockRef.current === null) return;
    const client = getReadClient();
    try {
      const current = await client.getBlockNumber();
      const fb = lastBlockRef.current + 1n;
      if (fb > current) return;

      const [created, multi, paid, cancelled, donated, pages] = await fetchAllLogs(
        client, fb, current,
        [
          { address: ROUTER_ADDRESS, event: evCreated },
          { address: ROUTER_ADDRESS, event: evMulti },
          { address: ROUTER_ADDRESS, event: evPaid },
          { address: ROUTER_ADDRESS, event: evCancelled },
          { address: VAULT_ADDRESS,  event: evDonate },
          { address: VAULT_ADDRESS,  event: evPage },
        ]
      );

      lastBlockRef.current = current;
      setLastBlock(current);

      const pgMap = {};
      pages.forEach(l => { pgMap[l.args.pageId] = l.args.creator; });
      const paidIds = new Set(paid.map(l => l.args.invoiceId));
      const cancIds = new Set(cancelled.map(l => l.args.invoiceId));

      const nS = created
        .filter(l => eqAddr(l.args.creator, address) || eqAddr(l.args.recipient, address))
        .map(l => ({
          source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
          invoiceId: l.args.invoiceId, kind: 0,
          from: l.args.creator, to: l.args.recipient, status: 0,
          direction: eqAddr(l.args.recipient, address) ? 'received' : 'sent',
          timestamp: Math.floor(Date.now() / 1000),
        }));
      const nM = multi
        .filter(l => eqAddr(l.args.creator, address))
        .map(l => ({
          source: 'invoice', txHash: l.transactionHash, blockNumber: l.blockNumber,
          invoiceId: l.args.invoiceId, kind: 1,
          from: l.args.creator, to: 'open', status: 0,
          direction: 'sent', timestamp: Math.floor(Date.now() / 1000),
        }));
      const nD = donated
        .filter(l => eqAddr(l.args.donor, address) || eqAddr(pgMap[l.args.pageId], address))
        .map(l => ({
          source: 'donation', txHash: l.transactionHash, blockNumber: l.blockNumber,
          pageId: l.args.pageId, from: l.args.donor,
          to: pgMap[l.args.pageId] || VAULT_ADDRESS,
          status: 3, direction: eqAddr(l.args.donor, address) ? 'sent' : 'received',
          timestamp: Math.floor(Date.now() / 1000),
        }));

      if (!nS.length && !nM.length && !nD.length && !paidIds.size && !cancIds.size) return;

      setEvents(prev => [...nS, ...nM, ...nD, ...prev].map(e => {
        if (e.source !== 'invoice') return e;
        if (cancIds.has(e.invoiceId)) return { ...e, status: 2 };
        if (paidIds.has(e.invoiceId)) return { ...e, status: 1 };
        return e;
      }));

      refreshUsdc();
      refreshCusdcHandle();
    } catch (e) {
      console.warn('[poll]', e?.message);
    }
  }, [address, evCreated, evMulti, evPaid, evCancelled, evDonate, evPage,
      refreshUsdc, refreshCusdcHandle]);

  useEffect(() => {
    if (!address) {
      setUsdcReady(true);
      setCusdcReady(true);
      setEventsReady(true);
      return;
    }
    refreshUsdc();
    refreshCusdcHandle();
    fetchAll();
  }, [address, refreshUsdc, refreshCusdcHandle, fetchAll]);

  useEffect(() => {
    if (statsLoading || balancesLoading || !address) return;
    const t = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [statsLoading, balancesLoading, address, poll]);

  const stats = useMemo(() => {
    const inv  = events.filter(e => e.source === 'invoice');
    const don  = events.filter(e => e.source === 'donation');
    const paid = inv.filter(e => e.status === 1);
    const pend = inv.filter(e => e.status === 0);
    const canc = inv.filter(e => e.status === 2);
    const mine = inv.filter(e => e.direction === 'sent');
    const settled = mine.filter(e => e.status === 1);
    return {
      invoices: inv.length, donations: don.length,
      paid: paid.length, pending: pend.length, cancelled: canc.length,
      sent: events.filter(e => e.direction === 'sent').length,
      received: events.filter(e => e.direction === 'received').length,
      recvPaid: events.filter(e => e.source === 'invoice' && e.direction === 'received' && e.status === 1).length,
      rate: mine.length ? ((settled.length / mine.length) * 100).toFixed(1) : '0.0',
    };
  }, [events]);

  const counts = useMemo(() => ({
    All:       events.length,
    Pending:   events.filter(e => e.source === 'invoice' && e.status === 0).length,
    Paid:      events.filter(e => e.source === 'invoice' && e.status === 1).length,
    Cancelled: events.filter(e => e.source === 'invoice' && e.status === 2).length,
    Donations: events.filter(e => e.source === 'donation').length,
  }), [events]);

  const filtered = useMemo(() => {
    let l = events;
    if (actTab === 'Pending')   l = l.filter(e => e.source === 'invoice' && e.status === 0);
    if (actTab === 'Paid')      l = l.filter(e => e.source === 'invoice' && e.status === 1);
    if (actTab === 'Cancelled') l = l.filter(e => e.source === 'invoice' && e.status === 2);
    if (actTab === 'Donations') l = l.filter(e => e.source === 'donation');
    return l;
  }, [events, actTab]);

  const hasHandle    = cusdcHandle !== null;
  const isDecrypted  = cusdcVal !== null;
  const canDecrypt   = isConnected && hasHandle && !decrypting && sdkReady;
  const cusdcDisplay = isDecrypted ? `$${fmtUsdc(cusdcVal)}` : '••••••';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 tracking-tight font-sans">
      <ShimmerStyle />

      {/* Hero */}
      <section className="relative pt-24 pb-10 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px]
          bg-orange-500/8 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none
          bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-xs font-semibold tracking-widest text-orange-400 uppercase mb-4">
            Wallet dashboard
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-white leading-tight mb-3">
                Your activity.{' '}
                <span className="bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                  Always private.
                </span>
              </h1>
              {isConnected ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono">{shortAddr(address)}</span>
                  <span className="text-zinc-600">· Sepolia</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Connect wallet to load dashboard.</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-8">
            {PAGE_TABS.map(t => (
              <button key={t} onClick={() => setPageTab(t)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  pageTab === t
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                    : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}>{t}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 space-y-8">

        {/* ═══ DASHBOARD TAB ═══ */}
        {pageTab === 'Dashboard' && (
          <>
            {/* Balances + top stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <BigCard label="USDC Balance" accent="text-emerald-400">
                <LoadingShell loading={!usdcReady}>
                  <MetricRow
                    value={isConnected ? fmtUsdc(usdcBal) : '—'}
                    unit="USDC" unitColor="text-emerald-400"
                  />
                </LoadingShell>
                <p className="text-[11px] text-zinc-600 mt-2">Public ERC-20</p>
                <button onClick={refreshUsdc} disabled={!isConnected}
                  className="mt-3 text-[11px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1 disabled:opacity-40">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </BigCard>

              <BigCard label="cUSDC Shielded" accent="text-violet-400">
                <LoadingShell loading={!cusdcReady}>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-semibold tabular-nums ${
                      isDecrypted ? 'text-zinc-100' : 'text-violet-300 tracking-wider'
                    }`}>{cusdcDisplay}</span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-violet-400">
                      cUSDC
                    </span>
                  </div>
                </LoadingShell>

                {cusdcReady && !hasHandle && isConnected && (
                  <p className="text-[11px] text-zinc-600 mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    No shielded balance detected
                  </p>
                )}

                <div className="flex gap-2 mt-3">
                  <button onClick={decryptCusdc} disabled={!canDecrypt}
                    className="flex-1 h-9 bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                      disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg
                      transition-all active:scale-95 flex items-center justify-center gap-1.5">
                    {decrypting ? <Spinner label="Decrypting…" /> : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        Decrypt
                      </>
                    )}
                  </button>
                  <button onClick={() => { refreshCusdcHandle(); setCusdcVal(null); setDecryptError(''); }}
                    disabled={!isConnected} title="Refresh handle"
                    className="h-9 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded-lg transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                {decryptError && <p className="text-[11px] text-rose-400 mt-2">{decryptError}</p>}
                {!sdkReady && hasHandle && <p className="text-[11px] text-zinc-600 mt-2">Initialising FHE…</p>}
              </BigCard>

              <LoadingShell loading={statsLoading}>
                <StatCard label="Total Invoices"
                  value={statsLoading ? '0' : stats.invoices.toLocaleString()}
                  sub={statsLoading ? '— donations' : `${stats.donations} donations`} />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Settled" accent="text-emerald-400"
                  value={statsLoading ? '0' : stats.paid.toLocaleString()}
                  sub={statsLoading ? '— settlement rate' : `${stats.rate}% settlement rate`} />
              </LoadingShell>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LoadingShell loading={statsLoading}>
                <StatCard label="Pending" accent="text-amber-400"
                  value={statsLoading ? '0' : stats.pending.toLocaleString()} sub="awaiting payment" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Cancelled" accent="text-rose-400"
                  value={statsLoading ? '0' : stats.cancelled.toLocaleString()} sub="by creator" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Paid to you"
                  value={statsLoading ? '0' : stats.recvPaid.toLocaleString()} sub="settled invoices received" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Sent / Received"
                  value={statsLoading ? '0 / 0' : `${stats.sent} / ${stats.received}`} sub="outgoing vs incoming" />
              </LoadingShell>
            </div>

            {/* Activity */}
            <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <LiveDot />
                  <span className="text-sm font-medium text-zinc-200">Wallet Activity</span>
                  {!tableLoading && (
                    <span className="text-xs text-zinc-600">
                      {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {lastBlock && !tableLoading && (
                    <span className="text-[11px] text-zinc-700">· block #{Number(lastBlock).toLocaleString()}</span>
                  )}
                  <button onClick={fetchAll}
                    className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1 flex items-center gap-1">
                    <svg className={`w-3 h-3 ${tableLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {tableLoading ? 'Scanning…' : 'Refresh'}
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800/60 overflow-x-auto">
                  {ACTIVITY_TABS.map(t => (
                    <button key={t} onClick={() => setActTab(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                        actTab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                      }`}>
                      {t}
                      {!tableLoading && counts[t] > 0 && (
                        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                          actTab === t ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-600'
                        }`}>{counts[t]}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <LoadingShell loading={tableLoading}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px]">
                    <thead>
                      <tr className="border-b border-zinc-800/60">
                        {['#','Direction','Tx Hash','Invoice / Page','Type',
                          'From','To','Amount','Status','Time'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold
                            text-zinc-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableLoading ? (
                        Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} index={i} />)
                      ) : !isConnected || filtered.length === 0 ? (
                        <EmptyState connected={isConnected} fetchError={fetchError} />
                      ) : (
                        filtered.slice(0, 200).map((ev, i) => (
                          <ActivityRow key={`${ev.txHash}-${i}`} event={ev} index={i} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </LoadingShell>

              {!tableLoading && isConnected && filtered.length > 0 && (
                <div className="px-5 py-3 border-t border-zinc-800/40 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-zinc-600">
                    Showing {Math.min(filtered.length, 200).toLocaleString()} of {filtered.length.toLocaleString()}
                    <span className="ml-2 text-zinc-700">· polls every {POLL_INTERVAL / 1000}s</span>
                  </span>
                  <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer"
                    className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
                    View on Etherscan
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ STATISTICS TAB ═══ */}
        {pageTab === 'Statistics' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LoadingShell loading={statsLoading}>
                <StatCard label="Pending" accent="text-amber-400"
                  value={statsLoading ? '0' : stats.pending.toLocaleString()} sub="open invoices" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Completed" accent="text-emerald-400"
                  value={statsLoading ? '0' : stats.paid.toLocaleString()} sub="fully settled" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Cancelled" accent="text-rose-400"
                  value={statsLoading ? '0' : stats.cancelled.toLocaleString()} sub="creator cancelled" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Settlement rate"
                  value={statsLoading ? '0%' : `${stats.rate}%`} sub="of invoices you created" />
              </LoadingShell>
            </div>

            <LoadingShell loading={statsLoading}>
              <PaymentGraph events={events} />
            </LoadingShell>

            <LoadingShell loading={statsLoading}>
              <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6">
                <h3 className="text-sm font-medium text-zinc-200 mb-4">Quick breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Invoices involving you</p>
                    <p className="text-zinc-100 font-medium">{stats.invoices}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Paid to you</p>
                    <p className="text-emerald-400 font-medium">{stats.recvPaid}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">You paid out</p>
                    <p className="text-orange-400 font-medium">
                      {events.filter(e => e.source === 'invoice' && e.direction === 'received' && e.status === 1).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Donations</p>
                    <p className="text-indigo-400 font-medium">{stats.donations}</p>
                  </div>
                </div>
              </div>
            </LoadingShell>
          </>
        )}

        <p className="text-center text-xs text-zinc-700">
          Sepolia · Zama FHE · {addresses.chainId}
        </p>
      </div>
    </div>
  );
}