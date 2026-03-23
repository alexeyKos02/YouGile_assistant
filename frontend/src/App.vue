<template>
  <div class="app">
    <header class="app-header">
      <div class="logo">⚡ YouGile AI</div>
      <p class="subtitle">Опишите задачу — ИИ сделает всё остальное</p>
    </header>

    <main class="app-main">
      <!-- Mode tabs -->
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'create' }" @click="mode = 'create'">
          ✦ Создать задачу
        </button>
        <button class="mode-tab" :class="{ active: mode === 'search' }" @click="mode = 'search'">
          ⌕ Умный поиск
        </button>
      </div>

      <!-- ====== SEARCH MODE ====== -->
      <template v-if="mode === 'search'">
        <section class="input-section">
          <div class="input-wrapper">
            <input
              v-model="searchQuery"
              class="search-input"
              placeholder="Например: МТС, выплаты, интеграция 1С..."
              @keydown.enter="handleSearch"
              :disabled="searching"
            />
          </div>
          <div class="settings-row" style="margin-top:8px">
            <div class="settings-field" style="max-width:280px">
              <label class="field-label">Фильтр по проекту (опционально)</label>
              <select class="select-input" v-model="searchProjectId" :disabled="loadingProjects">
                <option value="">— все проекты —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
              </select>
            </div>
          </div>
          <button
            class="btn btn-primary btn-generate"
            @click="handleSearch"
            :disabled="searching || !searchQuery.trim()"
          >
            <span v-if="searching" class="spinner" />
            <span>{{ searching ? 'Ищу...' : 'Найти и объяснить' }}</span>
          </button>
        </section>

        <div v-if="searchError" class="error-banner">{{ searchError }}</div>

        <transition name="slide-up">
          <section v-if="searchResult" class="result-section">
            <div class="search-result-card">
              <!-- Health + Summary -->
              <div class="search-summary" :class="`health-${searchResult.overallHealth}`">
                <span class="search-summary-icon">{{
                  searchResult.overallHealth === 'good' ? '✅' :
                  searchResult.overallHealth === 'critical' ? '🔴' : '⚠️'
                }}</span>
                <div>
                  <div class="search-health-label">{{
                    searchResult.overallHealth === 'good' ? 'Всё идёт хорошо' :
                    searchResult.overallHealth === 'critical' ? 'Есть серьёзные проблемы' : 'Есть риски'
                  }}</div>
                  <p>{{ searchResult.summary }}</p>
                </div>
              </div>

              <div v-if="searchResult.insufficientData" class="insufficient-data">
                ℹ️ Данных недостаточно для полного анализа — задачи могут не содержать описаний или комментариев
              </div>

              <!-- Groups -->
              <div v-for="group in searchResult.groups" :key="group.title" class="search-group">
                <div class="search-group-header">
                  <h3 class="search-group-title">{{ group.title }}</h3>
                  <p v-if="group.groupSummary" class="search-group-summary">{{ group.groupSummary }}</p>
                </div>

                <div v-for="t in group.tasks" :key="t.id" class="search-task-card">
                  <div class="search-task-header">
                    <span class="search-task-title">{{ t.title }}</span>
                    <span class="search-task-status" :class="statusClass(t.status)">{{ t.status }}</span>
                  </div>

                  <div class="search-task-brief">{{ t.brief }}</div>

                  <div class="search-task-grid">
                    <div v-if="t.currentState" class="search-task-field">
                      <span class="search-task-field-label">Сейчас</span>
                      <span>{{ t.currentState }}</span>
                    </div>
                    <div v-if="t.progressDetail" class="search-task-field">
                      <span class="search-task-field-label">Прогресс</span>
                      <span>{{ t.progressDetail }}</span>
                    </div>
                    <div v-if="t.nextSteps" class="search-task-field search-task-next">
                      <span class="search-task-field-label">→ Далее</span>
                      <span>{{ t.nextSteps }}</span>
                    </div>
                    <div v-if="t.dependencies" class="search-task-field search-task-blocker">
                      <span class="search-task-field-label">🔗 Зависимости</span>
                      <span>{{ t.dependencies }}</span>
                    </div>
                    <div v-if="t.related" class="search-task-field search-task-related">
                      <span class="search-task-field-label">Подзадачи</span>
                      <span>{{ t.related }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="search-footer">
                Найдено задач: {{ searchResult.totalFound }}
                <button class="btn btn-ghost" style="margin-left:12px" @click="searchResult = null">✕ Сбросить</button>
              </div>
            </div>
          </section>
        </transition>
      </template>

      <!-- ====== CREATE MODE ====== -->
      <template v-if="mode === 'create'">

      <!-- Input section -->
      <section class="input-section">
        <div class="input-wrapper">
          <textarea
            v-model="inputText"
            class="task-input"
            placeholder="мтс сертификаты прод срочно&#10;баг выплаты не работают&#10;интеграция с 1с по гуиду"
            rows="3"
            @keydown.ctrl.enter="handleGenerate"
            @keydown.meta.enter="handleGenerate"
            :disabled="loading"
          />
          <span class="input-hint">Ctrl+Enter для генерации</span>
        </div>

        <button
          class="btn btn-primary btn-generate"
          @click="handleGenerate"
          :disabled="loading || !inputText.trim()"
        >
          <span v-if="loading" class="spinner" />
          <span>{{ loading ? 'Генерирую...' : 'Сгенерировать задачу' }}</span>
        </button>
      </section>

      <!-- YouGile settings -->
      <section class="yougile-settings">
        <div class="settings-row">
          <!-- Project -->
          <div class="settings-field">
            <label class="field-label">Проект</label>
            <select
              class="select-input"
              v-model="selectedProjectId"
              @change="onProjectChange"
              :disabled="loadingProjects"
            >
              <option value="">{{ loadingProjects ? 'Загрузка...' : '— выберите проект —' }}</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </div>

          <!-- Board -->
          <div class="settings-field">
            <label class="field-label">Доска</label>
            <select
              class="select-input"
              v-model="selectedBoardId"
              @change="onBoardChange"
              :disabled="!selectedProjectId || loadingBoards"
            >
              <option value="">{{ loadingBoards ? 'Загрузка...' : '— выберите доску —' }}</option>
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
            </select>
          </div>

          <!-- Column -->
          <div class="settings-field">
            <label class="field-label">Колонка</label>
            <select
              class="select-input"
              v-model="selectedColumnId"
              :disabled="!selectedBoardId || loadingColumns"
            >
              <option value="">{{ loadingColumns ? 'Загрузка...' : '— выберите колонку —' }}</option>
              <option v-for="c in columns" :key="c.id" :value="c.id">{{ c.title ?? c.name }}</option>
            </select>
          </div>

          <!-- Assignee -->
          <div class="settings-field">
            <label class="field-label">Исполнитель</label>
            <select
              class="select-input"
              v-model="selectedAssigneeId"
              :disabled="loadingUsers"
            >
              <option value="">{{ loadingUsers ? 'Загрузка...' : '— без исполнителя —' }}</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ userLabel(u) }}</option>
            </select>
          </div>
        </div>
        <div v-if="settingsError" class="settings-error">⚠️ {{ settingsError }}</div>
      </section>

      <!-- Error -->
      <div v-if="error" class="error-banner">
        {{ error }}
      </div>

      <!-- Result section -->
      <transition name="slide-up">
        <section v-if="task" class="result-section">
          <div class="result-card">
            <!-- Badges -->
            <div class="badges">
              <select class="badge-select" :class="`badge-priority-${task.priority}`" v-model="task.priority">
                <option value="low">↓ Низкий</option>
                <option value="medium">→ Средний</option>
                <option value="high">↑ Высокий</option>
                <option value="critical">🔥 Критический</option>
              </select>
              <select class="badge-select badge-type-select" v-model="task.type">
                <option value="task">📋 Задача</option>
                <option value="bug">🐛 Баг</option>
                <option value="feature">✨ Фича</option>
                <option value="integration">🔌 Интеграция</option>
                <option value="improvement">🔧 Доработка</option>
              </select>
              <span v-if="task.project" class="badge badge-project">{{ task.project }}</span>
              <span v-for="label in task.labels" :key="label" class="badge badge-label">{{ label }}</span>
            </div>

            <!-- Title -->
            <div class="field">
              <label class="field-label">Заголовок</label>
              <input
                class="field-value title-value"
                v-model="task.title"
              />
            </div>

            <!-- Description -->
            <div class="field">
              <label class="field-label">Описание</label>
              <textarea
                class="field-value desc-value"
                v-model="task.description"
                rows="4"
              /></div>

            <!-- Checklist -->
            <div v-if="task.checklist?.length" class="field">
              <label class="field-label">Чек-лист</label>
              <ul class="checklist">
                <li v-for="(_item, i) in task.checklist" :key="i" class="checklist-item">
                  <span class="check-box">☐</span>
                  <input
                    class="checklist-input"
                    v-model="task.checklist[i]"
                  />
                </li>
              </ul>
            </div>

            <!-- Priority sticker -->
            <div v-if="prioritySticker" class="field field-inline">
              <label class="field-label">Стикер «{{ prioritySticker.name }}»</label>
              <select class="select-input select-inline" v-model="selectedPriorityStickerStateId">
                <option value="">— не выставлять —</option>
                <option v-for="s in prioritySticker.states" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <!-- Deadline -->
            <div class="field field-inline">
              <label class="field-label">Дедлайн</label>
              <input
                type="date"
                class="date-input"
                v-model="task.deadline"
              />
            </div>

            <!-- Actions -->
            <div class="actions">
              <button
                class="btn btn-primary"
                @click="handleCreate"
                :disabled="creating || !selectedColumnId"
                :title="!selectedColumnId ? 'Выберите проект и колонку' : ''"
              >
                <span v-if="creating" class="spinner" />
                {{ creating ? 'Создаю...' : '✓ Создать задачу в YouGile' }}
              </button>

              <button class="btn btn-secondary" @click="handleCopy">
                {{ copied ? '✓ Скопировано!' : '⎘ Скопировать' }}
              </button>

              <button class="btn btn-ghost" @click="reset">
                ✕ Сбросить
              </button>
            </div>

            <!-- Create success -->
            <div v-if="createSuccess" class="success-banner">
              ✓ Задача создана в YouGile! ID: {{ createSuccess }}
            </div>
          </div>
        </section>
      </transition>
      </template><!-- end create mode -->

    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { GeneratedTask, YouGileProject, YouGileBoard, YouGileColumn, YouGileUser, YouGileSticker, SearchResult } from './types';
