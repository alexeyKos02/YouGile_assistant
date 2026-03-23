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

export async function getAllTasks() {
  // Fetch up to 500 tasks with pagination
  const firstPage = await request('GET', '/task-list?limit=200&offset=0');
  const tasks = firstPage.content ?? [];

  if (firstPage.paging?.next) {
    try {
      const page2 = await request('GET', '/task-list?limit=200&offset=200');
      tasks.push(...(page2.content ?? []));
    } catch { /* ignore pagination errors */ }
  }

  return tasks;
}

export async function getTaskById(taskId) {
  return request('GET', `/tasks/${taskId}`);
}

export async function getTaskMessages(taskId) {
  try {
    const data = await request('GET', `/chats/${taskId}/messages?limit=15`);
    return (data.content ?? [])
      .filter(m => m.text && m.text.trim().length > 2)
      .map(m => ({ text: m.text.trim(), createdAt: m.timestamp ?? null }));
  } catch {
    return [];
  }
}

export async function getSubtaskDetails(subtaskIds = []) {
  if (!subtaskIds.length) return [];
  const results = await Promise.allSettled(
    subtaskIds.slice(0, 10).map(id => request('GET', `/tasks/${id}`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => ({
      id: r.value.id,
      title: r.value.title,
      completed: r.value.completed,
      description: r.value.description?.slice(0, 200),
      checklists: r.value.checklists?.map(cl => ({
        title: cl.title,
        done: cl.items?.filter(i => i.isCompleted).length ?? 0,
        total: cl.items?.length ?? 0,
      })),
    }));
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
