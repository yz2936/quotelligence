const cases = [];
const knowledgeFiles = [];

export function listCases() {
  return [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCase(caseId) {
  return cases.find((entry) => entry.caseId === caseId) || null;
}

export function saveCase(caseRecord) {
  const existingIndex = cases.findIndex((entry) => entry.caseId === caseRecord.caseId);

  if (existingIndex >= 0) {
    cases[existingIndex] = caseRecord;
    return caseRecord;
  }

  cases.push(caseRecord);
  return caseRecord;
}

export function listKnowledgeFiles() {
  return [...knowledgeFiles].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getKnowledgeFile(knowledgeFileId) {
  return knowledgeFiles.find((entry) => entry.knowledgeFileId === knowledgeFileId) || null;
}

export function saveKnowledgeFile(knowledgeFile) {
  const existingIndex = knowledgeFiles.findIndex((entry) => entry.knowledgeFileId === knowledgeFile.knowledgeFileId);

  if (existingIndex >= 0) {
    knowledgeFiles[existingIndex] = knowledgeFile;
    return knowledgeFile;
  }

  knowledgeFiles.push(knowledgeFile);
  return knowledgeFile;
}
