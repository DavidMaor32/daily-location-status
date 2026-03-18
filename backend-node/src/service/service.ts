// @ts-nocheck
import ExcelJS from "exceljs";
import archiver from "archiver";

import { NotFoundError, ValidationError } from "../utils/errors";
import {
  HOME_LOCATION,
  cleanString,
  ensureDailyStatus,
  ensureNonEmpty,
  ensureSelfDailyStatus,
  makeEventId,
  makePersonId,
  nowUtcIso,
  toIsoDate,
} from "../utils/utils";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPersonRecord(person, dateStr) {
  return {
    person_id: person.person_id,
    full_name: person.full_name,
    location: person.location,
    daily_status: person.daily_status,
    self_location: person.self_location || null,
    self_daily_status: person.self_daily_status || null,
    notes: person.notes || "",
    last_updated: person.last_updated || nowUtcIso(),
    date: dateStr,
  };
}

function normalizeNamesList(names) {
  const unique = [];
  const seen = new Set();
  for (const rawName of Array.isArray(names) ? names : []) {
    const fullName = cleanString(rawName);
    if (fullName.length < 2) {
      continue;
    }
    const key = fullName.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(fullName);
  }
  if (!unique.length) {
    throw new ValidationError("At least one valid full name is required");
  }
  return unique;
}

function includeOrFilterVoided(events, includeVoided) {
  return includeVoided ? events : events.filter((item) => !item.is_voided);
}

function sortByOccurredAt(events) {
  return [...events].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
}

export class SnapshotService {
  constructor(storage) {
    this.storage = storage;
  }

  async initializeTodaySnapshot() {
    await this.storage.initialize();
    await this.getSnapshotForDate(toIsoDate(), true);
  }

  async getTodaySnapshot() {
    return this.getSnapshotForDate(toIsoDate(), true);
  }

  async getSnapshotForDate(dateStr, createIfMissing = true) {
    const existing = await this.storage.readSnapshot(dateStr);
    if (existing) {
      return this.asSnapshotResponse(existing, dateStr);
    }
    if (!createIfMissing) {
      throw new NotFoundError("Snapshot was not found");
    }
    const masterPeople = await this.storage.readMasterPeople();
    const people = masterPeople.map((person) =>
      buildPersonRecord(
        {
          person_id: person.person_id,
          full_name: person.full_name,
          location: HOME_LOCATION,
          daily_status: "לא הוזן",
          notes: "",
          last_updated: nowUtcIso(),
        },
        dateStr
      )
    );
    const snapshot = { date: dateStr, people, events: [] };
    await this.storage.writeSnapshot(dateStr, snapshot);
    return this.asSnapshotResponse(snapshot, dateStr);
  }

  async saveSnapshotForDate(dateStr, createIfMissing = true) {
    const snapshot = await this.getSnapshotForDate(dateStr, createIfMissing);
    return { date: dateStr, rows_saved: snapshot.people.length };
  }

  async deleteSnapshotForDate(dateStr) {
    const deleted = await this.storage.deleteSnapshot(dateStr);
    if (!deleted) {
      throw new NotFoundError("Snapshot file was not found");
    }
    return { date: dateStr, deleted: true };
  }

  async listAvailableDates() {
    return this.storage.listSnapshotDates();
  }

  async restoreSnapshotToToday(sourceDate) {
    const source = await this.storage.readSnapshot(sourceDate);
    if (!source) {
      throw new NotFoundError("Source snapshot was not found");
    }
    const today = toIsoDate();
    const restoredPeople = (source.people || []).map((item) => ({
      ...item,
      date: today,
      last_updated: nowUtcIso(),
    }));
    const restoredEvents = (source.events || []).map((item) => ({
      ...item,
      date: today,
    }));
    const snapshot = { date: today, people: restoredPeople, events: restoredEvents };
    await this.storage.writeSnapshot(today, snapshot);
    return this.asSnapshotResponse(snapshot, today);
  }

  async getLocations() {
    return this.storage.readLocations();
  }

