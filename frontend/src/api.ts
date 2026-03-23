import type { GeneratedTask, CreateResult, YouGileProject, YouGileBoard, YouGileColumn, YouGileUser, YouGileSticker } from './types';

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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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

export async function getProjects(): Promise<YouGileProject[]> {
  const data = await get<{ content?: YouGileProject[] } | YouGileProject[]>('/api/projects');
  return Array.isArray(data) ? data : (data.content ?? []);
}

export async function getBoards(projectId: string): Promise<YouGileBoard[]> {
  const data = await get<{ content?: YouGileBoard[] } | YouGileBoard[]>(`/api/boards/${projectId}`);
  return Array.isArray(data) ? data : (data.content ?? []);
}

export async function getColumns(boardId: string): Promise<YouGileColumn[]> {
  const data = await get<{ content?: YouGileColumn[] } | YouGileColumn[]>(`/api/columns/${boardId}`);
  return Array.isArray(data) ? data : (data.content ?? []);
}

export async function getStickers(boardId: string): Promise<YouGileSticker[]> {
  const data = await get<{ content?: YouGileSticker[] } | YouGileSticker[]>(`/api/stickers/${boardId}`);
  return Array.isArray(data) ? data : (data.content ?? []);
}

export async function getUsers(): Promise<YouGileUser[]> {
  const data = await get<{ content?: YouGileUser[] } | YouGileUser[]>('/api/users');
  return Array.isArray(data) ? data : (data.content ?? []);
}
