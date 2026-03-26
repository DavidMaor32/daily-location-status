import { Alert, Box } from "@mui/material";

import AppToolbar from "./components/AppToolbar";
import UsersAdminToolbar from "./components/UsersAdminToolbar";
import AvailableDateChips from "./components/AvailableDateChips";
import DashboardHeader from "./components/DashboardHeader";
import DashboardMain from "./components/DashboardMain";
import { REPORTS_UNAVAILABLE_MESSAGE } from "./constants/app";
import { useDashboard } from "./hooks/useDashboard";
import { useTheme } from "./hooks/useTheme";

function App() {
  const dashboard = useDashboard();
  const { theme, setTheme } = useTheme();

  return (
    <Box
      sx={{
        width: "min(1240px, 95vw)",
        mx: "auto",
        my: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <DashboardHeader
        todayString={dashboard.todayString}
        selectedDate={dashboard.selectedDate}
        onSelectedDateChange={dashboard.setSelectedDate}
        canLoadSelectedDate={dashboard.canLoadSelectedDate}
        canDownloadSelectedDate={dashboard.canDownloadSelectedDate}
        onLoadSelectedDate={dashboard.handleLoadSelectedDate}
        onDownloadDayFile={() => void dashboard.handleDownloadDayFile()}
        theme={theme}
        onThemeChange={setTheme}
      />

      <UsersAdminToolbar
        busy={dashboard.actionLoading}
        onAddUser={dashboard.handleAddUser}
        onExcelImport={dashboard.handleUsersExcelImport}
      />

      <AppToolbar
        actionLoading={dashboard.actionLoading}
        canAddLocation={dashboard.canAddLocation}
        canChooseLocationToDelete={dashboard.canChooseLocationToDelete}
        canDeleteLocation={dashboard.canDeleteLocation}
        locationOptions={dashboard.locationOptions}
        deletableLocationOptions={dashboard.deletableLocationOptions}
        downloadFromDate={dashboard.downloadFromDate}
        downloadToDate={dashboard.downloadToDate}
        filteredPeopleCount={dashboard.filteredPeople.length}
        handleAddLocation={() => void dashboard.handleAddLocation()}
        handleDeleteLocation={() => void dashboard.handleDeleteLocation()}
        handleDownloadRangeFiles={() =>
          void dashboard.handleDownloadRangeFiles()
        }
        locationFilter={dashboard.locationFilter}
        locationToDelete={dashboard.locationToDelete}
        newLocationName={dashboard.newLocationName}
        onDownloadFromDateChange={dashboard.setDownloadFromDate}
        onDownloadToDateChange={dashboard.setDownloadToDate}
        onLocationFilterChange={dashboard.setLocationFilter}
        onLocationToDeleteChange={dashboard.setLocationToDelete}
        onNewLocationNameChange={dashboard.setNewLocationName}
        onSearchTermChange={dashboard.setSearchTerm}
        onStatusFilterChange={dashboard.setStatusFilter}
        searchTerm={dashboard.searchTerm}
        statusFilter={dashboard.statusFilter}
        todayString={dashboard.todayString}
      />

      <AvailableDateChips
        availableDates={dashboard.availableDates}
        selectedDate={dashboard.selectedDate}
        onSelectDate={dashboard.handleLoadSelectedDate}
      />

      {dashboard.isReadOnly ? (
        <Alert severity="warning" variant="outlined">
          מצב תצוגת היסטוריה: מוצגים דוחות כפי שנמצאו עבור התאריך{" "}
          {dashboard.selectedDate}
        </Alert>
      ) : null}

      {dashboard.error ? (
        <Alert severity="error" variant="outlined">
          {dashboard.error}
        </Alert>
      ) : null}

      <DashboardMain
        loading={dashboard.loading}
        filteredPeople={dashboard.filteredPeople}
        selectedDate={dashboard.selectedDate}
        todayString={dashboard.todayString}
        locationOptions={dashboard.locationOptions}
        isReadOnly={dashboard.isReadOnly}
        actionLoading={dashboard.actionLoading}
        reportsUnavailableMessage={REPORTS_UNAVAILABLE_MESSAGE}
        onQuickUpdate={(personId, patch) =>
          void dashboard.handleQuickUpdate(personId, patch)
        }
      />
    </Box>
  );
}

export default App;
