import { useEffect, useMemo, useState } from "react";

import {
  addInitialPeopleList,
  addPerson,
  createLocation,
  deleteLocation,
  downloadDaySnapshot,
  downloadRangeSnapshots,
  deletePerson,
  fetchAvailableDates,
  fetchLocations,
  fetchSnapshotByDate,
  fetchSystemStatus,
  fetchTodaySnapshot,
  getTodayString,
  quickUpdatePerson,
  replacePerson,
  restoreHistoryToToday,
} from "./api/client";
import PersonFormModal from "./components/PersonFormModal";
import PersonTable from "./components/PersonTable";
import {
  DEFAULT_LOCATION_OPTIONS,
  normalizeLocationName,
  uniqueLocations,
} from "./constants/locations";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "./constants/statuses";

const AUTO_REFRESH_MS = 5000;
const DEFAULT_SYSTEM_STATUS = {
  telegram_enabled: false,
  telegram_configured: false,
  telegram_running: false,
  telegram_healthy: false,
  telegram_active: false,
  telegram_message: "בוט טלגרם לא פעיל",
  telegram_last_error: null,
};

// Normalize backend system status payload so UI stays stable if fields are missing.
function normalizeSystemStatus(payload) {
  return {
    ...DEFAULT_SYSTEM_STATUS,
    ...(payload || {}),
    telegram_active: Boolean(payload?.telegram_active),
    telegram_message:
      payload?.telegram_message || DEFAULT_SYSTEM_STATUS.telegram_message,
  };
}

