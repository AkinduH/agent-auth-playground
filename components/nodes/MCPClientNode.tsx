import { Handle, Position } from 'reactflow';
import mcplogo from '../assets/mcp.png';

export default function MCPClientNode() {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-lg border-2 border-slate-200">
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={mcplogo.src}
            alt={"MCP Client"}
            className="h-12 w-12 object-contain"
          />
        </div>
      </div>
      <div className="text-xs font-medium text-slate-700">
        {"MCP Client"}
      </div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
