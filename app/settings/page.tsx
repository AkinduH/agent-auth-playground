'use client';

import { useState, useEffect } from 'react';
import { workflowStore } from '@/lib/workflowStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const keys = workflowStore.getApiKeys();
    setApiKeys(keys);
  }, []);

  const handleSaveKey = (provider: 'gemini' | 'openai', key: string) => {
    if (!key.trim()) {
      workflowStore.deleteApiKey(provider);
      setApiKeys((prev) => {
        const updated = { ...prev };
        delete updated[provider];
        return updated;
      });
    } else {
      workflowStore.setApiKey(provider, key);
      setApiKeys((prev) => ({ ...prev, [provider]: key }));
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-blue-500 hover:text-blue-700 text-sm">
            ← Back to Workflow
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">
            Settings
          </h1>
          <p className="text-gray-600">Configure your API keys for AI providers</p>
        </div>

        {saved && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">API keys saved successfully</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Google Gemini */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  🔮 Google Gemini
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Enter your Google API key for Gemini models
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Key
                </label>
                <Input
                  type="password"
                  placeholder="Enter your Google API key"
                  defaultValue={apiKeys.gemini || ''}
                  onBlur={(e) => handleSaveKey('gemini', e.target.value)}
                />
              </div>

              <p className="text-xs text-gray-500">
                Get your free API key from{' '}
                <a
                  href="https://makersuite.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  Google AI Studio
                </a>
              </p>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Available Models
                </h3>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li>• gemini-pro</li>
                  <li>• gemini-2.5-flash</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* OpenAI */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  🤖 OpenAI
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Enter your OpenAI API key for GPT models
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Key
                </label>
                <Input
                  type="password"
                  placeholder="Enter your OpenAI API key"
                  defaultValue={apiKeys.openai || ''}
                  onBlur={(e) => handleSaveKey('openai', e.target.value)}
                />
              </div>

              <p className="text-xs text-gray-500">
                Get your API key from{' '}
                <a
                  href="https://platform.openai.com/account/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  OpenAI Platform
                </a>
              </p>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Available Models
                </h3>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li>• gpt-4o</li>
                  <li>• gpt-4-turbo</li>
                  <li>• gpt-3.5-turbo</li>
                </ul>
              </div>
            </div>
          </Card>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Your API keys are stored securely in your
              browser&apos;s local storage and are never sent to our servers. They
              are only used to make requests directly to the AI provider APIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
