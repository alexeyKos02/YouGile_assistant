import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — опытный проджект-менеджер и аналитик. Тебе дан поисковый запрос и список задач из таск-трекера YouGile.

Твоя задача — дать РАЗВЁРНУТЫЙ и ПОНЯТНЫЙ анализ ситуации, как будто объясняешь руководителю проекта на планёрке.

Правила анализа:
- Пиши живым языком, понятным для менеджера — никаких технических шаблонов
- По каждой задаче объясняй: зачем это нужно, что сейчас происходит, какой результат ожидается
- Если есть подзадачи/чеклист — посчитай прогресс и опиши конкретно (например: "сделано 3 из 5 пунктов")
- Блокеры ищи в комментариях (слова: блок, проблем, не работает, ошибка, ждём, pending, стоп, завис)
- В общем резюме дай оценку: всё идёт хорошо / есть риски / есть проблемы
- Статус определяй по: completed=true → Завершена; column name (содержит "done/готов/завершён" → Завершена; "work/процесс/в работе" → В работе; иначе → В очереди)
- Если данных мало — честно скажи об этом в поле insufficientData

Отвечай ТОЛЬКО валидным JSON строго в этом формате:
{
  "summary": "Общая картина по запросу: что происходит, как идут дела в целом, есть ли риски (3-5 предложений)",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название группы (тема или направление)",
      "groupSummary": "Что происходит в этой группе задач (1-2 предложения)",
      "tasks": [
        {
          "id": "uuid задачи",
          "title": "заголовок задачи",
          "brief": "Зачем эта задача нужна и что она решает (1-2 предложения)",
          "currentState": "Подробное описание текущего состояния: что сейчас делается, кем, на каком этапе (2-3 предложения)",
          "status": "В работе / Завершена / В очереди / Заблокирована",
          "progressDetail": "Конкретный прогресс: например '3 из 5 пунктов чеклиста выполнено' или 'все подзадачи закрыты' или 'работа не начата'",
          "blockers": "Подробное описание блокеров и проблем из комментариев, или null если нет",
          "nextSteps": "Что нужно сделать дальше / какой следующий шаг, или null если задача завершена",
          "related": "Список подзадач или связанных задач с их статусом, или null"
        }
      ]
    }
  ],
  "totalFound": число,
  "insufficientData": true или false
}`;

export async function searchTasks(query, tasks) {
  if (!tasks || tasks.length === 0) {
    return {
      summary: `По запросу "${query}" задачи не найдены. Возможно, стоит уточнить запрос или проверить наличие задач в проекте.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => JSON.stringify({
    id: t.id,
    title: t.title,
    description: t.description?.slice(0, 600),
    column: t.columnTitle ?? 'неизвестно',
    completed: t.completed ?? false,
    subtasks: t.subtaskDetails?.map(s => `${s.completed ? '✓' : '○'} ${s.title}`),
    checklists: t.checklists?.map(cl => ({
      title: cl.title,
      total: cl.items?.length ?? 0,
      done: cl.items?.filter(i => i.isCompleted).length ?? 0,
      items: cl.items?.slice(0, 8).map(i => `${i.isCompleted ? '✓' : '○'} ${i.title}`),
    })),
    comments: t.comments?.slice(0, 8).map(c => c.text?.slice(0, 300)),
  })).join('\n---\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: `Запрос: "${query}"\n\nЗадачи из трекера:\n${tasksText}` },
    ],
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
