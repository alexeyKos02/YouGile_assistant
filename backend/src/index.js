import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { applyRules, computeDeadline } from './rules.js';
import { generateTask } from './llm.js';
import { createTask, getProjects, getBoardsForProject, getColumnsForBoard, getUsers, getStringStickers, getAllTasks, getSubtaskDetails } from './yougile.js';
import { searchTasks } from './search.js';

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/generate
// Body: { text: string }
// Returns: structured task object
app.post('/api/generate', async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const hints = applyRules(text);
    hints.deadline = computeDeadline(hints.deadlineDays);

    const task = await generateTask(text, hints);

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
// Body: { query, projectId? }
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  try {
    // 1. Fetch ALL tasks to build full context + dependency graph
    const allTasks = await getAllTasks();

    // 2. Build lookup map id → task
    const taskMap = Object.fromEntries(allTasks.map(t => [t.id, t]));

    // 3. Score tasks by relevance to query
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);

    const scored = allTasks.map(t => {
      let score = 0;
      const title = (t.title ?? '').toLowerCase();
      const desc  = (t.description ?? '').toLowerCase();

      if (title.includes(q)) score += 30;
      words.forEach(w => {
        if (title.includes(w)) score += 8;
        if (desc.includes(w))  score += 3;
      });
      return { ...t, _score: score };
    }).filter(t => t._score > 0).sort((a, b) => b._score - a._score);

    // 4. Take top 15, enrich with full subtask details
    const relevant = scored.slice(0, 15);
    const enriched = await Promise.all(
      relevant.map(async t => {
        const subtaskDetails = await getSubtaskDetails(t.subtasks ?? []);

        // Find parent task if this is a subtask
        const parentTask = allTasks.find(p =>
          Array.isArray(p.subtasks) && p.subtasks.includes(t.id)
        );

        // Find sibling tasks (other subtasks of same parent)
        const siblings = parentTask
          ? (parentTask.subtasks ?? [])
              .filter(sid => sid !== t.id)
              .map(sid => taskMap[sid])
              .filter(Boolean)
              .map(s => ({ title: s.title, completed: s.completed }))
          : [];

        return {
          id: t.id,
          title: t.title,
          description: t.description,
          columnTitle: t.columnTitle,
          completed: t.completed,
          deadline: t.deadline,
          checklists: t.checklists,
          subtaskDetails,
          parentTask: parentTask ? { id: parentTask.id, title: parentTask.title, completed: parentTask.completed } : null,
          siblings,
        };
      })
    );

    // DEBUG: log what we're sending to LLM
    console.log(`[search] query="${query}" totalTasks=${allTasks.length} relevant=${enriched.length}`);
    enriched.forEach(t => {
      console.log(`  TASK: "${t.title}" | col="${t.columnTitle}" | completed=${t.completed} | desc=${t.description?.length ?? 0}chars | subtasks=${t.subtaskDetails?.length ?? 0} | checklists=${t.checklists?.length ?? 0}`);
    });

    // 5. LLM summarize with full context
    const result = await searchTasks(query.trim(), enriched, allTasks.length);
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
