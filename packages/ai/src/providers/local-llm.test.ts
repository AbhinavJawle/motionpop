import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRouter, type TaskDef } from '../router';
import {
  inferLocalLlmPreset,
  isLoopbackBaseUrl,
  listLocalLlmModels,
  localLlmProvider,
  normalizeLocalLlmBaseUrl,
  redactLocalApiKey,
  stripThinkingTags,
} from './local-llm';

const DEFAULT_CFG = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'qwen3:8b',
  modelStrong: 'qwen3:8b',
  modelFilmBuild: 'qwen3:8b',
  killSwitch: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('normalizeLocalLlmBaseUrl & helpers', () => {
  it('normalizes Ollama, LM Studio, bare loopback hosts, and pasted chat completion paths cleanly', () => {
    expect(normalizeLocalLlmBaseUrl('localhost:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalLlmBaseUrl('127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1');
    expect(normalizeLocalLlmBaseUrl('http://localhost:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalLlmBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalLlmBaseUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeLocalLlmBaseUrl('http://localhost:1234/v1/chat/completions')).toBe(
      'http://localhost:1234/v1',
    );
    expect(normalizeLocalLlmBaseUrl('http://127.0.0.1:8080/api/v1/models')).toBe(
      'http://127.0.0.1:8080/api/v1',
    );
  });

  it('rejects non-HTTP schemes, embedded credentials, and bearer keys over remote plaintext http', async () => {
    expect(() => normalizeLocalLlmBaseUrl('javascript:alert(1)')).toThrow(/http/i);
    expect(() => normalizeLocalLlmBaseUrl('file:///etc/passwd')).toThrow(/http/i);
    expect(() => normalizeLocalLlmBaseUrl('http://user:pass@localhost:11434/v1')).toThrow(
      /credentials/i,
    );
    expect(() =>
      localLlmProvider({
        baseUrl: 'http://remote-gpu.example.com/v1',
        model: 'qwen3:8b',
        apiKey: 'sk-secret-token',
      }),
    ).toThrow(/unencrypted http/i);

    const listRes = await listLocalLlmModels('http://remote-gpu.example.com/v1', {
      apiKey: 'sk-secret-token',
    });
    expect(listRes.ok).toBe(false);
    if (!listRes.ok) expect(listRes.message).toMatch(/unencrypted http/i);
  });

  it('detects loopback hosts and presets', () => {
    expect(isLoopbackBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLoopbackBaseUrl('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLoopbackBaseUrl('https://llm.example.com/v1')).toBe(false);
    expect(inferLocalLlmPreset('http://localhost:11434/v1')).toBe('ollama');
    expect(inferLocalLlmPreset('http://localhost:1234/v1')).toBe('lmstudio');
    expect(inferLocalLlmPreset('http://localhost:8080/v1')).toBe('custom');
  });

  it('strips reasoning <think> blocks and redacts bearer tokens', () => {
    expect(stripThinkingTags('<think>planning...</think>\n{"title":"Hi"}')).toBe('{"title":"Hi"}');
    expect(redactLocalApiKey('Auth failed for sk-secret-1234', 'sk-secret-1234')).toBe(
      'Auth failed for [redacted]',
    );
  });
});

describe('listLocalLlmModels', () => {
  it('lists models from /v1/models and filters embedding models', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'qwen3:8b' },
          { id: 'nomic-embed-text:latest' },
          { id: 'gemma3:12b' },
          { id: 'qwen3:8b' },
        ],
      }),
    );

    const res = await listLocalLlmModels('http://localhost:11434', { fetchImpl: fetchMock });
    expect(res).toEqual({
      ok: true,
      baseUrl: 'http://localhost:11434/v1',
      models: [
        { id: 'gemma3:12b', displayName: 'gemma3:12b' },
        { id: 'qwen3:8b', displayName: 'qwen3:8b' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('falls back to Ollama /api/tags when /v1/models returns 404', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'not found' } }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'qwen3:8b',
              details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
            },
          ],
        }),
      );

    const res = await listLocalLlmModels('http://localhost:11434/v1', { fetchImpl: fetchMock });
    expect(res).toEqual({
      ok: true,
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'qwen3:8b',
          displayName: 'qwen3:8b',
          parameterSize: '8.2B',
          quantization: 'Q4_K_M',
        },
      ],
    });
  });

  it('returns corsHint: true on network / CORS fetch failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const res = await listLocalLlmModels('http://localhost:11434/v1', { fetchImpl: fetchMock });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.corsHint).toBe(true);
      expect(res.message).toContain('Ollama');
    }
  });
});

