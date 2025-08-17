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

// Blocklist of well-known protocol program IDs and service addresses (expandable)
const BLOCKLIST_ADDRESSES = new Set<string>([
  // Jupiter Aggregator v6
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  // Raydium AMM (legacy v4) and CP-Swap
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  // Orca Whirlpools
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
]);

const EXCHANGE_KEYWORDS = [
  'exchange','binance','coinbase','kraken','okx','bybit','cex','gate','kucoin','mexc','bitfinex','bitstamp','huobi'
];

const PROTOCOL_KEYWORDS = [
  'jupiter','raydium','orca','serum','openbook','mango','saber','marinade','solblaze','wormhole','pyth','protocol'
];

export class SolanaService {
  private connection: Connection;
  private fallbackConnection: Connection;
  private backupConnection: Connection;
  private solanafmApiKey?: string;

  constructor(
    rpcEndpoint: string,
    fallbackRpcEndpoint: string,
    backupRpcEndpoint: string = 'https://solana-rpc.publicnode.com',
    solanafmApiKey?: string
  ) {
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    this.fallbackConnection = new Connection(fallbackRpcEndpoint, 'confirmed');
    this.backupConnection = new Connection(backupRpcEndpoint, 'confirmed');
    this.solanafmApiKey = solanafmApiKey;
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.solanafmApiKey) headers['x-api-key'] = this.solanafmApiKey;
      // SolanaFM API endpoint for wallet labels (batch up to 100)
      const response = await axios.post(
        'https://api.solana.fm/v1/addresses/labels',
        { addresses: addresses.slice(0, 100) },
        { headers }
      );

      const data = Array.isArray(response.data) ? response.data : (response.data?.data ?? []);
      return data.map((item: any) => ({
        address: item.address || item.accountHash || '',
        label: item.label || item.friendlyName,
        type: item.type,
        category: item.category
      }));
    } catch (error) {
      console.warn('Failed to fetch wallet labels from SolanaFM:', error);
      return addresses.map(address => ({ address }));
    }
  }

  async fetchWalletTransactions(walletAddress: string, limit: number = 100): Promise<TransactionData[]> {
    const connections = [this.connection, this.fallbackConnection, this.backupConnection];
    try {
      const pubkey = new PublicKey(walletAddress);

      // Try to fetch signatures across connections
      let signatures: any[] | null = null;
      let sigConnIndex = 0;
      for (let i = 0; i < connections.length; i++) {
        try {
          signatures = await connections[i].getSignaturesForAddress(pubkey, { limit });
          sigConnIndex = i;
          break;
        } catch (e) {
          continue;
        }
      }
      if (!signatures || signatures.length === 0) return [];

      const transactions: TransactionData[] = [];

      // Process a limited number of signatures to avoid rate limits
      for (const sigInfo of signatures.slice(0, Math.min(100, limit))) {
        let parsed: any | null = null;
        const currentSig = sigInfo.signature;
        const currentBlockTime = sigInfo.blockTime || 0;

        // Try parsing on the same conn, then others
        for (let i = 0; i < connections.length; i++) {
          const idx = (sigConnIndex + i) % connections.length;
          try {
            parsed = await connections[idx].getParsedTransaction(currentSig, {
              maxSupportedTransactionVersion: 0,
            });
            if (parsed) break;
          } catch (e) {
            continue;
          }
        }
        if (!parsed) continue;

        const addTransfer = (source: string, destination: string, lamports: number) => {
          const amount = lamports / 1e9;
          if (destination === walletAddress) {
            transactions.push({
              signature: currentSig,
              blockTime: currentBlockTime,
              amount,
              from: source,
              to: destination,
              type: 'in',
            });
          } else if (source === walletAddress) {
            transactions.push({
              signature: currentSig,
              blockTime: currentBlockTime,
              amount,
              from: source,
              to: destination,
              type: 'out',
            });
          }
        };

        // Top-level system transfers
        for (const ix of (parsed.transaction.message.instructions as any[]) || []) {
          if (ix.program === 'system' && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferWithSeed')) {
            const info = ix.parsed.info;
            addTransfer(info.source, info.destination, Number(info.lamports) || 0);
          }
        }
        // Inner instructions
        const inner = (parsed.meta as any)?.innerInstructions || [];
        for (const innerGroup of inner) {
          for (const ix of innerGroup.instructions || []) {
            if (ix.program === 'system' && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferWithSeed')) {
              const info = ix.parsed.info;
              addTransfer(info.source, info.destination, Number(info.lamports) || 0);
            }
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
      if (config.excludeExchanges && this.isExchangeOrProtocolWallet(walletAddress, walletLabel)) {
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

  private isExchangeOrProtocolWallet(walletAddress: string, label: WalletLabel): boolean {
    if (BLOCKLIST_ADDRESSES.has(walletAddress)) return true;
    if (!label || (!label.label && !label.type && !label.category)) return false;

    const text = `${label.label || ''} ${label.type || ''} ${label.category || ''}`.toLowerCase();

    return EXCHANGE_KEYWORDS.some(keyword => text.includes(keyword)) ||
           PROTOCOL_KEYWORDS.some(keyword => text.includes(keyword));
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