export interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: string;
  autoRules?: string;
  parentId?: string | null;
}

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
