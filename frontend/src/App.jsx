import { useEffect, useMemo, useState } from "react";

import { createLocation, deleteLocation, fetchLocations } from "./api/locations.ts";
import { fetchReports } from "./api/reports.ts";
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

function App() {
  const todayString = getTodayString();

  // State Management
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [availableDates, setAvailableDates] = useState([todayString]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Filter & Form States
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newLocationName, setNewLocationName] = useState("");
  const [locationToDelete, setLocationToDelete] = useState("");
  const [downloadFromDate, setDownloadFromDate] = useState(todayString);
  const [downloadToDate, setDownloadToDate] = useState(todayString);

  const isReadOnly = selectedDate !== todayString;
  const homeLocation = DEFAULT_LOCATION_OPTIONS[0];

  // Logic: Memoized Data Transformations
  const locationOptions = useMemo(() => {
    const apiNames = locations.map((l) => l.name);
    return uniqueLocations(apiNames.length > 0 ? apiNames : DEFAULT_LOCATION_OPTIONS);
  }, [locations]);

  const deletableLocationOptions = useMemo(
    () => locationOptions.filter((l) => l !== homeLocation),
    [locationOptions, homeLocation]
  );

  const locationNameById = useMemo(() => 
    new Map(locations.map((l) => [Number(l.id), String(l.name || "")])), 
  [locations]);

  const people = useMemo(() => {
    return users.map((user) => {
      const userReports = reports.filter((r) => Number(r?.userId) === Number(user.id));
      const latest = userReports.sort((a, b) => 
        new Date(b?.occurredAt || 0) - new Date(a?.occurredAt || 0)
      )[0];

      return {
        person_id: String(user.id),
        full_name: String(user.fullName || ""),
        location: locationNameById.get(Number(latest?.locationId)) || (latest ? String(latest.locationId) : ""),
        daily_status: latest?.isStatusOk === true ? DAILY_STATUS_OK : 
                      latest?.isStatusOk === false ? DAILY_STATUS_BAD : DAILY_STATUS_MISSING,
        phone: user.phone ? String(user.phone) : "",
        last_updated: latest?.occurredAt || "",
      };
    });
  }, [locationNameById, reports, users]);

  const filteredPeople = useMemo(() => {
    return people
      .filter((p) => {
        if (searchTerm && !p.full_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (locationFilter !== "all" && p.location !== locationFilter) return false;
        if (statusFilter !== "all" && p.daily_status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
  }, [locationFilter, people, searchTerm, statusFilter]);

  // UI Guard Logic
  const canAddLocation = newLocationName.trim().length > 0 && !actionLoading;
  const canChooseLocationToDelete = deletableLocationOptions.length > 0;
  const canDeleteLocation = locationToDelete !== "" && !actionLoading;

  // Effects: Initial Data Load
  useEffect(() => {
    void loadDashboard(todayString);
    void loadBackupFiles();
  }, []);

  // --- API Actions ---

  async function loadDashboard(dateValue) {
    setLoading(true);
    setError("");
    try {
      const [u, l, allR, dateR] = await Promise.all([
        fetchUsers(),
        fetchLocations(),
        fetchReports(),
        fetchReports({ date: dateValue }),
      ]);
      setUsers(u || []);
      setLocations(l || []);
      setReports(dateR || []);
      setSelectedDate(dateValue);
      
      const historyDates = Array.isArray(allR) ? allR.map(r => r.occurredAt?.slice(0,10)) : [];
      setAvailableDates(Array.from(new Set([todayString, dateValue, ...historyDates]))
        .filter(Boolean).sort((a, b) => b.localeCompare(a)));
    } catch (err) {
      setError(getErrorMessage(err, "טעינת הנתונים נכשלה"));
    } finally {
      setLoading(false);
    }
  }

  async function loadBackupFiles() {
    try {
      const res = await fetch("/api/reports/backup/list"); 
      if (res.ok) {
        const data = await res.json();
        setBackupFiles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch backups", err);
    }
  }

  async function handleAddLocation() {
    if (!canAddLocation) return;
    setActionLoading(true);
    try {
      await createLocation({ name: newLocationName });
      setNewLocationName("");
      await loadDashboard(selectedDate);
    } catch (err) {
      setError("הוספת מיקום נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteLocation() {
    if (!canDeleteLocation) return;
    const target = locations.find(l => l.name === locationToDelete);
    if (!target) return;
    setActionLoading(true);
    try {
      await deleteLocation(target.id);
      setLocationToDelete("");
      await loadDashboard(selectedDate);
    } catch (err) {
      setError("מחיקת מיקום נכשלה");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBackupDownload(file) {
    const url = `/api/reports/backup/download/${encodeURIComponent(file)}`;
    triggerFileDownload(url, file);
  }

  async function handleDownloadRangeFiles() {
    const url = `/api/reports/export?from=${downloadFromDate}&to=${downloadToDate}`;
    triggerFileDownload(url, `report_${downloadFromDate}_to_${downloadToDate}.xlsx`);
  }

  function triggerFileDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="app-shell" dir="rtl">
      <header className="header-card">
        <h1>ניהול כוח אדם - פאנל ניהול</h1>
        <p className="muted-text">מערכת דיווח נוכחות ומיקום עובדים</p>
      </header>

      {/* BACKUP MANAGEMENT SECTION */}
      {backupFiles.length > 0 && (
        <section className="toolbar-card backup-section">
          <h3>📂 גיבויים זמינים להורדה (מערכת מקומית)</h3>
          <div className="backup-list" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
            {backupFiles.map((file) => (
              <div key={file} className="backup-item" style={{ border: '1px solid #ddd', padding: '8px', borderRadius: '4px', background: '#f9f9f9' }}>
                <span style={{ marginLeft: '10px' }}>{file}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => handleBackupDownload(file)}>
                  📥 הורד
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <AppToolbar
        // State & Loading
        actionLoading={actionLoading}
        todayString={todayString}
        filteredPeopleCount={filteredPeople.length}
        
        // Filters
        searchTerm={searchTerm}
        onSearchTermChange={(e) => setSearchTerm(e.target.value)}
        locationFilter={locationFilter}
        onLocationFilterChange={(e) => setLocationFilter(e.target.value)}
        statusFilter={statusFilter}
        onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
        
        // Location Management
        locationOptions={locationOptions}
        deletableLocationOptions={deletableLocationOptions}
        newLocationName={newLocationName}
        onNewLocationNameChange={(e) => setNewLocationName(e.target.value)}
        handleAddLocation={handleAddLocation}
        canAddLocation={canAddLocation}
        locationToDelete={locationToDelete}
        onLocationToDeleteChange={(e) => setLocationToDelete(e.target.value)}
        handleDeleteLocation={handleDeleteLocation}
        canChooseLocationToDelete={canChooseLocationToDelete}
        canDeleteLocation={canDeleteLocation}

        // Export Range
        downloadFromDate={downloadFromDate}
        onDownloadFromDateChange={(e) => setDownloadFromDate(e.target.value)}
        downloadToDate={downloadToDate}
        onDownloadToDateChange={(e) => setDownloadToDate(e.target.value)}
        handleDownloadRangeFiles={handleDownloadRangeFiles}
      />

      {error && <div className="error-banner">{error}</div>}

      <main className="content-area">
        {loading ? (
          <div className="loading-box">טוען נתונים...</div>
        ) : (
          <PersonTable 
            people={filteredPeople} 
            locationOptions={locationOptions}
            readOnly={isReadOnly}
          />
        )}
      </main>
    </div>
  );
}

export default App;
