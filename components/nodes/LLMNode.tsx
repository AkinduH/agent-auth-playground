import { Handle, Position } from 'reactflow';
import GoogleImage from '../assets/google-logo.png';
import OpenaiImage from '../assets/openai-logo.png';

export default function LLMNode({ data }: any) {
  const isGemini = data.provider === 'gemini';
  const logoSrc = isGemini ? GoogleImage.src : OpenaiImage.src;
  const providerLabel = isGemini ? 'Google Gemini' : 'OpenAI';

  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-lg border-2 border-slate-200">
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={logoSrc}
            alt={providerLabel}
            className="h-12 w-12 object-contain"
          />
        </div>
      </div>
      <div className="text-xs font-medium text-slate-700">
        {providerLabel}
      </div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
