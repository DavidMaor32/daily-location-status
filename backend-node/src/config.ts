import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import yaml from "js-yaml";

const PROJECT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PROJECT_DIR, "..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

function yamlGet<T>(source: any, keyPath: string, fallback: T): T {
  const parts = keyPath.split(".");
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return fallback;
    }
    current = current[part];
  }
  return current as T;
}

function toOrigins(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return ["http://localhost:5173"];
}

function toStringList(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toIntList(value: any) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));
  }
  return [];
}

function toBool(value: any, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function cleanStorageMode(rawValue: string) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (["local", "s3", "local_and_s3", "dual", "hybrid"].includes(value)) {
    return value;
  }
  return "local";
}

function cleanStorageBackend(rawValue: string) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "json" || value === "excel") {
    return value;
  }
  return "excel";
}

export function loadConfig() {
  const configPath = process.env.APP_CONFIG_PATH
    ? path.resolve(REPO_ROOT, process.env.APP_CONFIG_PATH)
    : path.join(REPO_ROOT, "config", "app_config.yaml");

  let parsed = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    parsed = yaml.load(raw) || {};
  }

  const configuredStorageDir = yamlGet(parsed, "storage.local_storage_dir", "./backend-node/local_storage");
  const storageDir = process.env.BACKEND_NODE_STORAGE_DIR
    ? path.resolve(REPO_ROOT, process.env.BACKEND_NODE_STORAGE_DIR)
    : path.resolve(REPO_ROOT, configuredStorageDir);

  return {
    appName: yamlGet(parsed, "app.name", "Daily Status Manager API (Node)"),
    port: Number(process.env.BACKEND_NODE_PORT || process.env.PORT || 8000),
    corsOrigins: toOrigins(yamlGet(parsed, "cors.origins", ["http://localhost:5173"])),
    storageBackend: cleanStorageBackend(process.env.BACKEND_NODE_STORAGE_BACKEND || "excel"),
    storageMode: cleanStorageMode(yamlGet(parsed, "storage.mode", "local")),
    storageDir,
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || yamlGet(parsed, "aws.access_key_id", ""),
      secretAccessKey:
        process.env.AWS_SECRET_ACCESS_KEY || yamlGet(parsed, "aws.secret_access_key", ""),
      sessionToken: process.env.AWS_SESSION_TOKEN || yamlGet(parsed, "aws.session_token", ""),
      region: process.env.AWS_REGION || yamlGet(parsed, "aws.region", "us-east-1"),
    },
    s3: {
      bucketName: process.env.S3_BUCKET_NAME || yamlGet(parsed, "storage.s3.bucket_name", ""),
      snapshotsPrefix:
        process.env.S3_SNAPSHOTS_PREFIX || yamlGet(parsed, "storage.s3.snapshots_prefix", "snapshots"),
      masterKey:
        process.env.S3_MASTER_KEY || yamlGet(parsed, "storage.s3.master_key", "master/people_master.xlsx"),
      locationsKey:
        process.env.S3_LOCATIONS_KEY ||
        yamlGet(parsed, "storage.s3.locations_key", "master/locations.xlsx"),
    },
    telegram: {
      enabled: toBool(yamlGet(parsed, "telegram.enabled", false), false),
      botToken:
        process.env.TELEGRAM_BOT_TOKEN ||
        String(yamlGet(parsed, "telegram.bot_token", "") || "").trim(),
      allowedChatIds: toIntList(yamlGet(parsed, "telegram.allowed_chat_ids", [])),
      allowedRemoteNames: toStringList(yamlGet(parsed, "telegram.allowed_remote_names", [])),
      pollTimeoutSeconds: Math.max(
        5,
        Number(yamlGet(parsed, "telegram.poll_timeout_seconds", 25)) || 25
      ),
      pollRetrySeconds: Math.max(
        1,
        Number(yamlGet(parsed, "telegram.poll_retry_seconds", 3)) || 3
      ),
    },
  };
}
