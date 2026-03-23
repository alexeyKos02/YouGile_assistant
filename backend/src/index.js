import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { applyRules, computeDeadline } from './rules.js';
import { generateTask } from './llm.js';
import { createTask, getProjects, getBoardsForProject, getColumnsForBoard, getUsers, getStringStickers, getAllTasks, getSubtaskDetails, getTaskMessages } from './yougile.js';
import { searchTasks } from './search.js';

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
// Body: { query, projectId? }
app.post('/api/search', async (req, res) => {
  const { query, model } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  try {
    // 1. Fetch ALL tasks to build full context + dependency graph
    const allTasks = await getAllTasks();

    // 2. Build lookup map id → task
    const taskMap = Object.fromEntries(allTasks.map(t => [t.id, t]));

    // 3. Score ALL tasks by relevance
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

    // 4. Enrich top 25 relevant tasks
    const enriched = await Promise.all(
      scored.slice(0, 25).map(async t => {
        const subtaskDetails = await getSubtaskDetails(t.subtasks ?? []);

        // Chat messages for this task
        const chatMessages = await getTaskMessages(t.id);

        // Parent task
        const parentTask = allTasks.find(p =>
          Array.isArray(p.subtasks) && p.subtasks.includes(t.id)
        );

        // Sibling tasks (other subtasks under same parent)
        const siblings = parentTask
          ? (parentTask.subtasks ?? [])
              .filter(sid => sid !== t.id)
              .map(sid => taskMap[sid])
              .filter(Boolean)
              .map(s => ({ title: s.title, completed: s.completed }))
          : [];

        // Find other tasks in scored list that share words in title (cross-links)
        const crossLinks = scored
          .filter(other => other.id !== t.id)
          .filter(other => {
            const otherTitle = (other.title ?? '').toLowerCase();
            return words.some(w => otherTitle.includes(w));
          })
          .map(other => ({ title: other.title, completed: other.completed, columnTitle: other.columnTitle }));

        return {
          id: t.id,
          title: t.title,
          description: t.description,
          columnTitle: t.columnTitle,
          completed: t.completed,
          deadline: t.deadline,
          checklists: t.checklists,
          subtaskDetails,
          chatMessages,
          parentTask: parentTask
            ? { id: parentTask.id, title: parentTask.title, completed: parentTask.completed }
            : null,
          siblings,
          crossLinks,
        };
      })
    );

    // DEBUG
    console.log(`[search] query="${query}" total=${allTasks.length} relevant=${enriched.length}`);
    enriched.forEach(t => {
      console.log(`  TASK: "${t.title}" | col="${t.columnTitle}" | done=${t.completed} | desc=${t.description?.length ?? 0}ch | sub=${t.subtaskDetails?.length ?? 0} | chat=${t.chatMessages?.length ?? 0}`);
    });

    // 5. LLM summarize with full context
    const result = await searchTasks(query.trim(), enriched, allTasks.length, model ?? null);
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