// Main page component for daily status and location management.
function App() {
  const todayString = getTodayString();

  // Snapshot currently displayed on screen (today or selected history date).
  const [snapshot, setSnapshot] = useState({ date: todayString, people: [] });
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [availableDates, setAvailableDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [systemStatus, setSystemStatus] = useState(DEFAULT_SYSTEM_STATUS);

  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [locationOptions, setLocationOptions] = useState(
    DEFAULT_LOCATION_OPTIONS
  );
  const [initialPeopleInput, setInitialPeopleInput] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [locationToDelete, setLocationToDelete] = useState("");
  const [downloadFromDate, setDownloadFromDate] = useState(todayString);
  const [downloadToDate, setDownloadToDate] = useState(todayString);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingPerson, setEditingPerson] = useState(null);

  // Historical snapshots are read-only by design.
  const isReadOnly = snapshot.date !== todayString;

  // Merge locations list from backend with values found in current snapshot.
  const effectiveLocationOptions = useMemo(() => {
    const locationsFromSnapshot = snapshot.people.map((person) => person.location);
    return uniqueLocations([
      ...DEFAULT_LOCATION_OPTIONS,
      ...locationOptions,
      ...locationsFromSnapshot,
    ]);
  }, [locationOptions, snapshot.people]);

  // "בית" הוא מיקום ברירת מחדל חובה ולכן לא מוצג ברשימת מחיקה.
  const deletableLocationOptions = useMemo(() => {
    return locationOptions.filter((location) => location !== "בבית");
  }, [locationOptions]);

  // Build filtered and sorted table rows based on search/filters.
  const filteredPeople = useMemo(() => {
    return snapshot.people
      .filter((person) => {
        if (
          searchTerm &&
          !person.full_name.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }

        if (locationFilter !== "all" && person.location !== locationFilter) {
          return false;
        }

        if (statusFilter !== "all" && person.daily_status !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
  }, [snapshot.people, searchTerm, locationFilter, statusFilter]);

  // Initial loading sequence when page is mounted.
  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selected delete-location value valid after list refresh.
  useEffect(() => {
    if (deletableLocationOptions.length === 0) {
      setLocationToDelete("");
      return;
    }
    if (!deletableLocationOptions.includes(locationToDelete)) {
      setLocationToDelete(deletableLocationOptions[0]);
    }
  }, [deletableLocationOptions, locationToDelete]);

  // Auto-refresh today's table so Telegram/self updates appear quickly in UI.
  useEffect(() => {
    if (selectedDate !== todayString || !systemStatus.telegram_active) {
      return undefined;
    }

    const timerId = window.setInterval(async () => {
      try {
        const liveSnapshot = await fetchTodaySnapshot();
        setSnapshot((current) =>
          current.date === todayString ? liveSnapshot : current
        );
      } catch {
        // Ignore periodic refresh failures to avoid noisy UI interruptions.
      }
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timerId);
  }, [selectedDate, todayString, systemStatus.telegram_active]);

  // Load today's snapshot, available historical dates, and locations list.
  async function initialize() {
    setLoading(true);
    setError("");
    try {
      const [
        todaySnapshot,
        datesResponse,
        locationsResponse,
        systemStatusResponse,
      ] = await Promise.all([
        fetchTodaySnapshot(),
        fetchAvailableDates(),
        fetchLocations(),
        fetchSystemStatus().catch(() => DEFAULT_SYSTEM_STATUS),
      ]);
      setSnapshot(todaySnapshot);
      setSelectedDate(todaySnapshot.date);
      setAvailableDates(datesResponse.dates || []);
      setSystemStatus(normalizeSystemStatus(systemStatusResponse));
      applyLocationOptions(locationsResponse.locations || []);
    } catch (err) {
      setSystemStatus(DEFAULT_SYSTEM_STATUS);
      setError(err.message || "טעינת הנתונים נכשלה");
    } finally {
      setLoading(false);
    }
  }

  // Refresh available date list after data changes.
  async function refreshDates() {
    const datesResponse = await fetchAvailableDates();
    setAvailableDates(datesResponse.dates || []);
  }

  // Keep one canonical way to merge locations from backend with defaults.
  function applyLocationOptions(apiLocations) {
    setLocationOptions(
      uniqueLocations([
        ...DEFAULT_LOCATION_OPTIONS,
        ...(apiLocations || []),
      ])
    );
  }

  // Load one date (today or historical) and refresh date badges.
  async function loadSelectedDate(dateValue) {
    setLoading(true);
    setError("");

    try {
      const [payload, systemStatusResponse] = await Promise.all([
        dateValue === todayString
          ? fetchTodaySnapshot()
          : fetchSnapshotByDate(dateValue),
        fetchSystemStatus().catch(() => systemStatus),
      ]);
      setSnapshot(payload);
      setSelectedDate(payload.date);
      setSystemStatus(normalizeSystemStatus(systemStatusResponse));
      await refreshDates();
    } catch (err) {
      setError(err.message || "לא ניתן לטעון את התאריך המבוקש");
    } finally {
      setLoading(false);
    }
  }

  // Trigger browser file download from received blob payload.
  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Download xlsx file for the currently selected date.
  async function handleDownloadDayFile() {
    if (!selectedDate) {
      setError("יש לבחור תאריך להורדה");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const { blob, filename } = await downloadDaySnapshot(selectedDate);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err.message || "הורדת קובץ היום נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Download zip file with all xlsx snapshots in selected date range.
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
      const { blob, filename } = await downloadRangeSnapshots(
        downloadFromDate,
        downloadToDate
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err.message || "הורדת קבצי הטווח נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Quick patch for location/status values in today's snapshot.
  async function handleQuickUpdate(personId, patch) {
    setActionLoading(true);
    setError("");

    try {
      await quickUpdatePerson(personId, patch);
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(err.message || "עדכון מהיר נכשל");
    } finally {
      setActionLoading(false);
    }
  }

  // Add a new location option via backend (persisted to locations Excel file).
  async function handleAddLocation() {
    const normalized = normalizeLocationName(newLocationName);
    if (!normalized) {
      setError("יש להזין שם מיקום לפני הוספה");
      return;
    }

    if (effectiveLocationOptions.includes(normalized)) {
      setError("המיקום כבר קיים ברשימה");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const response = await createLocation(normalized);
      applyLocationOptions(response.locations || []);
      setNewLocationName("");
    } catch (err) {
      setError(err.message || "הוספת מיקום נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Delete an existing location option from managed list.
  async function handleDeleteLocation() {
    const normalized = normalizeLocationName(locationToDelete);
    if (!normalized) {
      setError("יש לבחור מיקום למחיקה");
      return;
    }

    const approved = window.confirm(`למחוק את המיקום "${normalized}"?`);
    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const response = await deleteLocation(normalized);
      applyLocationOptions(response.locations || []);
      setLocationToDelete("");
      if (locationFilter === normalized) {
        setLocationFilter("all");
      }
    } catch (err) {
      setError(err.message || "מחיקת מיקום נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Add a bulk initial names list to master and today's snapshot.
  async function handleAddInitialPeopleList() {
    const names = initialPeopleInput
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);

    if (names.length === 0) {
      setError("יש להזין לפחות שם מלא אחד (לפחות 2 תווים)");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const response = await addInitialPeopleList(names);
      setInitialPeopleInput("");
      await loadSelectedDate(todayString);

      const createdCount = Number(response?.created_count || 0);
      const skippedCount = Number(response?.skipped_count || 0);
      window.alert(
        `הרשימה נקלטה בהצלחה.\nנוספו: ${createdCount}\nדולגו (כבר קיימים): ${skippedCount}`
      );
    } catch (err) {
      setError(err.message || "הוספת רשימת שמות התחלתית נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Open modal for creating a new person.
  function openAddModal() {
    setModalMode("add");
    setEditingPerson(null);
    setModalOpen(true);
  }

  // Open modal for editing an existing person.
  function openEditModal(person) {
    setModalMode("edit");
    setEditingPerson(person);
    setModalOpen(true);
  }

  // Submit add/edit form and refresh today's snapshot.
  async function handleModalSubmit(formData) {
    setActionLoading(true);
    setError("");

    try {
      if (modalMode === "add") {
        await addPerson(formData);
      } else if (editingPerson) {
        await replacePerson(editingPerson.person_id, formData);
      }

      setModalOpen(false);
      setEditingPerson(null);
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(err.message || "שמירת הנתונים נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Delete current edited person (today + master list) after confirmation.
  async function handleDeletePerson() {
    if (!editingPerson) {
      return;
    }

    const approved = window.confirm(
      `למחוק את ${editingPerson.full_name} מרשימת האנשים?`
    );
    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      await deletePerson(editingPerson.person_id);
      setModalOpen(false);
      setEditingPerson(null);
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(err.message || "מחיקת אדם נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  // Restore selected historical snapshot into today's snapshot file.
  async function handleRestoreHistory() {
    if (!isReadOnly) {
      return;
    }

    const approved = window.confirm(
      `האם לשחזר את הנתונים של ${snapshot.date} לתוך היום (${todayString})?`
    );

    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      await restoreHistoryToToday(snapshot.date);
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(err.message || "שחזור ההיסטוריה נכשל");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="app-shell" dir="rtl">
      <header className="header-card">
        <div>
          <h1>ניהול סטטוס יומי ומיקום</h1>
          <p className="muted-text">מעקב יומי לפי snapshot לכל תאריך</p>
          {!isReadOnly ? (
            <p className="muted-text auto-refresh-note">
              {systemStatus.telegram_active
                ? "עדכון אוטומטי פעיל כל 5 שניות"
                : "עדכון אוטומטי כבוי - בוט טלגרם לא פעיל"}
            </p>
          ) : null}
        </div>

        <div className="header-actions">
          <div className="date-controls">
            <label htmlFor="snapshot-date">בחירת תאריך</label>
            <input
              id="snapshot-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              max={todayString}
            />
            <button
              className="btn btn-primary"
              onClick={() => loadSelectedDate(selectedDate)}
              disabled={loading || !selectedDate}
            >
              טען תאריך
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleDownloadDayFile}
              disabled={loading || actionLoading || !selectedDate}
            >
              הורד XLSX ליום
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={openAddModal}
            disabled={isReadOnly || actionLoading}
            title={isReadOnly ? "ניתן להוסיף אנשים רק ביום הנוכחי" : ""}
          >
            הוסף אדם
          </button>

          {isReadOnly ? (
            <button
              className="btn btn-warning"
              onClick={handleRestoreHistory}
              disabled={actionLoading}
            >
              שחזר ליום הנוכחי
            </button>
          ) : null}
        </div>
      </header>

      <section className="toolbar-card">
        <div className="filter-group">
          <label>חיפוש לפי שם</label>
          <input
            placeholder="הקלד שם..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>פילטר מיקום</label>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
          >
            <option value="all">הכול</option>
            {effectiveLocationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>פילטר סטטוס</label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">הכול</option>
            <option value={DAILY_STATUS_OK}>תקין</option>
            <option value={DAILY_STATUS_BAD}>לא תקין</option>
            <option value={DAILY_STATUS_MISSING}>לא הוזן</option>
          </select>
        </div>

        <div className="filter-group location-add-group">
          <label>הוספת מיקום</label>
          <div className="location-add-row">
            <input
              placeholder="לדוגמה: מיקום 6"
              value={newLocationName}
              onChange={(event) => setNewLocationName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddLocation();
                }
              }}
            />
            <button
              className="btn btn-secondary"
              onClick={handleAddLocation}
              disabled={actionLoading}
            >
              הוסף
            </button>
          </div>
          <div className="location-remove-row">
            <select
              value={locationToDelete}
              onChange={(event) => setLocationToDelete(event.target.value)}
              disabled={deletableLocationOptions.length === 0 || actionLoading}
            >
              {deletableLocationOptions.length === 0 ? (
                <option value="">אין מיקומים למחיקה</option>
              ) : (
                deletableLocationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))
              )}
            </select>
            <button
              className="btn btn-danger"
              onClick={handleDeleteLocation}
              disabled={
                actionLoading ||
                deletableLocationOptions.length === 0 ||
                !locationToDelete
              }
            >
              מחק מיקום
            </button>
          </div>
        </div>

        <div className="filter-group initial-people-group">
          <label>רשימת שמות התחלתית</label>
          <textarea
            placeholder={"שם בכל שורה או מופרד בפסיקים\nלדוגמה:\nיוסי כהן\nדנה לוי"}
            value={initialPeopleInput}
            onChange={(event) => setInitialPeopleInput(event.target.value)}
            disabled={isReadOnly || actionLoading}
            rows={4}
          />
          <button
            className="btn btn-secondary"
            onClick={handleAddInitialPeopleList}
            disabled={isReadOnly || actionLoading}
            title={isReadOnly ? "ניתן לעדכן רשימת בסיס רק ביום הנוכחי" : ""}
          >
            הוסף רשימת שמות
          </button>
        </div>

        <div className="filter-group download-range-group">
          <label>הורד הכל לפי טווח</label>
          <div className="download-range-row">
            <input
              type="date"
              value={downloadFromDate}
              max={todayString}
              onChange={(event) => setDownloadFromDate(event.target.value)}
            />
            <input
              type="date"
              value={downloadToDate}
              max={todayString}
              onChange={(event) => setDownloadToDate(event.target.value)}
            />
            <button
              className="btn btn-secondary"
              onClick={handleDownloadRangeFiles}
              disabled={actionLoading}
            >
              הורד הכל (ZIP)
            </button>
          </div>
        </div>

        <div className="filter-group summary-box">
          <label>סה"כ מוצגים</label>
          <strong>{filteredPeople.length}</strong>
        </div>
      </section>

      {availableDates.length > 0 ? (
        <section className="dates-card">
          <span className="muted-text">תאריכים זמינים:</span>
          <div className="dates-list">
            {availableDates.map((item) => (
              <button
                key={item}
                className={`btn btn-chip ${item === snapshot.date ? "active-date" : ""}`}
                onClick={() => loadSelectedDate(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isReadOnly ? (
        <div className="history-banner">
          מצב תצוגת היסטוריה: הנתונים הם כפי שנשמרו בתאריך {snapshot.date}
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="content-area">
        {loading ? (
          <div className="loading-box">טוען נתונים...</div>
        ) : (
          <PersonTable
            people={filteredPeople}
            locationOptions={effectiveLocationOptions}
            readOnly={isReadOnly || actionLoading}
            telegramActive={systemStatus.telegram_active}
            telegramMessage={systemStatus.telegram_message}
            onQuickUpdate={handleQuickUpdate}
            onEdit={openEditModal}
          />
        )}
      </main>

      <PersonFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingPerson}
        locationOptions={effectiveLocationOptions}
        loading={actionLoading}
        onDelete={handleDeletePerson}
        onClose={() => {
          if (actionLoading) {
            return;
          }
          setModalOpen(false);
          setEditingPerson(null);
        }}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}

export default App;
