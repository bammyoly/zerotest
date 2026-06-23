/**
 * zamaEncrypt.js — src/lib/zamaEncrypt.js
 */

console.log('[zamaEncrypt] module loaded — version 5');

import { initSDK, createInstance } from '@zama-fhe/relayer-sdk/web';
import { parseUnits }              from 'viem';

const SEPOLIA_CONFIG = {
  chainId:        11155111,
  gatewayChainId: 10901,
  network:    import.meta.env.VITE_SEPOLIA_RPC_URL
                || 'https://ethereum-sepolia-rpc.publicnode.com',
  relayerUrl: 'https://relayer.testnet.zama.org',
  aclContractAddress:                        '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
  kmsContractAddress:                        '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
  inputVerifierContractAddress:              '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0',
  verifyingContractAddressDecryption:        '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478',
  verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955',
};

const MAX_UINT64 = 18_446_744_073_709_551_615n;

let _instance    = null;
let _initPromise = null;
let _sdkReady    = false;

// ── Singleton ─────────────────────────────────────────────────────────────────

export async function getRelayerInstance() {
  if (_instance)    return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    if (!_sdkReady) {
      try {
        await initSDK();
        _sdkReady = true;
      } catch (e) {
        const msg = e.message?.toLowerCase() ?? '';
        if (
          msg.includes('already initialized') ||
          msg.includes('already been initialized')
        ) {
          console.warn('[ZamaFHE] initSDK already called — skipping:', e.message);
          _sdkReady = true;
        } else {
          throw e;
        }
      }
    }
    const inst   = await createInstance(SEPOLIA_CONFIG);
    _instance    = inst;
    _initPromise = null;
    return inst;
  })().catch(err => {
    _initPromise = null;
    throw err;
  });

  return _initPromise;
}

