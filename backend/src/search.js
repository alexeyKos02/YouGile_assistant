import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — аналитик задач в IT-команде. Тебе дан поисковый запрос и список задач из таск-трекера YouGile.

Твоя задача:
1. Найти задачи, релевантные запросу
2. Если задач несколько — сгруппировать по смыслу
3. По каждой задаче дать краткое структурированное описание

Правила:
- Не дублируй текст из описаний — делай саммари своими словами
- Если данных мало — честно укажи insufficientData: true
- Статус определяй из поля completed и columnTitle задачи
- Блокеры ищи в комментариях (слова: "блок", "проблема", "не работает", "ошибка", "стоп")
- Прогресс оценивай по завершённым/незавершённым подзадачам и чеклистам

Отвечай ТОЛЬКО валидным JSON строго в этом формате:
{
  "summary": "Краткое резюме по запросу (1-2 предложения)",
  "groups": [
    {
      "title": "Название группы задач",
      "tasks": [
        {
          "id": "uuid задачи",
          "title": "заголовок задачи",
          "brief": "Суть: одно предложение о чём задача",
          "whatsDone": "Что делается / что было сделано",
          "status": "В работе / Завершена / В очереди / Заблокирована",
          "progress": "Описание прогресса (например: 2 из 3 подзадач выполнены)",
          "blockers": "Описание блокеров или null",
          "related": "Подзадачи или связанные задачи или null"
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
      summary: `По запросу "${query}" задачи не найдены.`,
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => JSON.stringify({
    id: t.id,
    title: t.title,
    description: t.description?.slice(0, 400),
    column: t.columnTitle ?? 'неизвестно',
    completed: t.completed ?? false,
    subtasks: t.subtaskDetails?.map(s => `${s.completed ? '✓' : '○'} ${s.title}`),
    checklists: t.checklists?.map(cl => ({
      title: cl.title,
      items: cl.items?.slice(0, 5).map(i => `${i.isCompleted ? '✓' : '○'} ${i.title}`),
    })),
    comments: t.comments?.slice(0, 5).map(c => c.text?.slice(0, 200)),
  })).join('\n---\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: `Запрос: "${query}"\n\nЗадачи:\n${tasksText}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