describe('localLlmProvider', () => {
  const sampleTask: TaskDef<{ text: string }, { headline: string }> = {
    id: 'test.local',
    input: z.object({ text: z.string() }),
    output: z.object({ headline: z.string() }),
    mode: () => 'ONLY_IN_CLOUD',
    model: (c) => c.modelStrong,
    system: 'Return a headline.',
    prompt: (i) => i.text,
    cloudCost: () => 3,
    cloudFallback: false,
    maxOutputTokens: 256,
  };

  it('runs through createRouter with json_schema, strips <think>, and logs 0 credits + model ID', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: '<think>choosing headline</think>\n{"headline":"Local works"}',
            },
          },
        ],
      }),
    );

    const usageEvents: unknown[] = [];
    const router = createRouter({
      provider: localLlmProvider({
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:8b',
        fetchImpl: fetchMock,
      }),
      config: () => DEFAULT_CFG,
      onUsage: (e) => usageEvents.push(e),
    });

    const res = await router.run(sampleTask, { text: 'hello' });
    expect(res.output).toEqual({ headline: 'Local works' });
    expect(res.ranOn).toBe('device');
    expect(res.model).toBe('qwen3:8b');
    expect(res.costCredits).toBe(0);
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      task: 'test.local',
      ranOn: 'device',
      model: 'qwen3:8b',
      credits: 0,
      ok: true,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe('omit');
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sent.model).toBe('qwen3:8b');
    expect(sent.stream).toBe(false);
    expect(sent.max_tokens).toBe(4096);
    expect(sent.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'motionpop_response', strict: false },
    });
  });

  it('handles Ollama string-shaped error bodies and full 3-step fallback (images -> json_object -> none)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'model does not support images' }, 400))
      .mockResolvedValueOnce(new Response('unsupported response_format json_schema', { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid format json_object' }, 422))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"headline":"3-step fallback worked"}' } }],
        }),
      );

    const provider = localLlmProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
      fetchImpl: fetchMock,
    });

    const out = await provider.generate({
      mode: 'ONLY_IN_CLOUD',
      model: 'qwen3:8b',
      system: 'Return JSON',
      prompt: 'Analyze',
      jsonSchema: { type: 'object', properties: { headline: { type: 'string' } } },
      media: { mimeType: 'image/jpeg', base64: 'AAAA' },
    });

    expect(out.text).toBe('{"headline":"3-step fallback worked"}');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('automatically retries text-only when a non-vision local model rejects image frames', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'model does not support images' } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"headline":"Text fallback worked"}' } }],
        }),
      );

    const provider = localLlmProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
      fetchImpl: fetchMock,
    });

    const out = await provider.generate({
      mode: 'ONLY_IN_CLOUD',
      model: 'qwen3:8b',
      system: 'Analyze frame',
      prompt: 'Fix the frame',
      jsonSchema: { type: 'object', properties: { headline: { type: 'string' } } },
      media: { mimeType: 'image/jpeg', base64: 'AAAA' },
    });

    expect(out).toEqual({
      text: '{"headline":"Text fallback worked"}',
      ranOn: 'device',
      model: 'qwen3:8b',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      messages: Array<{ content: unknown }>;
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {
      messages: Array<{ content: unknown }>;
    };
    expect(Array.isArray(firstBody.messages[1]?.content)).toBe(true);
    expect(typeof secondBody.messages[1]?.content).toBe('string');
  });

  it('automatically falls back from json_schema to json_object when server rejects json_schema', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'unsupported response_format json_schema' } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"headline":"Fallback schema ok"}' } }],
        }),
      );

    const provider = localLlmProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'mistral-7b',
      fetchImpl: fetchMock,
    });

    const out = await provider.generate({
      mode: 'ONLY_IN_CLOUD',
      model: 'mistral-7b',
      system: 'Return json',
      prompt: 'Go',
      jsonSchema: { type: 'object', properties: { headline: { type: 'string' } } },
    });

    expect(out.text).toBe('{"headline":"Fallback schema ok"}');
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {
      response_format: { type: string };
    };
    expect(secondBody.response_format).toEqual({ type: 'json_object' });
  });

  it('redacts custom apiKey if the server returns an error echoing it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Invalid token sk-local-9999' } }, 401),
      );
    const provider = localLlmProvider({
      baseUrl: 'http://localhost:8080/v1',
      model: 'custom-model',
      apiKey: 'sk-local-9999',
      fetchImpl: fetchMock,
    });

    await expect(
      provider.generate({
        mode: 'ONLY_IN_CLOUD',
        model: 'custom-model',
        system: 'Sys',
        prompt: 'Hi',
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Invalid token [redacted]');
  });

  it('recovers when Ollama Qwen3 returns empty content with reasoning under json_schema and strips nested $schema', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '', reasoning: 'thinking too long...' } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"headline":"Recovered via json_object"}' } }],
        }),
      );

    const provider = localLlmProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
      fetchImpl: fetchMock,
    });

    const out = await provider.generate({
      mode: 'ONLY_IN_CLOUD',
      model: 'qwen3:8b',
      system: 'Return JSON',
      prompt: 'Direct this',
      jsonSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          params: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
          },
        },
      },
    });

    expect(out.text).toBe('{"headline":"Recovered via json_object"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<
      string,
      unknown
    >;
    expect(firstBody.reasoning_effort).toBe('none');
    expect(JSON.stringify(firstBody.response_format)).not.toContain('$schema');
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {
      response_format: { type: string };
    };
    expect(secondBody.response_format).toEqual({ type: 'json_object' });
  });

  it('retries without reasoning_effort if a server rejects it and caches learned capabilities across calls', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Unknown field: reasoning_effort' } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'model does not support images' } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"headline":"First ok"}' } }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"headline":"Second ok"}' } }] }),
      );

    const provider = localLlmProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
      fetchImpl: fetchMock,
    });

    const req = {
      mode: 'ONLY_IN_CLOUD' as const,
      model: 'qwen3:8b',
      system: 'Return JSON',
      prompt: 'Analyze',
      jsonSchema: { type: 'object' },
      media: { mimeType: 'image/jpeg' as const, base64: 'AAAA' },
    };
    await expect(provider.generate(req)).resolves.toMatchObject({ text: '{"headline":"First ok"}' });
    // Second call uses learned capabilities directly (no reasoning_effort, no images): 1 fetch!
    await expect(provider.generate(req)).resolves.toMatchObject({ text: '{"headline":"Second ok"}' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fourthBody = JSON.parse(String(fetchMock.mock.calls[3]![1]?.body)) as {
      reasoning_effort?: string;
      messages: Array<{ content: unknown }>;
    };
    expect(fourthBody.reasoning_effort).toBeUndefined();
    expect(typeof fourthBody.messages[1]?.content).toBe('string');
  });
});