export function resetZamaInstances() {
  _instance    = null;
  _initPromise = null;
  _sdkReady    = false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const toHex = buf =>
  '0x' + Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

function normalizeHandle(h) {
  if (typeof h === 'bigint') {
    return '0x' + h.toString(16).padStart(64, '0');
  }
  if (typeof h === 'string') {
    const hex = h.startsWith('0x') ? h.slice(2) : h;
    return '0x' + hex.padStart(64, '0');
  }
  if (h instanceof Uint8Array || h instanceof ArrayBuffer) {
    return toHex(h);
  }
  throw new Error(`Unsupported handle type: ${typeof h} — value: ${h}`);
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

export async function encryptAmount(amountUsdc, contractAddress, userAddress) {
  if (!userAddress)     throw new Error('No wallet address — connect your wallet first');
  if (!contractAddress) throw new Error('No contract address provided for FHE binding');
  if (amountUsdc === undefined || amountUsdc === null || amountUsdc === '') {
    throw new Error('Amount is required');
  }

  console.log('[encryptAmount] input:', { amountUsdc, contractAddress, userAddress });

  const instance = await getRelayerInstance();
  const parsed   = parseUnits(amountUsdc.toString(), 6); // bigint

  console.log('[encryptAmount] parsed bigint:', parsed);

  if (parsed > MAX_UINT64)
    throw new Error(`Amount ${amountUsdc} USDC exceeds the euint64 maximum.`);
  if (parsed === 0n)
    throw new Error('Amount must be greater than 0');

  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(parsed);

  const enc = await input.encrypt();

  console.log('[encryptAmount] handles:', enc.handles);
  console.log('[encryptAmount] inputProof length:', enc.inputProof?.length);

  if (!enc.handles || enc.handles.length === 0)
    throw new Error('FHE encryption returned no handles');

  const rawHandle   = enc.handles[0];
  const handleBytes = rawHandle instanceof Uint8Array
    ? rawHandle
    : new Uint8Array(rawHandle);

  if (handleBytes.length !== 32)
    throw new Error(`FHE handle must be 32 bytes (got ${handleBytes.length})`);

  if (!enc.inputProof || enc.inputProof.length === 0)
    throw new Error('FHE encryption returned an empty proof');

  const result = {
    handle: toHex(handleBytes),
    proof:  toHex(enc.inputProof),
  };

  console.log('[encryptAmount] result:', result);
  return result;
}

// ── User decrypt ──────────────────────────────────────────────────────────────

export async function decryptHandle(handle, contractAddress, walletClient, userAddress) {
  if (!handle)          throw new Error('No ciphertext handle provided');
  if (!contractAddress) throw new Error('No contract address provided');
  if (!walletClient)    throw new Error('Wallet client required for decryption');
  if (!userAddress)     throw new Error('No wallet address');

  console.log('[decryptHandle] input:', {
    handle,
    handleType: typeof handle,
    contractAddress,
    userAddress,
  });

  const instance  = await getRelayerInstance();
  const handleHex = normalizeHandle(handle);

  console.log('[decryptHandle] normalised handleHex:', handleHex);

  const keypair = instance.generateKeypair();

  console.log('[keypair] publicKey type:', typeof keypair.publicKey);
  console.log('[keypair] privateKey type:', typeof keypair.privateKey);

  // ✅ Both MUST be plain JS numbers — SDK assertIsUintNumber rejects strings
  const startTimestamp = Number(Math.trunc(Date.now() / 1000));
  const durationDays   = 10;

  // Paranoia check — will throw before reaching SDK if something is wrong
  if (typeof startTimestamp !== 'number' || !Number.isInteger(startTimestamp)) {
    throw new Error(`startTimestamp is not an integer: ${startTimestamp} (${typeof startTimestamp})`);
  }
  if (typeof durationDays !== 'number' || !Number.isInteger(durationDays)) {
    throw new Error(`durationDays is not an integer: ${durationDays} (${typeof durationDays})`);
  }

  console.log('[decryptHandle] timing args:', {
    startTimestamp,
    startTimestampType: typeof startTimestamp,
    durationDays,
    durationDaysType: typeof durationDays,
  });

  const contractAddresses   = [contractAddress];
  const handleContractPairs = [{ handle: handleHex, contractAddress }];

  console.log('[decryptHandle] calling createEIP712 with:', {
    publicKeyType: typeof keypair.publicKey,
    contractAddresses,
    startTimestamp,
    durationDays,
  });

  const eip712 = instance.createEIP712(
    keypair.publicKey,  // string — SDK's generateKeypair() already returns string
    contractAddresses,  // string[]
    startTimestamp,     // number ✅
    durationDays,       // number ✅
  );

  console.log('[decryptHandle] eip712 domain:', eip712.domain);
  console.log('[decryptHandle] eip712 message:', eip712.message);

  const signature = await walletClient.signTypedData({
    account:     userAddress,
    domain:      eip712.domain,
    types:       {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
    },
    primaryType: 'UserDecryptRequestVerification',
    message:     eip712.message,
  });

  console.log('[decryptHandle] signature obtained:', signature.slice(0, 20) + '…');

  // SDK expects raw hex WITHOUT 0x prefix
  const rawSignature = signature.startsWith('0x')
    ? signature.slice(2)
    : signature;

  console.log('[decryptHandle] calling userDecrypt…');

  const result = await instance.userDecrypt(
    handleContractPairs,  // [{ handle: '0x...', contractAddress: '0x...' }]
    keypair.privateKey,   // string
    keypair.publicKey,    // string
    rawSignature,         // string, no 0x
    contractAddresses,    // string[]
    userAddress,          // string
    startTimestamp,       // number ✅
    durationDays,         // number ✅
  );

  console.log('[decryptHandle] raw result:', result);
  console.log('[decryptHandle] result keys:', Object.keys(result));

  // SDK may lowercase or uppercase the handle key — try all variants
  const value =
    result[handleHex] ??
    result[handleHex.toLowerCase()] ??
    result[handleHex.toUpperCase()];

  if (value === undefined) {
    console.error('[decryptHandle] no match — all keys:', Object.keys(result));
    throw new Error(
      'Relayer did not return a value for this handle. ' +
      'Ensure your wallet is the invoice creator or recipient with ACL access.'
    );
  }

  console.log('[decryptHandle] plaintext value:', value, typeof value);

  return BigInt(value);
}

// ── Public decrypt ────────────────────────────────────────────────────────────

export async function publicDecryptHandle(handle) {
  if (!handle) throw new Error('No ciphertext handle provided');

  console.log('[publicDecryptHandle] input:', handle, typeof handle);

  const instance  = await getRelayerInstance();
  const handleHex = normalizeHandle(handle);

  console.log('[publicDecryptHandle] normalised:', handleHex);

  const result = await instance.publicDecrypt([handleHex]);

  console.log('[publicDecryptHandle] raw result:', result);

  const value =
    result[handleHex] ??
    result[handleHex.toLowerCase()] ??
    result[handleHex.toUpperCase()];

  if (value === undefined) {
    console.error('[publicDecryptHandle] no match — all keys:', Object.keys(result));
    throw new Error(
      'Relayer did not return a value for this handle — ' +
      'was it marked publicly decryptable on-chain?'
    );
  }

  return BigInt(value);
}