  async addLocation(locationName) {
    const normalized = ensureNonEmpty(locationName, "location", 80);
    const locations = await this.storage.readLocations();
    if (locations.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      return locations;
    }
    const next = [...locations, normalized];
    await this.storage.writeLocations(next);
    return next;
  }

  async deleteLocation(locationName) {
    const normalized = ensureNonEmpty(locationName, "location", 80);
    if (normalized === HOME_LOCATION) {
      throw new ValidationError(`Cannot delete required default location "${HOME_LOCATION}"`);
    }
    const locations = await this.storage.readLocations();
    const next = locations.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
    if (next.length === locations.length) {
      throw new NotFoundError("Location was not found");
    }
    if (!next.includes(HOME_LOCATION)) {
      next.unshift(HOME_LOCATION);
    }
    await this.storage.writeLocations(next);
    return next;
  }

  async addInitialPeopleToday(names) {
    const normalizedNames = normalizeNamesList(names);
    const masterPeople = await this.storage.readMasterPeople();
    const existingByName = new Map(masterPeople.map((p) => [p.full_name.toLowerCase(), p]));
    const createdNames = [];
    const skippedNames = [];

    for (const fullName of normalizedNames) {
      if (existingByName.has(fullName.toLowerCase())) {
        skippedNames.push(fullName);
        continue;
      }
      const created = { person_id: makePersonId(fullName), full_name: fullName };
      masterPeople.push(created);
      existingByName.set(fullName.toLowerCase(), created);
      createdNames.push(fullName);
    }
    await this.storage.writeMasterPeople(masterPeople);

    const today = await this.ensureTodaySnapshot();
    const peopleById = new Set(today.people.map((p) => p.person_id));
    for (const name of createdNames) {
      const person = existingByName.get(name.toLowerCase());
      if (!person || peopleById.has(person.person_id)) {
        continue;
      }
      today.people.push(
        buildPersonRecord(
          {
            person_id: person.person_id,
            full_name: person.full_name,
            location: HOME_LOCATION,
            daily_status: "לא הוזן",
            notes: "",
            last_updated: nowUtcIso(),
          },
          today.date
        )
      );
      peopleById.add(person.person_id);
    }
    await this.storage.writeSnapshot(today.date, today);

    return {
      created_count: createdNames.length,
      skipped_count: skippedNames.length,
      created_names: createdNames,
      skipped_names: skippedNames,
    };
  }

  async addPersonToday(payload) {
    const fullName = ensureNonEmpty(payload.full_name, "full_name", 120);
    const location = ensureNonEmpty(payload.location || HOME_LOCATION, "location", 80);
    const dailyStatus = ensureDailyStatus(payload.daily_status);
    const notes = cleanString(payload.notes || "");

    const locations = await this.storage.readLocations();
    this.assertLocationExists(location, locations);

    const masterPeople = await this.storage.readMasterPeople();
    if (masterPeople.some((item) => item.full_name.toLowerCase() === fullName.toLowerCase())) {
      throw new ValidationError("Person with same full_name already exists");
    }

    const personId = makePersonId(fullName);
    masterPeople.push({ person_id: personId, full_name: fullName });
    await this.storage.writeMasterPeople(masterPeople);

    const today = await this.ensureTodaySnapshot();
    const person = buildPersonRecord(
      {
        person_id: personId,
        full_name: fullName,
        location,
        daily_status: dailyStatus,
        notes,
        last_updated: nowUtcIso(),
      },
      today.date
    );
    today.people.push(person);
    await this.storage.writeSnapshot(today.date, today);
    return person;
  }

  async updatePersonToday(personId, payload) {
    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonOrThrow(today, personId);
    const locations = await this.storage.readLocations();

    if (payload.full_name != null) {
      person.full_name = ensureNonEmpty(payload.full_name, "full_name", 120);
    }
    if (payload.location != null) {
      const location = ensureNonEmpty(payload.location, "location", 80);
      this.assertLocationExists(location, locations);
      person.location = location;
    }
    if (payload.daily_status != null) {
      person.daily_status = ensureDailyStatus(payload.daily_status);
    }
    if (payload.self_location != null) {
      const selfLocation = ensureNonEmpty(payload.self_location, "self_location", 80);
      this.assertLocationExists(selfLocation, locations);
      person.self_location = selfLocation;
    }
    if (payload.self_daily_status != null) {
      person.self_daily_status = ensureSelfDailyStatus(payload.self_daily_status);
    }
    if (payload.notes != null) {
      person.notes = cleanString(payload.notes);
    }
    person.last_updated = nowUtcIso();

    await this.storage.writeSnapshot(today.date, today);
    return person;
  }

