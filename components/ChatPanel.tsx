'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (message: string) => void;
  onClear: () => void;
  disabled?: boolean;
  oboConsentPending?: boolean;
}

export default function ChatPanel({
  messages,
  isLoading,
  error,
  onSendMessage,
  onClear,
  disabled = false,
  oboConsentPending = false,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || (!oboConsentPending && disabled)) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900">Chat</h3>
        <p className="text-xs text-gray-500">Test your workflow</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-gray-500">
            <div>
              <p className="text-sm font-semibold mb-2">No messages yet</p>
              <p className="text-xs">Send a message to test your workflow</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : msg.type === 'obo-consent'
                    ? 'bg-amber-50 text-gray-900 border border-amber-200'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.type === 'obo-consent' && msg.metadata?.authUrl ? (
                  <>
                    <p className="text-sm font-semibold text-amber-800 mb-1">
                      Authorization Required
                    </p>
                    <p className="text-xs text-gray-700 mb-3 whitespace-pre-wrap">
                      {msg.content.replace(/^Authorization Required[^\n]*\n\n/, '')}
                    </p>
                    <button
                      onClick={() =>
                        window.open(
                          msg.metadata?.authUrl ?? '',
                          'obo-auth-popup',
                          'width=520,height=680,scrollbars=yes,resizable=yes,left=' +
                            Math.round(window.screenX + (window.outerWidth - 520) / 2) +
                            ',top=' +
                            Math.round(window.screenY + (window.outerHeight - 680) / 2)
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      Authorize
                    </button>
                  </>
                ) : (
                  <p className="text-sm break-words">{msg.content}</p>
                )}
                <p
                  className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <Spinner className="w-4 h-4" />
                <span className="text-sm">
                  {oboConsentPending ? 'Exchanging token...' : 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg max-w-xs">
              <p className="text-sm font-semibold">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* OBO consent banner */}
      {oboConsentPending && (
        <div className="mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-xs text-amber-800 font-medium">
            Waiting for authorization... You will be redirected back automatically, or paste the code below.
          </p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              oboConsentPending
                ? 'Or paste authorization code / redirect URL manually...'
                : 'Type a message...'
            }
            disabled={(!oboConsentPending && disabled) || isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || (!oboConsentPending && disabled) || isLoading}
            size="sm"
          >
            {isLoading ? <Spinner className="w-4 h-4" /> : oboConsentPending ? 'Submit' : 'Send'}
          </Button>
        </div>

        {messages.length > 0 && (
          <Button
            onClick={onClear}
            variant="ghost"
            size="sm"
            disabled={disabled && !oboConsentPending}
            className="w-full text-xs"
          >
            Clear Chat
          </Button>
        )}
      </div>
    </div>
  );
}
