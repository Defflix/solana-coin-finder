import React, { useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Loader2, Wallet, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProcessingStatus {
  tokenAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  walletsFound: number;
  error?: string;
}

const WalletFinder = () => {
  const [tokenAddresses, setTokenAddresses] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus[]>([]);
  const [commonWallets, setCommonWallets] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  // Initialize Solana connection
  const [rpcUrl, setRpcUrl] = useState('https://rpc.ankr.com/solana');

  const validateTokenAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const fetchTokenHolders = async (tokenAddress: string): Promise<string[]> => {
    try {
      const mintKey = new PublicKey(tokenAddress);
      // Create connection per request using current RPC URL
      const connection = new Connection(rpcUrl, 'confirmed');

      // Get token accounts for this mint
      const tokenAccounts = await connection.getProgramAccounts(
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
      console.error('Error fetching token holders:', error);
      throw new Error(`Failed to fetch holders for token: ${tokenAddress}`);
    }
  };

  const findCommonWallets = async () => {
    const addresses = tokenAddresses
      .split('\n')
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);

    if (addresses.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one token address",
        variant: "destructive",
      });
      return;
    }

    // Validate all addresses
    const invalidAddresses = addresses.filter(addr => !validateTokenAddress(addr));
    if (invalidAddresses.length > 0) {
      toast({
        title: "Invalid Addresses",
        description: `The following addresses are invalid: ${invalidAddresses.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setCommonWallets([]);
    
    // Initialize processing status
    const initialStatus: ProcessingStatus[] = addresses.map(addr => ({
      tokenAddress: addr,
      status: 'pending',
      walletsFound: 0,
    }));
    setProcessingStatus(initialStatus);

    try {
      const allWalletSets: string[][] = [];
      
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        
        // Update status to processing
        setProcessingStatus(prev => 
          prev.map(status => 
            status.tokenAddress === address 
              ? { ...status, status: 'processing' }
              : status
          )
        );

        try {
          const wallets = await fetchTokenHolders(address);
          allWalletSets.push(wallets);
          
          // Update status to completed
          setProcessingStatus(prev => 
            prev.map(status => 
              status.tokenAddress === address 
                ? { ...status, status: 'completed', walletsFound: wallets.length }
                : status
            )
          );
        } catch (error) {
          // Update status to error
          setProcessingStatus(prev => 
            prev.map(status => 
              status.tokenAddress === address 
                ? { ...status, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
                : status
            )
          );
        }

        // Update progress
        setProgress(((i + 1) / addresses.length) * 100);
      }

      // Find common wallets across all sets
      if (allWalletSets.length > 0) {
        let common = new Set(allWalletSets[0]);
        
        for (let i = 1; i < allWalletSets.length; i++) {
          const currentSet = new Set(allWalletSets[i]);
          common = new Set([...common].filter(wallet => currentSet.has(wallet)));
        }

        const commonWalletArray = Array.from(common);
        setCommonWallets(commonWalletArray);

        toast({
          title: "Analysis Complete",
          description: `Found ${commonWalletArray.length} common wallet addresses`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred during processing",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(commonWallets.join('\n'));
    toast({
      title: "Copied!",
      description: "Common wallet addresses copied to clipboard",
    });
  };

  const exportToFile = () => {
    const content = commonWallets.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'common_wallets.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Exported!",
      description: "Common wallet addresses exported to file",
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="p-3 rounded-lg bg-gradient-primary shadow-glow">
              <Wallet className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Solana Wallet Finder
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Discover common wallet addresses across multiple Solana tokens. Enter token addresses below to find shared holders.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="h-5 w-5 text-crypto-primary" />
                <span>Token Addresses</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rpc-endpoint">RPC endpoint</Label>
                <Input
                  id="rpc-endpoint"
                  placeholder="https://rpc.ankr.com/solana"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  disabled={isProcessing}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              <Textarea
                placeholder="Enter Solana token addresses (one per line)&#10;Example:&#10;EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&#10;So11111111111111111111111111111111111111112"
                value={tokenAddresses}
                onChange={(e) => setTokenAddresses(e.target.value)}
                className="min-h-[200px] bg-secondary/50 border-border/50 resize-none"
                disabled={isProcessing}
              />
              
              <Button 
                onClick={findCommonWallets}
                disabled={isProcessing || !tokenAddresses.trim()}
                className="w-full bg-gradient-primary hover:opacity-90 text-white shadow-glow"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing Tokens...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Find Common Wallets
                  </>
                )}
              </Button>

              {/* Progress */}
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Processing tokens... {Math.round(progress)}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results Section */}
          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wallet className="h-5 w-5 text-crypto-accent" />
                  <span>Common Wallets</span>
                </div>
                {commonWallets.length > 0 && (
                  <Badge variant="secondary" className="bg-crypto-primary/20 text-crypto-primary">
                    {commonWallets.length} found
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {commonWallets.length > 0 ? (
                <>
                  <div className="bg-secondary/30 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                    <div className="space-y-2">
                      {commonWallets.map((wallet, index) => (
                        <div
                          key={index}
                          className="text-sm font-mono bg-background/50 rounded p-2 border border-border/30"
                        >
                          {wallet}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button
                      onClick={copyToClipboard}
                      variant="outline"
                      className="flex-1 border-crypto-primary/30 hover:bg-crypto-primary/10"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy All
                    </Button>
                    <Button
                      onClick={exportToFile}
                      variant="outline"
                      className="flex-1 border-crypto-accent/30 hover:bg-crypto-accent/10"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Common wallet addresses will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Processing Status */}
        {processingStatus.length > 0 && (
          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle>Processing Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {processingStatus.map((status, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm truncate">{status.tokenAddress}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge
                        variant={
                          status.status === 'completed' ? 'default' :
                          status.status === 'error' ? 'destructive' :
                          status.status === 'processing' ? 'secondary' : 'outline'
                        }
                        className={
                          status.status === 'completed' ? 'bg-crypto-success text-white' :
                          status.status === 'processing' ? 'bg-crypto-primary text-white' : ''
                        }
                      >
                        {status.status === 'processing' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {status.status}
                      </Badge>
                      {status.status === 'completed' && (
                        <span className="text-sm text-muted-foreground">
                          {status.walletsFound} wallets
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WalletFinder;