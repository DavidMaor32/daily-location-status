// End-to-end tests for main snapshot management flows in the UI.
// Responsibility: verify user-critical workflows across list, edit, and save operations.

import { expect, test } from "@playwright/test";

function toDateString(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function setupMockApi(page) {
  const now = new Date();
  const todayDate = toDateString(now);
  const historyDate = toDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const personId = "P-100";
  const defaultLocation = "בבית";
  const defaultStatus = "לא הוזן";
  const trackedLocation = "מיקום 1";
  const okStatus = "תקין";

  const state = {
    todayDate,
    historyDate,
    personId,
    trackedLocation,
    deleteSnapshotCalls: 0,
    deleteLocationCalls: 0,
    addEventCalls: 0,
    undoCalls: 0,
    events: [],
    nextEventId: 1,
    lastActionEventId: "",
    lastActionType: "",
    locations: [defaultLocation, trackedLocation, "מיקום 2"],
    todaySnapshot: {
      date: todayDate,
      people: [
        {
          person_id: personId,
          full_name: "Alice",
          location: defaultLocation,
          daily_status: defaultStatus,
          self_location: "",
          self_daily_status: "",
          notes: "",
          last_updated: `${todayDate}T08:00:00Z`,
          date: todayDate,
        },
      ],
    },
    historySnapshot: {
      date: historyDate,
      people: [
        {
          person_id: personId,
          full_name: "Alice",
          location: trackedLocation,
          daily_status: okStatus,
          self_location: "",
          self_daily_status: "",
          notes: "",
          last_updated: `${historyDate}T08:00:00Z`,
          date: historyDate,
        },
      ],
    },
  };

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      return route.continue();
    }
    const method = request.method().toUpperCase();

    if (method === "GET" && path === "/api/snapshot/today") {
      return route.fulfill({ status: 200, json: state.todaySnapshot });
    }
    if (method === "GET" && path === "/api/history/dates") {
      return route.fulfill({
        status: 200,
        json: { dates: [state.todayDate, state.historyDate] },
      });
    }
    if (method === "GET" && path === "/api/locations") {
      return route.fulfill({ status: 200, json: { locations: state.locations } });
    }
    if (method === "DELETE" && path.startsWith("/api/locations/")) {
      state.deleteLocationCalls += 1;
      const locationName = decodeURIComponent(path.replace("/api/locations/", ""));
      state.locations = state.locations.filter((item) => item !== locationName);
      return route.fulfill({ status: 200, json: { locations: state.locations } });
    }
    if (method === "GET" && path === "/api/system/status") {
      return route.fulfill({
        status: 200,
        json: {
          telegram_enabled: false,
          telegram_configured: false,
          telegram_running: false,
          telegram_healthy: false,
          telegram_active: false,
          telegram_message: "בוט טלגרם לא פעיל",
          telegram_last_error: null,
        },
      });
    }
    if (method === "GET" && path === `/api/snapshot/${state.historyDate}`) {
      return route.fulfill({ status: 200, json: state.historySnapshot });
    }
    if (method === "DELETE" && path === `/api/snapshot/${state.historyDate}`) {
      state.deleteSnapshotCalls += 1;
      return route.fulfill({
        status: 200,
        json: {
          date: state.historyDate,
          snapshot_deleted: true,
          events_existed: false,
          snapshot_events_existed: false,
          legacy_events_existed: false,
          events_deleted: false,
          snapshot_events_deleted: false,
          snapshot_key: `snapshots/${state.historyDate}.xlsx`,
          events_key: `snapshots/${state.historyDate}.xlsx#location_events`,
          legacy_events_key: `snapshots_events/${state.historyDate}.xlsx`,
          legacy_events_deleted: false,
        },
      });
    }

    if (method === "GET" && path === `/api/people/${state.personId}/location-events`) {
      return route.fulfill({
        status: 200,
        json: {
          date: state.todayDate,
          person_id: state.personId,
          events: state.events,
          last_action_event_id: state.lastActionEventId || null,
          last_action_type: state.lastActionType || null,
          latest_transition_warning: null,
        },
      });
    }
    if (method === "GET" && path === `/api/people/${state.personId}/transitions`) {
      return route.fulfill({
        status: 200,
        json: {
          date: state.todayDate,
          person_id: state.personId,
          transitions: [],
        },
      });
    }
    if (method === "POST" && path === `/api/people/${state.personId}/location-events`) {
      state.addEventCalls += 1;
      const body = request.postDataJSON?.() ?? {};
      const location = String(body.location || trackedLocation);
      const dailyStatus = String(body.daily_status || okStatus);
      const timestamp = new Date().toISOString();
      const eventId = `E-${state.nextEventId++}`;

      const eventRow = {
        event_id: eventId,
        person_id: state.personId,
        event_type: "move",
        location,
        daily_status: dailyStatus,
        target_event_id: null,
        is_voided: false,
        voided_at: null,
        voided_by_event_id: null,
        occurred_at: String(body.occurred_at || timestamp),
        created_at: timestamp,
        source: "manual",
        date: state.todayDate,
      };

      state.events = [eventRow, ...state.events];
      state.lastActionEventId = eventId;
      state.lastActionType = "move";
      state.todaySnapshot.people[0].location = location;
      state.todaySnapshot.people[0].daily_status = dailyStatus;
      state.todaySnapshot.people[0].last_updated = timestamp;

      return route.fulfill({
        status: 200,
        json: {
          date: state.todayDate,
          person_id: state.personId,
          events: state.events,
          last_action_event_id: eventId,
          last_action_type: "move",
          latest_transition_warning: null,
        },
      });
    }

    if (
      method === "DELETE" &&
      path.startsWith(`/api/people/${state.personId}/location-events/`)
    ) {
      state.undoCalls += 1;
      const eventId = path.split("/").at(-1) || "";
      state.events = state.events.filter((item) => item.event_id !== eventId);
      state.lastActionEventId = eventId;
      state.lastActionType = "undo";
      state.todaySnapshot.people[0].location = defaultLocation;
      state.todaySnapshot.people[0].daily_status = defaultStatus;
      state.todaySnapshot.people[0].last_updated = new Date().toISOString();

      return route.fulfill({
        status: 200,
        json: {
          date: state.todayDate,
          person_id: state.personId,
          events: state.events,
          last_action_event_id: eventId,
          last_action_type: "undo",
          latest_transition_warning: null,
        },
      });
    }

    return route.fulfill({ status: 404, json: { detail: "Not mocked in e2e" } });
  });

  return state;
}

