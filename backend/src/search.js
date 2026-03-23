import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Pass 1: select relevant task IDs from titles only ───────────────────────

const SELECT_PROMPT = `Ты — фильтр задач. По запросу пользователя выбери ID наиболее релевантных задач.
Включай задачи, прямо или косвенно связанные с запросом по теме, системе, функциональности.
Выбирай максимум 15 задач. Отвечай ТОЛЬКО валидным JSON: {"ids": ["id1","id2",...]}`;

export async function selectRelevantIds(query, allTasks, model) {
  const selectedModel = model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
  const isReasoningModel = /^(o\d|gpt-5)/.test(selectedModel);

  // Compact: one line per task
  const list = allTasks
    .map(t => `${t.id} | ${t.title} | ${t.columnTitle ?? '?'} | ${t.completed ? '✓' : '○'}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: selectedModel,
    messages: [
      { role: 'system', content: SELECT_PROMPT },
      { role: 'user', content: `ЗАПРОС: "${query}"\n\nЗАДАЧИ:\n${list}` },
    ],
    max_completion_tokens: isReasoningModel ? 5000 : 500,
    ...(isReasoningModel ? { reasoning_effort: 'low' } : { temperature: 0 }),
    response_format: isReasoningModel
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'ids',
            strict: true,
            schema: {
              type: 'object',
              properties: { ids: { type: 'array', items: { type: 'string' } } },
              required: ['ids'],
              additionalProperties: false,
            },
          },
        }
      : { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.ids ?? [];
}

// ─── Pass 2: deep analysis of enriched tasks ─────────────────────────────────

const ANALYZE_PROMPT = `Ты — опытный тимлид, который делает детальный разбор задач для руководителя.

ПРАВИЛА:
1. Каждая задача должна попасть в groups.tasks — не пропускай ни одну.
2. Факты из данных + аналитический вывод (риски, зависимости, что может застопориться).
3. Чат — ключевой источник: что обсуждали, решения, блокеры. Цитируй важные фразы.
4. Связи: parentTask/siblings/crossLinks — опиши как задачи влияют друг на друга.
5. Запрещены: "ведётся работа", "необходимо выполнить", "в рамках". Называй конкретные системы.
6. Статус: completed=true или колонка done/готов → "Завершена"; работ/process/wip → "В работе"; иначе → "В очереди".
7. Health: good — движется; warning — задержки/зависимости; critical — блокеры/дедлайны нарушены.

Отвечай ТОЛЬКО валидным JSON:
{
  "summary": "8-10 конкретных предложений: все задачи, их состояние, связи, риски, вывод.",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название направления",
      "groupSummary": "3-4 предложения: прогресс группы, ключевые выводы из чатов.",
      "tasks": [
        {
          "id": "uuid",
          "title": "заголовок",
          "brief": "Что нужно сделать, почему важно. 3-4 предложения.",
          "currentState": "Факты: статус, чеклист, чат. Анализ: движется/застряла. 5-7 предложений.",
          "status": "Завершена | В работе | В очереди",
          "progressDetail": "[✓] пункт1, [ ] пункт2 или 'Нет подзадач и чеклиста'",
          "chatSummary": "О чём говорили, решения, проблемы. Или 'Чат пустой'.",
          "dependencies": "Связи с другими задачами и их влияние. Или null.",
          "nextSteps": "Конкретные следующие шаги. Null если завершена.",
          "related": "Список подзадач. Null если нет."
        }
      ]
    }
  ],
  "totalFound": 0,
  "insufficientData": false
}`;

function serializeTask(t) {
  const checklistText = (t.checklists ?? []).map(cl => {
    const done  = cl.items?.filter(i => i.isCompleted).length ?? 0;
    const total = cl.items?.length ?? 0;
    const items = (cl.items ?? [])
      .map(i => `  ${i.isCompleted ? '[✓]' : '[ ]'} ${i.title.slice(0, 80)}`)
      .join('\n');
    return `Чеклист "${cl.title}" ${done}/${total}:\n${items}`;
  }).join('\n') || 'нет';

  const subtaskText = (t.subtaskDetails ?? []).map(s => {
    const cl = (s.checklists ?? []).map(c => `${c.done}/${c.total}`).join(', ');
    return `${s.completed ? '[✓]' : '[ ]'} ${s.title}${cl ? ` (${cl})` : ''}`;
  }).join('\n') || 'нет';

  const chatText = (t.chatMessages ?? []).length > 0
    ? (t.chatMessages ?? []).slice(0, 8).map(m => `> ${m.text.slice(0, 120)}`).join('\n')
    : '(пустой)';

  const crossText = (t.crossLinks ?? []).slice(0, 8)
    .map(c => `• ${c.title} [${c.columnTitle ?? '?'}] ${c.completed ? '✓' : '○'}`)
    .join('\n') || null;

  const deadline = t.deadline?.deadline
    ? new Date(t.deadline.deadline).toLocaleDateString('ru-RU')
    : 'нет';

  return [
    `=== ${t.title}`,
    `ID:${t.id} | Колонка:${t.columnTitle ?? '?'} | ${t.completed ? 'ЗАВЕРШЕНА' : 'НЕ ЗАВЕРШЕНА'} | Дедлайн:${deadline}`,
    `ОПИСАНИЕ: ${t.description ? t.description.slice(0, 400) : '(нет)'}`,
    `ЧЕКЛИСТЫ:\n${checklistText}`,
    `ПОДЗАДАЧИ:\n${subtaskText}`,
    `ЧАТ:\n${chatText}`,
    t.parentTask ? `РОДИТЕЛЬ: ${t.parentTask.title} (${t.parentTask.completed ? '✓' : 'в работе'})` : null,
    (t.siblings ?? []).length ? `БРАТСКИЕ: ${t.siblings.map(s => `${s.completed ? '[✓]' : '[ ]'} ${s.title}`).join(', ')}` : null,
    crossText ? `СВЯЗИ:\n${crossText}` : null,
  ].filter(Boolean).join('\n');
}

function buildResponseFormat(isReasoningModel) {
  if (!isReasoningModel) return { type: 'json_object' };
  return {
    type: 'json_schema',
    json_schema: {
      name: 'search_result',
      strict: false,
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          overallHealth: { type: 'string' },
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                groupSummary: { type: 'string' },
                tasks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      brief: { type: 'string' },
                      currentState: { type: 'string' },
                      status: { type: 'string' },
                      progressDetail: { type: 'string' },
                      chatSummary: { type: ['string', 'null'] },
                      dependencies: { type: ['string', 'null'] },
                      nextSteps: { type: ['string', 'null'] },
                      related: { type: ['string', 'null'] },
                    },
                    required: ['id', 'title', 'brief', 'currentState', 'status', 'progressDetail', 'chatSummary', 'dependencies', 'nextSteps', 'related'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['title', 'groupSummary', 'tasks'],
              additionalProperties: false,
            },
          },
          totalFound: { type: 'number' },
          insufficientData: { type: 'boolean' },
        },
        required: ['summary', 'overallHealth', 'groups', 'totalFound', 'insufficientData'],
        additionalProperties: false,
      },
    },
  };
}

export async function analyzeTasks(query, enrichedTasks, totalTasksInProject = 0, model = null) {
  if (!enrichedTasks || enrichedTasks.length === 0) {
    return {
      summary: `По запросу "${query}" задачи не найдены. Попробуйте другой запрос.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const selectedModel = model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
  const isReasoningModel = /^(o\d|gpt-5)/.test(selectedModel);

  const tasksText = enrichedTasks.map(serializeTask).join('\n\n');

  const userMessage = [
    `ЗАПРОС: "${query}"`,
    `Всего задач в проекте: ${totalTasksInProject} | Отобрано для анализа: ${enrichedTasks.length}`,
    `Проанализируй ВСЕ ${enrichedTasks.length} задач ниже.`,
    ``,
    tasksText,
  ].join('\n');

  const response = await client.chat.completions.create({
    model: selectedModel,
    messages: [
      { role: 'system', content: ANALYZE_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_completion_tokens: isReasoningModel ? 50000 : 8000,
    ...(isReasoningModel ? { reasoning_effort: 'medium' } : { temperature: 0.15 }),
    response_format: buildResponseFormat(isReasoningModel),
  });

  return JSON.parse(response.choices[0].message.content);
}
