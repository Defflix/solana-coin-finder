import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

export interface WalletLabel {
  address: string;
  label?: string;
  type?: string;
  category?: string;
}

export interface TransactionData {
  signature: string;
  blockTime: number;
  amount: number;
  from: string;
  to: string;
  type: 'in' | 'out';
}

export interface FilterConfig {
  excludeExchanges: boolean;
  excludeDustWallets: boolean;
  excludeBots: boolean;
  useHumanHeuristics: boolean;
  dustThreshold: number;
  botFrequencyThreshold: number;
}

export class SolanaService {
  private connection: Connection;
  private fallbackConnection: Connection;
  private backupConnection: Connection;

  constructor(rpcEndpoint: string, fallbackRpcEndpoint: string, backupRpcEndpoint: string = 'https://solana-rpc.publicnode.com') {
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    this.fallbackConnection = new Connection(fallbackRpcEndpoint, 'confirmed');
    this.backupConnection = new Connection(backupRpcEndpoint, 'confirmed');
  }

  async fetchTokenHolders(tokenAddress: string): Promise<string[]> {
    try {
      const mintKey = new PublicKey(tokenAddress);
      
      // Get token accounts for this mint
      const tokenAccounts = await this.connection.getProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token Program ID
        {
          filters: [
            {
              dataSize: 165, // Token account data size
            },
            {
              memcmp: {
                offset: 0,
                bytes: mintKey.toBase58(),
              },
            },
          ],
        }
      );

      // Extract owner addresses
      const walletAddresses = new Set<string>();
      tokenAccounts.forEach(account => {
        // The owner is at bytes 32-64 in the token account data
        const ownerBytes = account.account.data.slice(32, 64);
        const owner = new PublicKey(ownerBytes).toBase58();
        walletAddresses.add(owner);
      });

      return Array.from(walletAddresses);
    } catch (error) {
      console.error('Primary RPC failed, trying fallback...', error);
      try {
        const mintKey = new PublicKey(tokenAddress);
        const tokenAccounts = await this.fallbackConnection.getProgramAccounts(
          new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          {
            filters: [
              {
                dataSize: 165,
              },
              {
                memcmp: {
                  offset: 0,
                  bytes: mintKey.toBase58(),
                },
              },
            ],
          }
        );

        const walletAddresses = new Set<string>();
        tokenAccounts.forEach(account => {
          const ownerBytes = account.account.data.slice(32, 64);
          const owner = new PublicKey(ownerBytes).toBase58();
          walletAddresses.add(owner);
        });

        return Array.from(walletAddresses);
      } catch (fallbackError) {
        console.error('Fallback RPC failed, trying backup...', fallbackError);
        try {
          const mintKey = new PublicKey(tokenAddress);
          const tokenAccounts = await this.backupConnection.getProgramAccounts(
            new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
            {
              filters: [
                {
                  dataSize: 165,
                },
                {
                  memcmp: {
                    offset: 0,
                    bytes: mintKey.toBase58(),
                  },
                },
              ],
            }
          );

          const walletAddresses = new Set<string>();
          tokenAccounts.forEach(account => {
            const ownerBytes = account.account.data.slice(32, 64);
            const owner = new PublicKey(ownerBytes).toBase58();
            walletAddresses.add(owner);
          });

          return Array.from(walletAddresses);
        } catch (backupError) {
          throw new Error(`Failed to fetch holders for token: ${tokenAddress}`);
        }
      }
    }
  }

  async fetchWalletLabels(addresses: string[]): Promise<WalletLabel[]> {
    try {
      // SolanaFM API endpoint for wallet labels
      const response = await axios.post('https://api.solana.fm/v1/addresses/labels', {
        addresses: addresses.slice(0, 100) // Batch size limit
      });
      
      return response.data.map((item: any) => ({
        address: item.address,
        label: item.label,
        type: item.type,
        category: item.category
      }));
    } catch (error) {
      console.warn('Failed to fetch wallet labels from SolanaFM:', error);
      return addresses.map(address => ({ address }));
    }
  }

  async fetchWalletTransactions(walletAddress: string, limit: number = 100): Promise<TransactionData[]> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit });

      const transactions: TransactionData[] = [];

      for (const sigInfo of signatures.slice(0, 50)) { // increase sample size a bit
        try {
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx) continue;

          const addTransfer = (source: string, destination: string, lamports: number) => {
            const amount = lamports / 1e9;
            if (destination === walletAddress) {
              transactions.push({
                signature: sigInfo.signature,
                blockTime: sigInfo.blockTime || 0,
                amount,
                from: source,
                to: destination,
                type: 'in',
              });
            } else if (source === walletAddress) {
              transactions.push({
                signature: sigInfo.signature,
                blockTime: sigInfo.blockTime || 0,
                amount,
                from: source,
                to: destination,
                type: 'out',
              });
            }
          };

          // Top-level instructions
          for (const ix of tx.transaction.message.instructions as any[]) {
            if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
              const info = ix.parsed.info;
              addTransfer(info.source, info.destination, Number(info.lamports) || 0);
            }
          }

          // Inner instructions
          const inner = (tx.meta as any)?.innerInstructions || [];
          for (const innerGroup of inner) {
            for (const ix of innerGroup.instructions || []) {
              if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
                const info = ix.parsed.info;
                addTransfer(info.source, info.destination, Number(info.lamports) || 0);
              }
            }
          }
        } catch (txError) {
          // Retry on fallback connection if parsing failed
          try {
            const alt = await this.fallbackConnection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });
            if (!alt) continue;

            const addTransferAlt = (source: string, destination: string, lamports: number) => {
              const amount = lamports / 1e9;
              if (destination === walletAddress) {
                transactions.push({
                  signature: sigInfo.signature,
                  blockTime: sigInfo.blockTime || 0,
                  amount,
                  from: source,
                  to: destination,
                  type: 'in',
                });
              } else if (source === walletAddress) {
                transactions.push({
                  signature: sigInfo.signature,
                  blockTime: sigInfo.blockTime || 0,
                  amount,
                  from: source,
                  to: destination,
                  type: 'out',
                });
              }
            };

            for (const ix of alt.transaction.message.instructions as any[]) {
              if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
                const info = ix.parsed.info;
                addTransferAlt(info.source, info.destination, Number(info.lamports) || 0);
              }
            }
            const inner = (alt.meta as any)?.innerInstructions || [];
            for (const innerGroup of inner) {
              for (const ix of innerGroup.instructions || []) {
                if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
                  const info = ix.parsed.info;
                  addTransferAlt(info.source, info.destination, Number(info.lamports) || 0);
                }
              }
            }
          } catch (fallbackErr) {
            console.warn(`Failed to parse transaction ${sigInfo.signature}:`, fallbackErr);
          }
        }
      }

      return transactions;
    } catch (error) {
      console.error('Failed to fetch wallet transactions:', error);
      return [];
    }
  }

  async isHumanTrader(walletAddress: string, config: FilterConfig): Promise<boolean> {
    try {
      const labels = await this.fetchWalletLabels([walletAddress]);
      const walletLabel = labels[0];
      
      // Filter A: Exclude Known Protocol & Exchange Wallets
      if (config.excludeExchanges && this.isExchangeOrProtocolWallet(walletLabel)) {
        return false;
      }
      
      const transactions = await this.fetchWalletTransactions(walletAddress, 100);
      
      // Filter B: Exclude Dust & Zero-Value Wallets
      if (config.excludeDustWallets) {
        const totalValue = transactions.reduce((sum, tx) => sum + tx.amount, 0);
        if (totalValue < config.dustThreshold) {
          return false;
        }
      }
      
      // Filter C: Detect and Exclude Bot-Like Behavior
      if (config.excludeBots && this.isBotLikeBehavior(transactions, config)) {
        return false;
      }
      
      // Filter D: Isolate Human-Like Heuristics
      if (config.useHumanHeuristics && !this.hasHumanLikeTraits(transactions)) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking if wallet is human trader:', error);
      return true; // Default to including if we can't determine
    }
  }

  private isExchangeOrProtocolWallet(label: WalletLabel): boolean {
    if (!label.label && !label.type && !label.category) return false;
    
    const exchangeKeywords = ['exchange', 'binance', 'coinbase', 'kraken', 'okx', 'bybit', 'cex'];
    const protocolKeywords = ['jupiter', 'raydium', 'orca', 'serum', 'mango', 'protocol'];
    
    const text = `${label.label || ''} ${label.type || ''} ${label.category || ''}`.toLowerCase();
    
    return exchangeKeywords.some(keyword => text.includes(keyword)) ||
           protocolKeywords.some(keyword => text.includes(keyword));
  }

  private isBotLikeBehavior(transactions: TransactionData[], config: FilterConfig): boolean {
    if (transactions.length === 0) return false;
    
    // Check frequency (transactions per hour)
    if (transactions.length > 10) {
      const timeSpan = Math.max(1, (transactions[0].blockTime - transactions[transactions.length - 1].blockTime) / 3600);
      const frequency = transactions.length / timeSpan;
      
      if (frequency > config.botFrequencyThreshold) {
        return true;
      }
    }
    
    // Check for repetitive patterns
    const amounts = transactions.map(tx => tx.amount);
    const uniqueAmounts = new Set(amounts);
    
    // If more than 70% of transactions are the same amount, likely a bot
    if (uniqueAmounts.size < amounts.length * 0.3) {
      return true;
    }
    
    return false;
  }

  private hasHumanLikeTraits(transactions: TransactionData[]): boolean {
    if (transactions.length === 0) return false;
    
    // Check for irregular timing (not constant intervals)
    if (transactions.length > 5) {
      const intervals = [];
      for (let i = 1; i < Math.min(transactions.length, 10); i++) {
        intervals.push(transactions[i-1].blockTime - transactions[i].blockTime);
      }
      
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      
      // Human-like behavior has more variance in timing
      return variance > avgInterval * 0.5;
    }
    
    return true;
  }
}