test("loads a historical date and deletes it with confirmation", async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto("/");

  await page.getByTestId("snapshot-date-input").fill(state.historyDate);
  await page.getByTestId("load-date-button").click();
  await expect(page.getByTestId("delete-date-button")).toBeVisible();

  await page.getByTestId("delete-date-button").click();
  await expect(page.getByTestId("snapshot-date-input")).toHaveValue(state.todayDate);
  await expect(page.getByTestId("delete-date-button")).toHaveCount(0);
  expect(state.deleteSnapshotCalls).toBe(1);
});

test("adds tracking event and undoes it from tracking modal", async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto("/");

  await page.getByTestId(`track-person-${state.personId}`).click();
  await expect(page.getByTestId("tracking-add-event-button")).toBeVisible();

  await page.locator(".tracking-form select").first().selectOption("מיקום 1");
  await page.getByTestId("tracking-add-event-button").click();
  await expect(page.getByTestId("tracking-undo-button")).toBeEnabled();
  expect(state.addEventCalls).toBe(1);

  await page.getByTestId("tracking-undo-button").click();
  await expect(page.getByTestId("tracking-undo-button")).toBeDisabled();
  expect(state.undoCalls).toBe(1);
});

test("deleting location removes it from selectable location options", async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto("/");

  const quickLocationButton = page
    .locator(".quick-actions .btn")
    .filter({ hasText: state.trackedLocation });
  await expect(quickLocationButton.first()).toBeVisible();

  await page.locator(".location-remove-row select").selectOption(state.trackedLocation);
  await page.locator(".location-remove-row .btn.btn-danger").click();

  await expect(quickLocationButton).toHaveCount(0);
  await expect(
    page
      .locator(".compact-filter-group select")
      .first()
      .locator(`option[value="${state.trackedLocation}"]`)
  ).toHaveCount(0);
  expect(state.deleteLocationCalls).toBe(1);
});
