import type { GeneratedTask, CreateResult } from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function generateTask(text: string): Promise<GeneratedTask> {
  return post<GeneratedTask>('/api/generate', { text });
}

export function createTask(task: GeneratedTask): Promise<CreateResult> {
  return post<CreateResult>('/api/create', task);
}