  async replacePersonToday(personId, payload) {
    const fullName = ensureNonEmpty(payload.full_name, "full_name", 120);
    const location = ensureNonEmpty(payload.location || HOME_LOCATION, "location", 80);
    const dailyStatus = ensureDailyStatus(payload.daily_status);
    const notes = cleanString(payload.notes || "");
    const locations = await this.storage.readLocations();
    this.assertLocationExists(location, locations);

    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonOrThrow(today, personId);
    person.full_name = fullName;
    person.location = location;
    person.daily_status = dailyStatus;
    person.notes = notes;
    person.last_updated = nowUtcIso();

    const master = await this.storage.readMasterPeople();
    const masterRow = master.find((item) => item.person_id === personId);
    if (masterRow) {
      masterRow.full_name = fullName;
      await this.storage.writeMasterPeople(master);
    }

    await this.storage.writeSnapshot(today.date, today);
    return person;
  }

  async deletePersonToday(personId) {
    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonOrThrow(today, personId);
    today.people = today.people.filter((item) => item.person_id !== personId);
    today.events = (today.events || []).filter((item) => item.person_id !== personId);
    await this.storage.writeSnapshot(today.date, today);

    const master = await this.storage.readMasterPeople();
    const nextMaster = master.filter((item) => item.person_id !== personId);
    await this.storage.writeMasterPeople(nextMaster);
    return person;
  }

  async updateSelfReportToday({ person_lookup, self_location, self_daily_status, source }) {
    const lookup = ensureNonEmpty(person_lookup, "person_lookup", 120);
    const selfLocation = ensureNonEmpty(self_location, "self_location", 80);
    const selfStatus = ensureSelfDailyStatus(self_daily_status);

    const locations = await this.storage.readLocations();
    this.assertLocationExists(selfLocation, locations);

    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonByLookup(today, lookup);
    if (!person) {
      throw new NotFoundError("Person was not found");
    }

    person.self_location = selfLocation;
    person.self_daily_status = selfStatus;
    person.location = selfLocation;
    person.daily_status = selfStatus;
    person.last_updated = nowUtcIso();

    const moveEvent = this.createLocationEvent({
      person_id: person.person_id,
      location: selfLocation,
      daily_status: person.daily_status,
      source: source || "self_report_api",
      event_type: "move",
    });
    today.events = [...(today.events || []), moveEvent];

    await this.storage.writeSnapshot(today.date, today);
    return person;
  }

  async getPersonLocationEvents({
    person_id,
    snapshot_date,
    create_if_missing = true,
    include_voided = true,
  }) {
    const snapshot = await this.getSnapshotMutable(snapshot_date, create_if_missing);
    this.findPersonOrThrow(snapshot, person_id);

    const all = (snapshot.events || []).filter((item) => item.person_id === person_id);
    const events = sortByOccurredAt(includeOrFilterVoided(all, include_voided));
    return {
      date: snapshot.date,
      person_id,
      events,
      last_action_event_id: events.length ? events[events.length - 1].event_id : null,
      last_action_type: events.length ? events[events.length - 1].event_type : null,
      latest_transition_warning: null,
    };
  }

