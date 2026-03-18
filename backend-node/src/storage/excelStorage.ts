import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { HOME_LOCATION, nowUtcIso } from "../utils/utils";

const PEOPLE_HEADERS = ["person_id", "full_name"];
const LOCATIONS_HEADERS = ["location"];
const SNAPSHOT_HEADERS = [
  "person_id",
  "full_name",
  "location",
  "daily_status",
  "self_location",
  "self_daily_status",
  "notes",
  "last_updated",
  "date",
];
const EVENTS_HEADERS = [
  "event_id",
  "person_id",
  "event_type",
  "location",
  "daily_status",
  "target_event_id",
  "is_voided",
  "voided_at",
  "voided_by_event_id",
  "occurred_at",
  "created_at",
  "source",
  "date",
];

type RowObject = Record<string, string>;
type SnapshotEntity = Record<string, any>;
type SnapshotPayload = { people?: SnapshotEntity[]; events?: SnapshotEntity[] };

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function cleanCell(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

function worksheetRowsToObjects(sheet: ExcelJS.Worksheet | undefined): RowObject[] {
  if (!sheet || sheet.rowCount < 1) {
    return [];
  }
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cleanCell(cell.value);
  });
  const rows: RowObject[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) {
      continue;
    }
    const obj: RowObject = {};
    let hasAny = false;
    for (let col = 1; col < headers.length; col += 1) {
      const key = headers[col];
      if (!key) {
        continue;
      }
      const value = cleanCell(row.getCell(col).value);
      obj[key] = value;
      if (value !== "") {
        hasAny = true;
      }
    }
    if (hasAny) {
      rows.push(obj);
    }
  }
  return rows;
}

function writeObjectsToWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Record<string, unknown>>
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((key) => row[key] ?? ""));
  }
}

