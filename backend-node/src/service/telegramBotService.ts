// @ts-nocheck
import { setTimeout as delay } from "node:timers/promises";

import { toIsoDate } from "../utils/utils";

const STATUS_OPTIONS = ["תקין", "לא תקין"];
const RESTART_FLOW_BUTTON = "להזנה נוספת";
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isCommand(text, command) {
  return text === command || text.startsWith(`${command} `);
}

export class TelegramBotService {
  constructor(config, snapshotService) {
    this.config = config;
    this.snapshotService = snapshotService;
    this.stopRequested = false;
    this.running = false;
    this.healthy = false;
    this.lastError = null;
    this.offset = 0;
    this.conversations = new Map();
    this.savedFullNames = new Map();
  }

  start() {
    if (!this.config.telegram.enabled || !this.config.telegram.botToken || this.running) {
      this.healthy = false;
      return;
    }
    this.stopRequested = false;
    this.running = true;
    this.healthy = true;
    this.lastError = null;
    this.pollLoop().catch((error) => {
      this.running = false;
      this.healthy = false;
      this.lastError = error?.message || String(error);
    });
  }

  stop() {
    this.stopRequested = true;
    this.running = false;
  }

  getRuntimeStatus() {
    const enabled = Boolean(this.config.telegram.enabled);
    const configured = Boolean(this.config.telegram.botToken);
    const active = enabled && configured && this.running && this.healthy;
    let message = "בוט טלגרם לא פעיל";
    if (enabled && !configured) {
      message = "בוט טלגרם לא פעיל (חסר token)";
    } else if (active) {
      message = "בוט טלגרם פעיל";
    } else if (enabled && configured && this.lastError) {
      message = "בוט טלגרם פעיל עם שגיאה אחרונה";
    }
    return {
      telegram_enabled: enabled,
      telegram_configured: configured,
      telegram_running: this.running,
      telegram_healthy: this.healthy,
      telegram_active: active,
      telegram_message: message,
      telegram_last_error: this.lastError,
    };
  }

  async pollLoop() {
    while (!this.stopRequested) {
      try {
        const updates = await this.getUpdates();
        this.healthy = true;
        this.lastError = null;
        for (const update of updates) {
          this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.healthy = false;
        this.lastError = error?.message || String(error);
        await delay(this.config.telegram.pollRetrySeconds * 1000);
      }
    }
  }

  async telegramApiPost(methodName, payload) {
    const token = this.config.telegram.botToken;
    const response = await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      const detail = body?.description || `Telegram API error (${response.status})`;
      throw new Error(detail);
    }
    return body;
  }

  async getUpdates() {
    const payload = {
      timeout: this.config.telegram.pollTimeoutSeconds,
      offset: this.offset,
      allowed_updates: ["message"],
    };
    const body = await this.telegramApiPost("getUpdates", payload);
    return Array.isArray(body.result) ? body.result : [];
  }

