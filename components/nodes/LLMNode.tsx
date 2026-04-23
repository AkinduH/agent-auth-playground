import { Handle, Position } from 'reactflow';
import GoogleImage from '../assets/google-logo.png';
import OpenaiImage from '../assets/openai-logo.png';
import AnthropicImage from '../assets/anthropic-logo.png';

const PROVIDER_META: Record<string, { label: string; logoSrc?: string }> = {
  gemini: { label: 'Google Gemini', logoSrc: GoogleImage.src },
  openai: { label: 'OpenAI', logoSrc: OpenaiImage.src },
  anthropic: { label: 'Anthropic', logoSrc: AnthropicImage.src },
};

export default function LLMNode({ data }: any) {
  const { label, logoSrc } = PROVIDER_META[data.provider] ?? { label: data.provider ?? 'AI Service' };

  return (
    <div className="flex flex-col items-center gap-2 text-slate-900">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-lg border-2 border-slate-200">
        <div className="flex h-full w-full items-center justify-center">
          {logoSrc ? (
            <img src={logoSrc} alt={label} className="h-12 w-12 object-contain" />
          ) : (
            <span className="text-xs font-semibold text-slate-600 text-center px-1">{label}</span>
          )}
        </div>
      </div>
      <div className="text-xs font-medium text-slate-700">{label}</div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
