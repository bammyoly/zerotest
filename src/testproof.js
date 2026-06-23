// frontend/src/testproof.js
import { createInstance } from "@zama-fhe/relayer-sdk/node";
import { ethers } from "ethers";

// Using your exact working configuration block to ensure 100% environment alignment
const ZAMA_SEPOLIA_CONFIG = {
  aclContractAddress:                         "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  kmsContractAddress:                         "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  inputVerifierContractAddress:               "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
  verifyingContractAddressDecryption:         "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
  verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
  chainId:        11155111,                  // Sepolia
  gatewayChainId: 10901,                     // Zama gateway chain
  network:        "https://eth-sepolia.g.alchemy.com/v2/RL0K93iLy4_YN01pONT5H",
  relayerUrl:     "https://relayer.testnet.zama.org",
};

async function testSubmitProof() {
  console.log("Initializing legacy FHEVM instance via relayer-sdk/node...");

  // 1. Initialize instance (Node loads internal WASM automatically)
  const instance = await createInstance(ZAMA_SEPOLIA_CONFIG);
  console.log("✅ Client instance successfully generated.");

  // 2. Set up dummy constants to emulate a user payload creation
  const contractAddress = "0x0000000000000000000000000000000000000000";
  const userAddress     = "0x0000000000000000000000000000000000000000"; 

  console.log("Generating local cryptographic input parameters...");
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  
  // Using add64 to mimic your payroll balance/salary encryption logic precisely
  input.add64(BigInt(42_000_000)); // e.g. 42 cUSDC with 6 decimals

  // 3. Compute local proofs and encryption keys
  const enc = await input.encrypt();

  console.log("✅ Success! Local cryptography engine is operational.");
  console.log("Ciphertext Handle length:", enc.handles.length);
  console.log("Input Proof data length:", enc.inputProof.length, "bytes");
}

testSubmitProof().catch((err) => {
  console.error("❌ Test script run failed:", err);
});