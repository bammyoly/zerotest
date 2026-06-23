import React, { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits, parseEventLogs } from 'viem';
import QRCode from 'qrcode';
import { useZamaEncrypt } from '../hooks/useZamaEncrypt';

// ── Contract artifacts ────────────────────────────────────────────────────────
import PaymentRouterArtifact from '../contracts/PaymentRouter.json';
import DonationVaultArtifact from '../contracts/DonationVault.json';
import addresses             from '../contracts/addresses.json';

const ROUTER_ADDRESS = addresses.PaymentRouter;
const VAULT_ADDRESS  = addresses.DonationVault;
const ROUTER_ABI     = PaymentRouterArtifact.abi;
const VAULT_ABI      = DonationVaultArtifact.abi;
const USDC_DECIMALS  = 6;

// ── Gas config ────────────────────────────────────────────────────────────────
// Fallback limits used only when on-chain estimation fails
const FHE_GAS_FALLBACK_SINGLE = 3_000_000n;
const FHE_GAS_FALLBACK_MULTI  = 3_000_000n; // base; items add via estimation
const FHE_GAS_FALLBACK_VAULT  =   500_000n;
const GAS_BUFFER_BPS          = 130n; // 30% headroom over estimate

const MAX_ITEMS = 50;

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'single',
    label: 'Single payment',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>
      </svg>
    ),
    desc: 'Request a fixed amount from one specific payer',
  },
  {
    id: 'multi',
    label: 'Itemized',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
      </svg>
    ),
    desc: 'Open invoice — anyone can pay items, prices public',
  },
  {
    id: 'donation',
    label: 'Donation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
      </svg>
    ),
    desc: 'Open public page for contributions',
  },
];

// ── UI Components ─────────────────────────────────────────────────────────────
function Label({ children, required, hint }) {
  return (
    <div className="mb-2">
      <label className="text-sm font-medium text-zinc-200">
        {children}
        {required && <span className="text-violet-400 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full h-11 px-4 bg-zinc-950 border border-zinc-800 rounded-lg
        text-sm text-zinc-100 placeholder-zinc-600
        focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
        transition-all duration-200 ${className}`}
      {...props}
    />
  );
}

function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg
        text-sm text-zinc-100 placeholder-zinc-600
        focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
        transition-all duration-200 resize-none ${className}`}
      {...props}
    />
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/40 border border-red-900/30
      rounded-lg text-sm text-red-400 animate-in fade-in duration-200">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <span className="flex items-center justify-center gap-2.5">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span>{label}</span>
    </span>
  );
}

function SdkBadge({ sdkReady, sdkError }) {
  if (sdkError) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
        text-[11px] font-medium bg-red-950/40 text-red-400 border border-red-900/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
        SDK error
      </span>
    );
  }
  if (sdkReady) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
        text-[11px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>
        Encrypted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
      text-[11px] font-medium bg-zinc-900 text-zinc-500 border border-zinc-800">
      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Loading SDK
    </span>
  );
}

