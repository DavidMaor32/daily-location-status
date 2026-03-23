import { apiRequest } from "./base";

export type Location = {
  id: number;
  name: string;
};

export const fetchLocations = () => apiRequest<Location[]>("/api/locations");

export const fetchLocationById = (locationId: number) =>
  apiRequest<Location>(`/api/locations/${locationId}`);

export const createLocation = (name: string) =>
  apiRequest<Location>("/api/locations", {
    method: "POST",
    data: { name },
  });

export const deleteLocation = (locationId: number) =>
  apiRequest(`/api/locations/${locationId}`, {
    method: "DELETE",
  });
