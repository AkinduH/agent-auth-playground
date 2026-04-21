import { Handle, Position } from 'reactflow';

export default function AIAgentNode({ data }: any) {
  const systemPrompt = data.systemPrompt || 'No prompt configured';
  const truncated =
    systemPrompt.length > 50
      ? systemPrompt.substring(0, 47) + '...'
      : systemPrompt;

  return (
    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white min-w-[180px] shadow-lg border-2 border-purple-700">
      <div className="text-sm font-bold mb-2">🤖 AI Agent</div>
      <div className="text-xs bg-black/20 p-2 rounded mb-2 max-h-16 overflow-y-auto">
        {truncated}
      </div>
      <div className="text-xs opacity-90">
        Temp: {data.temperature?.toFixed(1) || '0.7'}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
