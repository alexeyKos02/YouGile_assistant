const BASE_URL = 'https://ru.yougile.com/api-v2';

async function request(method, path, body = null) {
  const headers = {
    'Authorization': `Bearer ${process.env.YOUGILE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouGile API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getProjects() {
  return request('GET', '/projects');
}

export async function searchTasksByProject(projectId, query) {
  const q = (query ?? '').toLowerCase().trim();

  // Fetch tasks — limit 200, no extra filters (projectId not supported directly)
  const params = new URLSearchParams({ limit: '200' });
  const data = await request('GET', `/task-list?${params}`);
  const tasks = data.content ?? [];

  if (!q) return tasks.slice(0, 20);

  // Client-side relevance scoring
  const scored = tasks.map(t => {
    let score = 0;
    const title = (t.title ?? '').toLowerCase();
    const desc = (t.description ?? '').toLowerCase();

    // Точное вхождение в заголовок — высший приоритет
    if (title.includes(q)) score += 20;
    // Каждое слово запроса в заголовке
    q.split(/\s+/).forEach(word => {
      if (title.includes(word)) score += 5;
      if (desc.includes(word)) score += 2;
    });

    return { ...t, _score: score };
  }).filter(t => t._score > 0);

  return scored.sort((a, b) => b._score - a._score).slice(0, 20);
}

export async function getTaskById(taskId) {
  return request('GET', `/tasks/${taskId}`);
}

export async function getSubtaskDetails(subtaskIds = []) {
  if (!subtaskIds.length) return [];
  const results = await Promise.allSettled(
    subtaskIds.slice(0, 5).map(id => request('GET', `/tasks/${id}`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => ({ title: r.value.title, completed: r.value.completed }));
}

export async function getTaskMessages(taskId) {
  try {
    const data = await request('GET', `/chats/${taskId}/messages?limit=30`);
    return (data.content ?? [])
      .filter(m => m.text && !m.system)
      .map(m => ({ text: m.text ?? '' }));
  } catch {
    return [];
  }
}

export async function getBoardsForProject(projectId) {
  if (!projectId) throw new Error('projectId is required');
  return request('GET', `/boards?projectId=${projectId}`);
}

export async function getColumnsForBoard(boardId) {
  if (!boardId) throw new Error('boardId is required');
  return request('GET', `/columns?boardId=${boardId}`);
}

export async function getUsers() {
  return request('GET', '/users');
}

export async function getStringStickers(boardId) {
  if (!boardId) throw new Error('boardId is required');
  return request('GET', `/string-stickers?boardId=${boardId}`);
}

export async function createTask({ title, description, checklist, priority, deadline, columnId, assigneeId, stickers }) {
  const columnIdToUse = columnId ?? process.env.YOUGILE_COLUMN_ID;
  if (!columnIdToUse) throw new Error('columnId is required');

  const body = {
    title,
    columnId: columnIdToUse,
    description: buildDescription(description, checklist),
  };

  if (stickers && Object.keys(stickers).length > 0) {
    body.stickers = stickers;
  }

  if (deadline) {
    body.deadline = { deadline: new Date(deadline).getTime() };
  }

  if (assigneeId) {
    body.assigned = [assigneeId];
  }

  return request('POST', '/tasks', body);
}

function buildDescription(description, checklist) {
  if (!checklist || checklist.length === 0) return description;

  const checklistMarkdown = checklist
    .map(item => `- [ ] ${item}`)
    .join('\n');

  return `${description}\n\n**Чек-лист:**\n${checklistMarkdown}`;
}
