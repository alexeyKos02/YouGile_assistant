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

const PRIORITY_COLOR = {
  critical: 'task-red',
  high: 'task-yellow',
  medium: 'task-blue',
  low: 'task-gray',
};

export async function createTask({ title, description, checklist, priority, deadline, columnId, assigneeId }) {
  const columnIdToUse = columnId ?? process.env.YOUGILE_COLUMN_ID;
  if (!columnIdToUse) throw new Error('columnId is required');

  const body = {
    title,
    columnId: columnIdToUse,
    description: buildDescription(description, checklist),
    color: PRIORITY_COLOR[priority] ?? 'task-primary',
  };

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
