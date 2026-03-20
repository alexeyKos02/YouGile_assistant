export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType = 'bug' | 'feature' | 'integration' | 'task' | 'improvement';

export interface GeneratedTask {
  title: string;
  description: string;
  checklist: string[];
  priority: Priority;
  type: TaskType;
  deadline: string;
  project: string | null;
  labels: string[];
}

export interface CreateResult {
  id: string;
  [key: string]: unknown;
}
