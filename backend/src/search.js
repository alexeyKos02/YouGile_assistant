import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEARCH_PROMPT = `Ты — опытный тимлид и аналитик. Тебе дан список задач из трекера со всеми данными.

ДВОЙНАЯ ЗАДАЧА:
1. ФАКТЫ — точно передавай что написано в данных (названия систем, конкретные пункты чеклиста, имена подзадач)
2. АНАЛИЗ — делай выводы: почему это важно, каков риск, что значит этот прогресс для проекта, логичен ли следующий шаг

ПРАВИЛА:
- Используй реальные названия из данных: систем, сервисов, компаний, серверов
- Цитируй конкретные пункты чеклиста и подзадач по именам
- После фактов — добавляй свою оценку: "это означает что...", "судя по всему...", "это критично потому что..."
- Если описание пустое — скажи об этом, но проанализируй по названию и контексту что это за задача
- НЕ ПИШИ: "ведётся работа", "необходимо выполнить ряд действий", "задача направлена на" — это пустые фразы
- Если задач по запросу мало — подробно разбери каждую

СТАТУС:
- completed=true → "Завершена"
- columnTitle содержит "done/готов/завершён" → "Завершена"
- columnTitle содержит "работ/процесс/progress/wip/делаем" → "В работе"
- иначе → "В очереди"

HEALTH:
- "good" — большинство задач завершено или движется без стопоров
- "warning" — есть задачи без прогресса или с незакрытыми зависимостями
- "critical" — задачи заблокированы, дедлайны нарушены, работа стоит

Отвечай ТОЛЬКО валидным JSON:
{
  "summary": "Полная картина: назови конкретные задачи которые завершены, что сейчас в работе (с деталями), что стоит в очереди. Добавь аналитику: есть ли риски, как связаны задачи между собой, что может стать проблемой. 6-8 предложений.",
  "overallHealth": "good | warning | critical",
  "groups": [
    {
      "title": "Название направления",
      "groupSummary": "Факты о группе + аналитика: что происходит, каков общий прогресс, на что обратить внимание. 3-4 предложения.",
      "tasks": [
        {
          "id": "uuid",
          "title": "заголовок задачи",
          "brief": "Факт: что конкретно нужно сделать (пересказ описания с реальными названиями). Анализ: зачем это нужно и какова ценность для проекта. Если описание пустое — скажи это и проанализируй по названию. 3-4 предложения.",
          "currentState": "Факт: статус колонки, конкретные выполненные/невыполненные пункты чеклиста и подзадачи по именам. Анализ: что это означает — хороший прогресс, задача застряла, или работа не начата? Если подзадача — объясни место в родительском эпике. 4-6 предложений.",
          "status": "Завершена / В работе / В очереди",
          "progressDetail": "Точные числа с именами: 'Подзадачи: [✓] название1, [✓] название2, [ ] название3' или 'Чеклист \"X\": выполнены пункты A, B; не выполнен пункт C' или 'Нет чеклиста и подзадач — прогресс не отслеживается'",
          "dependencies": "Факт: родительская задача и братские подзадачи по именам. Анализ: как это влияет на работу. Или null.",
          "nextSteps": "Конкретно что осталось (из невыполненных пунктов/подзадач) + аналитика: это блокирует что-то или можно делать параллельно? Null если завершена.",
          "related": "Список подзадач по именам со статусом [✓]/[ ]. Null если нет."
        }
      ]
    }
  ],
  "totalFound": число,
  "insufficientData": true если у большинства задач нет описаний и чеклистов, иначе false
}`;

export async function searchTasks(query, tasks, totalTasksInProject = 0) {
  if (!tasks || tasks.length === 0) {
    return {
      summary: `По запросу "${query}" задачи не найдены.`,
      overallHealth: 'warning',
      groups: [],
      totalFound: 0,
      insufficientData: true,
    };
  }

  const tasksText = tasks.map(t => {
    const checklistText = (t.checklists ?? []).map(cl => {
      const done  = cl.items?.filter(i => i.isCompleted).length ?? 0;
      const total = cl.items?.length ?? 0;
      const items = (cl.items ?? []).map(i =>
        `    ${i.isCompleted ? '[✓]' : '[ ]'} "${i.title}"`
      ).join('\n');
      return `  Чеклист "${cl.title}" — выполнено ${done}/${total}:\n${items}`;
    }).join('\n');

    const subtaskText = (t.subtaskDetails ?? []).map(s => {
      const clText = (s.checklists ?? []).map(cl => ` [чеклист ${cl.done}/${cl.total}]`).join('');
      const desc = s.description ? `\n      Описание: ${s.description.slice(0, 150)}` : '';
      return `  ${s.completed ? '[✓]' : '[ ]'} "${s.title}"${clText}${desc}`;
    }).join('\n');

    const siblingsText = (t.siblings ?? []).length > 0
      ? `Другие подзадачи в эпике "${t.parentTask?.title}":\n${t.siblings.map(s =>
          `  ${s.completed ? '[✓]' : '[ ]'} "${s.title}"`).join('\n')}`
      : '';

    const deadlineStr = t.deadline?.deadline
      ? `Дедлайн: ${new Date(t.deadline.deadline).toLocaleDateString('ru-RU')}`
      : 'Дедлайн: не указан';

    return [
      `════════════════════════════`,
      `ЗАДАЧА: "${t.title}"`,
      `ID: ${t.id}`,
      `Колонка: "${t.columnTitle ?? 'неизвестно'}" | Завершена: ${t.completed ? 'ДА ✓' : 'НЕТ'}`,
      deadlineStr,
      ``,
      `ОПИСАНИЕ ЗАДАЧИ:`,
      t.description ? t.description.slice(0, 1000) : '(описание не заполнено)',
      ``,
      checklistText ? `ЧЕКЛИСТЫ:\n${checklistText}` : 'ЧЕКЛИСТЫ: нет',
      ``,
      subtaskText
        ? `ПОДЗАДАЧИ (${t.subtaskDetails.length} шт.):\n${subtaskText}`
        : 'ПОДЗАДАЧИ: нет',
      ``,
      t.parentTask
        ? `РОДИТЕЛЬСКАЯ ЗАДАЧА: "${t.parentTask.title}" (${t.parentTask.completed ? 'завершена ✓' : 'в работе'})`
        : 'РОДИТЕЛЬСКАЯ ЗАДАЧА: нет (это самостоятельная задача)',
      siblingsText ? `\n${siblingsText}` : '',
    ].filter(v => v !== null).join('\n');
  }).join('\n\n');

  const userMessage = [
    `ЗАПРОС: "${query}"`,
    `Всего задач в проекте: ${totalTasksInProject} | Найдено по запросу: ${tasks.length}`,
    ``,
    tasksText,
  ].join('\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
