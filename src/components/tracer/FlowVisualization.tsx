import React, { useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface WalletFlow {
  address: string;
  totalIn: number;
  totalOut: number;
  transactionCount: number;
  type: 'inflow' | 'outflow';
  hop: number;
}

interface FlowVisualizationProps {
  centerWallet: string;
  inflows: WalletFlow[];
  outflows: WalletFlow[];
  onWalletSelect?: (wallet: string | null) => void;
  selectedWallet?: string | null;
}

const FlowVisualization = ({
  centerWallet,
  inflows,
  outflows,
  onWalletSelect,
  selectedWallet
}: FlowVisualizationProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!centerWallet) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Center node (target wallet)
    newNodes.push({
      id: centerWallet,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { 
        label: (
          <div className="text-center">
            <div className="font-mono text-xs truncate max-w-[120px]">
              {centerWallet.slice(0, 6)}...{centerWallet.slice(-4)}
            </div>
            <div className="text-xs text-muted-foreground">Target</div>
          </div>
        )
      },
      style: {
        backgroundColor: 'hsl(var(--crypto-primary))',
        color: 'white',
        border: '2px solid hsl(var(--crypto-primary))',
        borderRadius: '8px',
        width: 140,
        height: 60,
      },
    });

    // Inflow nodes (arranged in semicircle on left)
    const maxInflows = Math.min(inflows.length, 15);
    inflows.slice(0, maxInflows).forEach((flow, index) => {
      const angle = (Math.PI / maxInflows) * index - Math.PI / 2;
      const radius = 200 + (flow.hop * 100);
      const x = Math.cos(angle) * radius - 300;
      const y = Math.sin(angle) * radius;

      const nodeId = `inflow-${flow.address}`;
      newNodes.push({
        id: nodeId,
        type: 'default',
        position: { x, y },
        data: { 
          label: (
            <div className="text-center">
              <div className="font-mono text-xs truncate max-w-[100px]">
                {flow.address.slice(0, 4)}...{flow.address.slice(-3)}
              </div>
              <div className="text-xs text-crypto-primary font-medium">
                +{flow.totalIn.toFixed(3)}
              </div>
              <div className="text-xs text-muted-foreground">
                H{flow.hop} • {flow.transactionCount}tx
              </div>
            </div>
          )
        },
        style: {
          backgroundColor: selectedWallet === flow.address ? 'hsl(var(--crypto-primary) / 0.2)' : 'hsl(var(--card))',
          border: `2px solid ${selectedWallet === flow.address ? 'hsl(var(--crypto-primary))' : 'hsl(var(--crypto-primary) / 0.5)'}`,
          borderRadius: '6px',
          width: 120,
          height: 70,
          cursor: 'pointer',
        },
      });

      // Edge from inflow to center
      newEdges.push({
        id: `${nodeId}-${centerWallet}`,
        source: nodeId,
        target: centerWallet,
        type: 'smoothstep',
        style: { 
          stroke: 'hsl(var(--crypto-primary))', 
          strokeWidth: Math.min(Math.max(flow.totalIn * 2, 1), 8) 
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--crypto-primary))' },
        label: `${flow.totalIn.toFixed(2)} SOL`,
        labelStyle: { 
          fill: 'hsl(var(--crypto-primary))', 
          fontSize: '10px',
          fontWeight: 'bold'
        },
      });
    });

    // Outflow nodes (arranged in semicircle on right)
    const maxOutflows = Math.min(outflows.length, 15);
    outflows.slice(0, maxOutflows).forEach((flow, index) => {
      const angle = (Math.PI / maxOutflows) * index - Math.PI / 2;
      const radius = 200 + (flow.hop * 100);
      const x = Math.cos(angle) * radius + 300;
      const y = Math.sin(angle) * radius;

      const nodeId = `outflow-${flow.address}`;
      newNodes.push({
        id: nodeId,
        type: 'default',
        position: { x, y },
        data: { 
          label: (
            <div className="text-center">
              <div className="font-mono text-xs truncate max-w-[100px]">
                {flow.address.slice(0, 4)}...{flow.address.slice(-3)}
              </div>
              <div className="text-xs text-crypto-accent font-medium">
                -{flow.totalOut.toFixed(3)}
              </div>
              <div className="text-xs text-muted-foreground">
                H{flow.hop} • {flow.transactionCount}tx
              </div>
            </div>
          )
        },
        style: {
          backgroundColor: selectedWallet === flow.address ? 'hsl(var(--crypto-accent) / 0.2)' : 'hsl(var(--card))',
          border: `2px solid ${selectedWallet === flow.address ? 'hsl(var(--crypto-accent))' : 'hsl(var(--crypto-accent) / 0.5)'}`,
          borderRadius: '6px',
          width: 120,
          height: 70,
          cursor: 'pointer',
        },
      });

      // Edge from center to outflow
      newEdges.push({
        id: `${centerWallet}-${nodeId}`,
        source: centerWallet,
        target: nodeId,
        type: 'smoothstep',
        style: { 
          stroke: 'hsl(var(--crypto-accent))', 
          strokeWidth: Math.min(Math.max(flow.totalOut * 2, 1), 8) 
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--crypto-accent))' },
        label: `${flow.totalOut.toFixed(2)} SOL`,
        labelStyle: { 
          fill: 'hsl(var(--crypto-accent))', 
          fontSize: '10px',
          fontWeight: 'bold'
        },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [centerWallet, inflows, outflows, selectedWallet]);

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    if (node.id === centerWallet) return;
    
    const flowAddress = node.id.startsWith('inflow-') 
      ? node.id.replace('inflow-', '')
      : node.id.replace('outflow-', '');
    
    onWalletSelect?.(flowAddress === selectedWallet ? null : flowAddress);
  };

  if (!centerWallet || (inflows.length === 0 && outflows.length === 0)) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-secondary/20 rounded-lg border border-border/30">
        <div className="text-center text-muted-foreground">
          <div className="text-lg mb-2">No Flow Data</div>
          <div className="text-sm">Start a flow analysis to see the visualization</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[500px] w-full bg-background rounded-lg border border-border/30 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          color="hsl(var(--border))" 
          gap={20}
          size={1}
        />
        <Controls 
          style={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
          }}
        />
      </ReactFlow>
      
      <div className="absolute top-4 left-4 bg-card/90 backdrop-blur border border-border/50 rounded-lg p-3">
        <div className="text-sm font-medium mb-2">Flow Legend</div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-crypto-primary"></div>
            <span>Inflows (funding sources)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-crypto-accent"></div>
            <span>Outflows (destinations)</span>
          </div>
          <div className="text-muted-foreground mt-2">
            Line thickness = SOL amount<br/>
            Click nodes to explore
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowVisualization;