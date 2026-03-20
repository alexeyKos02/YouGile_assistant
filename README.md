# YouGile AI Assistant

AI-ассистент для создания задач в YouGile по кратким описаниям.

## Что умеет

- Принимает короткий текст: `"мтс сертификаты прод срочно"`
- Через OpenAI разворачивает в полноценную задачу с заголовком, описанием, чек-листом
- Применяет rule engine (приоритет, тип, проект, дедлайн)
- Создаёт задачу в YouGile одной кнопкой

## Быстрый старт

### 1. Клонировать и установить зависимости

```bash
git clone <repo>
cd yougile-ai-assistant

# Установить зависимости бэкенда
cd backend && npm install && cd ..

# Установить зависимости фронтенда
cd frontend && npm install && cd ..
```

### 2. Настроить окружение

```bash
cp backend/.env.example backend/.env
```

Заполнить `backend/.env`:

```env
OPENAI_API_KEY=sk-...          # Ключ OpenAI
OPENAI_MODEL=gpt-4o-mini       # Модель (gpt-4o для лучшего качества)

YOUGILE_API_KEY=...            # API ключ YouGile
YOUGILE_PROJECT_ID=...         # ID проекта YouGile
YOUGILE_COLUMN_ID=...          # ID колонки (спринта) для новых задач
```

#### Как получить YouGile API key

1. Открыть YouGile → Настройки компании → API
2. Сгенерировать ключ
3. Скопировать в `.env`

#### Как найти PROJECT_ID и COLUMN_ID

```bash
# Получить список проектов
curl -H "Authorization: Bearer YOUR_KEY" https://ru.yougile.com/api-v2/projects

# Получить список спринтов/колонок проекта
curl -H "Authorization: Bearer YOUR_KEY" https://ru.yougile.com/api-v2/projects/PROJECT_ID/sprints
```

### 3. Запустить

**Бэкенд:**
```bash
cd backend && npm run dev
# Запустится на http://localhost:3001
```

**Фронтенд:**
```bash
cd frontend && npm run dev
# Запустится на http://localhost:5173
```

Или оба одновременно из корня:
```bash
npm install  # установит concurrently
npm run dev
```

## Структура проекта

```
├── backend/
│   ├── src/
│   │   ├── index.js      # Express сервер, маршруты
│   │   ├── llm.js        # Интеграция с OpenAI
│   │   ├── rules.js      # Rule engine
│   │   └── yougile.js    # Интеграция с YouGile API
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.vue       # Главный компонент
│   │   ├── api.ts        # HTTP клиент
│   │   ├── types.ts      # TypeScript типы
│   │   ├── style.css     # Стили
│   │   └── main.ts
│   └── package.json
└── README.md
```

## API бэкенда

### `POST /api/generate`

Генерирует задачу по краткому описанию.

```json
// Request
{ "text": "мтс сертификаты прод срочно" }

// Response
{
  "title": "Прописка сертификатов для PROD (МТС)",
  "description": "Необходимо выполнить прописку сертификатов...",
  "checklist": ["Проверить текущие сертификаты", "Обновить сертификаты", "..."],
  "priority": "high",
  "type": "integration",
  "deadline": "2026-03-22",
  "project": "МТС",
  "labels": ["срочно"]
}
```

### `POST /api/create`

Создаёт задачу в YouGile.

```json
// Request — тело из /api/generate
{
  "title": "...",
  "description": "...",
  "checklist": ["..."],
  "priority": "high",
  "deadline": "2026-03-22"
}

// Response — ответ YouGile API
{ "id": "task-id", ... }
```

## Rule Engine

Правила применяются к тексту **до** отправки в LLM:

| Условие | Действие |
|---------|----------|
| `срочно / urgent / горит` | priority = high, label = срочно |
| `баг / bug / не работает` | type = bug, priority = high |
| `интеграция / integration / api` | type = integration |
| `мтс / mts` | project = МТС |
| `сбер / sber` | project = Сбер |
| `1с / 1c` | project = 1С |
| `сегодня` | deadline = сегодня |
| `завтра` | deadline = завтра |
| без дедлайна | deadline = +2 дня |

## Редактирование перед созданием

Все поля результата (заголовок, описание, чек-лист) можно редактировать прямо в браузере — они `contenteditable`. Дата меняется через date picker.

## Технологии

- **Frontend**: Vue 3 + TypeScript + Vite
- **Backend**: Node.js + Express
- **AI**: OpenAI GPT-4o-mini (настраивается)
- **API**: YouGile REST API v2
