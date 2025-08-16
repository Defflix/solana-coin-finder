import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Settings, Server, Key, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PlatformSettingsProps {
  rpcEndpoint: string;
  fallbackRpcEndpoint: string;
  solanafmApiKey?: string;
}

interface SettingsComponentProps {
  settings: PlatformSettingsProps;
  onSettingsChange: (settings: PlatformSettingsProps) => void;
}

const PlatformSettings = ({ settings, onSettingsChange }: SettingsComponentProps) => {
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Configuration has been updated successfully",
    });
  };

  const resetToDefaults = () => {
    onSettingsChange({
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      fallbackRpcEndpoint: 'https://solana-rpc.publicnode.com',
      solanafmApiKey: '',
    });
    
    toast({
      title: "Reset Complete",
      description: "Settings have been reset to defaults",
    });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5 text-crypto-primary" />
            <span>RPC Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="primary-rpc">Primary RPC Endpoint</Label>
            <Input
              id="primary-rpc"
              value={settings.rpcEndpoint}
              onChange={(e) => onSettingsChange({ ...settings, rpcEndpoint: e.target.value })}
              placeholder="https://api.mainnet-beta.solana.com"
              className="bg-secondary/50 border-border/50"
            />
            <p className="text-xs text-muted-foreground">
              Primary Solana RPC endpoint for blockchain queries
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fallback-rpc">Fallback RPC Endpoint</Label>
            <Input
              id="fallback-rpc"
              value={settings.fallbackRpcEndpoint}
              onChange={(e) => onSettingsChange({ ...settings, fallbackRpcEndpoint: e.target.value })}
              placeholder="https://solana-rpc.publicnode.com"
              className="bg-secondary/50 border-border/50"
            />
            <p className="text-xs text-muted-foreground">
              Backup endpoint used when primary RPC fails or rate limits
            </p>
          </div>

          <div className="bg-crypto-warning/10 border border-crypto-warning/20 rounded-lg p-3">
            <div className="text-sm text-crypto-warning font-medium">RPC Endpoint Tips:</div>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li>• Use different providers for primary/fallback to avoid correlated failures</li>
              <li>• Consider paid RPC services for higher rate limits</li>
              <li>• Public endpoints may have strict rate limiting</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-crypto-accent" />
            <span>API Integration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="solanafm-api">SolanaFM API Key</Label>
            <Input
              id="solanafm-api"
              type="password"
              value={settings.solanafmApiKey || ''}
              onChange={(e) => onSettingsChange({ ...settings, solanafmApiKey: e.target.value })}
              placeholder="Optional: Enter SolanaFM API key"
              className="bg-secondary/50 border-border/50"
            />
            <p className="text-xs text-muted-foreground">
              Optional API key for enhanced wallet labeling and classification
            </p>
          </div>

          <div className="bg-crypto-primary/10 border border-crypto-primary/20 rounded-lg p-3">
            <div className="text-sm text-crypto-primary font-medium">SolanaFM Integration:</div>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li>• Provides wallet labels (exchanges, protocols, etc.)</li>
              <li>• Improves filtering accuracy</li>
              <li>• Works without API key but with limitations</li>
            </ul>
          </div>

          <div className="flex space-x-2 pt-4">
            <Button 
              onClick={handleSave}
              className="flex-1 bg-gradient-primary hover:opacity-90 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
            <Button 
              onClick={resetToDefaults}
              variant="outline"
              className="flex-1 border-border/50 hover:bg-secondary/50"
            >
              Reset Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Performance & Usage */}
      <Card className="shadow-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-crypto-secondary" />
            <span>Performance Guidelines</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-crypto-primary">Common Holder Analysis</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Processing time increases exponentially with token count</li>
                <li>• Advanced filtering adds 2-5 seconds per wallet</li>
                <li>• Expect 30-60 seconds for 2-3 tokens with full filtering</li>
                <li>• Large token holder lists (&gt;1000) may timeout</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-crypto-accent">Multi-Hop Tracer</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Each hop multiplies analysis complexity</li>
                <li>• 3+ hops can take several minutes</li>
                <li>• High-activity wallets generate more data</li>
                <li>• Visualization may lag with 500+ nodes</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-gradient-secondary border border-border/30">
            <div className="text-sm font-medium mb-2">Rate Limiting Protection</div>
            <p className="text-xs text-muted-foreground">
              The platform automatically implements delays between API calls to respect RPC rate limits. 
              This ensures reliable operation but may increase processing time for large analyses.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlatformSettings;