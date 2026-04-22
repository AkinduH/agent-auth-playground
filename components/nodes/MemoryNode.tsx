import { Handle, Position } from 'reactflow';
import { Database } from 'lucide-react';

export default function MemoryNode({ data }: any) {
  const maxMessages = Math.max(1, Number(data?.maxMessages) || 6);

  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-lg border-2 border-slate-200">
        <div className="flex h-full w-full items-center justify-center">
          <Database className="h-10 w-10 text-slate-1000" />
        </div>
        <Handle type="target" position={Position.Left} />
      </div>
      <div className="text-xs font-medium text-slate-700">
        Memory
      </div>
    </div>
  );
}
