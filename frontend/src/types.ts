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
  columnId?: string;
  assigneeId?: string;
}

export interface CreateResult {
  id: string;
  [key: string]: unknown;
}

export interface YouGileProject {
  id: string;
  title: string;
}

export interface YouGileBoard {
  id: string;
  title: string;
}

export interface YouGileColumn {
  id: string;
  title: string;
  name?: string;
}

export interface YouGileUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}
