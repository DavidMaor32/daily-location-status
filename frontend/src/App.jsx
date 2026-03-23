import { useEffect, useMemo, useState } from "react";

import { createLocation, deleteLocation, fetchLocations } from "./api/locations.ts";
import {
  createReport,
  exportReports,
  fetchReports,
} from "./api/reports.ts";
import { getTodayString } from "./api/helpers.ts";
import { fetchUsers } from "./api/users.ts";
import AppToolbar from "./components/AppToolbar";
import PersonTable from "./components/PersonTable";
import {
  DEFAULT_LOCATION_OPTIONS,
  uniqueLocations,
} from "./constants/locations.ts";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "./constants/statuses.ts";
import { getErrorMessage } from "./utils/errors.ts";

const REPORTS_UNAVAILABLE_MESSAGE = "לא קיימים דוחות לתאריך שנבחר.";

const normalizeLocationName = (value) => String(value || "").trim();

const getReportLocalDate = (value) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = String(parsed.getFullYear());
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLatestReportForUser = (reports, userId) =>
  reports
    .filter((report) => Number(report?.userId) === Number(userId))
    .sort(
      (left, right) =>
        new Date(right?.occurredAt || 0).getTime() -
        new Date(left?.occurredAt || 0).getTime()
    )[0];

const mapReportStatusToDailyStatus = (isStatusOk) => {
  if (isStatusOk === true) {
    return DAILY_STATUS_OK;
  }

  if (isStatusOk === false) {
    return DAILY_STATUS_BAD;
  }

  return DAILY_STATUS_MISSING;
};

const mapDailyStatusToReportStatus = (dailyStatus) => {
  if (dailyStatus === DAILY_STATUS_OK) {
    return true;
  }

  if (dailyStatus === DAILY_STATUS_BAD) {
    return false;
  }

  return null;
};

const buildAvailableDates = (reports, todayString, selectedDate) => {
  const allDates = Array.isArray(reports)
    ? reports
        .map((report) => getReportLocalDate(report?.occurredAt))
        .filter(Boolean)
    : [];

  return Array.from(new Set([todayString, selectedDate, ...allDates]))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));
};

function App() {
  const todayString = getTodayString();
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [availableDates, setAvailableDates] = useState([todayString]);
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
        locations.map((location) => [Number(location.id), String(location.name || "")])
      ),
    [locations]
  );

  const deletableLocationOptions = useMemo(
    () => locationOptions.filter((location) => location !== homeLocation),
    [locationOptions, homeLocation]
  );

  const people = useMemo(() => {
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
  const canDownloadSelectedDate = Boolean(selectedDate) && !loading && !actionLoading;
  const canAddLocation = !actionLoading;
  const canChooseLocationToDelete =
    deletableLocationOptions.length > 0 && !actionLoading;
  const canDeleteLocation =
    !actionLoading && deletableLocationOptions.length > 0 && Boolean(locationToDelete);

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

  async function loadDashboard(dateValue) {
    setLoading(true);
    setError("");

    try {
      const [usersResponse, locationsResponse, allReportsResponse, dateReportsResponse] =
        await Promise.all([
          fetchUsers(),
          fetchLocations(),
          fetchReports(),
          fetchReports({ date: dateValue }),
        ]);

      const safeUsers = Array.isArray(usersResponse) ? usersResponse : [];
      const safeLocations = Array.isArray(locationsResponse) ? locationsResponse : [];
      const safeAllReports = Array.isArray(allReportsResponse) ? allReportsResponse : [];
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

  function triggerFileDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleLoadSelectedDate(dateValue) {
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

  async function handleQuickUpdate(personId, patch) {
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
      source: "ui",
      isStatusOk
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

  return (
    <div className="app-shell" dir="rtl">
      <header className="header-card">
        <div>
          <h1>ניהול סטטוס יומי ומיקום</h1>
          <p className="muted-text">תצוגת משתמשים ודוחות לפי התאריך שנבחר</p>
          <p className="muted-text auto-refresh-note">
            ה-API החדש מבוסס על דוחות. פעולות Snapshot ישנות הושבתו זמנית.
          </p>
        </div>

        <div className="header-actions">
          <div className="date-controls">
            <label htmlFor="snapshot-date">בחירת תאריך</label>
            <input
              id="snapshot-date"
              data-testid="snapshot-date-input"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              max={todayString}
            />
            <button
              className="btn btn-primary"
              data-testid="load-date-button"
              onClick={() => handleLoadSelectedDate(selectedDate)}
              disabled={!canLoadSelectedDate}
            >
              טען תאריך
            </button>
            <button
              className="btn btn-primary"
              onClick={handleDownloadDayFile}
              disabled={!canDownloadSelectedDate}
            >
              הורד אקסל ליום
            </button>
          </div>
        </div>
      </header>

      <AppToolbar
        actionLoading={actionLoading}
        canAddLocation={canAddLocation}
        canChooseLocationToDelete={canChooseLocationToDelete}
        canDeleteLocation={canDeleteLocation}
        locationOptions={locationOptions}
        deletableLocationOptions={deletableLocationOptions}
        downloadFromDate={downloadFromDate}
        downloadToDate={downloadToDate}
        filteredPeopleCount={filteredPeople.length}
        handleAddLocation={handleAddLocation}
        handleDeleteLocation={handleDeleteLocation}
        handleDownloadRangeFiles={handleDownloadRangeFiles}
        locationFilter={locationFilter}
        locationToDelete={locationToDelete}
        newLocationName={newLocationName}
        onDownloadFromDateChange={(event) => setDownloadFromDate(event.target.value)}
        onDownloadToDateChange={(event) => setDownloadToDate(event.target.value)}
        onLocationFilterChange={(event) => setLocationFilter(event.target.value)}
        onLocationToDeleteChange={(event) =>
          setLocationToDelete(event.target.value)
        }
        onNewLocationNameChange={(event) => setNewLocationName(event.target.value)}
        onSearchTermChange={(event) => setSearchTerm(event.target.value)}
        onStatusFilterChange={(event) => setStatusFilter(event.target.value)}
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        todayString={todayString}
      />

      {availableDates.length > 0 ? (
        <section className="dates-card">
          <span className="muted-text">תאריכים זמינים:</span>
          <div className="dates-list">
            {availableDates.map((item) => (
              <button
                key={item}
                className={`btn btn-chip ${item === selectedDate ? "active-date" : ""}`}
                onClick={() => void handleLoadSelectedDate(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isReadOnly ? (
        <div className="history-banner">
          מצב תצוגת היסטוריה: מוצגים דוחות כפי שנמצאו עבור התאריך {selectedDate}
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="content-area">
        {loading ? (
          <div className="loading-box">טוען נתונים...</div>
        ) : filteredPeople.length === 0 && selectedDate !== todayString ? (
          <div className="loading-box">{REPORTS_UNAVAILABLE_MESSAGE}</div>
        ) : (
          <PersonTable
            people={filteredPeople}
            locationOptions={locationOptions}
            readOnly={isReadOnly || actionLoading}
            onQuickUpdate={handleQuickUpdate}
          />
        )}
      </main>
    </div>
  );
}

export default App;