import { generateTask, createTask, getProjects, getBoards, getColumns, getUsers, getStickers, searchTasks } from './api';

// Mode
const mode = ref<'create' | 'search'>('create');

// Search
const searchQuery = ref('');
const searchProjectId = ref('');
const searching = ref(false);
const searchError = ref('');
const searchResult = ref<SearchResult | null>(null);

async function handleSearch() {
  if (!searchQuery.value.trim() || searching.value) return;
  searching.value = true;
  searchError.value = '';
  searchResult.value = null;
  try {
    searchResult.value = await searchTasks(searchQuery.value.trim(), searchProjectId.value || undefined);
  } catch (e: unknown) {
    searchError.value = e instanceof Error ? e.message : 'Ошибка поиска';
  } finally {
    searching.value = false;
  }
}

function statusClass(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('завершен') || s.includes('готов')) return 'status-done';
  if (s.includes('блокир')) return 'status-blocked';
  if (s.includes('работ')) return 'status-active';
  return 'status-default';
}

const inputText = ref('');
const task = ref<GeneratedTask | null>(null);
const loading = ref(false);
const creating = ref(false);
const error = ref('');
const copied = ref(false);
const createSuccess = ref('');

// YouGile selectors
const projects = ref<YouGileProject[]>([]);
const boards = ref<YouGileBoard[]>([]);
const columns = ref<YouGileColumn[]>([]);
const users = ref<YouGileUser[]>([]);
const selectedProjectId = ref('');
const selectedBoardId = ref('');
const selectedColumnId = ref('');
const selectedAssigneeId = ref('');
const loadingProjects = ref(false);
const loadingBoards = ref(false);
const loadingColumns = ref(false);
const loadingUsers = ref(false);
const settingsError = ref('');
const prioritySticker = ref<YouGileSticker | null>(null);
const selectedPriorityStickerStateId = ref('');

