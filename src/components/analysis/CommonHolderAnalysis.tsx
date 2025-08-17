import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Copy, Download, Loader2, Search, Filter, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SolanaService, FilterConfig } from '@/services/solanaService';

interface ProcessingStatus {
  tokenAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  walletsFound: number;
  filteredWallets: number;
  error?: string;
}

interface PlatformSettingsProps {
  rpcEndpoint: string;
  secondaryRpcEndpoint: string;
  backupRpcEndpoint: string;
  solanafmApiKey?: string;
}

const CommonHolderAnalysis = ({ settings }: { settings: PlatformSettingsProps }) => {
  const [tokenAddresses, setTokenAddresses] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus[]>([]);
  const [commonWallets, setCommonWallets] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    excludeExchanges: true,
    excludeDustWallets: true,
    excludeBots: true,
    useHumanHeuristics: false,
    dustThreshold: 0.1,
    botFrequencyThreshold: 50,
  });

  const solanaServicePrimary = new SolanaService(
    settings.rpcEndpoint,
    settings.secondaryRpcEndpoint,
    settings.backupRpcEndpoint,
    settings.solanafmApiKey
  );
  const solanaServiceSecondary = new SolanaService(
    settings.secondaryRpcEndpoint,
    settings.rpcEndpoint,
    settings.backupRpcEndpoint,
    settings.solanafmApiKey
  );

  const validateTokenAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const findCommonWallets = async () => {
    const addresses = tokenAddresses
      .split('\n')
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);

    if (addresses.length === 0) {
      toast({ title: "Error", description: "Please enter at least one token address", variant: "destructive" });
      return;
    }

    // Validate all addresses
    const invalidAddresses = addresses.filter(addr => !validateTokenAddress(addr));
    if (invalidAddresses.length > 0) {
      toast({ title: "Invalid Addresses", description: `The following addresses are invalid: ${invalidAddresses.join(', ')}`, variant: "destructive" });
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
      filteredWallets: 0,
    }));
    setProcessingStatus(initialStatus);

    try {
      // 1) Fetch holders for all tokens quickly in parallel (alternate RPCs)
      const holdersLists: string[][] = await Promise.all(
        addresses.map((addr, i) =>
          (i % 2 === 0 ? solanaServicePrimary : solanaServiceSecondary)
            .fetchTokenHolders(addr)
            .then((list) => {
              setProcessingStatus((prev) => prev.map((s) => s.tokenAddress === addr ? { ...s, status: 'completed', walletsFound: list.length } : s));
              return list;
            })
            .catch((e) => {
              setProcessingStatus((prev) => prev.map((s) => s.tokenAddress === addr ? { ...s, status: 'error', error: e instanceof Error ? e.message : 'Unknown error' } : s));
              return [] as string[];
            })
        )
      );

      // 2) Intersect holders to get only common wallets
      const nonEmpty = holdersLists.filter((l) => l.length > 0);
      if (nonEmpty.length === 0) {
        setIsProcessing(false);
        toast({ title: 'No Results', description: 'No holders found for the provided tokens' });
        return;
      }
      let common = new Set(nonEmpty[0]);
      for (let i = 1; i < nonEmpty.length; i++) {
        const s = new Set(nonEmpty[i]);
        common = new Set([...common].filter((x) => s.has(x)));
      }
      let commonArr = Array.from(common);
      setProgress(60);

      // 3) Apply filters ONLY to common wallets (if enabled)
      const filteringEnabled = filterConfig.excludeExchanges || filterConfig.excludeDustWallets || filterConfig.excludeBots || filterConfig.useHumanHeuristics;
      if (filteringEnabled) {
        const filtered: string[] = [];
        let done = 0;
        for (const [idx, w] of commonArr.entries()) {
          const svc = idx % 2 === 0 ? solanaServicePrimary : solanaServiceSecondary;
          // eslint-disable-next-line no-await-in-loop
          const ok = await svc.isHumanTrader(w, filterConfig);
          if (ok) filtered.push(w);
          done += 1;
          setProgress(60 + Math.round((done / commonArr.length) * 40));
        }
        commonArr = filtered;
      } else {
        setProgress(100);
      }

      setCommonWallets(commonArr);

      // Update per-token status to reflect final filtered count
      setProcessingStatus((prev) => prev.map((s) => ({ ...s, filteredWallets: commonArr.length, status: s.status === 'error' ? s.status : 'completed' })));

      toast({ title: 'Analysis Complete', description: `Found ${commonArr.length} common wallet addresses` });
    } catch (error) {
      toast({ title: 'Error', description: 'An unexpected error occurred during processing', variant: 'destructive' });
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
    link.download = 'filtered_common_wallets.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Exported!",
      description: "Filtered common wallet addresses exported to file",
    });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Input Section */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-crypto-primary" />
            <span>Token Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                Analyzing & Filtering...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Find Common Holders
              </>
            )}
          </Button>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Processing with AI filters... {Math.round(progress)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Configuration */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-crypto-accent" />
            <span>Advanced Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="exclude-exchanges"
                checked={filterConfig.excludeExchanges}
                onCheckedChange={(checked) => setFilterConfig(prev => ({ 
                  ...prev, 
                  excludeExchanges: checked as boolean 
                }))}
              />
              <Label htmlFor="exclude-exchanges" className="text-sm">
                Exclude Exchange & Protocol Wallets
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="exclude-dust"
                checked={filterConfig.excludeDustWallets}
                onCheckedChange={(checked) => setFilterConfig(prev => ({ 
                  ...prev, 
                  excludeDustWallets: checked as boolean 
                }))}
              />
              <Label htmlFor="exclude-dust" className="text-sm">
                Exclude Dust Wallets
              </Label>
            </div>

            {filterConfig.excludeDustWallets && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="dust-threshold" className="text-xs text-muted-foreground">
                  Minimum SOL threshold
                </Label>
                <Input
                  id="dust-threshold"
                  type="number"
                  step="0.01"
                  value={filterConfig.dustThreshold}
                  onChange={(e) => setFilterConfig(prev => ({ 
                    ...prev, 
                    dustThreshold: parseFloat(e.target.value) || 0.1 
                  }))}
                  className="h-8 bg-secondary/50"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="exclude-bots"
                checked={filterConfig.excludeBots}
                onCheckedChange={(checked) => setFilterConfig(prev => ({ 
                  ...prev, 
                  excludeBots: checked as boolean 
                }))}
              />
              <Label htmlFor="exclude-bots" className="text-sm">
                Exclude Bot-Like Behavior
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="human-heuristics"
                checked={filterConfig.useHumanHeuristics}
                onCheckedChange={(checked) => setFilterConfig(prev => ({ 
                  ...prev, 
                  useHumanHeuristics: checked as boolean 
                }))}
              />
              <Label htmlFor="human-heuristics" className="text-sm">
                Apply Human Trader Heuristics
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-crypto-accent" />
              <span>Filtered Results</span>
            </div>
            {commonWallets.length > 0 && (
              <Badge variant="secondary" className="bg-crypto-primary/20 text-crypto-primary">
                {commonWallets.length} quality holders
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
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Filtered common wallet addresses will appear here</p>
              <p className="text-xs mt-2">AI-powered filtering removes bots, exchanges, and dust wallets</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Status */}
      {processingStatus.length > 0 && (
        <div className="lg:col-span-3">
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
                        <div className="text-sm text-muted-foreground">
                          <span>{status.filteredWallets}/{status.walletsFound} quality</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CommonHolderAnalysis;