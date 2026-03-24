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
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);

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
  if (isStatusOk === true) return DAILY_STATUS_OK;
  if (isStatusOk === false) return DAILY_STATUS_BAD;
  return DAILY_STATUS_MISSING;
};

const mapDailyStatusToReportStatus = (dailyStatus) => {
  if (dailyStatus === DAILY_STATUS_OK) return true;
  if (dailyStatus === DAILY_STATUS_BAD) return false;
  return null;
};

const buildAvailableDates = (reports, todayString, selectedDate) => {
  const allDates = Array.isArray(reports)
    ? reports.map((r) => getReportLocalDate(r?.occurredAt)).filter(Boolean)
    : [];

  return Array.from(new Set([todayString, selectedDate, ...allDates]))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
};

function App() {
  const todayString = getTodayString();

  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);

  const [backupFiles, setBackupFiles] = useState([]);

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
    const apiLocationNames = locations.map((l) => l.name);
    const fallback =
      apiLocationNames.length > 0 ? apiLocationNames : DEFAULT_LOCATION_OPTIONS;
    return uniqueLocations(fallback);
  }, [locations]);

  const locationIdByName = useMemo(
    () =>
      new Map(
        locations
          .filter((l) => l?.name)
          .map((l) => [l.name, Number(l.id)])
      ),
    [locations]
  );

  const locationNameById = useMemo(
    () =>
      new Map(
        locations.map((l) => [Number(l.id), String(l.name || "")])
      ),
    [locations]
  );

  const deletableLocationOptions = useMemo(
    () => locationOptions.filter((l) => l !== homeLocation),
    [locationOptions, homeLocation]
  );

  const people = useMemo(() => {
    return users.map((user) => {
      const latest = getLatestReportForUser(reports, user.id);
      const location =
        locationNameById.get(Number(latest?.locationId)) ||
        (latest ? String(latest.locationId) : "");

      return {
        person_id: String(user.id),
        full_name: String(user.fullName || ""),
        location,
        daily_status: mapReportStatusToDailyStatus(latest?.isStatusOk),
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

  useEffect(() => {
    void loadDashboard(todayString);
    void loadBackupFiles();
  }, []);

  async function loadBackupFiles() {
    try {
      const res = await fetch("/reports/backup/list");
      if (!res.ok) return;
      const data = await res.json();
      setBackupFiles(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }

  function handleBackupDownload(file) {
    const url = `/reports/backup/download/${encodeURIComponent(file)}`;
    triggerFileDownload(url, file);
  }

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

      setUsers(Array.isArray(u) ? u : []);
      setLocations(Array.isArray(l) ? l : []);
      setReports(Array.isArray(dateR) ? dateR : []);
      setSelectedDate(dateValue);
      setAvailableDates(buildAvailableDates(allR, todayString, dateValue));
    } catch (err) {
      setError(getErrorMessage(err, "טעינת הנתונים נכשלה"));
    } finally {
      setLoading(false);
    }
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
        <h1>ניהול סטטוס יומי ומיקום</h1>
      </header>

      {backupFiles.length > 0 && (
        <section className="toolbar-card">
          <label>גיבויים זמינים</label>
          {backupFiles.map((file) => (
            <div key={file}>
              {file}
              <button onClick={() => handleBackupDownload(file)}>הורד</button>
            </div>
          ))}
        </section>
      )}

      <main className="content-area">
        {loading ? (
          <div>טוען...</div>
        ) : filteredPeople.length === 0 && selectedDate !== todayString ? (
          <div>{REPORTS_UNAVAILABLE_MESSAGE}</div>
        ) : (
          <PersonTable people={filteredPeople} />
        )}
      </main>
    </div>
  );
}

export default App;