onMounted(async () => {
  await Promise.all([loadProjects(), loadUsers()]);
});

async function loadProjects() {
  loadingProjects.value = true;
  settingsError.value = '';
  try {
    projects.value = await getProjects();
  } catch (e) {
    settingsError.value = 'Не удалось загрузить проекты. Проверьте YOUGILE_API_KEY.';
  } finally {
    loadingProjects.value = false;
  }
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    users.value = await getUsers();
  } catch {
    // silently fail — users are optional
  } finally {
    loadingUsers.value = false;
  }
}

async function onProjectChange() {
  selectedBoardId.value = '';
  selectedColumnId.value = '';
  boards.value = [];
  columns.value = [];
  if (!selectedProjectId.value) return;

  loadingBoards.value = true;
  try {
    boards.value = await getBoards(selectedProjectId.value);
  } catch (e) {
    settingsError.value = 'Не удалось загрузить доски проекта.';
  } finally {
    loadingBoards.value = false;
  }
}

async function onBoardChange() {
  selectedColumnId.value = '';
  columns.value = [];
  prioritySticker.value = null;
  if (!selectedBoardId.value) return;

  loadingColumns.value = true;
  try {
    const [cols, stickers] = await Promise.all([
      getColumns(selectedBoardId.value),
      getStickers(selectedBoardId.value),
    ]);
    columns.value = cols;
    prioritySticker.value = stickers.find(s => s.name === 'Приоритет') ?? null;
    selectedPriorityStickerStateId.value = '';
  } catch (e) {
    settingsError.value = 'Не удалось загрузить колонки доски.';
  } finally {
    loadingColumns.value = false;
  }
}

