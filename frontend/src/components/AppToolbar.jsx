import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "../constants/statuses.ts";

// Toolbar section for filters, location management, bulk add, exports, and summary.
function AppToolbar({
  actionLoading,
  canAddLocation,
  canChooseLocationToDelete,
  canDeleteLocation,
  configuredLocationOptions,
  deletableLocationOptions,
  downloadFromDate,
  downloadToDate,
  filteredPeopleCount,
  handleAddInitialPeopleList,
  handleAddLocation,
  handleDeleteLocation,
  handleDownloadRangeFiles,
  initialPeopleInput,
  isReadOnly,
  locationFilter,
  locationToDelete,
  newLocationName,
  onDownloadFromDateChange,
  onDownloadToDateChange,
  onInitialPeopleInputChange,
  onLocationFilterChange,
  onLocationToDeleteChange,
  onNewLocationNameChange,
  onSearchTermChange,
  onStatusFilterChange,
  openAddModal,
  searchTerm,
  statusFilter,
  todayString,
}) {
  return (
    <section className="toolbar-card">
      <div className="filter-group compact-filter-group">
        <label>חיפוש לפי שם</label>
        <input
          placeholder="הקלד שם..."
          value={searchTerm}
          onChange={onSearchTermChange}
        />
      </div>

      <div className="filter-group compact-filter-group">
        <label>פילטר מיקום</label>
        <select value={locationFilter} onChange={onLocationFilterChange}>
          <option value="all">הכול</option>
          {configuredLocationOptions.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group compact-filter-group">
        <label>פילטר סטטוס</label>
        <select value={statusFilter} onChange={onStatusFilterChange}>
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
        <div className="location-remove-row">
          <select
            value={locationToDelete}
            onChange={onLocationToDeleteChange}
            disabled={!canChooseLocationToDelete}
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
            disabled={!canDeleteLocation}
          >
            מחק מיקום
          </button>
        </div>
        <div className="location-person-action-row">
          <button
            className="btn btn-primary"
            onClick={openAddModal}
            disabled={isReadOnly || actionLoading}
            title={isReadOnly ? "ניתן להוסיף אנשים רק ביום הנוכחי" : ""}
          >
            הוסף אדם
          </button>
        </div>
      </div>

      <div className="filter-group initial-people-group">
        <label>רשימת שמות התחלתית</label>
        <textarea
          placeholder={"שם בכל שורה או מופרד בפסיקים\nלדוגמה:\nיוסי כהן\nדנה לוי"}
          value={initialPeopleInput}
          onChange={onInitialPeopleInputChange}
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
        <label>הורד הכול לפי טווח</label>
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
            הורד הכול (ZIP)
          </button>
        </div>
      </div>

      <div className="filter-group summary-box">
        <label>סה"כ מוצגים</label>
        <strong>{filteredPeopleCount}</strong>
      </div>
    </section>
  );
}

export default AppToolbar;
