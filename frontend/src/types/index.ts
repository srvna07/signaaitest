export enum Role {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  RUNNER = 'RUNNER',
  VIEWER = 'VIEWER',
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
}

export interface Environment {
  id: string;
  name: string;
  baseUrl: string;
  variables: Record<string, string>;
  createdAt: string;
  creator?: Partial<User>;
  requiresLogin: boolean;
  loginPath?: string | null;
  loginUsernameSecret?: string | null;
  loginPasswordSecret?: string | null;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  coverage: number;
  creator?: Partial<User>;
}

export interface TestCaseStep {
  order: number;
  action: string;
  expected?: string;
}

export interface TestCase {
  id: string;
  title: string;
  type: 'UI' | 'API';
  steps: TestCaseStep[];
  preconditions?: string | null;
  expectedResult: string;
  requirementId?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: Partial<User>;
  requirement?: { id: string; title: string } | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
