import { ImapFlow } from "imapflow";

import { extractEmailPackageFromBuffer } from "./file-text-extractor.js";
import { buildCaseFromSubmission } from "./intake-service.js";

export function getEmailIntakeConfig() {
  const host = String(process.env.IMAP_HOST || "").trim();
  const port = Number(process.env.IMAP_PORT || 993);
  const secure = normalizeBooleanEnv(process.env.IMAP_SECURE, true);
  const user = String(process.env.IMAP_USER || "").trim();
  const password = String(process.env.IMAP_PASSWORD || "").trim();
  const folder = String(process.env.IMAP_FOLDER || "INBOX").trim() || "INBOX";
  const processedFolder = String(process.env.IMAP_PROCESSED_FOLDER || "").trim();
  const maxMessagesPerSync = Math.max(1, Number(process.env.IMAP_MAX_MESSAGES_PER_SYNC || 10));

  return {
    configured: Boolean(host && port && user && password && folder),
    host,
    port,
    secure,
    user,
    password,
    folder,
    processedFolder,
    maxMessagesPerSync,
  };
}

export function getEmailIntakePublicConfig() {
  const config = getEmailIntakeConfig();

  return {
    configured: config.configured,
    user: config.user,
    folder: config.folder,
    processedFolder: config.processedFolder,
    maxMessagesPerSync: config.maxMessagesPerSync,
  };
}

export async function syncEmailIntakeMailbox({ ownerUserId = "", ownerEmail = "", language = "en", now = new Date() }) {
  const config = getEmailIntakeConfig();

  if (!config.configured) {
    throw new Error("Email intake is not configured.");
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });

  const createdCases = [];
  const processedMessages = [];
  const failures = [];
  let lock = null;

  try {
    await client.connect();
    lock = await client.getMailboxLock(config.folder);

    let processedCount = 0;

    for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true, source: true }, { uid: true })) {
      if (processedCount >= config.maxMessagesPerSync) {
        break;
      }

      const fileName = buildMailboxMessageFileName(message);
      const emailPackage = extractEmailPackageFromBuffer({
        fileName,
        buffer: Buffer.from(message.source),
      });

      try {
        const intakeFiles = (emailPackage.attachments || []).map(createBufferBackedFile);
        const caseRecord = await buildCaseFromSubmission({
          files: intakeFiles,
          emailText: emailPackage.bodyText,
          language,
          now: new Date(now.getTime() + processedCount * 1000),
        });

        createdCases.push({
          ...caseRecord,
          intakeSource: "email_sync",
          sourceEmail: {
            subject: emailPackage.subject,
            from: emailPackage.from,
            to: emailPackage.to,
            cc: emailPackage.cc,
            mailboxUser: config.user,
            mailboxFolder: config.folder,
          },
          ownerUserId,
          ownerEmail,
        });

        processedMessages.push({
          uid: message.uid,
          subject: emailPackage.subject || message.envelope?.subject || "",
          from: emailPackage.from || formatEnvelopeAddresses(message.envelope?.from),
          attachmentCount: intakeFiles.length,
        });

        await markMessageProcessed(client, message.uid, config);
        processedCount += 1;
      } catch (error) {
        failures.push({
          uid: message.uid,
          subject: emailPackage.subject || message.envelope?.subject || "",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    lock?.release();
    await client.logout().catch(() => {});
  }

  return {
    createdCases,
    processedMessages,
    failures,
    mailbox: {
      user: config.user,
      folder: config.folder,
    },
  };
}

function normalizeBooleanEnv(value, defaultValue) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  return !["false", "0", "no", "off"].includes(normalized);
}

function createBufferBackedFile(attachment) {
  const contentType = String(attachment.contentType || "").trim();

  return {
    name: attachment.name || "email-attachment",
    type: contentType,
    async arrayBuffer() {
      return attachment.buffer.buffer.slice(
        attachment.buffer.byteOffset,
        attachment.buffer.byteOffset + attachment.buffer.byteLength
      );
    },
  };
}

function buildMailboxMessageFileName(message) {
  const subject = String(message.envelope?.subject || "mail").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${subject || "mail"}-${message.uid || Date.now()}.eml`;
}

async function markMessageProcessed(client, uid, config) {
  if (config.processedFolder) {
    try {
      await client.mailboxCreate(config.processedFolder);
    } catch {
      // Ignore create failures if the folder already exists or is managed externally.
    }

    try {
      await client.messageMove({ uid }, config.processedFolder, { uid: true });
      return;
    } catch {
      // Fall back to marking seen if move fails.
    }
  }

  await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
}

function formatEnvelopeAddresses(entries) {
  return (entries || [])
    .map((entry) => `${entry.name || ""}${entry.address ? ` <${entry.address}>` : ""}`.trim())
    .filter(Boolean)
    .join(", ");
}