async function handleGenerate() {
  if (!inputText.value.trim() || loading.value) return;
  error.value = '';
  createSuccess.value = '';
  loading.value = true;
  task.value = null;
  try {
    task.value = await generateTask(inputText.value.trim());
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Ошибка генерации';
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  if (!task.value || creating.value) return;
  creating.value = true;
  error.value = '';
  try {
    const stickers: Record<string, string> = {};
    if (prioritySticker.value && selectedPriorityStickerStateId.value) {
      stickers[prioritySticker.value.id] = selectedPriorityStickerStateId.value;
    }
    const taskToCreate = {
      ...task.value,
      columnId: selectedColumnId.value || undefined,
      assigneeId: selectedAssigneeId.value || undefined,
      stickers: Object.keys(stickers).length ? stickers : undefined,
    };
    const result = await createTask(taskToCreate);
    createSuccess.value = result.id ?? 'создана';
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Ошибка создания задачи';
  } finally {
    creating.value = false;
  }
}

function handleCopy() {
  if (!task.value) return;
  const text = buildCopyText(task.value);
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  });
}

function buildCopyText(t: GeneratedTask): string {
  const lines = [
    `# ${t.title}`,
    '',
    t.description,
    '',
    ...(t.checklist?.length ? ['**Чек-лист:**', ...t.checklist.map(i => `- [ ] ${i}`), ''] : []),
    `Приоритет: ${priorityLabel(t.priority)}`,
    `Тип: ${typeLabel(t.type)}`,
    `Дедлайн: ${t.deadline}`,
  ];
  return lines.join('\n');
}

function reset() {
  task.value = null;
  error.value = '';
  createSuccess.value = '';
  inputText.value = '';
}

function priorityLabel(p: string) {
  const map: Record<string, string> = {
    low: '↓ Низкий',
    medium: '→ Средний',
    high: '↑ Высокий',
    critical: '🔥 Критический',
  };
  return map[p] ?? p;
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    bug: '🐛 Баг',
    feature: '✨ Фича',
    integration: '🔌 Интеграция',
    task: '📋 Задача',
    improvement: '🔧 Доработка',
  };
  return map[t] ?? t;
}

function userLabel(u: YouGileUser): string {
  if (u.name) return u.name;
  if (u.firstName || u.lastName) return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return u.email;
}
</script>
