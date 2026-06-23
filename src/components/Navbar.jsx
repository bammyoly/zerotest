import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useDisconnect } from 'wagmi';

const WORKSPACE_PREFIXES = [
  '/explorer', '/dashboard', '/create', '/pay',
  '/donate', '/setting', '/invoice', '/integrations',
];

function isWorkspacePath(pathname) {
  if (pathname === '/') return false;
  return WORKSPACE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isActiveLink(pathname, target) {
  if (target === pathname) return true;
  if (pathname.startsWith(target + '/')) return true;
  return false;
}

const INTEGRATIONS = [
  {
    id: 'telegram', label: 'Telegram API', desc: 'Send invoices & alerts via bot',
    to: '/integrations/telegram-api', available: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
  },
  {
    id: 'discord', label: 'Discord Webhooks', desc: 'Coming soon', to: '#', available: false,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
      </svg>
    ),
  },
  {
    id: 'slack', label: 'Slack', desc: 'Coming soon', to: '#', available: false,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
      </svg>
    ),
  },
  {
    id: 'zapier', label: 'Zapier', desc: 'Coming soon', to: '#', available: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    ),
  },
];

// NullPay-style ghost CTA — matches their "Get Started" button exactly
const ghostCTA =
  'flex items-center gap-2 px-5 py-2 bg-white/[0.03] hover:bg-white/[0.06] ' +
  'border border-white/[0.1] hover:border-white/[0.2] text-white text-sm font-medium ' +
  'rounded-full transition-all duration-300 group';

// Pill nav link — active/inactive states matching NullPay's toggle
const navLink = (active) =>
  `px-5 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ${
    active
      ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
      : 'text-gray-400 hover:text-gray-200'
  }`;

