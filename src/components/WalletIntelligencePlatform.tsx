import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Search, GitBranch, Settings } from 'lucide-react';
import CommonHolderAnalysis from './analysis/CommonHolderAnalysis';
import MultiHopTracer from './tracer/MultiHopTracer';
import PlatformSettings from './settings/PlatformSettings';

interface PlatformSettings {
  rpcEndpoint: string;
  secondaryRpcEndpoint: string;
  backupRpcEndpoint: string;
  solanafmApiKey?: string;
}

const WalletIntelligencePlatform = () => {
  const [settings, setSettings] = useState<PlatformSettings>({
    rpcEndpoint: 'https://solana.rpc.grove.city/v1/01fdb492',
    secondaryRpcEndpoint: 'https://go.getblock.us/86aac42ad4484f3c813079afc201451c',
    backupRpcEndpoint: 'https://solana-rpc.publicnode.com',
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="p-3 rounded-lg bg-gradient-primary shadow-glow">
              <Wallet className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Solana Wallet Intelligence Platform
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            Advanced on-chain analysis tools for Solana wallets. Identify common holders with AI-powered filtering and trace multi-hop fund flows.
          </p>
        </div>

        {/* Main Platform */}
        <Tabs defaultValue="common-holder" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-card border-border/50">
            <TabsTrigger 
              value="common-holder" 
              className="flex items-center space-x-2 data-[state=active]:bg-crypto-primary data-[state=active]:text-white"
            >
              <Search className="h-4 w-4" />
              <span>Common Holder Analysis</span>
            </TabsTrigger>
            <TabsTrigger 
              value="multi-hop" 
              className="flex items-center space-x-2 data-[state=active]:bg-crypto-primary data-[state=active]:text-white"
            >
              <GitBranch className="h-4 w-4" />
              <span>Multi-Hop Tracer</span>
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="flex items-center space-x-2 data-[state=active]:bg-crypto-primary data-[state=active]:text-white"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="common-holder">
            <CommonHolderAnalysis settings={settings} />
          </TabsContent>

          <TabsContent value="multi-hop">
            <MultiHopTracer settings={settings} />
          </TabsContent>

          <TabsContent value="settings">
            <PlatformSettings settings={settings} onSettingsChange={setSettings} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WalletIntelligencePlatform;