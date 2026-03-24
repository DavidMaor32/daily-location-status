import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "../constants/statuses.ts";

// Toolbar section for filters, location management, report exports, and summary.
function AppToolbar({
  actionLoading,
  canAddLocation,
  canChooseLocationToDelete,
  canDeleteLocation,
  locationOptions,
  deletableLocationOptions,
  downloadFromDate,
  downloadToDate,
  filteredPeopleCount,
  handleAddLocation,
  handleDeleteLocation,
  handleDownloadRangeFiles,
  locationFilter,
  locationToDelete,
  newLocationName,
  onDownloadFromDateChange,
  onDownloadToDateChange,
  onLocationFilterChange,
  onLocationToDeleteChange,
  onNewLocationNameChange,
  onSearchTermChange,
  onStatusFilterChange,
  searchTerm,
  statusFilter,
  todayString,
}) {
  return (
    <section className="toolbar-card">
      {/* Search by name */}
      <div className="filter-group compact-filter-group">
        <label>חיפוש לפי שם</label>
        <input
          placeholder="הקלד שם..."
          value={searchTerm}
          onChange={onSearchTermChange}
        />
      </div>

      {/* Location filter */}
      <div className="filter-group compact-filter-group">
        <label>פילטר מיקום</label>
        <select value={locationFilter} onChange={onLocationFilterChange}>
          <option value="all">הכול</option>
          {locationOptions.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </div>

      {/* Status filter */}
      <div className="filter-group compact-filter-group">
        <label>פילטר סטטוס</label>
        <select value={statusFilter} onChange={onStatusFilterChange}>
          <option value="all">הכול</option>
          <option value={DAILY_STATUS_OK}>תקין</option>
          <option value={DAILY_STATUS_BAD}>לא תקין</option>
          <option value={DAILY_STATUS_MISSING}>לא הוזן</option>
        </select>
      </div>

      {/* Add location */}
      <div className="filter-group location-add-group">
        <label>הוספת מיקום</label>
        <div className="location-add-row">
          <input
            placeholder={'לדוגמה: "מיקום 6"'}
            value={newLocationName}
            onChange={onNewLocationNameChange}
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
            disabled={!canAddLocation}
          >
            הוסף מיקום
          </button>
        </div>
      </div>

      {/* Delete location */}
      {deletableLocationOptions.length > 0 && canChooseLocationToDelete && (
        <div className="filter-group location-delete-group">
          <label>מחיקת מיקום</label>
          <div className="location-delete-row">
            <select
              value={locationToDelete}
              onChange={onLocationToDeleteChange}
            >
              {deletableLocationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
            <button
              className="btn btn-danger"
              onClick={handleDeleteLocation}
              disabled={!canDeleteLocation}
            >
              מחק
            </button>
          </div>
        </div>
      )}

      {/* Download range */}
      <div className="filter-group download-range-group">
        <label>הורד דוחות לפי טווח</label>
        <div className="download-range-row">
          <input
            type="date"
            value={downloadFromDate}
            max={todayString}
            onChange={onDownloadFromDateChange}
          />
          <input
            type="date"
            value={downloadToDate}
            max={todayString}
            onChange={onDownloadToDateChange}
          />
          <button
            className="btn btn-secondary"
            onClick={handleDownloadRangeFiles}
            disabled={actionLoading}
          >
            הורד אקסל
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="filter-group summary-box">
        <label>סה"כ מוצגים</label>
        <strong>{filteredPeopleCount}</strong>
      </div>
    </section>
  );
}

export default AppToolbar;
