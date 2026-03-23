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

export async function getColumns() {
  // Returns boards (sprints) for a project
  const projectId = process.env.YOUGILE_PROJECT_ID;
  if (!projectId) throw new Error('YOUGILE_PROJECT_ID not set');
  return request('GET', `/projects/${projectId}/sprints`);
}

export async function getColumnsForProject(projectId) {
  if (!projectId) throw new Error('projectId is required');
  return request('GET', `/sprints?projectId=${projectId}`);
}

export async function getUsers() {
  // Users are embedded in project data, extract from all projects
  const data = await request('GET', '/projects');
  const projects = data.content ?? [];
  const usersMap = {};
  for (const project of projects) {
    if (project.users) {
      for (const [id] of Object.entries(project.users)) {
        usersMap[id] = { id, name: id };
      }
    }
  }
  return { content: Object.values(usersMap) };
}

export async function createTask({ title, description, checklist, priority, deadline, columnId, assigneeId }) {
  const columnIdToUse = columnId ?? process.env.YOUGILE_COLUMN_ID;
  if (!columnIdToUse) throw new Error('YOUGILE_COLUMN_ID not set and not provided');

  const body = {
    title,
    columnId: columnIdToUse,
    description: buildDescription(description, checklist),
  };

  if (deadline) {
    body.deadline = { deadline: new Date(deadline).getTime() };
  }

  if (assigneeId) {
    body.assigned = { [assigneeId]: true };
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

export async function getProjects() {
  return request('GET', '/projects');
}
