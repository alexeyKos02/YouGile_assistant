import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { applyRules, computeDeadline } from './rules.js';
import { generateTask } from './llm.js';
import { createTask, getProjects, getBoardsForProject, getColumnsForBoard, getUsers, getStringStickers, getAllTasks, getSubtaskDetails, getTaskMessages } from './yougile.js';
import { selectRelevantIds, analyzeTasks } from './search.js';

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/generate
// Body: { text: string }
// Returns: structured task object
app.post('/api/generate', async (req, res) => {
  const { text, model } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const hints = applyRules(text);
    hints.deadline = computeDeadline(hints.deadlineDays);

    const task = await generateTask(text, hints, model ?? null);

    // Merge rule-derived data as fallback/override
    const result = {
      ...task,
      priority: hints.priority !== 'medium' ? hints.priority : (task.priority ?? hints.priority),
      deadline: task.deadline ?? hints.deadline,
      type: hints.type ?? task.type ?? 'task',
      project: hints.project ?? null,
      labels: hints.labels,
    };

    res.json(result);
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/create
// Body: { title, description, checklist, priority, deadline, columnId?, assigneeId? }
// Returns: { id, url }
app.post('/api/create', async (req, res) => {
  const { title, description, checklist, priority, deadline, columnId, assigneeId, stickers } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const result = await createTask({ title, description, checklist, priority, deadline, columnId, assigneeId, stickers });
    res.json(result);
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects
app.get('/api/projects', async (_req, res) => {
  try {
    const result = await getProjects();
    res.json(result);
  } catch (err) {
    console.error('Projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boards/:projectId
app.get('/api/boards/:projectId', async (req, res) => {
  try {
    const result = await getBoardsForProject(req.params.projectId);
    res.json(result);
  } catch (err) {
    console.error('Boards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/columns/:boardId
app.get('/api/columns/:boardId', async (req, res) => {
  try {
    const result = await getColumnsForBoard(req.params.boardId);
    res.json(result);
  } catch (err) {
    console.error('Columns error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stickers/:boardId
app.get('/api/stickers/:boardId', async (req, res) => {
  try {
    const result = await getStringStickers(req.params.boardId);
    res.json(result);
  } catch (err) {
    console.error('Stickers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users
app.get('/api/users', async (_req, res) => {
  try {
    const result = await getUsers();
    res.json(result);
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/search
// Body: { query, model? }
app.post('/api/search', async (req, res) => {
  const { query, model } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  try {
    const selectedModel = model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';

    // 1. Fetch ALL tasks (thin — no chat/subtask details yet)
    const allTasks = await getAllTasks();
    const taskMap = Object.fromEntries(allTasks.map(t => [t.id, t]));

    // 2. Pass 1: LLM picks relevant IDs from all titles (~4k tokens)
    const relevantIds = await selectRelevantIds(query.trim(), allTasks, selectedModel);
    const candidates = relevantIds.length > 0
      ? allTasks.filter(t => relevantIds.includes(t.id))
      : allTasks.slice(0, 12); // fallback if LLM returned nothing

    console.log(`[search] query="${query}" total=${allTasks.length} selected=${candidates.length}`);

    // 3. Enrich only the selected tasks (fetch chat + subtasks)
    const enriched = await Promise.all(candidates.map(async t => {
      const [subtaskDetails, chatMessages] = await Promise.all([
        getSubtaskDetails(t.subtasks ?? []),
        getTaskMessages(t.id),
      ]);
      const parentTask = allTasks.find(p => Array.isArray(p.subtasks) && p.subtasks.includes(t.id));
      const siblings = parentTask
        ? (parentTask.subtasks ?? [])
            .filter(sid => sid !== t.id)
            .map(sid => taskMap[sid]).filter(Boolean)
            .map(s => ({ title: s.title, completed: s.completed }))
        : [];
      const crossLinks = candidates
        .filter(other => other.id !== t.id)
        .map(other => ({ title: other.title, completed: other.completed, columnTitle: other.columnTitle }));
      return {
        id: t.id, title: t.title, description: t.description,
        columnTitle: t.columnTitle, completed: t.completed,
        deadline: t.deadline, checklists: t.checklists,
        subtaskDetails, chatMessages,
        parentTask: parentTask ? { id: parentTask.id, title: parentTask.title, completed: parentTask.completed } : null,
        siblings, crossLinks,
      };
    }));

    // 4. Pass 2: deep LLM analysis of enriched tasks
    const result = await analyzeTasks(query.trim(), enriched, allTasks.length, selectedModel);
    res.json(result);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
