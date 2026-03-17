type StorageLike = {
  initialize: () => Promise<void>;
  readMasterPeople: () => Promise<any[]>;
  writeMasterPeople: (people: any[]) => Promise<void>;
  readLocations: () => Promise<string[]>;
  writeLocations: (locations: string[]) => Promise<void>;
  readSnapshot: (dateStr: string) => Promise<any | null>;
  writeSnapshot: (dateStr: string, snapshot: any) => Promise<void>;
  deleteSnapshot: (dateStr: string) => Promise<boolean>;
  listSnapshotDates: () => Promise<string[]>;
};

export class MirroredStorage {
  private readonly primary: StorageLike;
  private readonly mirror: StorageLike;

  constructor(primary: StorageLike, mirror: StorageLike) {
    this.primary = primary;
    this.mirror = mirror;
  }

  async initialize(): Promise<void> {
    await this.primary.initialize();
    try {
      await this.mirror.initialize();
    } catch {
      // Local should still work even if mirror bootstrap fails.
    }
  }

  async readMasterPeople(): Promise<any[]> {
    const primary = await this.primary.readMasterPeople();
    if (primary.length) {
      return primary;
    }
    const fromMirror = await this.mirror.readMasterPeople();
    if (fromMirror.length) {
      await this.primary.writeMasterPeople(fromMirror);
    }
    return fromMirror;
  }

  async writeMasterPeople(people: any[]): Promise<void> {
    await this.primary.writeMasterPeople(people);
    await this.mirror.writeMasterPeople(people);
  }

  async readLocations(): Promise<string[]> {
    const primary = await this.primary.readLocations();
    if (primary.length) {
      return primary;
    }
    const fromMirror = await this.mirror.readLocations();
    if (fromMirror.length) {
      await this.primary.writeLocations(fromMirror);
    }
    return fromMirror;
  }

  async writeLocations(locations: string[]): Promise<void> {
    await this.primary.writeLocations(locations);
    await this.mirror.writeLocations(locations);
  }

  async readSnapshot(dateStr: string): Promise<any | null> {
    const primary = await this.primary.readSnapshot(dateStr);
    if (primary) {
      return primary;
    }
    const fromMirror = await this.mirror.readSnapshot(dateStr);
    if (fromMirror) {
      await this.primary.writeSnapshot(dateStr, fromMirror);
    }
    return fromMirror;
  }

  async writeSnapshot(dateStr: string, snapshot: any): Promise<void> {
    await this.primary.writeSnapshot(dateStr, snapshot);
    await this.mirror.writeSnapshot(dateStr, snapshot);
  }

  async deleteSnapshot(dateStr: string): Promise<boolean> {
    const [fromPrimary, fromMirror] = await Promise.all([
      this.primary.deleteSnapshot(dateStr),
      this.mirror.deleteSnapshot(dateStr),
    ]);
    return fromPrimary || fromMirror;
  }

  async listSnapshotDates(): Promise<string[]> {
    const [primaryDates, mirrorDates] = await Promise.all([
      this.primary.listSnapshotDates(),
      this.mirror.listSnapshotDates(),
    ]);
    return Array.from(new Set([...primaryDates, ...mirrorDates])).sort();
  }
}
