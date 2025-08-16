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

  constructor(rpcEndpoint: string, fallbackRpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    this.fallbackConnection = new Connection(fallbackRpcEndpoint, 'confirmed');
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
        throw new Error(`Failed to fetch holders for token: ${tokenAddress}`);
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
      
      for (const sigInfo of signatures.slice(0, 20)) { // Limit for performance
        try {
          const tx = await this.connection.getParsedTransaction(sigInfo.signature);
          if (tx && tx.meta) {
            const preBalances = tx.meta.preBalances;
            const postBalances = tx.meta.postBalances;
            const accountKeys = tx.transaction.message.accountKeys;
            
            // Find SOL transfers
            for (let i = 0; i < accountKeys.length; i++) {
              const account = accountKeys[i];
              const balanceChange = postBalances[i] - preBalances[i];
              
              if (Math.abs(balanceChange) > 0) {
                transactions.push({
                  signature: sigInfo.signature,
                  blockTime: sigInfo.blockTime || 0,
                  amount: Math.abs(balanceChange) / 1e9, // Convert lamports to SOL
                  from: balanceChange < 0 ? account.pubkey.toBase58() : '',
                  to: balanceChange > 0 ? account.pubkey.toBase58() : '',
                  type: balanceChange > 0 ? 'in' : 'out'
                });
              }
            }
          }
        } catch (txError) {
          console.warn(`Failed to parse transaction ${sigInfo.signature}:`, txError);
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