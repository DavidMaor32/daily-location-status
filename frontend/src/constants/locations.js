// Default locations used when locations Excel file is created.
const HOME_LOCATION = "בבית";
const LOCATION_1 = "מיקום 1";
const LOCATION_2 = "מיקום 2";
const LOCATION_3 = "מיקום 3";
const LOCATION_4 = "מיקום 4";
const LOCATION_5 = "מיקום 5";

export const DEFAULT_LOCATION_OPTIONS = [
  HOME_LOCATION,
  LOCATION_1,
  LOCATION_2,
  LOCATION_3,
  LOCATION_4,
  LOCATION_5,
];

// Color mapping for known locations.
export const LOCATION_CLASS_BY_VALUE = {
  [HOME_LOCATION]: "chip-home",
  [LOCATION_1]: "chip-location-1",
  [LOCATION_2]: "chip-location-2",
  [LOCATION_3]: "chip-location-3",
  [LOCATION_4]: "chip-location-4",
  [LOCATION_5]: "chip-location-5",
};

// Trim and normalize location text before sending to backend.
export function normalizeLocationName(rawName) {
  return (rawName || "").trim();
}

// Remove duplicates while preserving insertion order.
export function uniqueLocations(locations) {
  const seen = new Set();
  const output = [];

  locations.forEach((location) => {
    const normalized = normalizeLocationName(location);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push(normalized);
  });

  return output;
}

// Resolve chip class by location with fallback for custom locations.
export function getLocationChipClass(location) {
  return LOCATION_CLASS_BY_VALUE[location] || "chip-custom-location";
}
