import { Position } from 'reactflow';
import ChatTriggerImage from '../assets/chat.png';
import ActiveBorder from './ActiveBorder';
import PlusHandle from './PlusHandle';

export default function ChatTriggerNode({ data }: any) {
  const isActive = !!data?.isActive;
  const connected: string[] = data?.connectedSourceHandles ?? [];
  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <ActiveBorder active={isActive} rx={8}>
        <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-white shadow-lg border-2 border-slate-200">
          <img
            src={ChatTriggerImage.src}
            alt="Chat Trigger"
            className="h-12 w-12 object-contain"
          />
        </div>
      </ActiveBorder>
      <div className="text-xs font-medium text-slate-700">Chat Trigger</div>
      <PlusHandle type="source" position={Position.Right} connected={connected.includes('__default__')} />
    </div>
  );
}
