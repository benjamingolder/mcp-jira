import { TableClient, TableServiceClient } from "@azure/data-tables";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { JiraCredentials } from "./auth.js";

const TABLE_NAME = "jirausers";
const PARTITION_KEY = "users";

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY muss ein 64-stelliger Hex-String (32 Bytes) sein.");
  }
  return Buffer.from(hex, "hex");
}

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(data: string): string {
  const buf = Buffer.from(data, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function getClient(): TableClient {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  return TableClient.fromConnectionString(connStr, TABLE_NAME);
}

export async function ensureTable(): Promise<void> {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  const serviceClient = TableServiceClient.fromConnectionString(connStr);
  try {
    await serviceClient.createTable(TABLE_NAME);
  } catch {
    // Tabelle existiert bereits – ignorieren
  }
}

export async function getCredentials(userId: string): Promise<JiraCredentials | null> {
  try {
    const entity = await getClient().getEntity<{
      baseUrl: string;
      email: string;
      tokenEncrypted: string;
    }>(PARTITION_KEY, userId);
    return {
      baseUrl: entity.baseUrl,
      email: entity.email,
      token: decrypt(entity.tokenEncrypted),
    };
  } catch {
    return null;
  }
}

export async function saveCredentials(userId: string, creds: JiraCredentials): Promise<void> {
  await getClient().upsertEntity({
    partitionKey: PARTITION_KEY,
    rowKey: userId,
    baseUrl: creds.baseUrl,
    email: creds.email,
    tokenEncrypted: encrypt(creds.token),
  });
}
