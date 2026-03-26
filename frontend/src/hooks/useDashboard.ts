import { useEffect, useMemo, useState } from "react";

import { createLocation, deleteLocation, fetchLocations } from "../api/locations";
import {
  createReport,
  exportReports,
  fetchReports,
} from "../api/reports";
import type { Location } from "../api/locations";
import type { Report } from "../api/reports";
import type { User } from "../api/users";
import { getTodayString } from "../api/helpers";
import { addUser, addUsersFromExcel, fetchUsers } from "../api/users";
import {
  DEFAULT_LOCATION_OPTIONS,
  uniqueLocations,
} from "../constants/locations";
import type { PersonRow, QuickUpdatePatch } from "../types/personTable";
import { buildAvailableDates, normalizeLocationName } from "../utils/reportDates";
import {
  getLatestReportForUser,
  mapDailyStatusToReportStatus,
  mapReportStatusToDailyStatus,
} from "../utils/reportMapping";
import { triggerFileDownload } from "../utils/triggerFileDownload";
import { getErrorMessage } from "../utils/errors";

export function useDashboard() {
  const todayString = getTodayString();
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [availableDates, setAvailableDates] = useState<string[]>([todayString]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newLocationName, setNewLocationName] = useState("");
  const [locationToDelete, setLocationToDelete] = useState("");
  const [downloadFromDate, setDownloadFromDate] = useState(todayString);
  const [downloadToDate, setDownloadToDate] = useState(todayString);
  const isReadOnly = selectedDate !== todayString;
  const homeLocation = DEFAULT_LOCATION_OPTIONS[0];

  const locationOptions = useMemo(() => {
    const apiLocationNames = locations.map((location) => location.name);
    const fallbackLocations =
      apiLocationNames.length > 0 ? apiLocationNames : DEFAULT_LOCATION_OPTIONS;

    return uniqueLocations(fallbackLocations);
  }, [locations]);

  const locationIdByName = useMemo(
    () =>
      new Map(
        locations
          .filter((location) => location?.name)
          .map((location) => [location.name, Number(location.id)])
      ),
    [locations]
  );

  const locationNameById = useMemo(
    () =>
      new Map(
        locations.map((location) => [
          Number(location.id),
          String(location.name || ""),
        ])
      ),
    [locations]
  );

  const deletableLocationOptions = useMemo(
    () => locationOptions.filter((location) => location !== homeLocation),
    [locationOptions, homeLocation]
  );

  const people = useMemo((): PersonRow[] => {
    return users.map((user) => {
      const latestReport = getLatestReportForUser(reports, user.id);
      const location =
        locationNameById.get(Number(latestReport?.locationId)) ||
        (latestReport ? String(latestReport.locationId) : "");

      return {
        person_id: String(user.id),
        full_name: String(user.fullName || ""),
        location,
        daily_status: mapReportStatusToDailyStatus(latestReport?.isStatusOk),
        phone: user.phone ? String(user.phone) : "",
        last_updated: latestReport?.occurredAt || "",
      };
    });
  }, [locationNameById, reports, users]);

  const filteredPeople = useMemo(() => {
    return people
      .filter((person) => {
        const fullName = String(person?.full_name || "");
        const location = String(person?.location || "");
        const dailyStatus = String(person?.daily_status || "");

        if (
          searchTerm &&
          !fullName.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }

        if (locationFilter !== "all" && location !== locationFilter) {
          return false;
        }

        if (statusFilter !== "all" && dailyStatus !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        String(a?.full_name || "").localeCompare(String(b?.full_name || ""), "he")
      );
  }, [locationFilter, people, searchTerm, statusFilter]);

  const canLoadSelectedDate = Boolean(selectedDate) && !loading;
  const canDownloadSelectedDate =
    Boolean(selectedDate) && !loading && !actionLoading;
  const canAddLocation = !actionLoading;
  const canChooseLocationToDelete =
    deletableLocationOptions.length > 0 && !actionLoading;
  const canDeleteLocation =
    !actionLoading &&
    deletableLocationOptions.length > 0 &&
    Boolean(locationToDelete);

  useEffect(() => {
    void loadDashboard(todayString);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (deletableLocationOptions.length === 0) {
      setLocationToDelete("");
      return;
    }

    if (!deletableLocationOptions.includes(locationToDelete)) {
      setLocationToDelete(deletableLocationOptions[0]);
    }
  }, [deletableLocationOptions, locationToDelete]);

  async function loadDashboard(dateValue: string) {
    setLoading(true);
    setError("");

    try {
      const [
        usersResponse,
        locationsResponse,
        allReportsResponse,
        dateReportsResponse,
      ] = await Promise.all([
        fetchUsers(),
        fetchLocations(),
        fetchReports(),
        fetchReports({ date: dateValue }),
      ]);

      const safeUsers = Array.isArray(usersResponse) ? usersResponse : [];
      const safeLocations = Array.isArray(locationsResponse)
        ? locationsResponse
        : [];
      const safeAllReports = Array.isArray(allReportsResponse)
        ? allReportsResponse
        : [];
      const safeDateReports = Array.isArray(dateReportsResponse)
        ? dateReportsResponse
        : [];

      setUsers(safeUsers);
      setLocations(safeLocations);
      setReports(safeDateReports);
      setSelectedDate(dateValue);
      setAvailableDates(buildAvailableDates(safeAllReports, todayString, dateValue));
    } catch (err) {
      setUsers([]);
      setLocations([]);
      setReports([]);
      setAvailableDates([todayString]);
      setError(getErrorMessage(err, "טעינת הנתונים נכשלה"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSelectedDate(dateValue: string) {
    if (!dateValue) {
      setError("יש לבחור תאריך לטעינה");
      return;
    }

    await loadDashboard(dateValue);
  }

  async function handleDownloadDayFile() {
    if (!selectedDate) {
      setError("יש לבחור תאריך להורדה");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const { url, filename } = exportReports(
        { date: selectedDate },
        `reports_${selectedDate}.xlsx`
      );
      triggerFileDownload(url, filename);
    } catch (err) {
      setError(getErrorMessage(err, "הורדת דוח היום נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadRangeFiles() {
    if (!downloadFromDate || !downloadToDate) {
      setError("יש לבחור טווח תאריכים מלא");
      return;
    }

    if (downloadFromDate > downloadToDate) {
      setError("תאריך התחלה חייב להיות קטן או שווה לתאריך סיום");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const { url, filename } = exportReports(
        {
          minDate: `${downloadFromDate}T00:00:00.000Z`,
          maxDate: `${downloadToDate}T23:59:59.999Z`,
        },
        `reports_${downloadFromDate}_to_${downloadToDate}.xlsx`
      );
      triggerFileDownload(url, filename);
    } catch (err) {
      setError(getErrorMessage(err, "הורדת דוחות הטווח נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleQuickUpdate(personId: string, patch: QuickUpdatePatch) {
    if (isReadOnly) {
      setError("עדכון דוחות זמין רק לתאריך של היום");
      return;
    }

    const currentPerson = people.find((person) => person.person_id === personId);
    if (!currentPerson) {
      setError("לא נמצא משתמש לעדכון");
      return;
    }

    const fallbackLocationName =
      locations[0]?.name || currentPerson.location || locationOptions[0] || "";
    const targetLocationName = patch.location || fallbackLocationName;
    const targetLocationId = locationIdByName.get(targetLocationName);
    if (!targetLocationId) {
      setError("לא נמצא מיקום תקין עבור העדכון");
      return;
    }

    const nextStatus = patch.daily_status || currentPerson.daily_status;
    const isStatusOk = mapDailyStatusToReportStatus(nextStatus);
    const payload = {
      userId: Number(personId),
      locationId: targetLocationId,
      occurredAt: new Date().toISOString(),
      source: "ui" as const,
      isStatusOk,
    };

    setActionLoading(true);
    setError("");

    try {
      await createReport(payload);
      await loadDashboard(todayString);
    } catch (err) {
      setError(getErrorMessage(err, "יצירת הדוח נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddLocation() {
    const normalized = normalizeLocationName(newLocationName);
    if (!normalized) {
      setError("יש להזין שם מיקום לפני הוספה");
      return;
    }

    if (locationOptions.includes(normalized)) {
      setError("המיקום כבר קיים ברשימה");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      await createLocation(normalized);
      setNewLocationName("");
      await loadDashboard(selectedDate);
    } catch (err) {
      setError(getErrorMessage(err, "הוספת מיקום נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddUser(payload: {
    fullName: string;
    phone: string;
  }): Promise<boolean> {
    const fullName = payload.fullName.trim();
    const phone = payload.phone.trim();
    if (!fullName || !phone) {
      setError("יש למלא שם מלא וטלפון");
      return false;
    }

    setActionLoading(true);
    setError("");

    try {
      await addUser({ fullName, phone });
      await loadDashboard(selectedDate);
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "הוספת משתמש נכשלה"));
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUsersExcelImport(file: File): Promise<boolean> {
    setActionLoading(true);
    setError("");

    try {
      await addUsersFromExcel(file);
      await loadDashboard(selectedDate);
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "ייבוא משתמשים מאקסל נכשל"));
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteLocation() {
    const normalized = normalizeLocationName(locationToDelete);
    if (!normalized) {
      setError("יש לבחור מיקום למחיקה");
      return;
    }

    const location = locations.find((item) => item.name === normalized);
    if (!location) {
      setError("לא נמצא מזהה למיקום שנבחר");
      return;
    }

    const approved = window.confirm(`למחוק את המיקום "${normalized}"?`);
    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      await deleteLocation(location.id);
      setLocationToDelete("");
      if (locationFilter === normalized) {
        setLocationFilter("all");
      }
      await loadDashboard(selectedDate);
    } catch (err) {
      setError(getErrorMessage(err, "מחיקת מיקום נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  return {
    todayString,
    selectedDate,
    setSelectedDate,
    availableDates,
    loading,
    actionLoading,
    error,
    searchTerm,
    setSearchTerm,
    locationFilter,
    setLocationFilter,
    statusFilter,
    setStatusFilter,
    newLocationName,
    setNewLocationName,
    locationToDelete,
    setLocationToDelete,
    downloadFromDate,
    setDownloadFromDate,
    downloadToDate,
    setDownloadToDate,
    isReadOnly,
    locationOptions,
    deletableLocationOptions,
    filteredPeople,
    canLoadSelectedDate,
    canDownloadSelectedDate,
    canAddLocation,
    canChooseLocationToDelete,
    canDeleteLocation,
    handleLoadSelectedDate,
    handleDownloadDayFile,
    handleDownloadRangeFiles,
    handleQuickUpdate,
    handleAddLocation,
    handleDeleteLocation,
    handleAddUser,
    handleUsersExcelImport,
  };
}
