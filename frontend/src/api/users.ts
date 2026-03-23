import { apiRequest } from "./base";

export type User = {
  id: number;
  fullName: string;
  phone?: string;
};

export type UpdateUserPayload = {
  id: number;
  fullName?: string;
  phone?: string;
};

export const fetchUsers = () => apiRequest<User[]>("/users");

export const fetchUserById = (userId: number) =>
  apiRequest<User>(`/users/${userId}`);

export const updateUser = (userId: number, payload: UpdateUserPayload) =>
  apiRequest(`/users/${userId}`, {
    method: "PATCH",
    data: payload,
  });
