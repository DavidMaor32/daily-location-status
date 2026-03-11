import { useEffect, useMemo, useState } from "react";

import {
  addPerson,
  createLocation,
  downloadDaySnapshot,
  downloadRangeSnapshots,
  deletePerson,
  fetchAvailableDates,
  fetchLocations,
  fetchSnapshotByDate,
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

  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [locationOptions, setLocationOptions] = useState(
    DEFAULT_LOCATION_OPTIONS
  );
  const [newLocationName, setNewLocationName] = useState("");
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

  // Load today's snapshot, available historical dates, and locations list.
  async function initialize() {
    setLoading(true);
    setError("");
    try {
      const [todaySnapshot, datesResponse, locationsResponse] = await Promise.all([
        fetchTodaySnapshot(),
        fetchAvailableDates(),
        fetchLocations(),
      ]);
      setSnapshot(todaySnapshot);
      setSelectedDate(todaySnapshot.date);
      setAvailableDates(datesResponse.dates || []);
      setLocationOptions(
        uniqueLocations([
          ...DEFAULT_LOCATION_OPTIONS,
          ...(locationsResponse.locations || []),
        ])
      );
    } catch (err) {
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

  // Load one date (today or historical) and refresh date badges.
  async function loadSelectedDate(dateValue) {
    setLoading(true);
    setError("");

    try {
      const payload =
        dateValue === todayString
          ? await fetchTodaySnapshot()
          : await fetchSnapshotByDate(dateValue);
      setSnapshot(payload);
      setSelectedDate(payload.date);
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
      setLocationOptions(
        uniqueLocations([
          ...DEFAULT_LOCATION_OPTIONS,
          ...(response.locations || []),
        ])
      );
      setNewLocationName("");
    } catch (err) {
      setError(err.message || "הוספת מיקום נכשלה");
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
            <option value="תקין">תקין</option>
            <option value="לא תקין">לא תקין</option>
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
