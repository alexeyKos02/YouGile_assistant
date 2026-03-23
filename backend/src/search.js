import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — опытный тимлид, который делает детальный разбор задач для руководителя.

ТВОЯ ЗАДАЧА: проанализировать ВСЕ переданные задачи, не пропустить ни одной, связать их между собой и дать полную картину.

═══ ПРАВИЛА АНАЛИЗА ═══

1. ПОЛНОТА — каждая задача должна попасть в groups.tasks. Не объединяй несколько задач в одну запись.

2. ФАКТЫ + АНАЛИЗ:
   - Сначала конкретные факты из данных (названия систем, пункты чеклиста, содержание чата)
   - Затем аналитический вывод: что это значит для проекта, есть ли риск, что может застопориться

3. ЧАТ — это ключевой источник контекста:
   - Что обсуждали в чате? Какие решения приняли?
   - Есть ли упоминания проблем, блокеров, ожиданий?
   - Цитируй ключевые фразы из чата если они важны
   - Если чат пустой — скажи об этом

4. СВЯЗИ МЕЖДУ ЗАДАЧАМИ:
   - Если несколько задач явно связаны — объясни как именно
   - Используй поле crossLinks и parentTask/siblings для поиска связей
   - В summary обязательно опиши как задачи влияют друг на друга

5. КОНКРЕТИКА — запрещены фразы:
   - "ведётся работа", "необходимо выполнить", "направлена на", "в рамках"
   - Вместо этого: называй конкретные системы, сервисы, действия из данных

6. ЕСЛИ ДАННЫХ МАЛО:
   - Описание пустое — скажи "описание не заполнено" и проанализируй по названию
   - Чат пустой — скажи "обсуждений нет"
   - Не придумывай детали

7. СТАТУС:
   - completed=true → "Завершена"
   - columnTitle содержит "done/готов/завершён" → "Завершена"
   - columnTitle содержит "работ/процесс/progress/wip/делаем" → "В работе"
   - иначе → "В очереди"

8. HEALTH:
   - "good" — большинство задач завершено или активно движется
   - "warning" — есть задержки, незакрытые зависимости, задачи без прогресса
   - "critical" — явные блокеры, работа стоит, нарушены дедлайны

═══ ФОРМАТ ОТВЕТА ═══

