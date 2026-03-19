// Top-level application page that coordinates data loading, filters, modals, and actions.
// Responsibility: own the primary UI state machine and orchestrate user workflows end-to-end.

import { useEffect, useMemo, useState } from "react";

import {
  addInitialPeopleList,
  addPerson,
  createLocation,
  createPersonLocationEvent,
  deleteLocation,
  deletePersonLocationEvent,
  deletePerson,
  downloadDaySnapshot,
  downloadRangeSnapshots,
  fetchAvailableDates,
  fetchLocations,
  fetchPersonLocationEvents,
  fetchPersonTransitions,
  fetchSnapshotByDate,
  fetchSystemStatus,
  fetchTodaySnapshot,
  getTodayString,
  quickUpdatePerson,
  saveSnapshotNow,
  deleteSnapshotDate,
  replacePerson,
  restoreHistoryToToday,
} from "./api/client.ts";
import PersonFormModal from "./components/PersonFormModal";
import AppToolbar from "./components/AppToolbar";
import PersonTrackingModal from "./components/PersonTrackingModal";
import PersonTable from "./components/PersonTable";
import {
  AUTO_REFRESH_MS,
  SUSPICIOUS_TRANSITION_SECONDS,
  UNDO_WINDOW_SECONDS,
} from "./constants/app";
import {
  DEFAULT_LOCATION_OPTIONS,
  uniqueLocations,
} from "./constants/locations";
import {
  DEFAULT_SYSTEM_STATUS,
  getErrorMessage,
  normalizeSnapshotPayload,
  normalizeSystemStatus,
} from "./utils/appPayloads";

