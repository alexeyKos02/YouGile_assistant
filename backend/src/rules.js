// Rule engine: extract hints from raw user input before sending to LLM
export function applyRules(text) {
  const lower = text.toLowerCase();
  const hints = {
    priority: null,
    type: null,
    project: null,
    deadlineDays: 2, // default +2 days
    labels: [],
  };

  // Priority rules
  if (/срочно|urgent|asap|критично|горит/.test(lower)) {
    hints.priority = 'high';
    hints.labels.push('срочно');
  }

  // Type rules
  if (/баг|bug|ошибка|error|не работает|сломалось|broken/.test(lower)) {
    hints.type = 'bug';
    hints.priority = hints.priority ?? 'high';
  } else if (/интеграц|integration|api|апи/.test(lower)) {
    hints.type = 'integration';
  } else if (/доработк|улучшени|refactor|рефактор|feature|фича/.test(lower)) {
    hints.type = 'feature';
  }

  // Project rules
  if (/мтс|mts/.test(lower)) {
    hints.project = 'МТС';
  } else if (/сбер|sber/.test(lower)) {
    hints.project = 'Сбер';
  } else if (/1с|1c/.test(lower)) {
    hints.project = '1С';
  }

  // Deadline rules
  if (/сегодня|today/.test(lower)) hints.deadlineDays = 0;
  else if (/завтра|tomorrow/.test(lower)) hints.deadlineDays = 1;
  else if (/неделя|week/.test(lower)) hints.deadlineDays = 7;

  // Default priority
  hints.priority = hints.priority ?? 'medium';

  return hints;
}

export function computeDeadline(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}