function Divider() {
  return <div className="border-t border-zinc-800/80 my-1"/>;
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-zinc-900/50 border border-zinc-800/70 rounded-xl ${className}`}>
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
      {right && <div>{right}</div>}
    </div>
  );
}

function CardBody({ children, className = '' }) {
  return <div className={`px-6 pb-6 ${className}`}>{children}</div>;
}

// ── Line item row ─────────────────────────────────────────────────────────────
function LineItem({ item, index, onChange, onRemove, canRemove }) {
  return (
    <div className="group flex gap-3 items-center p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50
      hover:border-zinc-700/50 transition-all">
      <div className="w-7 h-7 rounded-lg bg-zinc-800/80 flex items-center justify-center
        text-xs font-mono text-zinc-500 flex-shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
        <input
          placeholder="Description"
          value={item.description}
          onChange={e => onChange(index, 'description', e.target.value)}
          className="w-full h-9 px-3 bg-transparent border border-zinc-800 rounded-md text-sm text-zinc-100
            placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-all"
        />
        <div className="relative">
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={item.amount}
            onChange={e => onChange(index, 'amount', e.target.value)}
            className="w-full h-9 pl-3 pr-14 bg-transparent border border-zinc-800 rounded-md text-sm
              text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-all"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium
            text-zinc-600 pointer-events-none">USDC</span>
        </div>
      </div>
      {canRemove && (
        <button onClick={() => onRemove(index)}
          className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-red-400
            hover:bg-red-950/30 rounded-md transition-all opacity-0 group-hover:opacity-100 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Invoice ID extraction ─────────────────────────────────────────────────────
function extractInvoiceId(receipt, activeTab, txHash) {
  try {
    if (activeTab === 'donation') {
      const logs = parseEventLogs({ abi: VAULT_ABI, logs: receipt.logs, eventName: 'PageCreated' });
      if (logs.length > 0 && logs[0].args?.pageId) return logs[0].args.pageId;
    } else if (activeTab === 'single') {
      const logs = parseEventLogs({ abi: ROUTER_ABI, logs: receipt.logs, eventName: 'SingleInvoiceCreated' });
      if (logs.length > 0 && logs[0].args?.invoiceId) return logs[0].args.invoiceId;
    } else if (activeTab === 'multi') {
      const logs = parseEventLogs({ abi: ROUTER_ABI, logs: receipt.logs, eventName: 'MultiInvoiceCreated' });
      if (logs.length > 0 && logs[0].args?.invoiceId) return logs[0].args.invoiceId;
    }
  } catch (_) {}

  const target = (activeTab === 'donation' ? VAULT_ADDRESS : ROUTER_ADDRESS).toLowerCase();
  const log = receipt.logs.find(l => l.address.toLowerCase() === target && l.topics?.length > 1);
  if (log?.topics?.[1]) return log.topics[1];

  return txHash;
}

// ── Gas estimation helpers ────────────────────────────────────────────────────
async function estimateGas(publicClient, params, fallback) {
  try {
    const estimate = await publicClient.estimateContractGas(params);
    // Add a 30% buffer so minor variance doesn't OOG
    return (estimate * GAS_BUFFER_BPS) / 100n;
  } catch (e) {
    console.warn('[estimateGas] falling back to hardcoded limit:', e.shortMessage || e.message);
    return fallback;
  }
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ invoiceId, type, txHash, onCreateAnother }) {
  const base   = window.location.origin;
  const payUrl = type === 'donation'
    ? `${base}/donate/${invoiceId}`
    : `${base}/pay/${invoiceId}`;

  const [copied,    setCopied]    = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  React.useEffect(() => {
    QRCode.toDataURL(payUrl, {
      width: 240, margin: 2,
      color: { dark: '#e4e4e7', light: '#0a0a0a' },
    }).then(setQrDataUrl).catch(console.error);
  }, [payUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20
            flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-zinc-100 mb-1">
            {type === 'donation' ? 'Donation page is live' : 'Invoice created'}
          </h2>
          <p className="text-sm text-zinc-500 mb-8">
            {type === 'multi'
              ? 'Anyone with the link can pay items'
              : 'Share the link or QR code to receive payment'}
          </p>

          <div className="flex justify-center mb-8">
            {qrDataUrl ? (
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
                <img src={qrDataUrl} alt="QR" className="w-48 h-48 rounded-xl"/>
              </div>
            ) : (
              <div className="w-56 h-56 rounded-2xl border border-zinc-800 bg-zinc-950
                flex items-center justify-center">
                <Spinner label="Generating…"/>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="text-xs font-medium text-zinc-500 mb-2 block text-left">Payment link</label>
            <div className="flex gap-2">
              <div className="flex-1 h-11 px-4 flex items-center bg-zinc-950 border border-zinc-800
                rounded-lg text-xs font-mono text-zinc-400 truncate">
                {payUrl}
              </div>
              <button onClick={copyLink}
                className={`h-11 px-5 rounded-lg text-sm font-medium transition-all border ${
                  copied
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="text-xs font-medium text-zinc-500 mb-2 block text-left">
              {type === 'donation' ? 'Page ID' : 'Invoice ID'}
            </label>
            <div className="h-11 px-4 flex items-center bg-zinc-950 border border-zinc-800
              rounded-lg text-xs font-mono text-zinc-500 break-all">
              {invoiceId}
            </div>
          </div>

          {txHash && (
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-violet-400
                hover:text-violet-300 transition-colors mb-8">
              View on Etherscan
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          )}

          <Divider />

          <div className="flex gap-3 mt-6">
            <button onClick={onCreateAnother}
              className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium
                rounded-lg text-sm transition-all border border-zinc-700">
              Create another
            </button>
            <a href="/dashboard"
              className="flex-1 h-11 flex items-center justify-center bg-violet-600 hover:bg-violet-500
                text-white font-medium rounded-lg text-sm transition-all">
              Dashboard →
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CreateInvoice() {
  const { address, isConnected }              = useAccount();
  const { open }                               = useAppKit();
  const publicClient                           = usePublicClient();
  const { data: walletClient }                 = useWalletClient();
  const { encryptAmount, sdkReady, sdkError }  = useZamaEncrypt();

  const [activeTab,  setActiveTab]  = useState('single');
  const [loading,    setLoading]    = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(false);
  const [invoiceId,  setInvoiceId]  = useState('');
  const [txHash,     setTxHash]     = useState('');

  const [form, setForm] = useState({
    recipient: '', title: '', memo: '', dueAt: '', amount: '',
    items: [{ description: '', amount: '' }, { description: '', amount: '' }],
    description: '', goal: '', imageURI: '', endsAt: '',
  });

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setError(''); };

  const updateItem = (i, key, val) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [key]: val };
      return { ...f, items };
    });
    setError('');
  };

  const addItem = () => {
    if (form.items.length >= MAX_ITEMS) return;
    setForm(f => ({ ...f, items: [...f.items, { description: '', amount: '' }] }));
  };

  const removeItem = i =>
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const resetAll = () => {
    setSuccess(false); setError(''); setTxHash(''); setInvoiceId('');
    setForm({
      recipient: '', title: '', memo: '', dueAt: '', amount: '',
      items: [{ description: '', amount: '' }, { description: '', amount: '' }],
      description: '', goal: '', imageURI: '', endsAt: '',
    });
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    if (!form.title.trim()) return 'Title is required';

    if (activeTab === 'single') {
      if (!form.recipient.trim()) return 'Recipient address is required';
      if (!/^0x[0-9a-fA-F]{40}$/.test(form.recipient))
        return 'Enter a valid Ethereum address (0x…)';
      if (form.recipient.toLowerCase() === address?.toLowerCase())
        return 'Recipient cannot be your own wallet';
      if (!form.amount || parseFloat(form.amount) <= 0)
        return 'Amount must be greater than 0';
      if (parseFloat(form.amount) > 1_000_000)
        return 'Max 1,000,000 USDC';
    }

    if (activeTab === 'multi') {
      if (form.items.length === 0)         return 'Add at least one line item';
      if (form.items.length > MAX_ITEMS)   return `Maximum ${MAX_ITEMS} line items`;
      for (const [i, it] of form.items.entries()) {
        if (!it.description.trim())                  return `Item ${i + 1} needs a description`;
        if (!it.amount || parseFloat(it.amount) <= 0) return `Item ${i + 1} needs an amount`;
        if (parseFloat(it.amount) > 1_000_000)        return `Item ${i + 1} exceeds max`;
      }
    }

    if (form.dueAt  && new Date(form.dueAt)  <= new Date()) return 'Due date must be in the future';
    if (form.endsAt && new Date(form.endsAt) <= new Date()) return 'End date must be in the future';
    return null;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    if (!isConnected) { open(); return; }

    if (activeTab !== 'donation') {
      if (sdkError) { setError(`FHE SDK error: ${sdkError}`); return; }
      if (!sdkReady) { setError('FHE SDK is still loading. Please wait…'); return; }
    }

    setLoading(true);
    try {
      const dueAtTs  = form.dueAt  ? BigInt(Math.floor(new Date(form.dueAt).getTime()  / 1000)) : 0n;
      const endsAtTs = form.endsAt ? BigInt(Math.floor(new Date(form.endsAt).getTime() / 1000)) : 0n;
      let hash;

      // ── Donation page ─────────────────────────────────────────────
      if (activeTab === 'donation') {
        const donationArgs = [
          form.title,
          form.description || '',
          form.imageURI || '',
          form.goal ? parseUnits(form.goal, USDC_DECIMALS) : 0n,
          endsAtTs,
        ];

        setLoadingMsg('Estimating gas…');
        const donationGas = await estimateGas(
          publicClient,
          {
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'createPage',
            args: donationArgs,
            account: address,
          },
          FHE_GAS_FALLBACK_VAULT,
        );

        setLoadingMsg('Confirm in wallet…');
        hash = await walletClient.writeContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'createPage',
          gas: donationGas,
          args: donationArgs,
        });
      }

      // ── Single invoice (private amount, fixed payer) ──────────────
      else if (activeTab === 'single') {
        setLoadingMsg('Encrypting amount with Zama FHE…');
        const { handle, proof } = await encryptAmount(form.amount, ROUTER_ADDRESS);

        const singleArgs = [
          form.recipient,
          handle,
          proof,
          form.title,
          form.memo || '',
          dueAtTs,
        ];

        setLoadingMsg('Estimating gas…');
        const singleGas = await estimateGas(
          publicClient,
          {
            address: ROUTER_ADDRESS,
            abi: ROUTER_ABI,
            functionName: 'createSingleInvoice',
            args: singleArgs,
            account: address,
          },
          FHE_GAS_FALLBACK_SINGLE,
        );

        setLoadingMsg('Confirm in wallet…');
        hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: 'createSingleInvoice',
          gas: singleGas,
          args: singleArgs,
        });
      }

      // ── Multi invoice (public amounts, open to anyone) ────────────
      else {
        setLoadingMsg('Encrypting line item amounts…');
        const encrypted = await Promise.all(
          form.items.map(it => encryptAmount(it.amount, ROUTER_ADDRESS))
        );

        const multiArgs = [
          form.items.map(it => it.description),
          encrypted.map(e => e.handle),
          encrypted.map(e => e.proof),
          form.title,
          form.memo || '',
          dueAtTs,
        ];

        setLoadingMsg('Estimating gas…');
        const multiGas = await estimateGas(
          publicClient,
          {
            address: ROUTER_ADDRESS,
            abi: ROUTER_ABI,
            functionName: 'createMultiInvoice',
            args: multiArgs,
            account: address,
          },
          FHE_GAS_FALLBACK_MULTI,
        );

        setLoadingMsg('Confirm in wallet…');
        hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: 'createMultiInvoice',
          gas: multiGas,
          args: multiArgs,
        });
      }

      setTxHash(hash);
      setLoadingMsg('Confirming on-chain…');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setInvoiceId(extractInvoiceId(receipt, activeTab, hash));
      setSuccess(true);
    } catch (e) {
      const msg = e.shortMessage || e.message || 'Transaction failed';
      console.error('[handleCreate]', e);
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled.');
      } else if (msg.includes('FHE') || msg.includes('proof') || msg.includes('handle')) {
        setError(`FHE error: ${msg}`);
      } else if (msg.includes('TooManyItems')) {
        setError(`Maximum ${MAX_ITEMS} items per multi-invoice.`);
      } else if (msg.includes('InvalidRecipient') || msg.includes('ZeroRecipient')) {
        setError('Invalid recipient address.');
      } else if (msg.includes('insufficient funds')) {
        setError('Insufficient Sepolia ETH for gas. Top up your wallet and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const multiTotal  = form.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0).toFixed(2);
  const fheRequired = activeTab !== 'donation';
  const ctaDisabled = loading || (fheRequired && !!sdkError);

  // ── Render ────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <SuccessScreen invoiceId={invoiceId} type={activeTab} txHash={txHash} onCreateAnother={resetAll}/>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">

      {/* Header */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-violet-400 hover:text-violet-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <h1 className="text-lg font-semibold text-zinc-100">Create invoice</h1>
          </div>
          {fheRequired && <SdkBadge sdkReady={sdkReady} sdkError={sdkError} />}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Type selector */}
        <Card>
          <CardHeader title="Invoice type" subtitle="Choose how you want to receive payment" />
          <CardBody className="pt-0">
            <div className="grid grid-cols-3 gap-3">
              {TABS.map(t => (
                <button key={t.id}
                  onClick={() => { setActiveTab(t.id); setError(''); }}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border
                    text-center transition-all duration-200
                    ${activeTab === t.id
                      ? 'bg-violet-500/10 border-violet-500/40 text-violet-300'
                      : 'bg-zinc-950/50 border-zinc-800/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}>
                  <div className={activeTab === t.id ? 'text-violet-400' : 'text-zinc-600'}>
                    {t.icon}
                  </div>
                  <span className="text-xs font-medium">{t.label}</span>
                  {activeTab === t.id && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-500"/>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-3 text-center">
              {TABS.find(t => t.id === activeTab)?.desc}
            </p>
          </CardBody>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader
            title="Details"
            subtitle={activeTab === 'donation' ? 'Campaign information' : 'Invoice information'}
          />
          <CardBody className="space-y-5 pt-0">

            <div>
              <Label required>
                {activeTab === 'donation' ? 'Campaign title' : 'Title'}
              </Label>
              <Input
                placeholder={
                  activeTab === 'single' ? 'e.g. Design services — Q3 2025' :
                  activeTab === 'multi'  ? 'e.g. Restaurant bill — split tab' :
                                           'e.g. Support open-source dev'
                }
                value={form.title}
                onChange={e => set('title', e.target.value)}
              />
            </div>

            {/* Recipient — ONLY for single */}
            {activeTab === 'single' && (
              <div>
                <Label required hint="The wallet that will pay this invoice. Both you and they can decrypt the amount.">
                  Recipient (payer) address
                </Label>
                <Input placeholder="0x…" value={form.recipient}
                  onChange={e => set('recipient', e.target.value)}
                />
              </div>
            )}

            {/* Open-invoice notice for multi */}
            {activeTab === 'multi' && (
              <div className="flex gap-2.5 px-3.5 py-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
                <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                <div className="text-xs text-violet-300/80 leading-relaxed">
                  <strong>Open to anyone with the link.</strong> Multiple people can pay
                  different items. All payments go to your wallet. Amounts are publicly
                  visible so payers can see what they're paying.
                </div>
              </div>
            )}

            {/* Memo / Description */}
            <div>
              <Label>
                {activeTab === 'donation' ? 'Description' : 'Memo'}
              </Label>
              <Textarea rows={3}
                placeholder={
                  activeTab === 'donation'
                    ? 'What is this campaign raising funds for?'
                    : 'Payment terms, PO number, notes…'
                }
                value={activeTab === 'donation' ? form.description : form.memo}
                onChange={e => set(activeTab === 'donation' ? 'description' : 'memo', e.target.value)}
              />
            </div>

            {activeTab === 'donation' && (
              <>
                <div>
                  <Label>Cover image</Label>
                  <Input placeholder="https://… or ipfs://…"
                    value={form.imageURI} onChange={e => set('imageURI', e.target.value)}/>
                </div>
                <div>
                  <Label hint="Optional note shown to donors">Memo</Label>
                  <Textarea rows={2} placeholder="Anything donors should know…"
                    value={form.memo} onChange={e => set('memo', e.target.value)}/>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* Amount / Items */}
        <Card>
          <CardHeader
            title={activeTab === 'multi' ? 'Line items' : 'Amount'}
            subtitle={
              activeTab === 'donation' ? 'Set an optional fundraising goal' :
              activeTab === 'multi'    ? `Add items and their amounts (max ${MAX_ITEMS})` :
                                         'Enter the payment amount'
            }
            right={
              activeTab === 'multi' && parseFloat(multiTotal) > 0 && (
                <span className="text-sm font-semibold text-zinc-100">
                  ${multiTotal}
                  <span className="text-zinc-500 font-normal ml-1">USDC</span>
                </span>
              )
            }
          />
          <CardBody className="space-y-4 pt-0">

            {activeTab === 'single' && (
              <div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium
                    text-zinc-500 pointer-events-none">$</span>
                  <input
                    type="number" min="0.01" step="0.01" placeholder="0.00"
                    value={form.amount}
                    onChange={e => set('amount', e.target.value)}
                    className="w-full h-14 pl-10 pr-20 bg-zinc-950 border border-zinc-800 rounded-lg
                      text-2xl font-semibold text-zinc-100 placeholder-zinc-700
                      focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
                      transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium
                    text-zinc-600 pointer-events-none">USDC</span>
                </div>
              </div>
            )}

            {activeTab === 'multi' && (
              <>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <LineItem key={i} item={item} index={i}
                      onChange={updateItem} onRemove={removeItem}
                      canRemove={form.items.length > 1}
                    />
                  ))}
                </div>
                {form.items.length < MAX_ITEMS && (
                  <button onClick={addItem}
                    className="w-full h-10 flex items-center justify-center gap-2
                      border border-dashed border-zinc-800 hover:border-violet-500/40
                      rounded-lg text-xs font-medium text-zinc-500 hover:text-violet-400
                      transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Add item ({form.items.length}/{MAX_ITEMS})
                  </button>
                )}
              </>
            )}

            {activeTab === 'donation' && (
              <div>
                <Label hint="Optional — displayed on your public donation page">Goal</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium
                    text-zinc-500 pointer-events-none">$</span>
                  <input
                    type="number" min="0" step="1" placeholder="0"
                    value={form.goal} onChange={e => set('goal', e.target.value)}
                    className="w-full h-14 pl-10 pr-20 bg-zinc-950 border border-zinc-800 rounded-lg
                      text-2xl font-semibold text-zinc-100 placeholder-zinc-700
                      focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
                      transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium
                    text-zinc-600 pointer-events-none">USDC</span>
                </div>
              </div>
            )}

            {/* Encryption note */}
            {activeTab !== 'donation' && (
              <div className="flex items-center gap-2 p-3 bg-violet-500/5 border border-violet-500/10
                rounded-lg">
                <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                <span className="text-xs text-violet-300/80">
                  {activeTab === 'multi'
                    ? 'Amounts are publicly decryptable so payers can verify prices'
                    : 'Amount encrypted in-browser — only you and the recipient can decrypt'
                  }
                </span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader
            title="Schedule"
            subtitle={activeTab === 'donation'
              ? 'Set a campaign end date'
              : 'Set a payment deadline'
            }
          />
          <CardBody className="pt-0">
            {activeTab !== 'donation' ? (
              <div>
                <Label hint="Optional — invoice expires at midnight UTC on this date">
                  Due date
                </Label>
                <Input type="date" value={form.dueAt}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => set('dueAt', e.target.value)}
                />
              </div>
            ) : (
              <div>
                <Label hint="Optional — leave blank for open-ended">End date</Label>
                <Input type="date" value={form.endsAt}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => set('endsAt', e.target.value)}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Privacy note */}
        <div className="flex items-start gap-3 px-5 py-4 bg-violet-500/5 border border-violet-500/10
          rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-violet-300 mb-0.5">End-to-end encrypted</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {activeTab === 'donation'
                ? 'Each donation is encrypted by the donor\'s browser using Zama FHE.'
                : activeTab === 'multi'
                ? 'Amounts are publicly decryptable on-chain so anyone with the link can verify prices. Payments still settle via confidential cUSDC transfers.'
                : 'Amounts are encrypted in your browser before signing. Only you and the named recipient can decrypt — no plaintext value ever touches the network.'
              }
            </p>
          </div>
        </div>

        <ErrorBox message={error} />
        {sdkError && !error && <ErrorBox message={`Zama SDK: ${sdkError}`} />}

        {/* Tx pending */}
        {txHash && !success && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900/50
            border border-zinc-800/60 rounded-xl text-sm text-zinc-400">
            <svg className="w-4 h-4 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Transaction submitted —
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              className="font-mono text-violet-400 hover:text-violet-300 underline underline-offset-2">
              view on Etherscan
            </a>
          </div>
        )}

        {/* CTA */}
        {!isConnected ? (
          <button onClick={() => open()}
            className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold
              rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20">
            Connect wallet to continue
          </button>
        ) : (
          <button onClick={handleCreate} disabled={ctaDisabled}
            className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold
              rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20
              disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
            {loading ? (
              <Spinner label={loadingMsg || 'Creating…'} />
            ) : fheRequired && !sdkReady && !sdkError ? (
              <Spinner label="Initializing encryption…" />
            ) : activeTab === 'donation' ? (
              'Create donation page'
            ) : activeTab === 'multi' ? (
              'Create open invoice'
            ) : (
              'Create & encrypt invoice'
            )}
          </button>
        )}

        <p className="text-center text-xs text-zinc-700 pb-4">
          You only pay Sepolia gas · Testnet
        </p>
      </div>
    </div>
  );
}