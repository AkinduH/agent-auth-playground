import { Handle, Position } from 'reactflow';
import aiAgentImage from '../assets/ai-agent.png';

export default function AIAgentNode() {

  return (
    <div className="bg-white rounded-lg p-4 text-slate-900 min-w-[180px] shadow-lg border-2 border-slate-200 flex flex-col items-center">
      <div className="flex flex-col items-center gap-2 mb-2 text-center">
        <img
          src={aiAgentImage.src}
          alt="AI Agent"
          className="w-15 h-15 rounded-full object-cover border border-slate-200"
        />
        <div className="text-sm font-bold">AI Agent</div>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
