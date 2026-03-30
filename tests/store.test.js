import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  __resetStoreForTests,
  deleteCase,
  getCase,
  getComplaint,
  getKnowledgeFile,
  getStoreHealth,
  listCases,
  listComplaints,
  listKnowledgeFiles,
  saveCase,
  saveComplaint,
  saveKnowledgeFile,
} from "../server/store.js";

test("store persists cases and knowledge files to disk-backed state", async () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}.json`);
  __resetStoreForTests(storePath);

  await saveCase({
    caseId: "QC-100",
    createdAt: "2026-03-28",
    customerName: "Acme Industrial",
  });
  await saveKnowledgeFile({
    knowledgeFileId: "kf-100",
    uploadedAt: "2026-03-28T12:00:00.000Z",
    name: "pricing-sheet.txt",
  });

  assert.equal((await getCase("QC-100"))?.customerName, "Acme Industrial");
  assert.equal((await getKnowledgeFile("kf-100"))?.name, "pricing-sheet.txt");
  assert.equal((await listCases()).length, 1);
  assert.equal((await listKnowledgeFiles()).length, 1);

  const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(persisted.cases.length, 1);
  assert.equal(persisted.knowledgeFiles.length, 1);
});

test("store persists complaints alongside other file-backed data", async () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}-complaints.json`);
  __resetStoreForTests(storePath);

  await saveComplaint({
    complaintId: "CMP-100",
    createdAt: "2026-03-29T12:00:00.000Z",
    updatedAt: "2026-03-29T12:00:00.000Z",
    complaintTitle: "Damaged delivery",
    customerName: "HeatEx",
    summary: "Customer reported transit damage.",
    attachments: [],
  });

  assert.equal((await getComplaint("CMP-100"))?.customerName, "HeatEx");
  assert.equal((await listComplaints()).length, 1);

  const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(persisted.complaints.length, 1);
});

test("store deletes cases and reports healthy file storage", async () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}-delete.json`);
  __resetStoreForTests(storePath);

  await saveCase({
    caseId: "QC-200",
    createdAt: "2026-03-29",
    customerName: "Delete Me",
  });

  assert.equal(await deleteCase("QC-200"), true);
  assert.equal(await deleteCase("QC-404"), false);
  assert.equal(await getCase("QC-200"), null);

  const health = await getStoreHealth();
  assert.equal(health.mode, "file");
  assert.equal(health.healthy, true);
});

test("store scopes cases by owner user id when provided", async () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}-owners.json`);
  __resetStoreForTests(storePath);

  await saveCase(
    {
      caseId: "QC-U1",
      createdAt: "2026-03-29",
      customerName: "User One",
    },
    "user-1"
  );
  await saveCase(
    {
      caseId: "QC-U2",
      createdAt: "2026-03-29",
      customerName: "User Two",
    },
    "user-2"
  );

  assert.equal((await listCases("user-1")).length, 1);
  assert.equal((await listCases("user-1"))[0].caseId, "QC-U1");
  assert.equal((await listCases("user-2")).length, 1);
  assert.equal((await listCases("user-2"))[0].caseId, "QC-U2");
  assert.equal(await getCase("QC-U2", "user-1"), null);
});

test("store scopes complaints and knowledge files by owner user id when provided", async () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}-owned-assets.json`);
  __resetStoreForTests(storePath);

  await saveComplaint(
    {
      complaintId: "CMP-U1",
      createdAt: "2026-03-29T12:00:00.000Z",
      updatedAt: "2026-03-29T12:00:00.000Z",
      complaintTitle: "User one complaint",
      customerName: "HeatEx",
      summary: "Complaint for user one.",
      attachments: [],
    },
    "user-1"
  );
  await saveKnowledgeFile(
    {
      knowledgeFileId: "KF-U2",
      uploadedAt: "2026-03-29T12:00:00.000Z",
      name: "user-two-pricing.xlsx",
    },
    "user-2"
  );

  assert.equal((await listComplaints("user-1")).length, 1);
  assert.equal((await listComplaints("user-2")).length, 0);
  assert.equal((await listKnowledgeFiles("user-2")).length, 1);
  assert.equal((await listKnowledgeFiles("user-1")).length, 0);
  assert.equal(await getComplaint("CMP-U1", "user-2"), null);
  assert.equal(await getKnowledgeFile("KF-U2", "user-1"), null);
});
