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
              <div
                class="field-value title-value"
                contenteditable="true"
                @blur="(e) => task && (task.title = (e.target as HTMLElement).innerText)"
              >{{ task.title }}</div>
            </div>

            <!-- Description -->
            <div class="field">
              <label class="field-label">Описание</label>
              <div
                class="field-value desc-value"
                contenteditable="true"
                @blur="(e) => task && (task.description = (e.target as HTMLElement).innerText)"
              >{{ task.description }}</div>
            </div>

            <!-- Checklist -->
            <div v-if="task.checklist?.length" class="field">
              <label class="field-label">Чек-лист</label>
              <ul class="checklist">
                <li v-for="(item, i) in task.checklist" :key="i" class="checklist-item">
                  <span class="check-box">☐</span>
                  <span
                    contenteditable="true"
                    @blur="(e) => task && (task.checklist[i] = (e.target as HTMLElement).innerText)"
                  >{{ item }}</span>
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
                :disabled="creating"
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
import { ref } from 'vue';
import type { GeneratedTask } from './types';
import { generateTask, createTask } from './api';

const inputText = ref('');
const task = ref<GeneratedTask | null>(null);
const loading = ref(false);
const creating = ref(false);
const error = ref('');
const copied = ref(false);
const createSuccess = ref('');

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
    const result = await createTask(task.value);
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
</script>