  async getPersonLocationTransitions({ person_id, snapshot_date, create_if_missing = true }) {
    const snapshot = await this.getSnapshotMutable(snapshot_date, create_if_missing);
    const person = this.findPersonOrThrow(snapshot, person_id);
    const activeMoves = sortByOccurredAt(
      (snapshot.events || []).filter(
        (item) => item.person_id === person_id && item.event_type === "move" && !item.is_voided
      )
    );

    const transitions = [];
    for (let index = 1; index < activeMoves.length; index += 1) {
      const from = activeMoves[index - 1];
      const to = activeMoves[index];
      if (from.location === to.location) {
        continue;
      }
      const fromDate = new Date(from.occurred_at);
      const toDate = new Date(to.occurred_at);
      const dwellMinutes = Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 60000));
      transitions.push({
        transition_id: `${from.event_id}:${to.event_id}`,
        person_id,
        full_name: person.full_name,
        from_location: from.location,
        to_location: to.location,
        moved_at: to.occurred_at,
        from_occurred_at: from.occurred_at,
        to_occurred_at: to.occurred_at,
        dwell_minutes: dwellMinutes,
        from_event_id: from.event_id,
        to_event_id: to.event_id,
        transition_source: to.source || "manual_ui",
        transition_source_raw: to.source || "manual_ui",
        date: snapshot.date,
      });
    }

    return { date: snapshot.date, person_id, transitions };
  }

  async addLocationEventToday({ person_id, location, daily_status, occurred_at, source }) {
    const normalizedLocation = ensureNonEmpty(location, "location", 80);
    const locations = await this.storage.readLocations();
    this.assertLocationExists(normalizedLocation, locations);

    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonOrThrow(today, person_id);
    const event = this.createLocationEvent({
      person_id,
      location: normalizedLocation,
      daily_status: ensureDailyStatus(daily_status, { allowEmpty: true }) || person.daily_status,
      occurred_at,
      source: source || "manual_ui",
      event_type: "move",
    });
    today.events = [...(today.events || []), event];
    person.location = event.location;
    person.daily_status = event.daily_status;
    person.last_updated = nowUtcIso();
    await this.storage.writeSnapshot(today.date, today);
    return this.getPersonLocationEvents({
      person_id,
      snapshot_date: today.date,
      create_if_missing: true,
      include_voided: true,
    });
  }

  async deleteLocationEventToday({ person_id, event_id, reason }) {
    const deleteReason = reason === "undo" ? "undo" : "correction";
    const today = await this.ensureTodaySnapshot();
    const person = this.findPersonOrThrow(today, person_id);

    const target = (today.events || []).find(
      (item) => item.person_id === person_id && item.event_id === event_id
    );
    if (!target) {
      throw new NotFoundError("Location event was not found");
    }
    if (target.is_voided) {
      throw new ValidationError("Location event is already voided");
    }
    target.is_voided = true;
    target.voided_at = nowUtcIso();

    const voidingEvent = this.createLocationEvent({
      person_id,
      location: target.location,
      daily_status: target.daily_status,
      source: "manual_ui",
      event_type: deleteReason,
      target_event_id: target.event_id,
    });
    target.voided_by_event_id = voidingEvent.event_id;
    today.events = [...(today.events || []), voidingEvent];

    const activeMoves = sortByOccurredAt(
      (today.events || []).filter(
        (item) => item.person_id === person_id && item.event_type === "move" && !item.is_voided
      )
    );
    const latest = activeMoves[activeMoves.length - 1];
    if (latest) {
      person.location = latest.location;
      person.daily_status = latest.daily_status;
    } else {
      person.location = HOME_LOCATION;
      person.daily_status = "לא הוזן";
    }
    person.last_updated = nowUtcIso();

    await this.storage.writeSnapshot(today.date, today);
    return this.getPersonLocationEvents({
      person_id,
      snapshot_date: today.date,
      create_if_missing: true,
      include_voided: true,
    });
  }

  async getSnapshotExcelBytes(dateStr, createIfMissing = true) {
    const snapshot = await this.getSnapshotForDate(dateStr, createIfMissing);
    const mutable = await this.getSnapshotMutable(dateStr, createIfMissing);
    const workbook = new ExcelJS.Workbook();

    const snapshotSheet = workbook.addWorksheet("snapshot");
    snapshotSheet.columns = [
      { header: "person_id", key: "person_id", width: 28 },
      { header: "full_name", key: "full_name", width: 28 },
      { header: "location", key: "location", width: 22 },
      { header: "daily_status", key: "daily_status", width: 14 },
      { header: "self_location", key: "self_location", width: 22 },
      { header: "self_daily_status", key: "self_daily_status", width: 16 },
      { header: "notes", key: "notes", width: 28 },
      { header: "last_updated", key: "last_updated", width: 24 },
      { header: "date", key: "date", width: 14 },
    ];
    snapshot.people.forEach((person) => snapshotSheet.addRow(person));

    const eventsSheet = workbook.addWorksheet("location_events");
    eventsSheet.columns = [
      { header: "event_id", key: "event_id", width: 38 },
      { header: "person_id", key: "person_id", width: 28 },
      { header: "event_type", key: "event_type", width: 12 },
      { header: "location", key: "location", width: 18 },
      { header: "daily_status", key: "daily_status", width: 14 },
      { header: "target_event_id", key: "target_event_id", width: 38 },
      { header: "is_voided", key: "is_voided", width: 10 },
      { header: "voided_at", key: "voided_at", width: 24 },
      { header: "voided_by_event_id", key: "voided_by_event_id", width: 38 },
      { header: "occurred_at", key: "occurred_at", width: 24 },
      { header: "created_at", key: "created_at", width: 24 },
      { header: "source", key: "source", width: 18 },
      { header: "date", key: "date", width: 14 },
    ];
    sortByOccurredAt(mutable.events || []).forEach((event) => eventsSheet.addRow(event));

    const content = await workbook.xlsx.writeBuffer();
    return [`${dateStr}.xlsx`, Buffer.from(content)];
  }

  async getSnapshotsZipBytes(dateFrom, dateTo) {
    if (dateFrom > dateTo) {
      throw new ValidationError("date_from must be smaller than or equal to date_to");
    }
    const allDates = await this.listAvailableDates();
    const inRange = allDates.filter((item) => item >= dateFrom && item <= dateTo);

    const zipBuffer = await new Promise((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks = [];

      archive.on("data", (chunk) => chunks.push(chunk));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));

      (async () => {
        for (const dateStr of inRange) {
          const [filename, content] = await this.getSnapshotExcelBytes(dateStr, false);
          archive.append(content, { name: filename });
        }
        await archive.finalize();
      })().catch(reject);
    });

    return [`snapshots_${dateFrom}_to_${dateTo}.zip`, zipBuffer];
  }

  asSnapshotResponse(snapshot, dateStr) {
    return {
      date: dateStr,
      people: (snapshot.people || []).map((item) => ({
        ...item,
        date: dateStr,
      })),
    };
  }

  createLocationEvent({
    person_id,
    location,
    daily_status,
    occurred_at,
    source,
    event_type,
    target_event_id = null,
  }) {
    const timestamp = occurred_at ? String(occurred_at).trim() : nowUtcIso();
    return {
      event_id: makeEventId(),
      person_id,
      event_type,
      location,
      daily_status,
      target_event_id,
      is_voided: false,
      voided_at: null,
      voided_by_event_id: null,
      occurred_at: timestamp,
      created_at: nowUtcIso(),
      source: source || "manual_ui",
      date: toIsoDate(),
    };
  }

  findPersonOrThrow(snapshot, personId) {
    const person = (snapshot.people || []).find((item) => item.person_id === personId);
    if (!person) {
      throw new NotFoundError("Person was not found");
    }
    return person;
  }

  findPersonByLookup(snapshot, lookup) {
    const normalized = lookup.toLowerCase();
    return (snapshot.people || []).find(
      (item) =>
        item.person_id.toLowerCase() === normalized || item.full_name.toLowerCase() === normalized
    );
  }

  async ensureTodaySnapshot() {
    return this.getSnapshotMutable(toIsoDate(), true);
  }

  async getSnapshotMutable(dateStr, createIfMissing) {
    const existing = await this.storage.readSnapshot(dateStr);
    if (existing) {
      return clone(existing);
    }
    const created = await this.getSnapshotForDate(dateStr, createIfMissing);
    const materialized = await this.storage.readSnapshot(created.date);
    return clone(materialized);
  }

  assertLocationExists(location, locations) {
    if (!locations.includes(location)) {
      throw new ValidationError("Selected location does not exist");
    }
  }
}
