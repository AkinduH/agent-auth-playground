import { Handle, Position } from 'reactflow';
import { Cable } from 'lucide-react';

export default function MCPClientNode() {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border-2 border-slate-200 bg-white shadow-lg">
        <Cable className="h-10 w-10 text-slate-700" />
      </div>
      <div className="text-xs font-medium text-slate-700">MCP Client</div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
