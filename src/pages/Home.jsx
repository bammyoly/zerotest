import React, { useEffect, useRef, useState } from 'react';

// Reusable fade-in-up hook
function useReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const revealClass = (visible, delay = '') =>
  `transition-all duration-700 ease-out ${delay} ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
  }`;

// ── Quantum Cryptographic Matrix Stream Background ──────────────────────────
function CryptographicMatrix() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const fontSize = 12;
    const columns = Math.floor(width / fontSize) + 1;
    const drops = Array(columns).fill(1);
    const hexChars = '0123456789ABCDEFØXαβγ'.split('');

    const draw = () => {
      // Lightly trailing black layer to maintain glowing state decay trails
      ctx.fillStyle = 'rgba(9, 9, 11, 0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `600 ${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = hexChars[Math.floor(Math.random() * hexChars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Give the top calculation segment a brighter flash highlight state
        if (Math.random() > 0.98) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.8)'; // Bright Ghost Blue
        } else {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'; // Muted Ghost Blue
        }

        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.45]"
    />
  );
}

// ── Feature Card ──────────────────────────────────────────
function FeatureCard({ icon, accent, title, desc, delay }) {
  return (
    <div
      className={`group p-6 rounded-none bg-zinc-900/10 border border-zinc-800/40 hover:border-sky-500/30 hover:bg-zinc-900/40 backdrop-blur-sm transition-all duration-300 ${delay}`}
    >
      <div
        className={`w-10 h-10 rounded-none ${accent} flex items-center justify-center mb-5 border border-zinc-800/60 group-hover:scale-102 group-hover:border-emerald-500/20 transition-all duration-200`}
      >
        {icon}
      </div>
      <h3 className="text-xs font-bold font-mono tracking-wider text-zinc-200 mb-2 uppercase">{title}</h3>
      <p className="text-xs text-zinc-400 leading-relaxed font-sans">{desc}</p>
    </div>
  );
}

// ── Stat Chip ─────────────────────────────────────────────
function StatChip({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-1.5 p-3 min-w-[130px] border border-zinc-900 bg-zinc-950/40 font-mono">
      <span className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">{value}</span>
      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-medium">{label}</span>
    </div>
  );
}

// ── Step Pill ─────────────────────────────────────────────
function StepPill({ n, title, desc }) {
  return (
    <div className="flex gap-4 items-start bg-zinc-950/30 p-3 border border-zinc-900/60">
      <div className="flex-shrink-0 w-7 h-7 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-sky-400">
        {n}
      </div>
      <div>
        <p className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wide mb-1">{title}</p>
        <p className="text-xs text-zinc-400 leading-relaxed font-sans">{desc}</p>
      </div>
    </div>
  );
}

// ── Icons (Inlined Quantum Palette) ──────────────────────────────────────
const Icon = {
  bolt:     <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  lock:     <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>,
  telegram: <svg className="w-5 h-5 text-zinc-400 group-hover:text-emerald-400 transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
  invoice:  <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  wallet:   <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>,
  burner:   <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/></svg>,
  bell:     <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>,
  shield:   <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
  globe:    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  qr:       <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4z"/></svg>,
  check:    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>,
};

// ═══════════════════════════════════════════════════════════
export default function Home() {
  const [featRef, featVis]   = useReveal();
  const [privRef, privVis]   = useReveal();
  const [howRef,  howVis]    = useReveal();
  const [tgRef,   tgVis]     = useReveal();
  const [statsRef,statsVis]  = useReveal(0.2);
  const [ctaRef,  ctaVis]    = useReveal();

  const handleNavigation = (e) => {
    e.preventDefault();
    window.location.href = '/explorer';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 tracking-wider font-mono selection:bg-sky-400 selection:text-zinc-950 uppercase">

      {/* ── HERO SECTION ───────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 border-b border-zinc-900/60">
        {/* Dynamic vertical matrix computation overlay */}
        <CryptographicMatrix />

        {/* Deep Phantom Radial Focus Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-[450px] h-[250px] bg-emerald-500/[0.02] blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10 pt-20">
          {/* Obsidian Border Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-800/80 bg-zinc-900/60 mb-8 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-none bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
            <span className="text-[10px] tracking-widest text-zinc-400 uppercase">SEPOLIA TESTNET V2 · END-TO-END FHE STATE</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-white leading-[1.05] mb-6 uppercase">
            MASKED PAYLOADS.<br />
            <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400 bg-clip-text text-transparent">
              CONFIDENTIAL METRICS.
            </span>
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed font-normal normal-case mb-10">
            Route on-chain transactions globally through isolated cryptographic pipelines. Protect corporate balances, payment flows, and metadata signatures inside secure execution arrays—completely decoupled from public history tracking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={handleNavigation}
              className="w-full sm:w-auto px-8 py-3.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-transparent transition-all active:scale-98 text-xs tracking-widest uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              aria-label="Get started with the explorer application"
            >
              GET STARTED
            </button>
            <button
              onClick={handleNavigation}
              className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900/40 hover:bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 font-bold border border-zinc-800/60 transition-all text-xs tracking-widest uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
              aria-label="Launch application terminal"
            >
              LAUNCH EXPLORER
            </button>
          </div>

          {/* Minimal Industrial Stats Divider */}
          <div className="flex flex-wrap justify-center gap-4 border-t border-zinc-900/50 pt-10">
            <StatChip value="FHEVM" label="CORE PROTOCOL" />
            <StatChip value="ZK-WRAPPED" label="LEDGER PRIVACY" />
            <StatChip value="1.2s" label="BLOCK CAPACITY" />
            <StatChip value="ACTIVE" label="ROUTING RELAYER" />
          </div>
        </div>
      </section>

      {/* ── METADATA SECURITY PARADIGM ───────────────────────── */}
      <section
        ref={featRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28"
      >
        <div className={revealClass(featVis)}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <p className="text-xs font-bold tracking-widest text-sky-400 uppercase">// STATE OBFUSCATION PARADIGM</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-snug uppercase">
                ISOLATING TRANSACTIONS FROM THE CHAIN INDEX.
              </h2>
              <p className="text-zinc-400 leading-relaxed text-xs normal-case font-sans">
                ZEROREMIT replaces plaintext settlement metadata with encrypted cipher values computed directly within `fhevm-solidity`. Contract state mappings, addresses, and transaction thresholds remain strictly unreadable by unauthorized third parties.
              </p>
              <ul className="space-y-3 pt-1 text-xs text-zinc-400 lowercase tracking-normal">
                <li className="flex gap-2 items-start">{Icon.check}<span className="uppercase tracking-wider font-mono font-bold text-zinc-300">SECURE MATH ARRAYS RUNNING ON CIPHERTEXTS</span></li>
                <li className="flex gap-2 items-start">{Icon.check}<span className="uppercase tracking-wider font-mono font-bold text-zinc-300">ROLE-BASED INSTANT VIEW ACCESS CONTROL MAPPINGS</span></li>
                <li className="flex gap-2 items-start">{Icon.check}<span className="uppercase tracking-wider font-mono font-bold text-zinc-300">NATIVE WRAPPING INTERFACES FOR ERC-20 TOKENS</span></li>
              </ul>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FeatureCard icon={Icon.bolt} accent="bg-sky-500/[0.02]" title="GASLESS PROXIES" desc="Third-party relayer architectures transfer parameter blocks without exposing internal client signatures." />
              <FeatureCard icon={Icon.lock} accent="bg-sky-500/[0.02]" title="ENCRYPTED STATE MAPS" desc="Underlying account states match encrypted balances processed purely inside validation steps." />
              <FeatureCard icon={Icon.shield} accent="bg-emerald-500/[0.02]" title="ACCESS SECURITY LAYER" desc="Explicit view mappings protect text properties from baseline block index aggregations." />
              <FeatureCard icon={Icon.globe} accent="bg-sky-500/[0.02]" title="ISOLATED TUNNEL CIRCUITS" desc="Distribute ConfidentialUSDC globally utilizing encrypted parameters to halt cross-border tracing." />
            </div>
          </div>
        </div>
      </section>

      {/* ── SYSTEM MATRIX COMPONENT GRID ─────────────────────── */}
      <section
        ref={privRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60"
      >
        <div className={revealClass(privVis)}>
          <div className="mb-14 max-w-2xl">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">// ARCHITECTURE DECK</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              COMPREHENSIVE MASKING ENGINE OPERATIONS.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Icon.invoice}
              accent="bg-sky-500/[0.02]"
              title="STEALTH INVOICING"
              desc="Set unique or grouped parameter metrics. The client framework transforms records into secure tracking matrices automatically."
            />
            <FeatureCard
              icon={Icon.burner}
              accent="bg-emerald-500/[0.02]"
              title="EPHEMERAL KEY NODES"
              desc="Deploy disposable target interfaces per request to ensure core transactional histories do not compile public links."
            />
            <FeatureCard
              icon={Icon.telegram}
              accent="bg-zinc-900/30 border border-zinc-800/50"
              title="TELEGRAM WEBHOCK TUNNELS"
              desc="Relay calculated confirmation event hooks straight into isolated messaging channels outside the typical web layout."
            />
            <FeatureCard
              icon={Icon.bell}
              accent="bg-sky-500/[0.02]"
              title="EVENT FILTER LOGS"
              desc="Automated secure subgraphs monitor transition steps with minimal delay metrics while wiping state traces."
            />
            <FeatureCard
              icon={Icon.wallet}
              accent="bg-sky-500/[0.02]"
              title="MULTI-IDENTITY CONSOLES"
              desc="Consolidate various processing points under a unified operation layout while masking overlapping data properties."
            />
            <FeatureCard
              icon={Icon.qr}
              accent="bg-sky-500/[0.02]"
              title="ENCRYPTED CODE HASHES"
              desc="Serialize request fields into encrypted visual barcodes readable by decentralized clients for local validations."
            />
          </div>
        </div>
      </section>

      {/* ── TELEGRAM DAEMON INTEGRATION ──────────────────────── */}
      <section
        ref={tgRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60"
      >
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ${revealClass(tgVis)}`}>
          <div className="space-y-6">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase">// REMOTE DAEMON CHANNELS</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              OUT-OF-BAND EXECUTION ALERT LOOPS.
            </h2>
            <p className="text-zinc-400 text-xs normal-case font-sans leading-relaxed">
              Link communication bots to capture validation signals safely. When a confirmation condition transforms state details on-chain, target relay keys push formatted verification strings directly to a hidden endpoint loop.
            </p>
            <div className="space-y-2 text-xs text-zinc-400 lowercase tracking-normal">
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] SECURED EVENT MONITORING TRIGGERS</p>
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] AGGREGATED ACCOUNT BALANCE READOUTS</p>
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] SECURE MEMPOOL PACKET STREAM SIGNALS</p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-px bg-gradient-to-br from-sky-500/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative bg-zinc-900/20 border border-zinc-800/50 backdrop-blur-sm p-6 space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-zinc-800/40">
                <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  {Icon.telegram}
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-200 uppercase">ZEROREMIT_BOT_DAEMON</p>
                  <p className="text-[9px] text-zinc-600 font-medium">STATUS: ACTIVE_LISTENER</p>
                </div>
                <span className="ml-auto text-[9px] text-emerald-400 font-bold px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 tracking-wider">SECURE_NODE</span>
              </div>
              {[
                { label: '[SIGNAL] MUTATION_SETTLED', body: 'ID: 0x4f2b…c3 · STATE ARRAYS VERIFIED', time: '0.00s', accent: 'text-emerald-400' },
                { label: '[SIGNAL] MEMPOOL_INGEST', body: 'ID: 0xa1b2…e9 :: ENCRYPTED PAYLOAD QUEUED', time: '1.45m', accent: 'text-zinc-500' },
                { label: '[SIGNAL] COPROCESSOR_SYNC', body: 'STATE BALANCES UPDATED ON ARBITRUM SEPOLIA', time: '9.20m', accent: 'text-sky-400/80' },
              ].map((msg, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 border-b border-zinc-800/20 last:border-0 font-mono">
                  <div className="min-w-0 pr-4">
                    <p className={`text-[10px] font-bold mb-0.5 uppercase ${msg.accent}`}>{msg.label}</p>
                    <p className="text-[11px] text-zinc-400 truncate uppercase">{msg.body}</p>
                  </div>
                  <span className="text-[9px] text-zinc-600 flex-shrink-0 font-medium">{msg.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DATA TUNNELING LIFECYCLE ────────────────────────── */}
      <section
        ref={howRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60"
      >
        <div className={revealClass(howVis)}>
          <div className="mb-14 max-w-xl">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">// LIFECYCLE SEQUENCE</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              TRANSACTION PIPELINE MAP.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="relative p-6 bg-zinc-900/10 border border-zinc-800/40">
              <div className="space-y-5">
                <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-sky-400">01</div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-200 mb-2 uppercase tracking-wide">CLIENT CIPHERING</h3>
                  <p className="text-xs text-zinc-400 normal-case font-sans leading-relaxed mb-4">Input arrays compile structural parameters locally prior to block generation to isolate trace vectors.</p>
                </div>
                <div className="space-y-2">
                  <StepPill n="·" title="KEY VERIFICATION" desc="Signatures bind safely inside terminal memory boundaries." />
                  <StepPill n="·" title="CIPHER COMPILING" desc="Cryptographic math matrices isolate standard values." />
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative p-6 bg-zinc-900/10 border border-zinc-800/40">
              <div className="space-y-5">
                <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-sky-400">02</div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-200 mb-2 uppercase tracking-wide">STATE COMPUTATION</h3>
                  <p className="text-xs text-zinc-400 normal-case font-sans leading-relaxed mb-4">The target network scales parameter changes against encrypted algebraic boundaries seamlessly.</p>
                </div>
                <div className="space-y-2">
                  <StepPill n="·" title="STATE WRAPPING" desc="Standard asset configurations convert to ciphertext fields." />
                  <StepPill n="·" title="OPAQUE OVERLAYS" desc="Execution contexts eliminate clear ledger data chains." />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative p-6 bg-zinc-900/10 border border-zinc-800/40">
              <div className="space-y-5">
                <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-sky-400">03</div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-200 mb-2 uppercase tracking-wide">SECURE SYNCING</h3>
                  <p className="text-xs text-zinc-400 normal-case font-sans leading-relaxed mb-4">Background webhook elements capture logs dynamically, refreshing localized client workspaces safely.</p>
                </div>
                <div className="space-y-2">
                  <StepPill n="·" title="RELAY TRIGGERS" desc="Remote handlers format data signals with zero history leakage." />
                  <StepPill n="·" title="VIEW ACCESS" desc="Explicit authorization keys decode dashboard numbers." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRIC READOUTS ─────────────────────────────────── */}
      <section
        ref={statsRef}
        className="border-y border-zinc-900/60 bg-zinc-950"
      >
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 ${revealClass(statsVis)}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <StatChip value="V2.1_SYS" label="RUNTIME DECK" />
            <StatChip value="0_BYTES" label="TEXT LEAKAGE" />
            <StatChip value="RELAY_OK" label="PROXY LAYER" />
            <StatChip value="ZAMA_FHE" label="COMPILER CORE" />
          </div>
        </div>
      </section>

      {/* ── DESTROYABLE EPHEMERAL WALLET MODULE ──────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-b border-zinc-900/60">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative order-2 lg:order-1">
            <div className="absolute -inset-px bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative bg-zinc-900/10 border border-zinc-800/50 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-5 font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-zinc-900 border border-zinc-800 flex items-center justify-center">{Icon.burner}</div>
                  <span className="text-xs font-bold text-zinc-300 uppercase">EPHEMERAL_KEY_CONTROLLER</span>
                </div>
                <span className="text-[9px] text-white font-bold bg-emerald-600 px-2 py-0.5 tracking-wider">VOLATILE</span>
              </div>
              <div className="space-y-3 font-mono">
                <div className="p-3 bg-zinc-950/40 border border-zinc-800/40">
                  <p className="text-[9px] text-zinc-500 uppercase mb-1">TRANSIENT INSTANCE LINK</p>
                  <p className="text-xs text-zinc-300 truncate">0X4F2B…C3D9A1E7F0B2</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-950/40 border border-zinc-800/40">
                    <p className="text-[9px] text-zinc-500 uppercase mb-1">ALLOCATED BALANCE</p>
                    <p className="text-xs font-bold text-zinc-200">250.00 CUSDC</p>
                  </div>
                  <div className="p-3 bg-zinc-950/40 border border-zinc-800/40">
                    <p className="text-[9px] text-zinc-500 uppercase mb-1">SESSION STABILITY</p>
                    <p className="text-xs font-bold text-emerald-400">SINGLE_USE</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleNavigation} className="flex-1 py-2.5 text-xs font-bold bg-zinc-100 hover:bg-white text-zinc-950 border border-transparent transition-colors uppercase">LAUNCH ENGINE</button>
                  <button onClick={handleNavigation} className="flex-1 py-2.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 transition-colors uppercase">FLUSH MEMORY</button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 order-1 lg:order-2">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase">// EPHEMERAL INTERFACE FLUSH</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase leading-snug">
              SEVER LONG-TERM TRACKING TRAILS INSTANTLY.
            </h2>
            <p className="text-zinc-400 text-xs normal-case font-sans leading-relaxed">
              Isolate payment identity frameworks by setting short-lived, volatile execution points for separate confirmations. The moment transaction metrics match verification fields on-chain, routing cache parameters can be wiped out from local interfaces.
            </p>
            <div className="space-y-2 text-xs text-zinc-400 lowercase tracking-normal">
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] ROTATING SINGLE-USE TRANSIENT ROUTING CHANNELS</p>
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] ABSOLUTE SEPARATION FROM KEY ARCHIVE VALUES</p>
              <p className="flex gap-2 uppercase tracking-wider font-mono font-bold text-zinc-300">[✓] ZERO PERMANENT DISK STORAGE ACROSS INTERFACE TERMINALS</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACTION INVOCATION CTA ────────────────────────────── */}
      <section
        ref={ctaRef}
        className="relative px-4 py-32 overflow-hidden border-t border-zinc-900/60"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[250px] bg-sky-500/[0.03] blur-[100px] rounded-full pointer-events-none" />
        <div className={`max-w-2xl mx-auto text-center relative z-10 ${revealClass(ctaVis)}`}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase mb-5">
            MOUNT RUNTIME COMPILER STACK.
          </h2>
          <p className="text-zinc-400 text-xs normal-case font-sans leading-relaxed mb-10 max-w-lg mx-auto">
            Authorize client data pipelines to generate encrypted parameters instantly. Deploy secure transaction vectors across global endpoints without leaking internal core details.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleNavigation}
              className="w-full sm:w-auto px-8 py-4 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs tracking-widest uppercase transition-all shadow-md active:scale-98"
            >
              RUN APPLICATIONS
            </button>
            <button
              onClick={handleNavigation}
              className="w-full sm:w-auto px-8 py-4 bg-transparent hover:bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 font-bold border border-zinc-800 text-xs tracking-widest uppercase transition-colors"
            >
              ACCESS CORE EXPLORER
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900/60 px-4 py-8 bg-zinc-950">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 tracking-wider">ZEROREMIT //</span>
            <span className="text-xs text-zinc-600 uppercase">ON-CHAIN TRANSACT PRIVACY FRAMEWORK</span>
          </div>
          <div className="flex items-center gap-5 text-[10px] tracking-wider text-zinc-500 uppercase">
            <a href="#" className="hover:text-sky-400 transition-colors">SPEC_DOCS.MD</a>
            <a href="#" className="hover:text-sky-400 transition-colors">CORE_SRC</a>
            <a href="#" className="hover:text-sky-400 transition-colors">NODE_TELEMETRY</a>
            <span className="text-sky-400 font-bold">SEPOLIA_NODE_RUNNING</span>
          </div>
        </div>
      </footer>

    </div>
  );
}