// Main page component for daily status and location management.
function App() {
  const todayString = getTodayString();

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
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [trackingPerson, setTrackingPerson] = useState(null);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [trackingTransitions, setTrackingTransitions] = useState([]);
  const [trackingLastActionEventId, setTrackingLastActionEventId] = useState("");
  const [trackingLastActionType, setTrackingLastActionType] = useState("");
  const [latestTransitionWarning, setLatestTransitionWarning] = useState("");
  const [undoExpiresAtMs, setUndoExpiresAtMs] = useState(0);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const isReadOnly = snapshot.date !== todayString;
  const homeLocation = DEFAULT_LOCATION_OPTIONS[0];
  const configuredLocationOptions = useMemo(
    () => uniqueLocations(locationOptions),
    [locationOptions]
  );

  // "Home" is required default location, so it is excluded from delete options.
  const deletableLocationOptions = useMemo(() => {
    return locationOptions.filter((location) => location !== homeLocation);
  }, [locationOptions, homeLocation]);
  const canLoadSelectedDate = Boolean(selectedDate) && !loading;
  const canDownloadSelectedDate = Boolean(selectedDate) && !loading && !actionLoading;
  const canRunReadOnlyDateAction = !actionLoading;
  const canAddLocation = !actionLoading;
  const canChooseLocationToDelete =
    deletableLocationOptions.length > 0 && !actionLoading;
  const canDeleteLocation =
    !actionLoading && deletableLocationOptions.length > 0 && Boolean(locationToDelete);

  const filteredPeople = useMemo(() => {
    return snapshot.people
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
  }, [snapshot.people, searchTerm, locationFilter, statusFilter]);

  useEffect(() => {
    if (!trackingPerson) {
      return;
    }
    const refreshedPerson = snapshot.people.find(
      (item) => item.person_id === trackingPerson.person_id
    );
    if (!refreshedPerson) {
      resetTrackingModalState();
      return;
    }
    setTrackingPerson(refreshedPerson);
  }, [snapshot.people, trackingPerson]);

  useEffect(() => {
    if (!undoExpiresAtMs) {
      setUndoSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      const seconds = Math.max(
        0,
        Math.ceil((undoExpiresAtMs - Date.now()) / 1000)
      );
      setUndoSecondsLeft(seconds);
      if (seconds <= 0) {
        setUndoExpiresAtMs(0);
      }
    };

    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [undoExpiresAtMs]);

  useEffect(() => {
    initialize();
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

  useEffect(() => {
    if (selectedDate !== todayString || !systemStatus.telegram_active) {
      return undefined;
    }

    const timerId = window.setInterval(async () => {
      try {
        const liveSnapshot = await fetchTodaySnapshot();
        const normalizedLiveSnapshot = normalizeSnapshotPayload(
          liveSnapshot,
          todayString
        );
        setSnapshot((current) =>
          current.date === todayString ? normalizedLiveSnapshot : current
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
      const normalizedTodaySnapshot = normalizeSnapshotPayload(
        todaySnapshot,
        todayString
      );
      setSnapshot(normalizedTodaySnapshot);
      setSelectedDate(normalizedTodaySnapshot.date);
      setAvailableDates(datesResponse.dates || []);
      setSystemStatus(normalizeSystemStatus(systemStatusResponse));
      applyLocationOptions(locationsResponse.locations || []);
    } catch (err) {
      setSystemStatus(DEFAULT_SYSTEM_STATUS);
      setError(getErrorMessage(err, "טעינת הנתונים נכשלה"));
    } finally {
      setLoading(false);
    }
  }

  async function refreshDates() {
    const datesResponse = await fetchAvailableDates();
    setAvailableDates(datesResponse.dates || []);
  }

  function applyLocationOptions(apiLocations) {
    const safeApiLocations = Array.isArray(apiLocations) ? apiLocations : [];
    const fallbackLocations =
      safeApiLocations.length > 0 ? safeApiLocations : DEFAULT_LOCATION_OPTIONS;
    setLocationOptions(uniqueLocations(fallbackLocations));
  }

  function applyTrackingResponse(response, { allowUndoStart = false } = {}) {
    const safeEvents = Array.isArray(response?.events) ? response.events : [];
    setTrackingEvents(safeEvents);
    const lastActionEventId = String(response?.last_action_event_id || "");
    const lastActionType = String(response?.last_action_type || "");
    const warningText = String(response?.latest_transition_warning || "");
    setTrackingLastActionEventId(lastActionEventId);
    setTrackingLastActionType(lastActionType);
    setLatestTransitionWarning(warningText);

    if (allowUndoStart && lastActionType === "move" && lastActionEventId) {
      const deadlineMs = Date.now() + UNDO_WINDOW_SECONDS * 1000;
      setUndoExpiresAtMs(deadlineMs);
      return;
    }

    if (!allowUndoStart || lastActionType === "undo" || lastActionType === "correction") {
      setUndoExpiresAtMs(0);
    }
  }

  function shouldConfirmSuspiciousTransition(payload) {
    const toLocation = String(payload?.location || "");
    if (!toLocation) {
      return false;
    }

    const toDate = payload?.occurred_at ? new Date(payload.occurred_at) : new Date();
    if (Number.isNaN(toDate.getTime())) {
      return false;
    }

    const latestActiveMove = trackingEvents.find(
      (item) => item?.event_type === "move" && !item?.is_voided
    );
    if (!latestActiveMove) {
      return false;
    }

    const fromLocation = String(latestActiveMove.location || "");
    if (!fromLocation || fromLocation === toLocation) {
      return false;
    }

    const fromDate = new Date(latestActiveMove.occurred_at);
    if (Number.isNaN(fromDate.getTime())) {
      return false;
    }

    const diffSeconds = (toDate.getTime() - fromDate.getTime()) / 1000;
    return diffSeconds >= 0 && diffSeconds < SUSPICIOUS_TRANSITION_SECONDS;
  }

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
      const normalizedPayload = normalizeSnapshotPayload(payload, dateValue);
      setSnapshot(normalizedPayload);
      setSelectedDate(normalizedPayload.date);
      setSystemStatus(normalizeSystemStatus(systemStatusResponse));
      await refreshDates();
    } catch (err) {
      setError(getErrorMessage(err, "לא ניתן לטעון את התאריך המבוקש"));
    } finally {
      setLoading(false);
    }
  }

  async function loadTrackingEvents(personId, dateValue) {
    setTrackingLoading(true);
    setError("");
    try {
      const [eventsResponse, transitionsResponse] = await Promise.all([
        fetchPersonLocationEvents(personId, dateValue, { includeVoided: true }),
        fetchPersonTransitions(personId, dateValue),
      ]);
      applyTrackingResponse(eventsResponse, { allowUndoStart: false });
      setTrackingTransitions(
        Array.isArray(transitionsResponse?.transitions)
          ? transitionsResponse.transitions
          : []
      );
    } catch (err) {
      setTrackingEvents([]);
      setTrackingTransitions([]);
      setTrackingLastActionEventId("");
      setTrackingLastActionType("");
      setLatestTransitionWarning("");
      setUndoExpiresAtMs(0);
      setError(getErrorMessage(err, "טעינת מעקב מיקומים נכשלה"));
    } finally {
      setTrackingLoading(false);
    }
  }

  function openTrackingModal(person) {
    if (!person?.person_id) {
      return;
    }
    setTrackingPerson(person);
    setTrackingEvents([]);
    setTrackingTransitions([]);
    setTrackingLastActionEventId("");
    setTrackingLastActionType("");
    setLatestTransitionWarning("");
    setUndoExpiresAtMs(0);
    setTrackingModalOpen(true);
    loadTrackingEvents(person.person_id, snapshot.date);
  }

  function resetTrackingModalState() {
    setTrackingModalOpen(false);
    setTrackingPerson(null);
    setTrackingEvents([]);
    setTrackingTransitions([]);
    setTrackingLastActionEventId("");
    setTrackingLastActionType("");
    setLatestTransitionWarning("");
    setUndoExpiresAtMs(0);
  }

  function handleCloseTrackingModal() {
    if (trackingLoading || actionLoading) {
      return;
    }

    resetTrackingModalState();
  }

  async function handleAddTrackingEvent(payload) {
    if (!trackingPerson || isReadOnly) {
      return;
    }

    if (shouldConfirmSuspiciousTransition(payload)) {
      const approved = window.confirm(
        "זוהה מעבר חשוד (פחות מ-2 דקות מהמעבר הקודם). להמשיך בכל זאת?"
      );
      if (!approved) {
        return;
      }
    }

    setTrackingLoading(true);
    setError("");
    try {
      const response = await createPersonLocationEvent(
        trackingPerson.person_id,
        payload
      );
      applyTrackingResponse(response, { allowUndoStart: true });
      const transitionsResponse = await fetchPersonTransitions(
        trackingPerson.person_id,
        snapshot.date
      );
      setTrackingTransitions(
        Array.isArray(transitionsResponse?.transitions)
          ? transitionsResponse.transitions
          : []
      );
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(getErrorMessage(err, "הוספת אירוע מיקום נכשלה"));
    } finally {
      setTrackingLoading(false);
    }
  }

  async function handleDeleteTrackingEvent(eventId) {
    if (!trackingPerson || !eventId || isReadOnly) {
      return;
    }

    const approved = window.confirm("למחוק את אירוע המיקום שנבחר?");
    if (!approved) {
      return;
    }

    setTrackingLoading(true);
    setError("");
    try {
      const response = await deletePersonLocationEvent(
        trackingPerson.person_id,
        eventId,
        "correction"
      );
      applyTrackingResponse(response, { allowUndoStart: false });
      const transitionsResponse = await fetchPersonTransitions(
        trackingPerson.person_id,
        snapshot.date
      );
      setTrackingTransitions(
        Array.isArray(transitionsResponse?.transitions)
          ? transitionsResponse.transitions
          : []
      );
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(getErrorMessage(err, "מחיקת אירוע מיקום נכשלה"));
    } finally {
      setTrackingLoading(false);
    }
  }

  async function handleUndoLastTrackingAction() {
    if (!trackingPerson || isReadOnly || !trackingLastActionEventId || undoSecondsLeft <= 0) {
      return;
    }

    setTrackingLoading(true);
    setError("");
    try {
      const response = await deletePersonLocationEvent(
        trackingPerson.person_id,
        trackingLastActionEventId,
        "undo"
      );
      applyTrackingResponse(response, { allowUndoStart: false });
      const transitionsResponse = await fetchPersonTransitions(
        trackingPerson.person_id,
        snapshot.date
      );
      setTrackingTransitions(
        Array.isArray(transitionsResponse?.transitions)
          ? transitionsResponse.transitions
          : []
      );
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(getErrorMessage(err, "ביטול הפעולה האחרונה נכשל"));
    } finally {
      setTrackingLoading(false);
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

  async function handleDownloadDayFile() {
    if (!selectedDate) {
      setError("יש לבחור תאריך להורדה");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const { url, filename } = downloadDaySnapshot(selectedDate);
      triggerFileDownload(url, filename);
    } catch (err) {
      setError(getErrorMessage(err, "הורדת קובץ היום נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManualSaveExcel() {
    if (!selectedDate) {
      setError("יש לבחור תאריך לשמירה");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const response = await saveSnapshotNow(selectedDate);
      const savedRows = Number(response?.rows_saved || 0);
      window.alert(`השמירה בוצעה בהצלחה. נשמרו ${savedRows} רשומות.`);
      await refreshDates();
    } catch (err) {
      setError(getErrorMessage(err, "שמירת קובץ האקסל נכשלה"));
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
      const { url, filename } = downloadRangeSnapshots(
        downloadFromDate,
        downloadToDate
      );
      triggerFileDownload(url, filename);
    } catch (err) {
      setError(getErrorMessage(err, "הורדת קבצי הטווח נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleQuickUpdate(personId, patch) {
    setActionLoading(true);
    setError("");

    try {
      await quickUpdatePerson(personId, patch);
      await loadSelectedDate(todayString);
    } catch (err) {
      setError(getErrorMessage(err, "עדכון מהיר נכשל"));
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

    if (configuredLocationOptions.includes(normalized)) {
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
      setError(getErrorMessage(err, "מחיקת מיקום נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

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
      setError(getErrorMessage(err, "הוספת רשימת שמות התחלתית נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  function openAddModal() {
    setModalMode("add");
    setEditingPerson(null);
    setModalOpen(true);
  }

  function openEditModal(person) {
    setModalMode("edit");
    setEditingPerson(person);
    setModalOpen(true);
  }

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
      setError(getErrorMessage(err, "שמירת הנתונים נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeletePerson() {
    if (!editingPerson) {
      return;
    }

    const approved = window.confirm(`למחוק את ${editingPerson.full_name} מרשימת האנשים?`);
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
      setError(getErrorMessage(err, "מחיקת אדם נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

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
      setError(getErrorMessage(err, "שחזור ההיסטוריה נכשל"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteDate() {
    if (!isReadOnly || !snapshot.date) {
      return;
    }

    const targetDate = snapshot.date;
    const approved = window.confirm(
      `האם אתה בטוח שברצונך למחוק את התאריך ${targetDate}?\nהפעולה תמחק את קובץ האקסל של התאריך ואת נתוני המעקב שלו.`
    );
    if (!approved) {
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      await deleteSnapshotDate(targetDate);
      resetTrackingModalState();
      await loadSelectedDate(todayString);
      window.alert(`התאריך ${targetDate} נמחק בהצלחה.`);
    } catch (err) {
      setError(getErrorMessage(err, "מחיקת התאריך נכשלה"));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="app-shell" dir="rtl">
      <header className="header-card">
        <div>
          <h1>ניהול סטטוס יומי ומיקום</h1>
          <p className="muted-text">מעקב יומי לפי Snapshot לכל תאריך</p>
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
              data-testid="snapshot-date-input"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              max={todayString}
            />
            <button
              className="btn btn-primary"
              data-testid="load-date-button"
              onClick={() => loadSelectedDate(selectedDate)}
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
            <button
              className="btn btn-primary"
              onClick={handleManualSaveExcel}
              disabled={!canDownloadSelectedDate}
            >
              שמור אקסל
            </button>
          </div>

          {isReadOnly ? (
            <>
              <button
                className="btn btn-warning"
                onClick={handleRestoreHistory}
                disabled={!canRunReadOnlyDateAction}
              >
                שחזר ליום הנוכחי
              </button>
              <button
                className="btn btn-danger"
                data-testid="delete-date-button"
                onClick={handleDeleteDate}
                disabled={!canRunReadOnlyDateAction}
              >
                מחק תאריך
              </button>
            </>
          ) : null}
        </div>
      </header>
      <AppToolbar
        actionLoading={actionLoading}
        canAddLocation={canAddLocation}
        canChooseLocationToDelete={canChooseLocationToDelete}
        canDeleteLocation={canDeleteLocation}
        configuredLocationOptions={configuredLocationOptions}
        deletableLocationOptions={deletableLocationOptions}
        downloadFromDate={downloadFromDate}
        downloadToDate={downloadToDate}
        filteredPeopleCount={filteredPeople.length}
        handleAddInitialPeopleList={handleAddInitialPeopleList}
        handleAddLocation={handleAddLocation}
        handleDeleteLocation={handleDeleteLocation}
        handleDownloadRangeFiles={handleDownloadRangeFiles}
        initialPeopleInput={initialPeopleInput}
        isReadOnly={isReadOnly}
        locationFilter={locationFilter}
        locationToDelete={locationToDelete}
        newLocationName={newLocationName}
        onDownloadFromDateChange={(event) => setDownloadFromDate(event.target.value)}
        onDownloadToDateChange={(event) => setDownloadToDate(event.target.value)}
        onInitialPeopleInputChange={(event) =>
          setInitialPeopleInput(event.target.value)
        }
        onLocationFilterChange={(event) => setLocationFilter(event.target.value)}
        onLocationToDeleteChange={(event) =>
          setLocationToDelete(event.target.value)
        }
        onNewLocationNameChange={(event) => setNewLocationName(event.target.value)}
        onSearchTermChange={(event) => setSearchTerm(event.target.value)}
        onStatusFilterChange={(event) => setStatusFilter(event.target.value)}
        openAddModal={openAddModal}
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
            locationOptions={configuredLocationOptions}
            readOnly={isReadOnly || actionLoading}
            telegramActive={systemStatus.telegram_active}
            telegramMessage={systemStatus.telegram_message}
            onQuickUpdate={handleQuickUpdate}
            onEdit={openEditModal}
            onTrack={openTrackingModal}
          />
        )}
      </main>

      <PersonFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingPerson}
        locationOptions={configuredLocationOptions}
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

      <PersonTrackingModal
        open={trackingModalOpen}
        person={trackingPerson}
        readOnly={isReadOnly}
        loading={trackingLoading || actionLoading}
        locationOptions={configuredLocationOptions}
        events={trackingEvents}
        transitions={trackingTransitions}
        latestTransitionWarning={latestTransitionWarning}
        undoSecondsLeft={undoSecondsLeft}
        canUndo={Boolean(
          trackingLastActionEventId &&
            trackingLastActionType === "move" &&
            undoSecondsLeft > 0
        )}
        onClose={handleCloseTrackingModal}
        onAddEvent={handleAddTrackingEvent}
        onDeleteEvent={handleDeleteTrackingEvent}
        onUndoLastAction={handleUndoLastTrackingAction}
      />
    </div>
  );
}

export default App;
