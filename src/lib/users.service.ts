import { apiFetch } from './api';
import type { ManagedUser, Role } from '@/types';

export const listUsers = () => apiFetch<ManagedUser[]>('/users');

export const createUser = (payload: {
  name: string;
  email: string;
  password: string;
  role: Role;
  can_view_sensitive: boolean;
}) => apiFetch<ManagedUser>('/users', { method: 'POST', body: JSON.stringify(payload) });

export const updateUser = (
  id: string,
  payload: Partial<{
    name: string;
    role: Role;
    status: 'ATIVO' | 'INATIVO';
    can_view_sensitive: boolean;
    password: string;
  }>,
) => apiFetch<ManagedUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
