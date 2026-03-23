import { PrismaClient } from "@prisma/client";
import { Workbook } from "exceljs";
import * as fs from "fs";
import * as path from "path";

export class BackupService {
  private interval?: NodeJS.Timeout;
  private readonly backupDir = "/app/backups";
  private readonly intervalMs = 3600000;
  private isRunning = false;

  constructor(private prisma: PrismaClient) {
    this.ensureDir();
  }

  start() {
    console.log("BackupService started");

    this.runBackup();

    this.interval = setInterval(() => {
      this.runBackup();
    }, this.intervalMs);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async runBackup() {
    if (this.isRunning) {
      console.log("Backup skipped (already running)");
      return;
    }

    this.isRunning = true;

    try {
      const now = new Date();
      const filePath = this.getFilePath(now);

      const workbook = fs.existsSync(filePath)
        ? await this.loadWorkbook(filePath)
        : new Workbook();

      const sheetName = this.getSheetName(now);
      let sheet = workbook.getWorksheet(sheetName);

      if (!sheet) {
        sheet = workbook.addWorksheet(sheetName);
      }

      await this.fillSheet(sheet);

      await workbook.xlsx.writeFile(filePath);

      this.cleanOldBackups(30);

      console.log("Backup saved:", filePath);

    } catch (err) {
      console.error("Backup failed:", err);
    } finally {
      this.isRunning = false;
    }
  }

  private async loadWorkbook(filePath: string): Promise<Workbook> {
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);
    return workbook;
  }

  private getFilePath(date: Date): string {
    const dateStr = date.toISOString().split("T")[0];
    return path.join(this.backupDir, `${dateStr}.xlsx`);
  }

  private getSheetName(date: Date): string {
    return date.toTimeString().slice(0,5); // HH:mm
  }

  private ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async fillSheet(sheet: any) {
    sheet.columns = [
      { header: "User", key: "user" },
      { header: "Location", key: "location" },
      { header: "Status", key: "status" },
      { header: "Time", key: "time" },
    ];

    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);

    const reports = await this.prisma.locationReport.findMany({
      where: {
        occurredAt: {
          gte: startOfDay
        }
      },
      include: {
        user: true,
        location: true
      },
      orderBy: {
        occurredAt: "asc"
      }
    });

    reports.forEach(r => {
      sheet.addRow({
        user: r.user.fullName,
        location: r.location.name,
        status: r.isStatusOk,
        time: r.occurredAt
      });
    });
  }

  private cleanOldBackups(days: number) {
    const files = fs.readdirSync(this.backupDir);

    files.forEach(file => {
      if (!file.endsWith(".xlsx")) return;

      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);

      const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (ageDays > days) {
        fs.unlinkSync(filePath);
        console.log("Deleted old backup:", file);
      }
    });
  }
}
