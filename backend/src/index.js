import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { applyRules, computeDeadline } from './rules.js';
import { generateTask } from './llm.js';
import { createTask } from './yougile.js';

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
// Body: { title, description, checklist, priority, deadline, columnId? }
// Returns: { id, url }
app.post('/api/create', async (req, res) => {
  const { title, description, checklist, priority, deadline, columnId } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const result = await createTask({ title, description, checklist, priority, deadline, columnId });
    res.json(result);
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
