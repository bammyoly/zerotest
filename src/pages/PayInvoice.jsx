import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits } from 'viem';
import jsQR from 'jsqr';
import { useZamaEncrypt } from '../hooks/useZamaEncrypt';

import PaymentRouterArtifact    from '../contracts/PaymentRouter.json';
import ConfidentialUSDCArtifact from '../contracts/ConfidentialUSDC.json';
import addresses                from '../contracts/addresses.json';

const ROUTER_ADDRESS = addresses.PaymentRouter;
const CUSDC_ADDRESS  = addresses.cUSDC;
const USDC_ADDRESS   = addresses.USDC;
const ROUTER_ABI     = PaymentRouterArtifact.abi;
const CUSDC_ABI      = ConfidentialUSDCArtifact.abi;
const USDC_DECIMALS  = 6;
const ZERO_ADDRESS   = '0x0000000000000000000000000000000000000000';

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single',  'Multi'];

const FHE_PAY_GAS = 5_000_000n;

// ── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';

function timeUntil(ts) {
  const diff = Number(ts) - Math.floor(Date.now() / 1000);
  if (diff <= 0)    return 'Expired';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

function parseInvoiceInput(raw) {
  const trimmed = (raw ?? '').toString().trim();
  try {
    const url  = new URL(trimmed);
    const segs = url.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (/^0x[0-9a-fA-F]{64}$/.test(last)) return last;
  } catch {}
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed;
  return null;
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function Spinner({ label, className = '' }) {
  return (
    <span className={`flex items-center justify-center gap-2 ${className}`}>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/40 border border-red-900/30
      rounded-lg text-sm text-red-400">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    Pending:   { bg: 'bg-amber-950/40',   text: 'text-amber-400',   border: 'border-amber-900/30',   dot: 'bg-amber-400'   },
    Paid:      { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-900/30', dot: 'bg-emerald-400' },
    Cancelled: { bg: 'bg-zinc-800/40',    text: 'text-zinc-500',    border: 'border-zinc-700/30',    dot: 'bg-zinc-600'    },
    Expired:   { bg: 'bg-red-950/40',     text: 'text-red-400',     border: 'border-red-900/30',     dot: 'bg-red-400'     },
  }[status] || {};
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1
      rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {status}
    </span>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
  const steps = [
    { num: 1, label: 'Connect' },
    { num: 2, label: 'Verify'  },
    { num: 3, label: 'Pay'     },
  ];
  return (
    <div className="flex items-center justify-between mb-8 px-2">
      {steps.map((step, i) => {
        const isComplete = currentStep > step.num;
        const isActive   = currentStep === step.num;
        return (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs
                font-semibold transition-all duration-300 border-2 ${
                isComplete ? 'bg-white text-zinc-950 border-white'
                : isActive ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/30'
                : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}>
                {isComplete ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                  </svg>
                ) : step.num}
              </div>
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${
                isActive ? 'text-white' : isComplete ? 'text-zinc-400' : 'text-zinc-600'
              }`}>
                {step.num}. {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 transition-all duration-300 ${
                currentStep > step.num ? 'bg-white' : 'bg-zinc-800'
              }`}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-zinc-900/50 border border-zinc-800/70 rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

// ── Shield modal ──────────────────────────────────────────────────────────────
function ShieldModal({ usdcBalance, onShield, onClose, loading, loadingMsg, error }) {
  const [amount, setAmount] = useState('');
  const maxUsdc = usdcBalance !== null ? (Number(usdcBalance) / 1e6).toFixed(6) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
      bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Shield USDC</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Convert to confidential cUSDC</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60">
            <div className="text-[11px] text-zinc-500 mb-1 uppercase tracking-wider">USDC</div>
            <div className="text-base font-semibold text-zinc-200">
              {usdcBalance !== null ? `${(Number(usdcBalance) / 1e6).toFixed(2)}` : '…'}
            </div>
          </div>
          <div className="bg-violet-500/5 rounded-xl p-3 border border-violet-500/20">
            <div className="text-[11px] text-violet-400 mb-1 uppercase tracking-wider">cUSDC</div>
            <div className="text-sm font-medium text-zinc-500 italic">encrypted</div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-zinc-400 mb-2">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-zinc-500">$</span>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-14 pl-10 pr-16 bg-zinc-950 border border-zinc-800 rounded-xl
                text-xl font-semibold text-zinc-100 placeholder-zinc-700
                focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
                transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-600">USDC</span>
          </div>
          {maxUsdc && (
            <button onClick={() => setAmount(maxUsdc)}
              className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              Use max ({(Number(usdcBalance) / 1e6).toFixed(2)} USDC)
            </button>
          )}
        </div>

        {error && <div className="mb-4"><ErrorBox message={error} /></div>}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl text-sm
              border border-zinc-700 transition-all">
            Cancel
          </button>
          <button onClick={() => onShield(amount)}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="flex-1 h-11 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl text-sm
              transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-violet-500/20">
            {loading ? <Spinner label={loadingMsg || 'Shielding…'} /> : 'Shield USDC'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Encrypted amount with decrypt button ─────────────────────────────────────
function EncryptedAmount({ value, canDecrypt, decrypting, onDecrypt, decryptError, isPublic }) {
  if (value !== null && value !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20
          px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
          </svg>
          <span className="text-sm font-semibold text-emerald-300">
            ${(Number(value) / 1e6).toFixed(2)}
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-600 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
          cUSDC
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20
          px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span className="text-sm font-medium text-violet-300 italic">
            {isPublic ? 'Hidden' : 'Encrypted'}
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-600 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
          cUSDC
        </span>
        {canDecrypt && (
          <button onClick={onDecrypt} disabled={decrypting}
            title={isPublic ? 'Public decrypt (anyone can view)' : 'Decrypt amount (authorized only)'}
            className="h-8 px-2.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30
              text-violet-300 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5">
            {decrypting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            )}
            <span className="text-[11px] font-semibold">
              {decrypting ? 'Decrypting' : (isPublic ? 'View' : 'Decrypt')}
            </span>
          </button>
        )}
      </div>
      {decryptError && <span className="text-[10px] text-red-400 max-w-[280px] text-right">{decryptError}</span>}
    </div>
  );
}

// ── Multi item row ────────────────────────────────────────────────────────────
function ItemRow({ item, index, onPay, paying, invoiceStatus, canDecrypt, onDecryptItem, isPublic, canPay }) {
  const itemCanPay = invoiceStatus === 'Pending' && !item.paid && canPay;
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
      item.paid
        ? 'bg-emerald-950/10 border-emerald-900/30'
        : 'bg-zinc-950/40 border-zinc-800/60 hover:border-zinc-700/60'
    }`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        item.paid ? 'bg-emerald-500' : 'bg-zinc-800/80 border border-zinc-700/60'
      }`}>
        {item.paid ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
          </svg>
        ) : (
          <span className="text-xs font-mono text-zinc-500">{index + 1}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${
          item.paid ? 'text-zinc-500 line-through' : 'text-zinc-200'
        }`}>
          {item.description || `Item ${index + 1}`}
        </div>
        <div className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1.5">
          {item.decryptedAmount !== undefined && item.decryptedAmount !== null ? (
            <span className="text-emerald-400 font-medium">
              ${(Number(item.decryptedAmount) / 1e6).toFixed(2)} cUSDC
            </span>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              {isPublic ? 'Hidden amount' : 'Encrypted'}
              {canDecrypt && (
                <button onClick={() => onDecryptItem(index)} disabled={item.decrypting}
                  className="ml-1 text-violet-400 hover:text-violet-300 underline underline-offset-2 text-[11px]">
                  {item.decrypting ? '…' : (isPublic ? 'view' : 'decrypt')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {itemCanPay && (
        <button onClick={() => onPay(index)} disabled={paying === index}
          className="px-4 h-9 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold
            rounded-lg transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap
            shadow-md shadow-violet-500/20">
          {paying === index ? <Spinner label="Paying…" /> : 'Pay'}
        </button>
      )}
      {item.paid && <span className="text-xs text-emerald-400 font-semibold">Settled</span>}
    </div>
  );
}

// ── QR Upload helper ─────────────────────────────────────────────────────────
async function decodeQRFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) resolve(code.data);
        else reject(new Error('No QR code found in image'));
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PayInvoice() {
  const { invoiceId: paramId }   = useParams();
  const navigate                  = useNavigate();
  const { address, isConnected } = useAccount();
  const { open }                  = useAppKit();
  const publicClient              = usePublicClient();
  const { data: walletClient }   = useWalletClient();
  const { decryptHandle, publicDecryptHandle, sdkReady, sdkError } = useZamaEncrypt();
  const fileInputRef              = useRef(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [linkInput,   setLinkInput]   = useState('');
  const [linkError,   setLinkError]   = useState('');
  const [resolving,   setResolving]   = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);

  const [activeId,   setActiveId]   = useState(paramId || null);
  const [invoice,    setInvoice]    = useState(null);
  const [items,      setItems]      = useState([]);
  const [fetching,   setFetching]   = useState(!!paramId);
  const [fetchError, setFetchError] = useState('');

  const [paying,        setPaying]        = useState(null);
  const [payError,      setPayError]      = useState('');
  const [payTxHash,     setPayTxHash]     = useState('');
  const [payLoadingMsg, setPayLoadingMsg] = useState('');
  const [paid,          setPaid]          = useState(false);
  const [payerNote,     setPayerNote]     = useState('');

  const [showShield,  setShowShield]  = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [shielding,   setShielding]   = useState(false);
  const [shieldMsg,   setShieldMsg]   = useState('');
  const [shieldError, setShieldError] = useState('');

  const [decryptedAmount, setDecryptedAmount] = useState(null);
  const [decrypting,      setDecrypting]      = useState(false);
  const [decryptError,    setDecryptError]    = useState('');

  // ── Fetch invoice ─────────────────────────────────────────────────────────
  const fetchInvoice = useCallback(async (id) => {
    if (!publicClient || !id) return;
    setFetching(true);
    setFetchError('');
    setInvoice(null);
    setItems([]);
    setDecryptedAmount(null);
    setDecryptError('');
    try {
      // getInvoice returns 10 fields
      const data = await publicClient.readContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'getInvoice', args: [id],
      });
      const [creator, recipient, kind, status, title, memo, createdAt, dueAt, itemCount, paidItems] = data;
      const inv = {
        creator, recipient,
        kind: Number(kind), status: Number(status),
        title, memo, createdAt, dueAt,
        itemCount: Number(itemCount), paidItems: Number(paidItems),
      };

      // Batch-fetch all items via getAllItems
      if (Number(itemCount) > 0) {
        const [descriptions, paidStatus, paidByList, paidAtList, amountHandles] =
          await publicClient.readContract({
            address: ROUTER_ADDRESS, abi: ROUTER_ABI,
            functionName: 'getAllItems', args: [id],
          });

        const parsedItems = descriptions.map((desc, i) => ({
          description:      desc,
          paid:             paidStatus[i],
          paidBy:           paidByList[i],
          paidAt:           paidAtList[i],
          encryptedAmount:  amountHandles[i],
          decryptedAmount:  null,
          decrypting:       false,
        }));
        setItems(parsedItems);

        // For SINGLE, expose item[0] amount on the invoice for main display
        if (Number(kind) === 0) {
          inv.encryptedAmount = parsedItems[0]?.encryptedAmount;
        }
      }

      setInvoice(inv);
    } catch (e) {
      console.error('[fetchInvoice]', e);
      setFetchError('Invoice not found or could not be loaded.');
    } finally {
      setFetching(false);
    }
  }, [publicClient]);

  useEffect(() => {
    if (paramId) {
      setActiveId(paramId);
      setLinkInput('');
      setLinkError('');
      setPaid(false);
      setPayTxHash('');
      setPayError('');
      fetchInvoice(paramId);
    } else {
      setActiveId(null);
      setInvoice(null);
      setItems([]);
      setFetchError('');
      setPaid(false);
      setPayTxHash('');
      setPayError('');
      setDecryptedAmount(null);
    }
  }, [paramId, fetchInvoice]);

  useEffect(() => {
    if (!publicClient || !address) return;
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf', args: [address],
    }).then(setUsdcBalance).catch(() => {});
  }, [publicClient, address]);

  // ── Access control ──────────────────────────────────────────────────────
  const isMulti  = invoice?.kind === 1;
  const isSingle = invoice?.kind === 0;

  const isCreator = isConnected && invoice && address &&
    invoice.creator.toLowerCase() === address.toLowerCase();

  const isNamedRecipient = isConnected && invoice && address &&
    invoice.recipient !== ZERO_ADDRESS &&
    invoice.recipient.toLowerCase() === address.toLowerCase();

  // Decryption rights:
  //   SINGLE — only creator + named recipient (ACL-granted)
  //   MULTI  — anyone (publicly decryptable)
  const canDecrypt = isMulti ? true : (isCreator || isNamedRecipient);

  // Payment rights:
  //   SINGLE — only the named recipient
  //   MULTI  — anyone except the creator
  const canPay = invoice && (isMulti
    ? (isConnected && !isCreator)
    : isNamedRecipient
  );

  // ── Resolver handlers ─────────────────────────────────────────────────────
  const handleResolveLink = async (e) => {
    e?.preventDefault();
    setLinkError('');
    const id = parseInvoiceInput(linkInput);
    if (!id) { setLinkError('Paste a valid invoice link or bytes32 ID'); return; }
    setResolving(true);
    navigate(`/pay/${id}`);
    setResolving(false);
  };

  const handleQRUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLinkError('');
    setUploadingQR(true);
    try {
      const data = await decodeQRFromFile(file);
      const id   = parseInvoiceInput(data);
      if (id) {
        navigate(`/pay/${id}`);
      } else {
        setLinkInput(data);
        setLinkError('QR decoded, but did not contain a valid invoice link.');
      }
    } catch (err) {
      setLinkError(err.message || 'Could not decode QR from image');
    } finally {
      setUploadingQR(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = () => navigate('/pay');

  // ── Decrypt handlers ──────────────────────────────────────────────────────
  const handleDecryptMain = async () => {
    if (!invoice?.encryptedAmount) return;
    setDecryptError('');
    setDecrypting(true);
    try {
      let value;
      if (isMulti) {
        // Public decryption — no wallet signature required
        value = await publicDecryptHandle(invoice.encryptedAmount);
      } else {
        // User decryption — creator or named recipient only
        if (!canDecrypt) throw new Error('Not authorized to decrypt this amount');
        value = await decryptHandle(invoice.encryptedAmount, ROUTER_ADDRESS);
      }
      setDecryptedAmount(value);
    } catch (e) {
      console.error('[handleDecryptMain]', e);
      setDecryptError(e.shortMessage || e.message || 'Decryption failed');
    } finally {
      setDecrypting(false);
    }
  };

  const handleDecryptItem = async (idx) => {
    const item = items[idx];
    if (!item?.encryptedAmount) return;

    setItems(prev => prev.map((it, i) => i === idx ? { ...it, decrypting: true } : it));
    try {
      let value;
      if (isMulti) {
        value = await publicDecryptHandle(item.encryptedAmount);
      } else {
        if (!canDecrypt) throw new Error('Not authorized to decrypt');
        value = await decryptHandle(item.encryptedAmount, ROUTER_ADDRESS);
      }
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, decrypting: false, decryptedAmount: value } : it
      ));
    } catch (e) {
      console.error('[handleDecryptItem]', e);
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, decrypting: false } : it));
      setDecryptError(e.shortMessage || e.message || 'Decryption failed');
    }
  };

  // ── Shield handler ────────────────────────────────────────────────────────
  const handleShield = async (amount) => {
    if (!amount || parseFloat(amount) <= 0) { setShieldError('Enter a valid amount'); return; }
    setShieldError(''); setShielding(true);
    try {
      const amt = parseUnits(amount, USDC_DECIMALS);
      setShieldMsg('Approve USDC…');
      const approveTx = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'approve', args: [CUSDC_ADDRESS, amt],
      });
      setShieldMsg('Waiting for approval…');
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      setShieldMsg('Confirm shield…');
      const wrapTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_ABI,
        functionName: 'wrap', args: [address, amt],
      });
      setShieldMsg('Finalising…');
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });

      const newBal = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf', args: [address],
      });
      setUsdcBalance(newBal);
      setShowShield(false);
    } catch (e) {
      setShieldError(e.shortMessage || e.message || 'Shield failed');
    } finally {
      setShielding(false); setShieldMsg('');
    }
  };

  // ── Pay handler ────────────────────────────────────────────────────────────
  const handlePay = async (itemIndex = 0) => {
    setPayError('');
    setPaying(itemIndex);
    try {
      // 1. Grant PaymentRouter operator on cUSDC
      setPayLoadingMsg('Authorizing router…');
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const opTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_ABI,
        functionName: 'setOperator',
        args: [ROUTER_ADDRESS, expiry],
        gas: 200_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: opTx });

      // 2. Pay — payItem(invoiceId, index) handles both SINGLE (idx=0) and MULTI
      setPayLoadingMsg('Confirm payment in wallet…');
      const hash = await walletClient.writeContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'payItem',
        args: [activeId, BigInt(itemIndex)],
        gas: FHE_PAY_GAS,
      });

      setPayTxHash(hash);
      setPayLoadingMsg('Confirming on-chain…');
      await publicClient.waitForTransactionReceipt({ hash });

      // Optimistic update
      if (isSingle) {
        setInvoice(inv => ({ ...inv, status: 1, paidItems: 1 }));
        setItems(prev => prev.map((it, i) => i === 0
          ? { ...it, paid: true, paidBy: address, paidAt: BigInt(Math.floor(Date.now()/1000)) }
          : it));
        setPaid(true);
      } else {
        setItems(prev => prev.map((it, i) => i === itemIndex
          ? { ...it, paid: true, paidBy: address, paidAt: BigInt(Math.floor(Date.now()/1000)) }
          : it));
        setInvoice(inv => {
          const newPaid = inv.paidItems + 1;
          const isAllPaid = newPaid === inv.itemCount;
          if (isAllPaid) setPaid(true);
          return { ...inv, paidItems: newPaid, status: isAllPaid ? 1 : 0 };
        });
      }
    } catch (e) {
      const msg = e.shortMessage || e.message || 'Payment failed';
      console.error('[handlePay]', e);

      if (msg.includes('NotAuthorizedPayer')) {
        setPayError('Only the named recipient can pay this single invoice.');
      } else if (msg.includes('CannotPaySelf')) {
        setPayError('You cannot pay an invoice you created.');
      } else if (msg.includes('AlreadyPaid') || msg.includes('ItemAlreadyPaid')) {
        setPayError('This item has already been paid.');
      } else if (msg.includes('Expired')) {
        setPayError('This invoice has expired.');
      } else if (msg.includes('AlreadyCancelled')) {
        setPayError('This invoice was cancelled.');
      } else if (msg.includes('user rejected') || msg.includes('User rejected')) {
        setPayError('Transaction cancelled.');
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        setPayError('Insufficient cUSDC balance. Shield some USDC first.');
      } else if (msg.includes('JSON-RPC') || msg.includes('not supported')) {
        setPayError('RPC error. Check your wallet is on Sepolia.');
      } else {
        setPayError(msg);
      }
    } finally {
      setPaying(null);
      setPayLoadingMsg('');
    }
  };

  const invoiceStatus = invoice ? (INVOICE_STATUS[invoice.status] ?? 'Pending') : null;
  const invoiceType   = invoice ? (INVOICE_TYPE[invoice.kind]     ?? 'Single')  : null;
  const currentStep   = !isConnected ? 1 : (paid ? 3 : (invoiceStatus === 'Pending' ? 2 : 3));

  // ────────────────────────────────────────────────────────────────────────
  // MODE A — Resolver
  // ────────────────────────────────────────────────────────────────────────
  if (!activeId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="text-violet-400 hover:text-violet-300 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </a>
              <h1 className="text-lg font-semibold text-zinc-100">Pay invoice</h1>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20
              flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Resolve an invoice</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Paste a payment link, enter an invoice ID, or upload a QR code image to view and pay.
            </p>
          </div>

          <Card className="p-6">
            <form onSubmit={handleResolveLink} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-200 mb-2 block">
                  Payment link or invoice ID
                </label>
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                  </svg>
                  <input type="text" value={linkInput}
                    onChange={e => { setLinkInput(e.target.value); setLinkError(''); }}
                    placeholder="https://zeroremit.app/pay/0x… or 0x…"
                    className="w-full h-12 pl-11 pr-4 bg-zinc-950 border border-zinc-800 rounded-xl
                      text-sm font-mono text-zinc-200 placeholder-zinc-600
                      focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10
                      transition-all"
                  />
                </div>
              </div>

              {linkError && <ErrorBox message={linkError} />}

              <input ref={fileInputRef} type="file" accept="image/*"
                onChange={handleQRUpload} className="hidden"
              />

              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingQR}
                  className="h-12 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium
                    rounded-xl text-sm border border-zinc-700 transition-all flex items-center
                    justify-center gap-2 disabled:opacity-50">
                  {uploadingQR ? (
                    <Spinner label="Reading QR…" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                      Upload QR
                    </>
                  )}
                </button>
                <button type="submit" disabled={resolving || !linkInput.trim()}
                  className="flex-1 h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold
                    rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50
                    shadow-lg shadow-violet-500/20">
                  {resolving ? <Spinner label="Looking up…" /> : 'Continue →'}
                </button>
              </div>

              <p className="text-[11px] text-zinc-600 text-center pt-1">
                Upload a screenshot or saved QR image from your gallery
              </p>
            </form>
          </Card>

          <div className="text-center space-y-1">
            <p className="text-xs text-zinc-600">Need to create an invoice instead?</p>
            <a href="/create" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
              Create new invoice →
            </a>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-700 pt-4">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            All amounts encrypted with Zama FHE
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // MODE B — Checkout
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
        bg-violet-500/10 blur-[120px] rounded-full pointer-events-none"/>

      {showShield && (
        <ShieldModal usdcBalance={usdcBalance} onShield={handleShield}
          onClose={() => { setShowShield(false); setShieldError(''); }}
          loading={shielding} loadingMsg={shieldMsg} error={shieldError}
        />
      )}

      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleClear} className="text-violet-400 hover:text-violet-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-zinc-100">Checkout</h1>
          </div>
          {invoice && <StatusBadge status={invoiceStatus} />}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 relative z-10">

        {fetching && (
          <Card className="px-5 py-20 text-center">
            <Spinner label="Loading invoice…" className="text-zinc-500" />
            <p className="text-xs text-zinc-700 mt-3 font-mono">{activeId?.slice(0, 18)}…</p>
          </Card>
        )}

        {!fetching && fetchError && (
          <Card className="px-5 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20
              flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-zinc-200 mb-1">Invoice not found</h3>
            <p className="text-sm text-zinc-500 mb-6">{fetchError}</p>
            <button onClick={handleClear}
              className="px-5 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium
                rounded-xl text-sm border border-zinc-700 transition-all">
              ← Try another link
            </button>
          </Card>
        )}

        {!fetching && invoice && (
          <Card className="p-6 sm:p-8">
            <StepIndicator currentStep={currentStep} />

            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">

              {/* LEFT — Invoice details */}
              <div className="space-y-4">
                <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-5 space-y-4">

                  {/* Creator (always shown) */}
                  <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                      Pay to (Creator)
                    </span>
                    <a href={`https://sepolia.etherscan.io/address/${invoice.creator}`}
                      target="_blank" rel="noreferrer"
                      className="font-mono text-xs text-zinc-300 hover:text-violet-300 transition-colors
                        bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
                      {shortAddr(invoice.creator)}
                    </a>
                  </div>

                  {/* Recipient — SINGLE only */}
                  {isSingle && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                        Named Payer
                      </span>
                      <a href={`https://sepolia.etherscan.io/address/${invoice.recipient}`}
                        target="_blank" rel="noreferrer"
                        className="font-mono text-xs text-zinc-300 hover:text-violet-300 transition-colors
                          bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
                        {shortAddr(invoice.recipient)}
                      </a>
                    </div>
                  )}

                  {/* "Open to anyone" notice — MULTI only */}
                  {isMulti && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                        Payer
                      </span>
                      <span className="text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20
                        px-2.5 py-1 rounded-md font-medium">
                        Open · Anyone with link
                      </span>
                    </div>
                  )}

                  {/* Title */}
                  <div className="flex items-start justify-between pb-4 border-b border-zinc-800/60">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 pt-0.5">
                      Invoice Title
                    </span>
                    <span className="text-sm font-medium text-zinc-100 text-right max-w-[60%]">
                      {invoice.title}
                    </span>
                  </div>

                  {/* Amount — SINGLE only (multi shows per-item) */}
                  {isSingle && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                        Amount
                      </span>
                      <EncryptedAmount
                        value={decryptedAmount}
                        canDecrypt={canDecrypt && sdkReady}
                        decrypting={decrypting}
                        onDecrypt={handleDecryptMain}
                        decryptError={decryptError}
                        isPublic={false}
                      />
                    </div>
                  )}

                  {/* Type */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                      Type
                    </span>
                    <span className="text-sm text-zinc-300">{invoiceType}</span>
                  </div>

                  {/* Due */}
                  {invoice.dueAt && Number(invoice.dueAt) > 0 && (
                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                        Due
                      </span>
                      <span className={`text-sm ${
                        Number(invoice.dueAt) < Date.now() / 1000 ? 'text-red-400' : 'text-zinc-300'
                      }`}>{timeUntil(invoice.dueAt)}</span>
                    </div>
                  )}

                  {/* Multi progress */}
                  {isMulti && (
                    <div className="pt-4 border-t border-zinc-800/60">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
                          Progress
                        </span>
                        <span className="text-xs font-medium text-zinc-300">
                          {invoice.paidItems} of {invoice.itemCount} settled
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all duration-500"
                          style={{ width: `${(invoice.paidItems / invoice.itemCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Memo */}
                  {invoice.memo && (
                    <div className="pt-4 border-t border-zinc-800/60">
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 mb-1.5">
                        Memo
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">{invoice.memo}</p>
                    </div>
                  )}
                </div>

                {/* Multi line items */}
                {isMulti && items.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 mb-2 px-1">
                      Line items
                    </div>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <ItemRow key={i} item={item} index={i}
                          onPay={handlePay} paying={paying} invoiceStatus={invoiceStatus}
                          canDecrypt={sdkReady}
                          onDecryptItem={handleDecryptItem}
                          isPublic={true}
                          canPay={canPay}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — Action panel */}
              <div className="space-y-4">
                <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-5">
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 mb-2 block">
                    Payer Note
                  </label>
                  <textarea rows={3} value={payerNote}
                    onChange={e => setPayerNote(e.target.value)}
                    placeholder="Private note for your records…"
                    className="w-full px-3 py-2.5 bg-transparent border border-zinc-800 rounded-lg
                      text-sm text-zinc-200 placeholder-zinc-600 resize-none
                      focus:outline-none focus:border-violet-500/50 transition-all"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1.5">
                    Stored locally — kept private from the creator.
                  </p>
                </div>

                <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-5">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 mb-3">
                    Payment Method
                  </div>

                  {!isConnected ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"/>
                        No wallet connected
                      </div>
                      <button onClick={() => open()}
                        className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white
                          font-semibold rounded-xl text-sm transition-all active:scale-[0.98]
                          shadow-lg shadow-violet-500/20">
                        Connect Wallet
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                          <span className="text-xs font-mono text-zinc-300">{shortAddr(address)}</span>
                        </div>
                        {isCreator && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold
                            text-violet-300 bg-violet-950/40 px-2 py-0.5 rounded border border-violet-900/30">
                            Creator
                          </span>
                        )}
                        {isNamedRecipient && !isCreator && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold
                            text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/30">
                            Payer
                          </span>
                        )}
                        {isMulti && !isCreator && isConnected && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold
                            text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                            Open
                          </span>
                        )}
                      </div>

                      {usdcBalance !== null && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">USDC balance</span>
                          <span className="text-zinc-300 font-medium">
                            ${(Number(usdcBalance) / 1e6).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {invoiceStatus === 'Pending' && !paid && canPay && (
                        <button onClick={() => { setShieldError(''); setShowShield(true); }}
                          className="w-full h-10 bg-zinc-900 hover:bg-zinc-800 text-zinc-300
                            font-medium rounded-lg text-xs border border-zinc-800 transition-all
                            flex items-center justify-center gap-2">
                          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                          </svg>
                          Shield USDC → cUSDC
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {payTxHash && !paid && (
                  <div className="flex items-start gap-2.5 p-3 bg-zinc-950/40 border border-zinc-800/60 rounded-lg text-xs text-zinc-400">
                    <svg className="w-3.5 h-3.5 animate-spin text-violet-400 mt-0.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    <div className="flex-1">
                      <div className="text-zinc-300 font-medium mb-0.5">
                        {payLoadingMsg || 'Confirming on-chain'}
                      </div>
                      <a href={`https://sepolia.etherscan.io/tx/${payTxHash}`}
                        target="_blank" rel="noreferrer"
                        className="font-mono text-[11px] text-violet-400 hover:text-violet-300">
                        View on Etherscan ↗
                      </a>
                    </div>
                  </div>
                )}

                <ErrorBox message={payError} />
                {sdkError && <ErrorBox message={`Zama SDK: ${sdkError}`} />}

                {/* Main pay CTA */}
                {invoiceStatus === 'Pending' && !paid && isConnected && canPay && (
                  isSingle ? (
                    <button onClick={() => handlePay(0)} disabled={paying !== null}
                      className="w-full h-14 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold
                        rounded-xl text-base transition-all active:scale-[0.98] disabled:opacity-50
                        shadow-xl shadow-white/10">
                      {paying !== null ? (
                        <Spinner label={payLoadingMsg || 'Processing…'} />
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                          </svg>
                          Confirm & Pay
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="px-4 py-3 bg-zinc-950/40 border border-zinc-800/60 rounded-lg
                      text-center text-xs text-zinc-500">
                      Click <strong className="text-zinc-300">Pay</strong> on each line item to settle.
                    </div>
                  )
                )}

                {/* Can't pay — single only */}
                {invoiceStatus === 'Pending' && !paid && isConnected && !canPay && !isCreator && isSingle && (
                  <div className="px-4 py-4 bg-amber-500/5 border border-amber-500/20 rounded-xl
                    text-sm text-amber-300 text-center">
                    Only the named recipient can pay this invoice.
                  </div>
                )}

                {/* Creator notice */}
                {isCreator && invoiceStatus === 'Pending' && (
                  <div className="px-4 py-4 bg-violet-500/5 border border-violet-500/20 rounded-xl
                    text-sm text-violet-300 text-center">
                    You created this invoice. {isMulti
                      ? 'Anyone with the link can pay items.'
                      : 'Only the named recipient can pay it.'}
                    {!isMulti && ' You can decrypt the amount.'}
                  </div>
                )}

                {invoiceStatus === 'Cancelled' && (
                  <div className="px-4 py-4 bg-zinc-950/40 border border-zinc-800/60 rounded-xl
                    text-sm text-zinc-500 text-center">
                    This invoice was cancelled by the creator.
                  </div>
                )}

                {invoiceStatus === 'Expired' && (
                  <div className="px-4 py-4 bg-red-950/20 border border-red-900/30 rounded-xl
                    text-sm text-red-400 text-center">
                    This invoice has expired.
                  </div>
                )}

                {invoiceStatus === 'Paid' && !paid && (
                  <div className="px-4 py-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl
                    text-sm text-emerald-400 text-center">
                    ✓ This invoice has already been fully settled.
                  </div>
                )}

                {paid && (
                  <div className="bg-emerald-950/20 rounded-xl border border-emerald-900/30 p-6 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30
                      flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-emerald-300 mb-1">Payment complete</h3>
                    <p className="text-xs text-zinc-500 mb-4">
                      cUSDC transferred confidentially. Amount remains private.
                    </p>
                    {payTxHash && (
                      <a href={`https://sepolia.etherscan.io/tx/${payTxHash}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400
                          hover:text-emerald-300 transition-colors">
                        View transaction ↗
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-2 px-3 py-2.5 bg-violet-500/5 border border-violet-500/10 rounded-lg">
                  <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  <p className="text-[11px] text-violet-300/80 leading-relaxed">
                    {isMulti
                      ? 'Amounts are publicly decryptable — anyone can verify prices via Zama FHE.'
                      : 'Amount can only be decrypted by the creator and named recipient via Zama FHE.'}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-zinc-700 pt-6">
          Secured by Zama FHE · Sepolia testnet
        </p>
      </div>
    </div>
  );
}