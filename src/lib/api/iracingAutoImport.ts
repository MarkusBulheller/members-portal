import { api } from '../api';
import type {
  AutoImportAttempt,
  AutoImportAttemptImportResult,
  AutoImportAttemptStatus,
  AutoImportRunResult,
  AutoImportSettings,
  UpdateAutoImportSettingsInput,
} from '../../types/iracingAutoImport';

export const iracingAutoImportApi = {
  get: () => api.get<AutoImportSettings>('/iracing/auto-import'),
  update: (input: UpdateAutoImportSettingsInput) => api.patch<AutoImportSettings>('/iracing/auto-import', input),
  runNow: () => api.post<AutoImportRunResult>('/iracing/auto-import/run'),
  listAttempts: (status: AutoImportAttemptStatus, limit = 50) =>
    api.get<AutoImportAttempt[]>(`/iracing/auto-import/attempts?status=${status}&limit=${limit}`),
  importAttempt: (id: string) =>
    api.post<AutoImportAttemptImportResult>(`/iracing/auto-import/attempts/${id}/import`),
  ignoreAttempt: (id: string) => api.post<AutoImportAttempt>(`/iracing/auto-import/attempts/${id}/ignore`),
};
