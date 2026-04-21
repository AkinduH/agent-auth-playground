import { Handle, Position } from 'reactflow';

export default function LLMNode({ data }: any) {
  const providerIcon = data.provider === 'gemini' ? '🔮' : '🤖';
  const modelName = data.model || 'Not selected';
  const truncated =
    modelName.length > 20
      ? modelName.substring(0, 17) + '...'
      : modelName;

  return (
    <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white min-w-[160px] shadow-lg border-2 border-green-700">
      <div className="text-sm font-bold mb-2">{providerIcon} LLM</div>
      <div className="text-xs bg-black/20 p-2 rounded mb-2">{truncated}</div>
      <div className="text-xs opacity-90">
        {data.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}
      </div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
