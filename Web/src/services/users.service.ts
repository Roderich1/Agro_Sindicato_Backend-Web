import { api } from '../lib/axios';
import type {
  AdminUser,
  CreateUserPayload,
  UpdateUserPayload,
} from '../types/users';

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<AdminUser[]>('/users');
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>('/users', payload);
  return data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}`, payload);
  return data;
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await api.patch(`/users/${id}/password`, { password });
}

export async function deactivateUser(id: string): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}/deactivate`);
  return data;
}
