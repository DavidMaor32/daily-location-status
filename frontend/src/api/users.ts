import axios from "axios";

import { apiRequest, buildApiUrl } from "./base";
import { getApiErrorMessage } from "./errors";

export type User = {
  id: number;
  fullName: string;
  phone?: string;
};

export type AddUserPayload = {
  fullName: string;
  phone: string;
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

export const addUser = (payload: AddUserPayload) =>
  apiRequest<User>("/users", {
    method: "POST",
    data: payload,
  });

export const addUsersFromExcel = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await axios.post<{ count?: number }>(
      buildApiUrl("/users/excel"),
      formData
    );
    return response.data ?? {};
  } catch (error) {
    throw new Error(getApiErrorMessage(error));
  }
};