Отвечай ТОЛЬКО валидным JSON:
{
  "summary": "Полная аналитическая картина: перечисли ВСЕ найденные задачи по группам, опиши их состояние и связи. Что сделано, что в работе, что стоит. Какие риски видны из чатов и прогресса. Вывод: как в целом идут дела. 8-10 конкретных предложений.",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название направления (группируй по смыслу)",
      "groupSummary": "Общий прогресс по группе: сколько задач завершено, что в работе, ключевые выводы из чатов этих задач. 3-4 предложения.",
      "tasks": [
        {
          "id": "uuid задачи",
          "title": "заголовок задачи",
          "brief": "Что конкретно нужно сделать — пересказ описания с реальными названиями систем/сервисов. Аналитика: почему это важно. Если описание пустое — так и скажи. 3-4 предложения.",
          "currentState": "ФАКТЫ: статус колонки, что выполнено в чеклисте/подзадачах (по именам), ключевые обсуждения из чата. АНАЛИЗ: что это говорит о состоянии задачи — движется, застряла, завершена? Упомяни конкретные реплики из чата если есть важные. 5-7 предложений.",
          "status": "Завершена / В работе / В очереди",
          "progressDetail": "Точный прогресс: '[✓] название_подзадачи1, [ ] название_подзадачи2' или 'Чеклист \"X\": [✓] пункт1, [✓] пункт2, [ ] пункт3' или 'Нет подзадач и чеклиста'",
          "chatSummary": "Краткое содержание чата: о чём говорили, какие решения приняли, есть ли проблемы упомянутые в переписке. Или 'Чат пустой — обсуждений нет'",
          "dependencies": "Связи с другими задачами: родительская задача, братские подзадачи, перекрёстные связи по теме. Аналитика: как эти связи влияют на работу. Или null.",
          "nextSteps": "Конкретные следующие шаги из невыполненных пунктов + аналитика приоритетности. Null если завершена.",
          "related": "Список подзадач: '[✓] название1, [ ] название2'. Null если нет."
        }
      ]
    }
  ],
  "totalFound": число,
  "insufficientData": true если у большинства задач нет описаний чеклистов и чата, иначе false
}`;

export async function searchTasks(query, tasks, totalTasksInProject = 0) {
  if (!tasks || tasks.length === 0) {
    return {
      summary: `По запросу "${query}" задачи не найдены. Попробуйте другой запрос.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => {
    // Checklists with each item
    const checklistText = (t.checklists ?? []).map(cl => {
      const done  = cl.items?.filter(i => i.isCompleted).length ?? 0;
      const total = cl.items?.length ?? 0;
      const items = (cl.items ?? [])
        .map(i => `      ${i.isCompleted ? '[✓]' : '[ ]'} "${i.title}"`)
        .join('\n');
      return `  Чеклист "${cl.title}" — ${done}/${total} выполнено:\n${items}`;
    }).join('\n') || '  нет чеклистов';

    // Subtasks with details
    const subtaskText = (t.subtaskDetails ?? []).map(s => {
      const clParts = (s.checklists ?? []).map(cl => `чеклист ${cl.done}/${cl.total}`).join(', ');
      const desc = s.description ? `\n      "${s.description.slice(0, 120)}"` : '';
      return `  ${s.completed ? '[✓]' : '[ ]'} "${s.title}"${clParts ? ` (${clParts})` : ''}${desc}`;
    }).join('\n') || '  нет подзадач';

    // Chat messages
    const chatText = (t.chatMessages ?? []).length > 0
      ? (t.chatMessages ?? [])
          .slice(0, 10)
          .map(m => `  > "${m.text.slice(0, 150)}"`)
          .join('\n')
      : '  (чат пустой — сообщений нет)';

    // Siblings
    const siblingsText = (t.siblings ?? []).length > 0
      ? (t.siblings ?? []).map(s => `  ${s.completed ? '[✓]' : '[ ]'} "${s.title}"`).join('\n')
      : null;

    // Cross-links
    const crossText = (t.crossLinks ?? []).length > 0
      ? (t.crossLinks ?? []).map(c => `  • "${c.title}" [${c.columnTitle ?? '?'}] ${c.completed ? '✓' : '○'}`).join('\n')
      : null;

    const deadlineStr = t.deadline?.deadline
      ? `Дедлайн: ${new Date(t.deadline.deadline).toLocaleDateString('ru-RU')}`
      : 'Дедлайн: не указан';

    return [
      `╔══════════════════════════════════════`,
      `║ ЗАДАЧА: "${t.title}"`,
      `║ ID: ${t.id}`,
      `║ Колонка: "${t.columnTitle ?? '?'}" | Завершена: ${t.completed ? 'ДА ✓' : 'НЕТ'} | ${deadlineStr}`,
      `╚══════════════════════════════════════`,
      ``,
      `ОПИСАНИЕ:`,
      t.description ? t.description.slice(0, 500) : '(описание не заполнено)',
      ``,
      `ЧЕКЛИСТЫ:`,
      checklistText,
      ``,
      `ПОДЗАДАЧИ (${t.subtaskDetails?.length ?? 0}):`,
      subtaskText,
      ``,
      `ЧАТ (${t.chatMessages?.length ?? 0} сообщений):`,
      chatText,
      ``,
      t.parentTask
        ? `РОДИТЕЛЬ: "${t.parentTask.title}" (${t.parentTask.completed ? 'завершена ✓' : 'в работе'})`
        : `РОДИТЕЛЬ: нет (самостоятельная задача)`,
      siblingsText ? `БРАТСКИЕ ПОДЗАДАЧИ:\n${siblingsText}` : null,
      crossText ? `СВЯЗАННЫЕ ЗАДАЧИ ПО ТЕМЕ:\n${crossText}` : null,
    ].filter(v => v !== null).join('\n');
  }).join('\n\n');

  const userMessage = [
    `ЗАПРОС: "${query}"`,
    `Всего задач в проекте: ${totalTasksInProject} | Найдено релевантных: ${tasks.length}`,
    `ВАЖНО: проанализируй ВСЕ ${tasks.length} задач, не пропускай ни одну.`,
    ``,
    tasksText,
  ].join('\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-5',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_completion_tokens: 8000,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'search_result',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            overallHealth: { type: 'string' },
            groups: { type: 'array' },
            totalFound: { type: 'number' },
            insufficientData: { type: 'boolean' },
          },
          required: ['summary', 'overallHealth', 'groups', 'totalFound', 'insufficientData'],
          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(response.choices[0].message.content);
}
