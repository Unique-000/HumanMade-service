import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=' + process.env.API_HELIUS,
  'confirmed'
);

function getServerWallet() {
  if (!process.env.SOLANA_PRIVATE_KEY) {
    return null;
  }

  try {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
    );
  } catch (error) {
    console.error("Invalid SOLANA_PRIVATE_KEY:", error);
    return null;
  }
}

export async function recordHashOnChain({ sha256, phash, code }) {
  const serverWallet = getServerWallet();

  if (!serverWallet) {
    return null;
  }

  const memoData = `sha256:${sha256}|phash:${phash}|code:${code}`;

  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: serverWallet.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoData, 'utf8'),
  });

  const tx = new Transaction().add(memoInstruction);
  const signature = await sendAndConfirmTransaction(connection, tx, [serverWallet]);
  return signature;
}