  async sendMessage(chatId, text, extra = {}) {
    await this.telegramApiPost("sendMessage", {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  buildReplyKeyboard(options, columns = 2) {
    const keyboard = [];
    for (let index = 0; index < options.length; index += columns) {
      keyboard.push(options.slice(index, index + columns));
    }
    return {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }

  async sendLocationStep(chatId, prefixText = "") {
    const locations = await this.snapshotService.getLocations();
    const text = `${prefixText}${prefixText ? "\n" : ""}שלב 2/3: מה המיקום?`;
    await this.sendMessage(chatId, text, this.buildReplyKeyboard(locations, 2));
  }

  async sendStatusStep(chatId, prefixText = "") {
    const text = `${prefixText}${prefixText ? "\n" : ""}שלב 3/3: מה סטטוס ההזנה? תקין או לא תקין`;
    await this.sendMessage(chatId, text, this.buildReplyKeyboard(STATUS_OPTIONS, 2));
  }

  async sendRestartProcessButton(chatId) {
    await this.sendMessage(chatId, "רוצה לעדכן שוב? אפשר ללחוץ על הכפתור:", {
      ...this.buildReplyKeyboard([RESTART_FLOW_BUTTON], 1),
    });
  }

  async startStatusFlow(chatId) {
    const savedFullName = this.savedFullNames.get(chatId);
    if (savedFullName) {
      this.conversations.set(chatId, { step: "location", full_name: savedFullName });
      await this.sendLocationStep(chatId, `ברוך/ה הבא/ה שוב. משתמשים בשם השמור: ${savedFullName}`);
      return;
    }
    this.conversations.set(chatId, { step: "name" });
    await this.sendMessage(chatId, "שלב 1/3: מה השם של הבן אדם?", {
      reply_markup: { remove_keyboard: true },
    });
  }

  async handleUpdate(update) {
    const message = update?.message || {};
    const text = String(message?.text || "").trim();
    if (!text) {
      return;
    }
    const chatId = Number(message?.chat?.id || 0);
    if (!chatId) {
      return;
    }

    const allowedChatIds = this.config.telegram.allowedChatIds || [];
    if (allowedChatIds.length && !allowedChatIds.includes(chatId)) {
      await this.sendMessage(chatId, "הצ'אט הזה לא מורשה לעדכן סטטוס.");
      return;
    }

    if (isCommand(text, "/help")) {
      await this.sendMessage(
        chatId,
        "פקודות:\n/start\n/cancel\n/locations\n/chatid\n/status שם|מיקום|תקין/לא תקין"
      );
      return;
    }
    if (isCommand(text, "/chatid")) {
      await this.sendMessage(chatId, `chat_id שלך: ${chatId}`);
      return;
    }
    if (isCommand(text, "/locations")) {
      const locations = await this.snapshotService.getLocations();
      await this.sendMessage(chatId, `מיקומים זמינים:\n${locations.map((x) => `- ${x}`).join("\n")}`);
      return;
    }
    if (isCommand(text, "/cancel")) {
      this.conversations.delete(chatId);
      await this.sendMessage(chatId, "התהליך בוטל. להתחלה מחדש שלח /start", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }
    if (isCommand(text, "/status")) {
      const payloadText = text.slice("/status".length).trim();
      if (!payloadText) {
        await this.startStatusFlow(chatId);
        return;
      }
      await this.handleDirectStatus(chatId, payloadText);
      return;
    }
    if (isCommand(text, "/start")) {
      await this.startStatusFlow(chatId);
      return;
    }
    if (text === RESTART_FLOW_BUTTON) {
      await this.startStatusFlow(chatId);
      return;
    }
    if (text.startsWith("/")) {
      await this.sendMessage(chatId, "פקודה לא מוכרת. שלח /help.");
      return;
    }
    if (text.includes("|")) {
      await this.handleDirectStatus(chatId, text);
      return;
    }

    const conversation = this.conversations.get(chatId);
    if (!conversation) {
      await this.sendMessage(chatId, "כדי להתחיל הזנה שלח /start");
      return;
    }
    await this.handleConversationStep(chatId, text, conversation);
  }

  isRemoteNameAllowed(name) {
    const allowList = this.config.telegram.allowedRemoteNames || [];
    if (!allowList.length) {
      return true;
    }
    const normalized = normalize(name);
    return allowList.some((item) => normalize(item) === normalized);
  }

  async handleConversationStep(chatId, text, state) {
    if (state.step === "name") {
      const fullName = String(text || "").trim();
      if (fullName.length < 2) {
        await this.sendMessage(chatId, "יש להזין שם מלא (לפחות 2 תווים).");
        return;
      }
      if (!this.isRemoteNameAllowed(fullName)) {
        await this.sendMessage(chatId, "השם לא מורשה להזנה מרחוק.");
        return;
      }
      this.savedFullNames.set(chatId, fullName);
      this.conversations.set(chatId, { step: "location", full_name: fullName });
      await this.sendLocationStep(chatId);
      return;
    }

    if (state.step === "location") {
      const location = String(text || "").trim();
      const locations = await this.snapshotService.getLocations();
      if (!locations.includes(location)) {
        await this.sendLocationStep(chatId, "המיקום לא נמצא ברשימת המיקומים.");
        return;
      }
      this.conversations.set(chatId, {
        step: "status",
        full_name: state.full_name,
        self_location: location,
      });
      await this.sendStatusStep(chatId);
      return;
    }

    if (state.step === "status") {
      const status = String(text || "").trim();
      if (!STATUS_OPTIONS.includes(status)) {
        await this.sendStatusStep(chatId, "הסטטוס חייב להיות תקין או לא תקין.");
        return;
      }
      const updated = await this.submitStatus({
        personLookup: state.full_name,
        personName: state.full_name,
        selfLocation: state.self_location,
        selfDailyStatus: status,
      });
      this.conversations.delete(chatId);
      await this.sendMessage(
        chatId,
        `ההזנה נקלטה בהצלחה.\nשם: ${updated.full_name}\nמיקום: ${updated.self_location || "-"}\nסטטוס: ${updated.self_daily_status || "-"}`
      );
      await this.sendRestartProcessButton(chatId);
    }
  }

  async handleDirectStatus(chatId, payloadText) {
    const parts = payloadText.split("|").map((item) => item.trim());
    if (parts.length !== 3 || parts.some((item) => !item)) {
      await this.sendMessage(chatId, "פורמט שגוי. השתמש/י: שם|מיקום|תקין/לא תקין");
      return;
    }
    const [personLookup, selfLocation, selfDailyStatus] = parts;
    if (!this.isRemoteNameAllowed(personLookup)) {
      await this.sendMessage(chatId, "השם לא מורשה להזנה מרחוק.");
      return;
    }
    if (!STATUS_OPTIONS.includes(selfDailyStatus)) {
      await this.sendMessage(chatId, "הסטטוס חייב להיות תקין או לא תקין.");
      return;
    }
    try {
      const updated = await this.submitStatus({
        personLookup,
        personName: personLookup,
        selfLocation,
        selfDailyStatus,
      });
      await this.sendMessage(
        chatId,
        `ההזנה נקלטה בהצלחה.\nשם: ${updated.full_name}\nמיקום: ${updated.self_location || "-"}\nסטטוס: ${updated.self_daily_status || "-"}`
      );
      await this.sendRestartProcessButton(chatId);
    } catch (error) {
      await this.sendMessage(chatId, `ההזנה לא נקלטה בהצלחה: ${error?.message || String(error)}`);
    }
  }

  async submitStatus({ personLookup, personName, selfLocation, selfDailyStatus }) {
    try {
      return await this.snapshotService.updateSelfReportToday({
        person_lookup: personLookup,
        self_location: selfLocation,
        self_daily_status: selfDailyStatus,
        source: "self_report_bot",
      });
    } catch {
      const todaySnapshot = await this.snapshotService.getSnapshotForDate(toIsoDate(), true);
      const existing = todaySnapshot.people.find(
        (item) => normalize(item.full_name) === normalize(personLookup)
      );
      const person = existing
        ? existing
        : await this.snapshotService.addPersonToday({
            full_name: personName,
            location: selfLocation,
            daily_status: "לא הוזן",
            notes: "נרשם דרך בוט טלגרם",
          });
      return this.snapshotService.updateSelfReportToday({
        person_lookup: person.person_id,
        self_location: selfLocation,
        self_daily_status: selfDailyStatus,
        source: "self_report_bot",
      });
    }
  }
}
