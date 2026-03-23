import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — опытный руководитель разработки. Тебе дан поисковый запрос и список задач из таск-трекера со всеми деталями: описания, подзадачи, чеклисты, родительские задачи, статусы.

Твоя задача — дать ПОЛНЫЙ и РАЗВЁРНУТЫЙ анализ ситуации, как на планёрке с командой. Не копируй текст из полей — синтезируй, делай выводы, объясняй связи.

ПРАВИЛА АНАЛИЗА:

1. КОНТЕКСТ И ЗАВИСИМОСТИ:
   - Если задача является подзадачей — обязательно упомяни родительскую задачу и как они связаны
   - Если у задачи есть братские подзадачи (siblings) — оцени общий прогресс родительского эпика
   - Выяви задачи которые зависят друг от друга или связаны тематически

2. ПРОГРЕСС:
   - Считай чеклисты: "выполнено X из Y пунктов" — конкретные числа
   - Считай подзадачи: "закрыто X из Y подзадач"
   - Если всё выполнено — сделай акцент что задача завершена
   - Если ничего не сделано — прямо скажи что работа не начата

3. СТАТУС:
   - completed: true → "Завершена"
   - columnTitle содержит "done/готов/завершён/done" → "Завершена"
   - columnTitle содержит "работ/процесс/progress/wip" → "В работе"
   - иначе → "В очереди"

4. ОБЩАЯ КАРТИНА:
   - overallHealth: "good" если большинство завершено или идёт по плану, "warning" если есть задержки или незакрытые зависимости, "critical" если задачи заблокированы или давно висят без прогресса
   - В summary дай честную оценку: что сделано, что в работе, что стоит — 4-6 предложений

5. ЯЗЫК:
   - Пиши понятно для менеджера, без технических шаблонов
   - Используй конкретику: имена задач, числа, факты
   - Не пиши "информации недостаточно" если есть хоть какие-то данные — делай выводы из того что есть

Отвечай ТОЛЬКО валидным JSON строго в этом формате:
{
  "summary": "Общая картина: что сделано, что в работе, что стоит, есть ли риски. 4-6 содержательных предложений с конкретикой.",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название группы или эпика",
      "groupSummary": "Что происходит в этой группе: общий прогресс, текущий фокус, риски. 2-3 предложения.",
      "tasks": [
        {
          "id": "uuid",
          "title": "заголовок задачи",
          "brief": "Зачем эта задача: цель и ценность для проекта. 1-2 предложения.",
          "currentState": "Что происходит прямо сейчас с этой задачей. Если есть родительская задача — укажи в каком контексте эпика она находится. 2-4 предложения.",
          "status": "Завершена / В работе / В очереди / Заблокирована",
          "progressDetail": "Конкретный прогресс с числами: 'X из Y подзадач закрыто', 'чеклист X/Y пунктов выполнен', или 'работа не начата', или 'задача полностью завершена'",
          "dependencies": "Описание зависимостей: от каких задач зависит, какие задачи зависят от неё, или null если нет",
          "nextSteps": "Что конкретно нужно сделать дальше. null если завершена.",
          "related": "Список подзадач с их статусом, или null"
        }
      ]
    }
  ],
  "totalFound": число,
  "insufficientData": true или false
}`;

export async function searchTasks(query, tasks, totalTasksInProject = 0) {
  if (!tasks || tasks.length === 0) {
    return {
      summary: `По запросу "${query}" задачи не найдены. Попробуйте уточнить запрос — возможно, задача называется иначе.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => {
    const checklistSummary = (t.checklists ?? []).map(cl => {
      const done = cl.items?.filter(i => i.isCompleted).length ?? 0;
      const total = cl.items?.length ?? 0;
      const items = cl.items?.map(i => `  ${i.isCompleted ? '✓' : '○'} ${i.title}`).join('\n') ?? '';
      return `[Чеклист "${cl.title}": ${done}/${total} выполнено]\n${items}`;
    }).join('\n');

    const subtaskSummary = (t.subtaskDetails ?? []).map(s => {
      const clProgress = (s.checklists ?? []).map(cl => `${cl.done}/${cl.total}`).join(', ');
      return `  ${s.completed ? '✓' : '○'} ${s.title}${clProgress ? ` (чеклист: ${clProgress})` : ''}`;
    }).join('\n');

    const siblingsSummary = (t.siblings ?? []).length > 0
      ? `Другие подзадачи эпика:\n${t.siblings.map(s => `  ${s.completed ? '✓' : '○'} ${s.title}`).join('\n')}`
      : '';

    return [
      `=== ЗАДАЧА: ${t.title} (id: ${t.id}) ===`,
      `Статус колонки: ${t.columnTitle ?? 'неизвестно'} | Завершена: ${t.completed ? 'да' : 'нет'}`,
      t.deadline ? `Дедлайн: ${new Date(t.deadline.deadline).toLocaleDateString('ru-RU')}` : '',
      t.description ? `\nОписание:\n${t.description.slice(0, 600)}` : '',
      checklistSummary ? `\n${checklistSummary}` : '',
      subtaskSummary ? `\nПодзадачи (${t.subtaskDetails?.length ?? 0} шт.):\n${subtaskSummary}` : '',
      t.parentTask ? `\nРодительская задача: "${t.parentTask.title}" (${t.parentTask.completed ? 'завершена' : 'в работе'})` : '',
      siblingsSummary ? `\n${siblingsSummary}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      {
        role: 'user',
        content: `Запрос: "${query}"\nВсего задач в проекте: ${totalTasksInProject}\nНайдено релевантных: ${tasks.length}\n\n${tasksText}`,
      },
    ],
    temperature: 0.25,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
