/**
 * useZamaEncrypt.js — src/hooks/useZamaEncrypt.js
 *
 * Exposes:
 *   - encryptAmount(amountUsdc, contractAddress)  — encrypt for FHE.fromExternal
 *   - decryptHandle(handle, contractAddress)       — user-decrypt ACL-restricted handle
 *   - publicDecryptHandle(handle)                  — public-decrypt publicly-decryptable handle
 *   - sdkReady / sdkError                          — readiness flags
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient }       from 'wagmi';
import {
  getRelayerInstance,
  resetZamaInstances,
  encryptAmount       as _encryptAmount,
  decryptHandle       as _decryptHandle,
  publicDecryptHandle as _publicDecryptHandle,
} from '../lib/zamaEncrypt';

export function useZamaEncrypt() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient }            = useWalletClient();

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState('');

  // Pre-warm on mount
  useEffect(() => {
    setSdkError('');
    setSdkReady(false);
    getRelayerInstance()
      .then(() => { setSdkReady(true); setSdkError(''); })
      .catch(e  => { setSdkError(e.message ?? 'FHE SDK failed to initialize'); setSdkReady(false); });
  }, []);

  // Reset + re-init on chain switch
  useEffect(() => {
    if (!chainId) return;
    if (chainId !== 11155111) {
      resetZamaInstances();
      setSdkReady(false);
      setSdkError('Switch to Ethereum Sepolia (chainId 11155111) to use FHE.');
      return;
    }
    setSdkError('');
    getRelayerInstance()
      .then(() => { setSdkReady(true); setSdkError(''); })
      .catch(e  => { setSdkError(e.message ?? 'FHE SDK failed to initialize'); setSdkReady(false); });
  }, [chainId]);

  const encryptAmount = useCallback(
    async (amountUsdc, contractAddress) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!address)     throw new Error('No wallet address found');
      return _encryptAmount(amountUsdc, contractAddress, address);
    },
    [address, isConnected]
  );

  const decryptHandle = useCallback(
    async (handle, contractAddress) => {
      if (!isConnected)  throw new Error('Wallet not connected');
      if (!address)      throw new Error('No wallet address found');
      if (!walletClient) throw new Error('Wallet client not ready');
      return _decryptHandle(handle, contractAddress, walletClient, address);
    },
    [address, isConnected, walletClient]
  );

  // Public decryption — no wallet/signature required
  const publicDecryptHandle = useCallback(
    async (handle) => _publicDecryptHandle(handle),
    []
  );

  return {
    encryptAmount,
    decryptHandle,
    publicDecryptHandle,
    sdkReady,
    sdkError,
  };
}