export default function Navbar() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [dropdownOpen, setDropdownOpen]             = useState(false);
  const [integrationsOpen, setIntegrationsOpen]     = useState(false);
  const [mobileOpen, setMobileOpen]                 = useState(false);
  const [mobileIntegrationsOpen, setMobileIntegrationsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const integrationsRef = useRef(null);
  const location = useLocation();
  const isWorkspace = isWorkspacePath(location.pathname);

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
    setIntegrationsOpen(false);
    setMobileIntegrationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!integrationsOpen) return;
    const handler = (e) => {
      if (integrationsRef.current && !integrationsRef.current.contains(e.target))
        setIntegrationsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [integrationsOpen]);

  const truncateAddress = (addr) =>
    addr ? `${addr.substring(0, 6)}…${addr.substring(addr.length - 4)}` : '';

  const copyToClipboard = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const workspaceLinks = [
    { to: '/explorer',  label: 'Explorer'  },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/create',    label: 'Create'    },
    { to: '/pay',       label: 'Pay'       },
  ];

  const landingLinks = [
    { to: '/',               label: 'Home',         isRoute: true  },
    { href: '#how-it-works', label: 'How it works', isRoute: false },
    { href: '#docs',         label: 'Docs',         isRoute: false },
  ];

  const isIntegrationsActive = location.pathname.startsWith('/integrations');

  return (
    <>
      {/* ── Header — fully transparent, fixed, NullPay style ── */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full px-6 py-4 bg-transparent">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* ── Logo ── */}
          <Link to="/" className="flex items-center gap-3 z-10">
            <div className="w-10 h-10 bg-white/[0.04] border border-white/[0.08] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)]">
              <span className="font-black text-sm text-white tracking-tighter">Z</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-[15px] tracking-tight leading-none uppercase">Zeroremit</span>
            </div>
          </Link>

          {/* ── Center pill nav ── */}
          <nav className="hidden md:flex items-center p-1 bg-white/[0.03] border border-white/[0.08] rounded-full backdrop-blur-md absolute left-1/2 -translate-x-1/2">
            {isWorkspace ? (
              <>
                {workspaceLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={navLink(isActiveLink(location.pathname, link.to))}
                  >
                    {link.label}
                  </Link>
                ))}

                {/* Integrations dropdown */}
                <div className="relative" ref={integrationsRef}>
                  <button
                    onClick={() => setIntegrationsOpen(o => !o)}
                    className={navLink(isIntegrationsActive || integrationsOpen) + ' flex items-center gap-1'}
                  >
                    Integrations
                    <svg
                      className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${integrationsOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>

                  {integrationsOpen && (
                    <div className="absolute left-1/2 -translate-x-1/2 mt-3 w-72 rounded-xl bg-zinc-950/90 border border-white/[0.08] shadow-2xl shadow-black/80 p-1.5 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-2 mb-1">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Integrations</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Connect Zeroremit to your stack</p>
                      </div>
                      <div className="h-px bg-white/5 mx-1.5 mb-1"/>

                      {INTEGRATIONS.map(int =>
                        int.available ? (
                          <Link
                            key={int.id}
                            to={int.to}
                            onClick={() => setIntegrationsOpen(false)}
                            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-white flex-shrink-0 transition-colors">
                              {int.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-zinc-300 group-hover:text-white">{int.label}</p>
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-900/30">Live</span>
                              </div>
                              <p className="text-[11px] text-zinc-500 mt-0.5">{int.desc}</p>
                            </div>
                          </Link>
                        ) : (
                          <div key={int.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed">
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.04] flex items-center justify-center text-zinc-600 flex-shrink-0">{int.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-zinc-500">{int.label}</p>
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded-full">Soon</span>
                              </div>
                              <p className="text-[11px] text-zinc-600 mt-0.5">{int.desc}</p>
                            </div>
                          </div>
                        )
                      )}

                      <div className="h-px bg-white/5 mx-1.5 my-1"/>
                      <Link
                        to="/integrations"
                        onClick={() => setIntegrationsOpen(false)}
                        className="block w-full text-center px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-colors"
                      >
                        View all integrations →
                      </Link>
                    </div>
                  )}
                </div>
              </>
            ) : (
              landingLinks.map((link, i) =>
                link.isRoute ? (
                  <Link key={i} to={link.to} className={navLink(location.pathname === link.to)}>
                    {link.label}
                  </Link>
                ) : (
                  <a key={i} href={link.href} className={navLink(false)}>{link.label}</a>
                )
              )
            )}
          </nav>

          {/* ── Right actions ── */}
          <div className="flex items-center gap-2 z-10">

            {/* Mobile workspace wallet button */}
            {isWorkspace && (
              <div className="flex md:hidden items-center gap-2">
                {!isConnected ? (
                  <button
                    onClick={() => open()}
                    className="px-4 py-1.5 rounded-full text-[12px] font-medium border border-white/[0.1] text-white bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                  >
                    Connect
                  </button>
                ) : (
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-gray-300 relative"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                    {truncateAddress(address)}
                  </button>
                )}

                {dropdownOpen && isConnected && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)}/>
                    <div className="absolute right-14 mt-24 w-48 rounded-xl bg-zinc-950 border border-white/[0.08] p-1.5 z-30 shadow-xl">
                      <button
                        onClick={() => { copyToClipboard(); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:bg-white/[0.05] flex items-center gap-2"
                      >
                        {copied ? '✓ Copied!' : 'Copy Address'}
                      </button>
                      <button
                        onClick={() => { disconnect(); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/20 flex items-center gap-2 mt-1"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              )}
            </button>

            {/* Desktop right side */}
            {!isWorkspace ? (
              <Link to="/explorer" className={`hidden md:flex ${ghostCTA}`}>
                <span>Get Started</span>
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors transform group-hover:translate-x-0.5 duration-200"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                </svg>
              </Link>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                {!isConnected ? (
                  <button onClick={() => open()} className={ghostCTA}>
                    <span>Connect Wallet</span>
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className={ghostCTA}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                      <span>{truncateAddress(address)}</span>
                      <svg
                        className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>

                    {dropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)}/>
                        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-zinc-950/90 border border-white/[0.08] shadow-2xl shadow-black/80 p-1.5 z-20 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-3 py-2.5 mb-1">
                            <p className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Connected wallet</p>
                            <p className="text-xs font-mono text-zinc-300">{truncateAddress(address)}</p>
                          </div>
                          <div className="h-px bg-white/5 mx-1.5"/>
                          <button
                            onClick={() => { copyToClipboard(); setDropdownOpen(false); }}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-colors flex items-center gap-2 mt-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                            </svg>
                            {copied ? '✓ Copied!' : 'Copy Address'}
                          </button>
                          <div className="h-px bg-white/5 mx-1.5 my-1"/>
                          <button
                            onClick={() => { disconnect(); setDropdownOpen(false); }}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/20 transition-colors flex items-center gap-2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                            </svg>
                            Disconnect
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Settings gear */}
                <Link
                  to="/setting"
                  title="Settings"
                  className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all group ${
                    location.pathname.startsWith('/setting')
                      ? 'bg-white/[0.08] border-white/[0.15] text-white'
                      : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.06]'
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-90"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile slide-down menu ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-zinc-950/95 backdrop-blur-xl border-b border-white/[0.06] shadow-2xl animate-in slide-in-from-top duration-200 max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between px-4 h-16 border-b border-white/[0.04]">
              <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="font-black text-sm text-white tracking-tighter">Z</span>
                </div>
                <span className="font-bold text-sm text-white uppercase tracking-wider">Zeroremit</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <nav className="p-4 space-y-1">
              {!isWorkspace && (
                <div className="pb-3 mb-2 border-b border-white/[0.04]">
                  <Link
                    to="/explorer"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-full text-sm font-medium border border-white/[0.1] text-white bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                  >
                    Get Started
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                  </Link>
                </div>
              )}

              {isWorkspace ? (
                <>
                  {workspaceLinks.map(link => {
                    const active = isActiveLink(location.pathname, link.to);
                    return (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          active
                            ? 'text-white bg-white/[0.06] border border-white/[0.08]'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}

                  <button
                    onClick={() => setMobileIntegrationsOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isIntegrationsActive
                        ? 'text-white bg-white/[0.06] border border-white/[0.08]'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                    }`}
                  >
                    Integrations
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${mobileIntegrationsOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>

                  {mobileIntegrationsOpen && (
                    <div className="ml-4 pl-3 border-l border-white/[0.06] space-y-1 py-1">
                      {INTEGRATIONS.map(int =>
                        int.available ? (
                          <Link
                            key={int.id}
                            to={int.to}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-colors"
                          >
                            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/[0.04] flex items-center justify-center text-zinc-400 flex-shrink-0">{int.icon}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{int.label}</p>
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-full">Live</span>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div key={int.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-30">
                            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-600 flex-shrink-0">{int.icon}</div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-zinc-500">{int.label}</p>
                              <span className="text-[9px] font-semibold uppercase text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded-full">Soon</span>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  <Link
                    to="/setting"
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      location.pathname.startsWith('/setting')
                        ? 'text-white bg-white/[0.06] border border-white/[0.08]'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                    }`}
                  >
                    Settings
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/" onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/[0.02] transition-all">Home</Link>
                  <a href="#how-it-works" onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.02] transition-all">How it works</a>
                  <a href="#docs" onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.02] transition-all">Docs</a>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}