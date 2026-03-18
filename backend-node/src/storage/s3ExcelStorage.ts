import ExcelJS from "exceljs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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
type RuntimeConfig = {
  s3: {
    bucketName: string;
    snapshotsPrefix?: string;
    masterKey?: string;
    locationsKey?: string;
  };
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
};

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

async function streamToBuffer(stream: AsyncIterable<unknown>): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as any));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export class S3ExcelStorage {
  private readonly bucket: string;
  private readonly snapshotsPrefix: string;
  private readonly masterKey: string;
  private readonly locationsKey: string;
  private readonly client: S3Client;

  constructor(config: RuntimeConfig) {
    if (!config?.s3?.bucketName) {
      throw new Error("S3 bucket is required for s3 storage mode");
    }
    this.bucket = config.s3.bucketName;
    this.snapshotsPrefix = String(config.s3.snapshotsPrefix || "snapshots").replace(/\/+$/, "");
    this.masterKey = config.s3.masterKey || "master/people_master.xlsx";
    this.locationsKey = config.s3.locationsKey || "master/locations.xlsx";
    this.client = new S3Client({
      region: config.aws.region,
      credentials: config.aws.accessKeyId
        ? {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey || "",
            sessionToken: config.aws.sessionToken || undefined,
          }
        : undefined,
    });
  }

  snapshotKey(dateStr: string): string {
    return `${this.snapshotsPrefix}/${dateStr}.xlsx`;
  }

  async initialize(): Promise<void> {
    if (!(await this.keyExists(this.masterKey))) {
      await this.writeMasterPeople([]);
    }
    if (!(await this.keyExists(this.locationsKey))) {
      await this.writeLocations([HOME_LOCATION]);
    }
  }

  async keyExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async readWorkbookByKey(key: string): Promise<ExcelJS.Workbook> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const buffer = await streamToBuffer(response.Body as AsyncIterable<unknown>);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    return workbook;
  }

  async writeWorkbookByKey(key: string, workbook: ExcelJS.Workbook): Promise<void> {
    const content = await workbook.xlsx.writeBuffer();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(content),
      })
    );
  }

  async readMasterPeople(): Promise<Array<{ person_id: string; full_name: string }>> {
    if (!(await this.keyExists(this.masterKey))) {
      return [];
    }
    const workbook = await this.readWorkbookByKey(this.masterKey);
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
    await this.writeWorkbookByKey(this.masterKey, workbook);
  }

  async readLocations(): Promise<string[]> {
    if (!(await this.keyExists(this.locationsKey))) {
      return [HOME_LOCATION];
    }
    const workbook = await this.readWorkbookByKey(this.locationsKey);
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
    await this.writeWorkbookByKey(this.locationsKey, workbook);
  }

  async readSnapshot(dateStr: string): Promise<{ date: string; people: SnapshotEntity[]; events: SnapshotEntity[] } | null> {
    const key = this.snapshotKey(dateStr);
    if (!(await this.keyExists(key))) {
      return null;
    }
    const workbook = await this.readWorkbookByKey(key);
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
    await this.writeWorkbookByKey(this.snapshotKey(dateStr), workbook);
  }

  async deleteSnapshot(dateStr: string): Promise<boolean> {
    const key = this.snapshotKey(dateStr);
    if (!(await this.keyExists(key))) {
      return false;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    return true;
  }

  async listSnapshotDates(): Promise<string[]> {
    const dates: string[] = [];
    let token: string | undefined = undefined;
    do {
      const page: ListObjectsV2CommandOutput = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${this.snapshotsPrefix}/`,
          ContinuationToken: token,
        })
      );
      for (const item of page.Contents || []) {
        const key = item.Key || "";
        const match = key.match(/(\d{4}-\d{2}-\d{2})\.xlsx$/);
        if (match) {
          dates.push(match[1]);
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return Array.from(new Set(dates)).sort();
  }
}
