import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Ты — опытный продакт-менеджер и аналитик. Твоя задача — по краткому описанию задачи от разработчика генерировать структурированную задачу для таск-трекера.

Правила:
- Заголовок: короткий, понятный, на русском, начинается с глагола или существительного
- Описание: 2–4 предложения, поясняет контекст и цель задачи
- Чеклист: 3–6 конкретных пунктов (если задача не тривиальная)
- Приоритет: low / medium / high / critical
- Тип: bug / feature / integration / task / improvement
- Дедлайн: YYYY-MM-DD

Отвечай ТОЛЬКО валидным JSON без markdown-блоков, строго в формате:
{
  "title": "...",
  "description": "...",
  "checklist": ["...", "..."],
  "priority": "...",
  "type": "...",
  "deadline": "..."
}`;

export async function generateTask(rawText, hints, model = null) {
  const userPrompt = `
Краткое описание задачи: "${rawText}"

Подсказки (уже определено правилами, учти при генерации):
- Приоритет: ${hints.priority}
- Тип задачи: ${hints.type ?? 'определи сам'}
- Проект: ${hints.project ?? 'не определён'}
- Дедлайн через дней: ${hints.deadlineDays} (дата: ${hints.deadline})

Сгенерируй задачу в формате JSON.
`.trim();

  const selectedModel = model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
  const isReasoningModel = /^(o\d|gpt-5)/.test(selectedModel);

  const response = await client.chat.completions.create({
    model: selectedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: isReasoningModel ? 5000 : 800,
    ...(isReasoningModel ? { reasoning_effort: 'low' } : { temperature: 0.4 }),
    response_format: isReasoningModel
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'task',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                checklist: { type: 'array', items: { type: 'string' } },
                priority: { type: 'string' },
                type: { type: 'string' },
                deadline: { type: 'string' },
              },
              required: ['title', 'description', 'checklist', 'priority', 'type', 'deadline'],
              additionalProperties: false,
            },
          },
        }
      : { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}
