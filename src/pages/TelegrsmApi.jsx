// src/pages/integrations/TelegramApi.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { Link } from 'react-router-dom';

// ── Config ────────────────────────────────────────────────────────────────────
// These will eventually come from your backend / env
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZeroremitBot';
const API_BASE     = import.meta.env.VITE_API_BASE              || '';

// ── Backend stub helpers (replace with real fetch calls later) ────────────────
async function apiGenerateLinkCode(wallet) {
  // POST /telegram/link-code  { wallet } → { code, expiresAt }
  if (!API_BASE) {
    // Demo mode — generate locally so the UI works without a backend
    const code = `zr_${Math.random().toString(36).slice(2, 10)}`;
    return { code, expiresAt: Date.now() + 5 * 60 * 1000 };
  }
  const res = await fetch(`${API_BASE}/telegram/link-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error('Failed to generate link code');
  return res.json();
}

async function apiGetLinkStatus(wallet) {
  // GET /telegram/status?wallet=0x… → { linked, chatId, username, linkedAt, alertsEnabled, ... }
  if (!API_BASE) {
    // Demo: read from localStorage so the UI can be tested end-to-end
    const stored = localStorage.getItem(`tg_link_${wallet?.toLowerCase()}`);
    return stored ? JSON.parse(stored) : { linked: false };
  }
  const res = await fetch(`${API_BASE}/telegram/status?wallet=${wallet}`);
  if (!res.ok) throw new Error('Failed to fetch link status');
  return res.json();
}

async function apiUnlink(wallet) {
  if (!API_BASE) {
    localStorage.removeItem(`tg_link_${wallet?.toLowerCase()}`);
    return { ok: true };
  }
  const res = await fetch(`${API_BASE}/telegram/unlink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error('Failed to unlink');
  return res.json();
}

async function apiUpdatePrefs(wallet, prefs) {
  if (!API_BASE) {
    const key = `tg_link_${wallet?.toLowerCase()}`;
    const cur = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...cur, ...prefs };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }
  const res = await fetch(`${API_BASE}/telegram/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, ...prefs }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'link',     label: 'Wallet Linking' },
  { id: 'commands', label: 'Commands' },
  { id: 'alerts',   label: 'Payment Alerts' },
];

// ── Commands registry ─────────────────────────────────────────────────────────
const COMMANDS = [
  {
    cmd: '/start',
    args: '',
    desc: 'Show the welcome message and main menu.',
    category: 'Basics',
    example: '/start',
  },
  {
    cmd: '/help',
    args: '',
    desc: 'List all available commands.',
    category: 'Basics',
    example: '/help',
  },
  {
    cmd: '/link',
    args: '<code>',
    desc: 'Link your wallet using a one-time code generated on the website.',
    category: 'Basics',
    example: '/link zr_a8f3k2x9',
  },
  {
    cmd: '/unlink',
    args: '',
    desc: 'Disconnect your wallet from this Telegram account.',
    category: 'Basics',
    example: '/unlink',
  },
  {
    cmd: '/balance',
    args: '',
    desc: 'Check your USDC and shielded cUSDC balance.',
    category: 'Wallet',
    example: '/balance',
  },
  {
    cmd: '/address',
    args: '',
    desc: 'Show your linked wallet address.',
    category: 'Wallet',
    example: '/address',
  },
  {
    cmd: '/create',
    args: '<amount> <to> [memo]',
    desc: 'Open the Mini App to create a confidential invoice.',
    category: 'Invoices',
    example: '/create 50 0xA1c…E4 Design work',
  },
  {
    cmd: '/invoices',
    args: '[pending|paid|all]',
    desc: 'List your recent invoices, optionally filtered by status.',
    category: 'Invoices',
    example: '/invoices pending',
  },
  {
    cmd: '/status',
    args: '<invoice_id>',
    desc: 'Show the status of a specific invoice.',
    category: 'Invoices',
    example: '/status 0x7a3b…f0',
  },
  {
    cmd: '/pay',
    args: '<invoice_id>',
    desc: 'Open the Mini App to pay an invoice.',
    category: 'Invoices',
    example: '/pay 0x7a3b…f0',
  },
  {
    cmd: '/cancel',
    args: '<invoice_id>',
    desc: 'Cancel a pending invoice you created.',
    category: 'Invoices',
    example: '/cancel 0x7a3b…f0',
  },
  {
    cmd: '/donate',
    args: '<page_id>',
    desc: 'Open a donation page in the Mini App.',
    category: 'Donations',
    example: '/donate 0xpage…',
  },
  {
    cmd: '/alerts',
    args: 'on|off',
    desc: 'Toggle all real-time payment notifications.',
    category: 'Notifications',
    example: '/alerts on',
  },
  {
    cmd: '/mute',
    args: '<duration>',
    desc: 'Temporarily silence notifications (e.g. 1h, 8h, 1d).',
    category: 'Notifications',
    example: '/mute 8h',
  },
];

// ── Alert types ───────────────────────────────────────────────────────────────
const ALERT_TYPES = [
  {
    id: 'invoicePaid',
    label: 'Invoice paid',
    desc: 'Get notified the moment an invoice you created is paid.',
    icon: '💰',
    accent: 'emerald',
    defaultOn: true,
  },
  {
    id: 'invoiceReceived',
    label: 'New invoice received',
    desc: 'Alert when someone sends you an invoice to pay.',
    icon: '📥',
    accent: 'violet',
    defaultOn: true,
  },
  {
    id: 'invoiceCancelled',
    label: 'Invoice cancelled',
    desc: 'Notify when an invoice involving you is cancelled.',
    icon: '🚫',
    accent: 'rose',
    defaultOn: false,
  },
  {
    id: 'invoiceExpired',
    label: 'Invoice expired',
    desc: 'Heads-up when your invoices pass their due date.',
    icon: '⏰',
    accent: 'amber',
    defaultOn: true,
  },
  {
    id: 'donationReceived',
    label: 'Donation received',
    desc: 'Get pinged for new donations to your pages.',
    icon: '❤️',
    accent: 'indigo',
    defaultOn: true,
  },
  {
    id: 'balanceChanges',
    label: 'Balance changes',
    desc: 'Alert when your USDC or cUSDC balance shifts.',
    icon: '📊',
    accent: 'cyan',
    defaultOn: false,
  },
];

// ── Shimmer (matches dashboard) ───────────────────────────────────────────────
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

// ── Small atoms ───────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-zinc-900/40 rounded-2xl border border-zinc-800/60 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between px-6 pt-5 pb-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function CardBody({ children, className = '' }) {
  return <div className={`px-6 pb-6 ${className}`}>{children}</div>;
}

function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
      text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-900/40">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
      text-[11px] font-semibold bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"/>
      Not connected
    </span>
  );
}

function TelegramIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${checked ? 'bg-violet-600' : 'bg-zinc-700'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function TelegramApi() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  const [tab,         setTab]         = useState('overview');
  const [linkStatus,  setLinkStatus]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [code,        setCode]        = useState('');
  const [codeExpires, setCodeExpires] = useState(0);
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [pollTick,    setPollTick]    = useState(0);
  const [error,       setError]       = useState('');
  const [prefs,       setPrefs]       = useState({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const pollRef = useRef(null);

  const isLinked = !!linkStatus?.linked;

  // ── Fetch link status on mount + when address changes ──────────────────────
  const refreshStatus = useCallback(async () => {
    if (!address) {
      setLinkStatus({ linked: false });
      setLoading(false);
      return;
    }
    try {
      const s = await apiGetLinkStatus(address);
      setLinkStatus(s);
      // Seed prefs from server, fall back to defaults
      const initial = {};
      ALERT_TYPES.forEach(a => {
        initial[a.id] = s?.prefs?.[a.id] ?? a.defaultOn;
      });
      setPrefs(initial);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setLoading(true);
    refreshStatus();
  }, [refreshStatus]);

  // ── Poll for confirmation while waiting for Telegram tap ───────────────────
  useEffect(() => {
    if (!code || isLinked) return;
    pollRef.current = setInterval(async () => {
      setPollTick(t => t + 1);
      try {
        const s = await apiGetLinkStatus(address);
        if (s?.linked) {
          setLinkStatus(s);
          setCode('');
          clearInterval(pollRef.current);
        }
      } catch {}
    }, 4_000);
    return () => clearInterval(pollRef.current);
  }, [code, isLinked, address]);

  // ── Generate new linking code ──────────────────────────────────────────────
  const handleGenerateCode = async () => {
    if (!address) { open(); return; }
    setError('');
    setGenerating(true);
    try {
      const { code: c, expiresAt } = await apiGenerateLinkCode(address);
      setCode(c);
      setCodeExpires(expiresAt);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ── Unlink ─────────────────────────────────────────────────────────────────
  const handleUnlink = async () => {
    if (!address) return;
    if (!confirm('Disconnect Telegram from this wallet?')) return;
    try {
      await apiUnlink(address);
      setLinkStatus({ linked: false });
      setCode('');
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Update alert prefs ─────────────────────────────────────────────────────
  const handleTogglePref = async (id, value) => {
    setPrefs(p => ({ ...p, [id]: value }));
    setSavingPrefs(true);
    try {
      await apiUpdatePrefs(address, { prefs: { ...prefs, [id]: value } });
    } catch (e) {
      setError(e.message);
      // revert on error
      setPrefs(p => ({ ...p, [id]: !value }));
    } finally {
      setTimeout(() => setSavingPrefs(false), 600);
    }
  };

  // ── Demo trigger for testing without bot ───────────────────────────────────
  const handleDemoLink = () => {
    if (!address || !code) return;
    const fake = {
      linked: true,
      chatId: '5012345678',
      username: 'demo_user',
      firstName: 'Demo',
      linkedAt: Date.now(),
      prefs: prefs,
    };
    localStorage.setItem(`tg_link_${address.toLowerCase()}`, JSON.stringify(fake));
    setLinkStatus(fake);
    setCode('');
  };

  const deepLink = code ? `https://t.me/${BOT_USERNAME}?start=${code}` : '';
  const secondsLeft = Math.max(0, Math.floor((codeExpires - Date.now()) / 1000));

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Group commands by category ─────────────────────────────────────────────
  const grouped = COMMANDS.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 tracking-tight font-sans">
      <ShimmerStyle />

      {/* Hero */}
      <section className="relative pt-24 pb-10 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px]
          bg-sky-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none
          bg-[radial-gradient(#0ea5e9_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="max-w-6xl mx-auto relative z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-5">
            <Link to="/integrations" className="hover:text-zinc-300 transition-colors">
              Integrations
            </Link>
            <span>›</span>
            <span className="text-zinc-300">Telegram API</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-5 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600
              flex items-center justify-center shadow-lg shadow-sky-500/20">
              <TelegramIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white">
                  Telegram Integration
                </h1>
                <LoadingShell loading={loading}>
                  <StatusPill active={isLinked} />
                </LoadingShell>
              </div>
              <p className="text-sm text-zinc-400 mt-2 max-w-2xl leading-relaxed">
                Link your wallet to {`@${BOT_USERNAME}`} and manage invoices, monitor your dashboard,
                and receive real-time payment alerts — all from inside Telegram.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/60
            rounded-xl p-1 w-fit overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-zinc-800 text-zinc-100 shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">

        {error && (
          <div className="mb-6 flex items-start gap-2.5 px-4 py-3 bg-red-950/40
            border border-red-900/30 rounded-lg text-sm text-red-400">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-200">×</button>
          </div>
        )}

        {/* ════════════════ OVERVIEW TAB ════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Feature grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: '🔗',
                  title: 'Wallet linking',
                  desc: 'Securely connect your Ethereum wallet to your Telegram account using a one-time code. No keys ever leave your wallet.',
                  cta: 'Link your wallet',
                  action: () => setTab('link'),
                },
                {
                  icon: '📊',
                  title: 'Dashboard monitoring',
                  desc: 'Check your USDC and shielded cUSDC balance, list invoices, and see protocol stats — all from chat.',
                  cta: 'See commands',
                  action: () => setTab('commands'),
                },
                {
                  icon: '🔔',
                  title: 'Real-time alerts',
                  desc: 'Get notified the second an invoice is paid, cancelled, or expires. Customize what fires a notification.',
                  cta: 'Configure alerts',
                  action: () => setTab('alerts'),
                },
              ].map(f => (
                <Card key={f.title}>
                  <CardBody className="pt-6 space-y-3">
                    <div className="text-3xl">{f.icon}</div>
                    <h3 className="text-base font-semibold text-zinc-100">{f.title}</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                    <button onClick={f.action}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300
                        flex items-center gap-1 mt-1 transition-colors">
                      {f.cta}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </CardBody>
                </Card>
              ))}
            </div>

            {/* How it works */}
            <Card>
              <CardHeader title="How it works" subtitle="From wallet to chat in 3 steps" />
              <CardBody className="pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
                  {[
                    {
                      n: '01',
                      title: 'Generate code',
                      desc: 'Click "Generate link code" in the Wallet Linking tab to mint a one-time, 5-minute token tied to your wallet.',
                    },
                    {
                      n: '02',
                      title: `Open @${BOT_USERNAME}`,
                      desc: 'Tap the deep link or scan the QR — Telegram opens the bot and auto-fills the /link command.',
                    },
                    {
                      n: '03',
                      title: 'Confirmed',
                      desc: 'Bot replies with ✅ Linked. Your wallet ↔ Telegram pairing is now active. Start receiving alerts.',
                    },
                  ].map(s => (
                    <div key={s.n}>
                      <div className="text-3xl font-bold text-zinc-700 tabular-nums mb-2">{s.n}</div>
                      <h4 className="text-sm font-semibold text-zinc-100 mb-1.5">{s.title}</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Privacy note */}
            <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-sky-300 mb-1">Your keys never leave your wallet</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  The bot only stores the mapping between your Telegram chat ID and your public wallet address.
                  All signing happens in your wallet via the Mini App. Encrypted amounts are never decrypted on our servers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ WALLET LINKING TAB ════════════════ */}
        {tab === 'link' && (
          <div className="space-y-6">
            {!isConnected ? (
              /* Not connected to wallet */
              <Card>
                <CardBody className="pt-10 pb-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-2">
                    Connect your wallet first
                  </h3>
                  <p className="text-sm text-zinc-500 max-w-sm mx-auto mb-5">
                    We need your wallet address to tie it to your Telegram account.
                  </p>
                  <button onClick={() => open()}
                    className="px-6 h-11 bg-sky-600 hover:bg-sky-500 text-white font-medium
                      rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                    Connect Wallet
                  </button>
                </CardBody>
              </Card>
            ) : isLinked ? (
              /* Already linked */
              <Card>
                <CardHeader
                  title="Telegram is connected"
                  subtitle={`Linked to @${linkStatus.username || 'user'} ${
                    linkStatus.linkedAt
                      ? '· ' + new Date(linkStatus.linkedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                      : ''
                  }`}
                  right={<StatusPill active />}
                />
                <CardBody className="pt-2 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="px-4 py-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <p className="text-[11px] text-zinc-500 mb-1">Wallet</p>
                      <p className="text-xs font-mono text-zinc-300 truncate">
                        {address}
                      </p>
                    </div>
                    <div className="px-4 py-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <p className="text-[11px] text-zinc-500 mb-1">Telegram</p>
                      <p className="text-xs font-mono text-zinc-300 truncate">
                        {linkStatus.firstName ? `${linkStatus.firstName} ` : ''}
                        @{linkStatus.username || 'user'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={`https://t.me/${BOT_USERNAME}`}
                      target="_blank" rel="noreferrer"
                      className="flex-1 h-11 flex items-center justify-center gap-2 bg-sky-600
                        hover:bg-sky-500 text-white font-medium rounded-xl text-sm transition-all
                        shadow-md shadow-sky-500/20"
                    >
                      <TelegramIcon className="w-4 h-4" />
                      Open @{BOT_USERNAME}
                    </a>
                    <button
                      onClick={handleUnlink}
                      className="px-5 h-11 bg-zinc-800 hover:bg-red-950/40 hover:text-red-400
                        text-zinc-300 font-medium rounded-xl text-sm transition-all border border-zinc-700"
                    >
                      Disconnect
                    </button>
                  </div>

                  <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-500/5
                    border border-emerald-500/10 rounded-lg text-xs text-emerald-300/80">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span>You're all set. Head to the <button onClick={() => setTab('alerts')} className="font-semibold underline underline-offset-2">Payment Alerts</button> tab to customize what triggers notifications.</span>
                  </div>
                </CardBody>
              </Card>
            ) : (
              /* Not linked — show the linking flow */
              <>
                <Card>
                  <CardHeader
                    title="Link your wallet"
                    subtitle="Generate a one-time code to securely pair this wallet with Telegram"
                    right={<StatusPill active={false} />}
                  />
                  <CardBody className="pt-2 space-y-5">
                    {/* Connected wallet display */}
                    <div className="px-4 py-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <p className="text-[11px] text-zinc-500 mb-1">Linking wallet</p>
                      <p className="text-xs font-mono text-zinc-300 break-all">{address}</p>
                    </div>

                    {!code ? (
                      <button
                        onClick={handleGenerateCode}
                        disabled={generating}
                        className="w-full h-12 flex items-center justify-center gap-2 bg-sky-600
                          hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed
                          text-white font-semibold rounded-xl text-sm transition-all active:scale-[0.98]
                          shadow-lg shadow-sky-500/20"
                      >
                        {generating ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10"
                                stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                            Generating…
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                            </svg>
                            Generate link code
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-4">
                        {/* The code */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-zinc-400">Your one-time code</p>
                            <p className="text-[11px] text-zinc-600 tabular-nums">
                              Expires in{' '}
                              <span className={secondsLeft < 60 ? 'text-amber-400 font-semibold' : ''}>
                                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                              </span>
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1 h-12 px-4 flex items-center bg-zinc-950
                              border border-zinc-800 rounded-xl font-mono text-base
                              text-sky-300 tracking-wider">
                              {code}
                            </div>
                            <button onClick={copyCode}
                              className={`h-12 px-4 rounded-xl text-sm font-medium transition-all border ${
                                copied
                                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700'
                              }`}>
                              {copied ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        {/* Deep link button */}
                        <a
                          href={deepLink}
                          target="_blank" rel="noreferrer"
                          className="w-full h-12 flex items-center justify-center gap-2 bg-sky-600
                            hover:bg-sky-500 text-white font-semibold rounded-xl text-sm transition-all
                            active:scale-[0.98] shadow-lg shadow-sky-500/20"
                        >
                          <TelegramIcon className="w-4 h-4" />
                          Open @{BOT_USERNAME} & link
                        </a>

                        {/* QR code */}
                        <div className="flex items-center gap-4 p-4 bg-zinc-950 rounded-xl
                          border border-zinc-800">
                          <div className="w-24 h-24 bg-white rounded-lg p-1.5 flex-shrink-0">
                            {/* Free QR via api.qrserver.com — swap to qrcode lib if you don't want external */}
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(deepLink)}&size=180x180&margin=0`}
                              alt="QR code"
                              className="w-full h-full"
                            />
                          </div>
                          <div className="flex-1 text-xs text-zinc-500 leading-relaxed">
                            <p className="text-zinc-300 font-medium mb-1">Or scan from your phone</p>
                            <p>Open Telegram on your phone, scan this QR, and tap <span className="text-zinc-300">Start</span>.</p>
                          </div>
                        </div>

                        {/* Polling indicator */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900/60
                          border border-zinc-800 rounded-xl">
                          <svg className="w-4 h-4 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10"
                              stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          <span className="text-xs text-zinc-400">
                            Waiting for confirmation from Telegram… (auto-detects)
                          </span>
                          <span className="ml-auto text-[10px] text-zinc-700 font-mono">
                            {pollTick}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleGenerateCode}
                            className="flex-1 h-10 text-xs font-medium text-zinc-400 hover:text-zinc-200
                              bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-all"
                          >
                            Generate new code
                          </button>
                          {!API_BASE && (
                            <button
                              onClick={handleDemoLink}
                              className="flex-1 h-10 text-xs font-medium text-violet-400 hover:text-violet-300
                                bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/20 rounded-lg
                                transition-all"
                              title="Demo only — simulates a successful link without a backend"
                            >
                              Simulate link (demo)
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Manual instructions */}
                <Card>
                  <CardHeader title="Doing it manually?" subtitle="If the deep link doesn't open Telegram" />
                  <CardBody className="pt-2 space-y-2.5 text-xs text-zinc-400 leading-relaxed">
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex
                        items-center justify-center text-[10px] font-semibold flex-shrink-0">1</div>
                      <div>Open Telegram and search for <span className="text-zinc-200 font-mono">@{BOT_USERNAME}</span>.</div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex
                        items-center justify-center text-[10px] font-semibold flex-shrink-0">2</div>
                      <div>Tap <span className="text-zinc-200">Start</span>.</div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex
                        items-center justify-center text-[10px] font-semibold flex-shrink-0">3</div>
                      <div>Send: <span className="text-zinc-200 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">/link {code || '<code>'}</span></div>
                    </div>
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ════════════════ COMMANDS TAB ════════════════ */}
        {tab === 'commands' && (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Bot commands"
                subtitle={`All commands available in @${BOT_USERNAME} once your wallet is linked`}
              />
              <CardBody className="pt-2">
                {Object.keys(grouped).map(cat => (
                  <div key={cat} className="mb-6 last:mb-0">
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest
                      text-zinc-500 mb-3">{cat}</h4>
                    <div className="space-y-2">
                      {grouped[cat].map(c => (
                        <div key={c.cmd}
                          className="group flex flex-col sm:flex-row sm:items-center gap-3 p-3.5
                            bg-zinc-950/50 rounded-xl border border-zinc-800/40
                            hover:border-zinc-700/50 transition-all">
                          <div className="flex items-baseline gap-2 min-w-[200px]">
                            <code className="text-sm font-mono font-semibold text-sky-400">
                              {c.cmd}
                            </code>
                            {c.args && (
                              <code className="text-xs font-mono text-zinc-600">{c.args}</code>
                            )}
                          </div>
                          <div className="flex-1 text-xs text-zinc-400">{c.desc}</div>
                          <code className="text-[11px] font-mono text-zinc-600 bg-zinc-900
                            px-2 py-1 rounded-md whitespace-nowrap">
                            {c.example}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            {/* Quick tip */}
            <div className="flex items-start gap-3 px-5 py-4 bg-violet-500/5
              border border-violet-500/10 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center
                justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-violet-300 mb-1">Pro tip</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Commands that require a signature (<code className="text-zinc-400">/create</code>, <code className="text-zinc-400">/pay</code>, <code className="text-zinc-400">/cancel</code>) open the Zeroremit Mini App so your wallet can sign without leaving Telegram.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ PAYMENT ALERTS TAB ════════════════ */}
        {tab === 'alerts' && (
          <div className="space-y-6">
            {!isLinked ? (
              <Card>
                <CardBody className="pt-10 pb-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-2">
                    Link Telegram to enable alerts
                  </h3>
                  <p className="text-sm text-zinc-500 max-w-sm mx-auto mb-5">
                    You need to connect your wallet to a Telegram account before configuring notifications.
                  </p>
                  <button onClick={() => setTab('link')}
                    className="px-6 h-11 bg-sky-600 hover:bg-sky-500 text-white font-medium
                      rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                    Go to Wallet Linking
                  </button>
                </CardBody>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader
                    title="Real-time payment alerts"
                    subtitle="Choose which on-chain events should ping your Telegram"
                    right={
                      savingPrefs && (
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Saving…
                        </span>
                      )
                    }
                  />
                  <CardBody className="pt-2 space-y-2">
                    {ALERT_TYPES.map(a => (
                      <div key={a.id}
                        className="flex items-start gap-4 p-4 bg-zinc-950/50 rounded-xl
                          border border-zinc-800/40 hover:border-zinc-700/50 transition-all">
                        <div className="text-2xl">{a.icon}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium text-zinc-100">{a.label}</p>
                          </div>
                          <p className="text-xs text-zinc-500 leading-relaxed">{a.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                            prefs[a.id] ? 'text-emerald-400' : 'text-zinc-600'
                          }`}>
                            {prefs[a.id] ? 'On' : 'Off'}
                          </span>
                          <Toggle
                            checked={!!prefs[a.id]}
                            onChange={v => handleTogglePref(a.id, v)}
                          />
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>

                {/* Preview */}
                <Card>
                  <CardHeader
                    title="Notification preview"
                    subtitle="What an invoice paid alert looks like in chat"
                  />
                  <CardBody className="pt-2">
                    <div className="flex items-start gap-3 p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                      <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center
                        justify-center flex-shrink-0">
                        <TelegramIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-sm font-semibold text-zinc-100">
                            @{BOT_USERNAME}
                          </span>
                          <span className="text-[10px] text-zinc-600">just now</span>
                        </div>
                        <div className="bg-zinc-900 rounded-2xl rounded-tl-md p-3.5 text-sm
                          text-zinc-200 leading-relaxed">
                          <div className="font-semibold mb-1">🟢 Payment received!</div>
                          <div className="text-xs text-zinc-400 space-y-0.5 mt-2">
                            <div>From:&nbsp;&nbsp;&nbsp;&nbsp;<span className="font-mono text-zinc-300">0xA1c2…E4f0</span></div>
                            <div>Amount:&nbsp;<span className="font-mono text-zinc-500 italic">🔐 tap to decrypt</span></div>
                            <div>Tx:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="font-mono text-sky-400">0x9f3b…7a2c ↗</span></div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg
                              text-xs font-medium text-zinc-200 transition-colors">
                              Open in app
                            </button>
                            <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg
                              text-xs font-medium text-zinc-200 transition-colors">
                              Decrypt amount
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Quiet hours info */}
                <div className="flex items-start gap-3 px-5 py-4 bg-amber-500/5
                  border border-amber-500/10 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center
                    justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-300 mb-1">Need quiet hours?</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Use <code className="text-zinc-400 font-mono">/mute 8h</code> in the bot to silence notifications for a set duration. Send <code className="text-zinc-400 font-mono">/alerts off</code> to disable all alerts entirely.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-center text-xs text-zinc-700 mt-10">
          Bot: <span className="font-mono">@{BOT_USERNAME}</span>
          {!API_BASE && (
            <span className="ml-2 text-amber-500/60">· Demo mode — set VITE_API_BASE in .env</span>
          )}
        </p>
      </div>
    </div>
  );
}