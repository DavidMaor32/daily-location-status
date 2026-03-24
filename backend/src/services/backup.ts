import { PrismaClient } from "@prisma/client";
import { Workbook } from "exceljs";
import * as fs from "fs";
import * as path from "path";
import moment from "moment";
import logger from "../utils/logger";

export class BackupService {
  private interval?: NodeJS.Timeout;
  private readonly backupDir = "/app/backups";
  private readonly intervalMs = 3600000;
  private isRunning = false;

  constructor(private prisma: PrismaClient) {
    this.ensureDir();
  }

  start() {
    logger.info("BackupService started");
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
      logger.info("Backup skipped (already running)");
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

      logger.info(`Backup saved: ${filePath}`);

    } catch (err) {
      logger.error("Backup failed", { error: err });
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
    // Format: DD-MM-YYYY.xlsx — matches client requirement
    const day   = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year  = date.getFullYear();
    return path.join(this.backupDir, `${day}-${month}-${year}.xlsx`);
  }

  private getSheetName(date: Date): string {
    // HH-mm format — colons are forbidden in Excel sheet names
    const hours   = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}-${minutes}`;
  }

  private ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async fillSheet(sheet: any) {
    // Only define columns on a new empty sheet.
    // Redefining on an existing sheet corrupts already-written data.
    if (sheet.rowCount === 0) {
      sheet.columns = [
        { header: "User",     key: "user"     },
        { header: "Location", key: "location" },
        { header: "Status",   key: "status"   },
        { header: "Time",     key: "time"     },
      ];
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const reports = await this.prisma.locationReport.findMany({
      where: { occurredAt: { gte: startOfDay } },
      include: { user: true, location: true },
      orderBy: { occurredAt: "asc" },
    });

    reports.forEach((r) => {
      sheet.addRow({
        user:     r.user.fullName,
        location: r.location.name,
        status:   r.isStatusOk,
        time:     r.occurredAt,
      });
    });
  }

  private cleanOldBackups(days: number) {
    fs.readdirSync(this.backupDir)
      .filter((file) => file.endsWith(".xlsx"))
      .forEach((file) => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        const ageDays = moment().diff(moment(stats.mtimeMs), "days");

        if (ageDays > days) {
          fs.unlinkSync(filePath);
          logger.info(`Deleted old backup: ${file}`);
        }
      });
  }
}
