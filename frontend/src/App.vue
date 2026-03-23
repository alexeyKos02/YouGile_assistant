<template>
  <div class="app">
    <header class="app-header">
      <div class="logo">⚡ YouGile AI</div>
      <p class="subtitle">Опишите задачу — ИИ сделает всё остальное</p>
    </header>

    <main class="app-main">
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
              <span class="badge" :class="`badge-priority-${task.priority}`">
                {{ priorityLabel(task.priority) }}
              </span>
              <span class="badge badge-type">{{ typeLabel(task.type) }}</span>
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
                <li v-for="(item, i) in task.checklist" :key="i" class="checklist-item">
                  <span class="check-box">☐</span>
                  <input
                    class="checklist-input"
                    v-model="task.checklist[i]"
                  />
                </li>
              </ul>
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { GeneratedTask, YouGileProject, YouGileBoard, YouGileColumn, YouGileUser } from './types';
import { generateTask, createTask, getProjects, getBoards, getColumns, getUsers } from './api';

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
  if (!selectedBoardId.value) return;

  loadingColumns.value = true;
  try {
    columns.value = await getColumns(selectedBoardId.value);
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
    const taskToCreate = {
      ...task.value,
      columnId: selectedColumnId.value || undefined,
      assigneeId: selectedAssigneeId.value || undefined,
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