export class ExcelStorage {
  private readonly rootDir: string;
  private readonly masterDir: string;
  private readonly snapshotsDir: string;
  private readonly peoplePath: string;
  private readonly locationsPath: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.masterDir = path.join(rootDir, "master");
    this.snapshotsDir = path.join(rootDir, "snapshots");
    this.peoplePath = path.join(this.masterDir, "people_master.xlsx");
    this.locationsPath = path.join(this.masterDir, "locations.xlsx");
  }

  async initialize(): Promise<void> {
    await ensureDir(this.masterDir);
    await ensureDir(this.snapshotsDir);
    if (!(await this.exists(this.peoplePath))) {
      await this.writeMasterPeople([]);
    }
    if (!(await this.exists(this.locationsPath))) {
      await this.writeLocations([HOME_LOCATION]);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return workbook;
  }

  async writeWorkbook(filePath: string, workbook: ExcelJS.Workbook): Promise<void> {
    await ensureDir(path.dirname(filePath));
    await workbook.xlsx.writeFile(filePath);
  }

  async readMasterPeople(): Promise<Array<{ person_id: string; full_name: string }>> {
    if (!(await this.exists(this.peoplePath))) {
      return [];
    }
    const workbook = await this.readWorkbook(this.peoplePath);
    const sheet = workbook.getWorksheet("people") || workbook.worksheets[0];
    const rows = worksheetRowsToObjects(sheet);
    return rows
      .map((item) => ({
        person_id: cleanCell(item.person_id),
        full_name: cleanCell(item.full_name),
      }))
      .filter((item) => item.person_id && item.full_name);
  }

  async writeMasterPeople(people: SnapshotEntity[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    writeObjectsToWorksheet(workbook, "people", PEOPLE_HEADERS, people);
    await this.writeWorkbook(this.peoplePath, workbook);
  }

  async readLocations(): Promise<string[]> {
    if (!(await this.exists(this.locationsPath))) {
      return [HOME_LOCATION];
    }
    const workbook = await this.readWorkbook(this.locationsPath);
    const sheet = workbook.getWorksheet("locations") || workbook.worksheets[0];
    const rows = worksheetRowsToObjects(sheet);
    const locations = rows.map((item) => cleanCell(item.location)).filter(Boolean);
    if (!locations.length) {
      return [HOME_LOCATION];
    }
    if (!locations.includes(HOME_LOCATION)) {
      locations.unshift(HOME_LOCATION);
    }
    return Array.from(new Set(locations));
  }

  async writeLocations(locations: unknown[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const normalized = Array.from(
      new Set((locations || []).map((item) => cleanCell(item)).filter(Boolean))
    );
    if (!normalized.includes(HOME_LOCATION)) {
      normalized.unshift(HOME_LOCATION);
    }
    writeObjectsToWorksheet(
      workbook,
      "locations",
      LOCATIONS_HEADERS,
      normalized.map((location) => ({ location }))
    );
    await this.writeWorkbook(this.locationsPath, workbook);
  }

  snapshotPath(dateStr: string): string {
    return path.join(this.snapshotsDir, `${dateStr}.xlsx`);
  }

  async readSnapshot(dateStr: string): Promise<{ date: string; people: SnapshotEntity[]; events: SnapshotEntity[] } | null> {
    const filePath = this.snapshotPath(dateStr);
    if (!(await this.exists(filePath))) {
      return null;
    }

    const workbook = await this.readWorkbook(filePath);
    const snapshotSheet = workbook.getWorksheet("snapshot") || workbook.worksheets[0];
    const eventsSheet = workbook.getWorksheet("location_events");
    const peopleRows = worksheetRowsToObjects(snapshotSheet);
    const eventRows = worksheetRowsToObjects(eventsSheet);

    const people = peopleRows.map((item) => ({
      person_id: cleanCell(item.person_id),
      full_name: cleanCell(item.full_name),
      location: cleanCell(item.location) || HOME_LOCATION,
      daily_status: cleanCell(item.daily_status) || "לא הוזן",
      self_location: cleanCell(item.self_location) || null,
      self_daily_status: cleanCell(item.self_daily_status) || null,
      notes: cleanCell(item.notes),
      last_updated: cleanCell(item.last_updated) || nowUtcIso(),
      date: cleanCell(item.date) || dateStr,
    }));

    const events = eventRows.map((item) => ({
      event_id: cleanCell(item.event_id),
      person_id: cleanCell(item.person_id),
      event_type: cleanCell(item.event_type),
      location: cleanCell(item.location),
      daily_status: cleanCell(item.daily_status) || "לא הוזן",
      target_event_id: cleanCell(item.target_event_id) || null,
      is_voided: cleanCell(item.is_voided).toLowerCase() === "true",
      voided_at: cleanCell(item.voided_at) || null,
      voided_by_event_id: cleanCell(item.voided_by_event_id) || null,
      occurred_at: cleanCell(item.occurred_at) || nowUtcIso(),
      created_at: cleanCell(item.created_at) || nowUtcIso(),
      source: cleanCell(item.source) || "manual_ui",
      date: cleanCell(item.date) || dateStr,
    }));

    return { date: dateStr, people, events };
  }

  async writeSnapshot(dateStr: string, snapshot: SnapshotPayload): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    writeObjectsToWorksheet(
      workbook,
      "snapshot",
      SNAPSHOT_HEADERS,
      (snapshot.people || []).map((item) => ({
        person_id: item.person_id,
        full_name: item.full_name,
        location: item.location,
        daily_status: item.daily_status,
        self_location: item.self_location || "",
        self_daily_status: item.self_daily_status || "",
        notes: item.notes || "",
        last_updated: item.last_updated || nowUtcIso(),
        date: item.date || dateStr,
      }))
    );
    writeObjectsToWorksheet(
      workbook,
      "location_events",
      EVENTS_HEADERS,
      (snapshot.events || []).map((item) => ({
        event_id: item.event_id,
        person_id: item.person_id,
        event_type: item.event_type,
        location: item.location,
        daily_status: item.daily_status,
        target_event_id: item.target_event_id || "",
        is_voided: item.is_voided ? "true" : "false",
        voided_at: item.voided_at || "",
        voided_by_event_id: item.voided_by_event_id || "",
        occurred_at: item.occurred_at,
        created_at: item.created_at,
        source: item.source || "manual_ui",
        date: item.date || dateStr,
      }))
    );
    await this.writeWorkbook(this.snapshotPath(dateStr), workbook);
  }

  async deleteSnapshot(dateStr: string): Promise<boolean> {
    const filePath = this.snapshotPath(dateStr);
    if (!(await this.exists(filePath))) {
      return false;
    }
    await fs.unlink(filePath);
    return true;
  }

  async listSnapshotDates(): Promise<string[]> {
    await ensureDir(this.snapshotsDir);
    const files = await fs.readdir(this.snapshotsDir);
    return files
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.xlsx$/.test(name))
      .map((name) => name.replace(".xlsx", ""))
      .sort();
  }
}
