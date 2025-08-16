import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { GitBranch, Loader2, ArrowRight, ArrowLeft, Download, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SolanaService, TransactionData } from '@/services/solanaService';
import FlowVisualization from './FlowVisualization';

interface WalletFlow {
  address: string;
  totalIn: number;
  totalOut: number;
  transactionCount: number;
  type: 'inflow' | 'outflow';
  hop: number;
}

interface PlatformSettingsProps {
  rpcEndpoint: string;
  fallbackRpcEndpoint: string;
  solanafmApiKey?: string;
}

const MultiHopTracer = ({ settings }: { settings: PlatformSettingsProps }) => {
  const [targetWallet, setTargetWallet] = useState('');
  const [maxHops, setMaxHops] = useState([2]);
  const [isTracing, setIsTracing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inflows, setInflows] = useState<WalletFlow[]>([]);
  const [outflows, setOutflows] = useState<WalletFlow[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const { toast } = useToast();

  const solanaService = new SolanaService(settings.rpcEndpoint, settings.fallbackRpcEndpoint);

  const validateWalletAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const traceWalletFlows = async () => {
    if (!targetWallet.trim()) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    if (!validateWalletAddress(targetWallet)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsTracing(true);
    setProgress(0);
    setInflows([]);
    setOutflows([]);
    setSelectedWallet(null);

    try {
      const allInflows: WalletFlow[] = [];
      const allOutflows: WalletFlow[] = [];
      const processedWallets = new Set<string>();
      
      await traceHops(targetWallet, maxHops[0], allInflows, allOutflows, processedWallets, 0);

      setInflows(allInflows.sort((a, b) => b.totalIn - a.totalIn));
      setOutflows(allOutflows.sort((a, b) => b.totalOut - a.totalOut));

      toast({
        title: "Tracing Complete",
        description: `Found ${allInflows.length} inflow sources and ${allOutflows.length} outflow destinations`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to trace wallet flows",
        variant: "destructive",
      });
    } finally {
      setIsTracing(false);
    }
  };

  const traceHops = async (
    walletAddress: string, 
    remainingHops: number, 
    inflows: WalletFlow[], 
    outflows: WalletFlow[], 
    processedWallets: Set<string>,
    currentHop: number
  ) => {
    if (remainingHops <= 0 || processedWallets.has(walletAddress)) {
      return;
    }

    processedWallets.add(walletAddress);
    
    try {
      const transactions = await solanaService.fetchWalletTransactions(walletAddress, 100);
      
      // Process inflows (money coming TO this wallet)
      const inflowMap = new Map<string, { total: number; count: number }>();
      transactions
        .filter(tx => tx.type === 'in' && tx.from && tx.from !== walletAddress)
        .forEach(tx => {
          const existing = inflowMap.get(tx.from) || { total: 0, count: 0 };
          inflowMap.set(tx.from, {
            total: existing.total + tx.amount,
            count: existing.count + 1,
          });
        });

      // Process outflows (money going FROM this wallet)
      const outflowMap = new Map<string, { total: number; count: number }>();
      transactions
        .filter(tx => tx.type === 'out' && tx.to && tx.to !== walletAddress)
        .forEach(tx => {
          const existing = outflowMap.get(tx.to) || { total: 0, count: 0 };
          outflowMap.set(tx.to, {
            total: existing.total + tx.amount,
            count: existing.count + 1,
          });
        });

      // Add to results
      inflowMap.forEach((data, address) => {
        if (data.total > 0.001) { // Filter out dust
          inflows.push({
            address,
            totalIn: data.total,
            totalOut: 0,
            transactionCount: data.count,
            type: 'inflow',
            hop: currentHop,
          });
        }
      });

      outflowMap.forEach((data, address) => {
        if (data.total > 0.001) { // Filter out dust
          outflows.push({
            address,
            totalIn: 0,
            totalOut: data.total,
            transactionCount: data.count,
            type: 'outflow',
            hop: currentHop,
          });
        }
      });

      // Update progress
      const totalProgress = ((maxHops[0] - remainingHops + 1) / maxHops[0]) * 100;
      setProgress(Math.min(totalProgress, 95));

      // Recursive tracing for next hop
      if (remainingHops > 1) {
        const nextHopWallets = [
          ...Array.from(inflowMap.keys()),
          ...Array.from(outflowMap.keys())
        ].slice(0, 5); // Limit to prevent explosion

        for (const nextWallet of nextHopWallets) {
          await traceHops(nextWallet, remainingHops - 1, inflows, outflows, processedWallets, currentHop + 1);
        }
      }
    } catch (error) {
      console.error(`Failed to trace wallet ${walletAddress}:`, error);
    }
  };

  const exportResults = () => {
    const inflowData = inflows.map(flow => 
      `INFLOW,${flow.address},${flow.totalIn.toFixed(6)},${flow.transactionCount},${flow.hop}`
    ).join('\n');
    
    const outflowData = outflows.map(flow => 
      `OUTFLOW,${flow.address},${flow.totalOut.toFixed(6)},${flow.transactionCount},${flow.hop}`
    ).join('\n');
    
    const content = `Type,Address,Amount (SOL),Transactions,Hop\n${inflowData}\n${outflowData}`;
    
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wallet_flow_analysis_${targetWallet.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Exported!",
      description: "Wallet flow analysis exported to CSV",
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <GitBranch className="h-5 w-5 text-crypto-primary" />
              <span>Flow Tracer Setup</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-wallet">Target Wallet Address</Label>
              <Input
                id="target-wallet"
                placeholder="Enter Solana wallet address to trace"
                value={targetWallet}
                onChange={(e) => setTargetWallet(e.target.value)}
                disabled={isTracing}
                className="bg-secondary/50 border-border/50 font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-hops">
                Maximum Hops: {maxHops[0]}
              </Label>
              <Slider
                id="max-hops"
                min={1}
                max={5}
                step={1}
                value={maxHops}
                onValueChange={setMaxHops}
                disabled={isTracing}
                className="py-2"
              />
              <p className="text-xs text-muted-foreground">
                Higher hops = deeper analysis but slower processing
              </p>
            </div>

            <Button 
              onClick={traceWalletFlows}
              disabled={isTracing || !targetWallet.trim()}
              className="w-full bg-gradient-primary hover:opacity-90 text-white shadow-glow"
            >
              {isTracing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Tracing Flows...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Start Flow Analysis
                </>
              )}
            </Button>

            {/* Progress */}
            {isTracing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Tracing multi-hop flows... {Math.round(progress)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Flow Summary</span>
              {(inflows.length > 0 || outflows.length > 0) && (
                <Button
                  onClick={exportResults}
                  variant="outline"
                  size="sm"
                  className="border-crypto-accent/30 hover:bg-crypto-accent/10"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 rounded-lg bg-crypto-primary/10 border border-crypto-primary/20">
                <ArrowLeft className="h-6 w-6 mx-auto mb-2 text-crypto-primary" />
                <div className="text-2xl font-bold text-crypto-primary">{inflows.length}</div>
                <div className="text-sm text-muted-foreground">Inflow Sources</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {inflows.reduce((sum, flow) => sum + flow.totalIn, 0).toFixed(2)} SOL total
                </div>
              </div>

              <div className="text-center p-4 rounded-lg bg-crypto-accent/10 border border-crypto-accent/20">
                <ArrowRight className="h-6 w-6 mx-auto mb-2 text-crypto-accent" />
                <div className="text-2xl font-bold text-crypto-accent">{outflows.length}</div>
                <div className="text-sm text-muted-foreground">Outflow Destinations</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {outflows.reduce((sum, flow) => sum + flow.totalOut, 0).toFixed(2)} SOL total
                </div>
              </div>
            </div>

            {targetWallet && (
              <div className="text-center p-3 rounded-lg bg-secondary/30 border border-border/30">
                <div className="text-sm text-muted-foreground">Analyzing</div>
                <div className="font-mono text-sm truncate">{targetWallet}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visualization */}
      {(inflows.length > 0 || outflows.length > 0) && (
        <Card className="shadow-card border-border/50">
          <CardHeader>
            <CardTitle>Flow Visualization</CardTitle>
          </CardHeader>
          <CardContent>
            <FlowVisualization 
              centerWallet={targetWallet}
              inflows={inflows}
              outflows={outflows}
              onWalletSelect={setSelectedWallet}
              selectedWallet={selectedWallet}
            />
          </CardContent>
        </Card>
      )}

      {/* Flow Lists */}
      {(inflows.length > 0 || outflows.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Inflows */}
          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ArrowLeft className="h-5 w-5 text-crypto-primary" />
                <span>Top Inflow Sources</span>
                <Badge variant="secondary" className="bg-crypto-primary/20 text-crypto-primary">
                  {inflows.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {inflows.slice(0, 20).map((flow, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedWallet === flow.address 
                        ? 'bg-crypto-primary/20 border-crypto-primary/50' 
                        : 'bg-secondary/30 border-border/30 hover:bg-secondary/50'
                    }`}
                    onClick={() => setSelectedWallet(flow.address)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate">{flow.address}</div>
                        <div className="text-xs text-muted-foreground">
                          Hop {flow.hop} • {flow.transactionCount} transactions
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-sm font-bold text-crypto-primary">
                          +{flow.totalIn.toFixed(4)} SOL
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Outflows */}
          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ArrowRight className="h-5 w-5 text-crypto-accent" />
                <span>Top Outflow Destinations</span>
                <Badge variant="secondary" className="bg-crypto-accent/20 text-crypto-accent">
                  {outflows.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {outflows.slice(0, 20).map((flow, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedWallet === flow.address 
                        ? 'bg-crypto-accent/20 border-crypto-accent/50' 
                        : 'bg-secondary/30 border-border/30 hover:bg-secondary/50'
                    }`}
                    onClick={() => setSelectedWallet(flow.address)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate">{flow.address}</div>
                        <div className="text-xs text-muted-foreground">
                          Hop {flow.hop} • {flow.transactionCount} transactions
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-sm font-bold text-crypto-accent">
                          -{flow.totalOut.toFixed(4)} SOL
                        </div>
                      </div>
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

export default MultiHopTracer;