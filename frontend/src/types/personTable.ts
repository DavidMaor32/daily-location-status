/** Row shape for the main people table (users + latest report for selected date). */
export type PersonRow = {
  person_id: string;
  full_name: string;
  location: string;
  daily_status: string;
  phone?: string;
  last_updated?: string;
};

export type QuickUpdatePatch = {
  location?: string;
  daily_status?: string;
};
