import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=' + process.env.API_HELIUS,
  'confirmed'
);

const serverWallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
);

export async function recordHashOnChain({ sha256, phash, code }) {
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