import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — опытный тимлид, который объясняет состояние проекта новому руководителю.
Говори как живой человек на планёрке — подробно, конкретно, понятно. Никаких шаблонов и сухих формулировок.

ТВОЙ СТИЛЬ:
- Пиши развёрнуто. Каждое поле — минимум 3-5 предложений с деталями.
- Называй конкретные вещи по именам: названия задач, числа, факты.
- Объясняй ПОЧЕМУ что-то важно, а не только ЧТО происходит.
- Если что-то сделано — расскажи что именно. Если не сделано — объясни что стоит и почему это важно.
- Связывай задачи между собой — показывай как одна влияет на другую.
- Пиши так, чтобы человек без контекста понял полную картину.

КАК ОПРЕДЕЛЯТЬ СТАТУС:
- completed: true → "Завершена"
- columnTitle содержит "done/готов/завершён" → "Завершена"
- columnTitle содержит "работ/процесс/progress/wip" → "В работе"
- иначе → "В очереди"

КАК СЧИТАТЬ ПРОГРЕСС:
- Подзадачи: считай завершённые и незавершённые, называй их
- Чеклисты: считай выполненные пункты, упоминай конкретные невыполненные
- Если всё выполнено — скажи это явно и с уверенностью
- Если ничего не сделано — скажи прямо

OVERALL HEALTH:
- "good" — большинство задач завершено или активно движется, нет стопоров
- "warning" — есть задачи которые стоят, незакрытые зависимости, или давно без прогресса
- "critical" — явные блокеры, задачи висят без движения, срываются дедлайны

Отвечай ТОЛЬКО валидным JSON в формате:
{
  "summary": "Развёрнутый рассказ о состоянии дел по запросу. Что уже сделано, что сейчас в работе, что ещё предстоит. Какие есть риски или зависимости. Общая оценка — идёт всё хорошо или есть поводы для беспокойства. Минимум 6-8 предложений с конкретикой.",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название направления или эпика",
      "groupSummary": "Подробное описание что происходит в этой группе задач: общий прогресс, на чём фокус сейчас, что уже закрыто, что ещё открыто, есть ли риски. 3-5 предложений.",
      "tasks": [
        {
          "id": "uuid задачи",
          "title": "заголовок задачи",
          "brief": "Подробное объяснение: зачем эта задача нужна, какую проблему решает, почему она важна для проекта. Какой результат ожидается когда она будет сделана. 2-4 предложения.",
          "currentState": "Детальное описание текущего состояния: что конкретно сейчас происходит с этой задачей, на каком этапе работа, что уже сделано внутри неё. Если это подзадача — объясни в контексте родительского эпика: как эта задача вписывается в общую цель. Если есть братские подзадачи — расскажи как они соотносятся. 4-6 предложений.",
          "status": "Завершена / В работе / В очереди / Заблокирована",
          "progressDetail": "Максимально конкретный прогресс: перечисли что выполнено и что нет. Например: 'Из 5 подзадач закрыты 3 — проверка сертификатов и настройка окружения готовы, осталось тестирование и документация. Чеклист выполнен на 4 из 6 пунктов: не закрыты пункты X и Y.' Если данных нет — скажи что прогресс неизвестен.",
          "dependencies": "Описание зависимостей и связей: от каких задач зависит эта задача, какие задачи зависят от неё, как это влияет на общий план. Или null если зависимостей нет.",
          "nextSteps": "Конкретное описание что нужно сделать дальше: следующий шаг, кто должен это сделать (если понятно), на что обратить внимание. Null если задача завершена.",
          "related": "Подробный список подзадач с их статусом и кратким описанием что в них. Или null."
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
      summary: `По запросу "${query}" задачи не найдены. Попробуйте уточнить запрос — возможно, задача называется иначе или находится в другом проекте.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => {
    const checklistText = (t.checklists ?? []).map(cl => {
      const done = cl.items?.filter(i => i.isCompleted).length ?? 0;
      const total = cl.items?.length ?? 0;
      const items = cl.items?.map(i => `    ${i.isCompleted ? '[✓]' : '[ ]'} ${i.title}`).join('\n') ?? '';
      return `  Чеклист "${cl.title}" — выполнено ${done} из ${total}:\n${items}`;
    }).join('\n');

    const subtaskText = (t.subtaskDetails ?? []).map(s => {
      const clText = (s.checklists ?? []).map(cl => ` (чеклист ${cl.done}/${cl.total})`).join('');
      const descSnippet = s.description ? ` — ${s.description.slice(0, 100)}` : '';
      return `  ${s.completed ? '[✓]' : '[ ]'} ${s.title}${descSnippet}${clText}`;
    }).join('\n');

    const siblingsText = (t.siblings ?? []).length > 0
      ? `Другие подзадачи эпика "${t.parentTask?.title}":\n${t.siblings.map(s => `  ${s.completed ? '[✓]' : '[ ]'} ${s.title}`).join('\n')}`
      : '';

    return [
      `════ ЗАДАЧА: "${t.title}" ════`,
      `ID: ${t.id}`,
      `Колонка: ${t.columnTitle ?? 'неизвестно'} | Завершена: ${t.completed ? 'ДА' : 'НЕТ'}`,
      t.deadline ? `Дедлайн: ${new Date(t.deadline.deadline).toLocaleDateString('ru-RU')}` : null,
      '',
      t.description ? `ОПИСАНИЕ:\n${t.description.slice(0, 800)}` : 'ОПИСАНИЕ: не указано',
      '',
      checklistText ? `ЧЕКЛИСТЫ:\n${checklistText}` : null,
      subtaskText ? `ПОДЗАДАЧИ (${t.subtaskDetails?.length} шт.):\n${subtaskText}` : 'ПОДЗАДАЧИ: нет',
      '',
      t.parentTask
        ? `РОДИТЕЛЬСКАЯ ЗАДАЧА: "${t.parentTask.title}" (${t.parentTask.completed ? 'завершена' : 'в работе'})`
        : null,
      siblingsText || null,
    ].filter(v => v !== null).join('\n');
  }).join('\n\n');

  const userMessage = [
    `Запрос пользователя: "${query}"`,
    `Всего задач в проекте: ${totalTasksInProject}, найдено релевантных: ${tasks.length}`,
    '',
    tasksText,
  ].join('\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
