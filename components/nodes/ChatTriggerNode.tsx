import { Handle, Position } from 'reactflow';

export default function ChatTriggerNode({ data }: any) {
  return (
    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white min-w-[160px] shadow-lg border-2 border-blue-700">
      <div className="text-sm font-bold mb-2">💬 Chat Trigger</div>
      <div className="text-xs opacity-90">Receives chat input</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
