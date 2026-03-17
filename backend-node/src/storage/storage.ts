import fs from "node:fs/promises";
import path from "node:path";

import { HOME_LOCATION } from "../utils/utils";

type JsonObject = Record<string, unknown>;

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export class JsonStorage {
  private readonly rootDir: string;
  private readonly masterDir: string;
  private readonly snapshotsDir: string;
  private readonly peoplePath: string;
  private readonly locationsPath: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.masterDir = path.join(rootDir, "master");
    this.snapshotsDir = path.join(rootDir, "snapshots");
    this.peoplePath = path.join(this.masterDir, "people_master.json");
    this.locationsPath = path.join(this.masterDir, "locations.json");
  }

  async initialize(): Promise<void> {
    await ensureDir(this.masterDir);
    await ensureDir(this.snapshotsDir);

    if (!(await this.exists(this.peoplePath))) {
      await this.writeJson(this.peoplePath, { people: [] });
    }
    if (!(await this.exists(this.locationsPath))) {
      await this.writeJson(this.locationsPath, { locations: [HOME_LOCATION] });
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

  async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async writeJson(filePath: string, payload: JsonObject): Promise<void> {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async readMasterPeople(): Promise<unknown[]> {
    const payload = await this.readJson<{ people?: unknown[] }>(this.peoplePath, { people: [] });
    return Array.isArray(payload.people) ? payload.people : [];
  }

  async writeMasterPeople(people: unknown[]): Promise<void> {
    await this.writeJson(this.peoplePath, { people });
  }

  async readLocations(): Promise<string[]> {
    const payload = await this.readJson<{ locations?: unknown[] }>(this.locationsPath, {
      locations: [HOME_LOCATION],
    });
    const locations = Array.isArray(payload.locations) ? payload.locations : [HOME_LOCATION];
    const normalized = locations.map((item) => String(item));
    return normalized.length ? normalized : [HOME_LOCATION];
  }

  async writeLocations(locations: string[]): Promise<void> {
    await this.writeJson(this.locationsPath, { locations });
  }

  snapshotPath(dateStr: string): string {
    return path.join(this.snapshotsDir, `${dateStr}.json`);
  }

  async readSnapshot(dateStr: string): Promise<unknown | null> {
    return this.readJson(this.snapshotPath(dateStr), null);
  }

  async writeSnapshot(dateStr: string, snapshot: JsonObject): Promise<void> {
    await this.writeJson(this.snapshotPath(dateStr), snapshot);
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
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.replace(".json", ""))
      .sort();
  }
}
