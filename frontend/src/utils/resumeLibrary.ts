import type {
  ResumeDocument,
  ResumeDocumentSource,
  ResumeTemplate,
  ResumeVersionProvenance,
  ResumeVersion,
  ResumeVersionStatus
} from "@/stores/studentWorkbench";

export const RESUME_LIBRARY_SCHEMA = "get-yourself.resume-library";

export interface ResumeLibraryVersion {
  versionId: string;
  version: number;
  status: ResumeVersionStatus;
  templateId: string;
  updatedAt: string;
  source: ResumeDocumentSource;
  changeNote: string;
  content: string;
  fileName?: string;
  finalPlanId?: string;
  finalPlanContentHash?: string;
  finalDocumentContentHash?: string;
  renderId?: string;
  renderContentHash?: string;
  sourceFileContentHash?: string;
}

export interface ResumeLibraryDocument {
  documentId: string;
  title: string;
  targetRole: string;
  activeVersionId: string;
  versions: ResumeLibraryVersion[];
}

export interface ResumeLibrary {
  schema: string;
  schemaVersion: number;
  libraryId: string;
  generatedAt: string;
  traceId: string;
  confirmation: string;
  documents: ResumeLibraryDocument[];
}

export interface CanonicalResumeLibrary {
  library: ResumeLibrary;
  contentHash: string;
  documentCount: number;
  versionCount: number;
}

export interface ImportedResumeLibrary extends CanonicalResumeLibrary {
  fileName: string;
}

type UnknownRecord = Record<string, unknown>;

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const DISPLAY_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/;
const UNSAFE_CONTENT_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FILE_NAME_PATTERN = /^[^\\/:*?"<>|\r\n]{1,110}\.[A-Za-z0-9]{1,12}$/;
const WINDOWS_RESERVED_FILE_NAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const VERSION_STATUSES = new Set<ResumeVersionStatus>(["draft", "final", "exported"]);
const VERSION_SOURCES = new Set<ResumeDocumentSource>(["agent", "import", "manual"]);
const LIBRARY_FIELDS = [
  "schema",
  "schemaVersion",
  "libraryId",
  "generatedAt",
  "traceId",
  "confirmation",
  "documents"
];
const DOCUMENT_FIELDS = ["documentId", "title", "targetRole", "activeVersionId", "versions"];
const VERSION_FIELDS = [
  "versionId",
  "version",
  "status",
  "templateId",
  "updatedAt",
  "source",
  "changeNote",
  "content",
  "fileName",
  "finalPlanId",
  "finalPlanContentHash",
  "finalDocumentContentHash",
  "renderId",
  "renderContentHash",
  "sourceFileContentHash"
];

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("简历版本库结构无效");
  }
  return value as UnknownRecord;
}

function rejectUnknownFields(record: UnknownRecord, fields: string[], path: string) {
  const unknown = Object.keys(record).filter(key => !fields.includes(key));
  if (unknown.length > 0) throw new Error(`${path} 包含未知字段：${unknown.join(", ")}`);
}

function requireString(
  value: unknown,
  path: string,
  { min = 1, max = 240 }: { min?: number; max?: number } = {}
) {
  if (typeof value !== "string") throw new Error(`${path} 必须是字符串`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new Error(`${path} 长度必须在 ${min} 到 ${max} 之间`);
  }
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${path} 包含控制字符`);
  return text;
}

function requireSafeId(value: unknown, path: string) {
  const text = requireString(value, path, { min: 1, max: 64 });
  if (!SAFE_ID_PATTERN.test(text)) throw new Error(`${path} 包含不支持的字符`);
  return text;
}

function requireTimestamp(value: unknown, path: string) {
  const text = requireString(value, path, { min: 20, max: 40 });
  if (!TIMESTAMP_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${path} 必须是 UTC 时间`);
  }
  return new Date(text).toISOString();
}

function requireEnumValue<T extends string>(value: unknown, path: string, allowed: Set<T>): T {
  const text = requireString(value, path, { min: 1, max: 40 });
  if (!allowed.has(text as T)) throw new Error(`${path} 不是支持的枚举值`);
  return text as T;
}

function requireVersionContent(value: unknown, path: string) {
  if (typeof value !== "string") throw new Error(`${path} 必须是字符串`);
  if (value.length < 1 || value.length > 128 * 1024) {
    throw new Error(`${path} 长度必须在 1 到 131072 个字符之间`);
  }
  if (UNSAFE_CONTENT_CONTROL_PATTERN.test(value)) throw new Error(`${path} 包含控制字符`);
  return value;
}

function requireFileName(value: unknown, path: string) {
  const text = requireString(value, path, { min: 5, max: 120 });
  if (!FILE_NAME_PATTERN.test(text)) throw new Error(`${path} 不能包含路径分隔符`);
  if (WINDOWS_RESERVED_FILE_NAME_PATTERN.test(text)) throw new Error(`${path} 不能使用 Windows 保留设备名`);
  return text;
}

function requireContentHash(value: unknown, path: string) {
  const text = requireString(value, path, { min: 71, max: 71 });
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw new Error(`${path} 必须使用 sha256:<64 位小写十六进制>`);
  }
  return text;
}

function requireArray(value: unknown, path: string, min: number, max: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${path} 数量必须在 ${min} 到 ${max} 之间`);
  }
  return value;
}

async function sha256Json(value: unknown) {
  return sha256Text(JSON.stringify(value));
}

export async function sha256Text(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonicalizeVersion(value: unknown, path: string, templateIds: Set<string>) {
  const record = asRecord(value);
  rejectUnknownFields(record, VERSION_FIELDS, path);
  const templateId = requireSafeId(record.templateId, `${path}.templateId`);
  if (!templateIds.has(templateId)) throw new Error(`${path}.templateId 不是支持的模板`);
  const version = Number(record.version);
  if (!Number.isInteger(version) || version < 1 || version > 100) {
    throw new Error(`${path}.version 必须是 1 到 100 的整数`);
  }
  const canonical: ResumeLibraryVersion = {
    versionId: requireSafeId(record.versionId, `${path}.versionId`),
    version,
    status: requireEnumValue(record.status, `${path}.status`, VERSION_STATUSES),
    templateId,
    updatedAt: requireTimestamp(record.updatedAt, `${path}.updatedAt`),
    source: requireEnumValue(record.source, `${path}.source`, VERSION_SOURCES),
    changeNote: requireString(record.changeNote, `${path}.changeNote`, { min: 2, max: 500 }),
    content: requireVersionContent(record.content, `${path}.content`)
  };
  if (record.fileName !== undefined) {
    canonical.fileName = requireFileName(record.fileName, `${path}.fileName`);
  }
  const finalFields = ["finalPlanId", "finalPlanContentHash", "finalDocumentContentHash"] as const;
  const finalPresent = finalFields.filter(field => record[field] !== undefined);
  if (finalPresent.length > 0 && finalPresent.length !== finalFields.length) {
    throw new Error(`${path}.finalPlanId、finalPlanContentHash 与 finalDocumentContentHash 必须成组提供`);
  }
  if (finalPresent.length === finalFields.length) {
    if (canonical.status === "draft") throw new Error(`${path}.草稿不能绑定不可变定稿指纹`);
    canonical.finalPlanId = requireSafeId(record.finalPlanId, `${path}.finalPlanId`);
    canonical.finalPlanContentHash = requireContentHash(record.finalPlanContentHash, `${path}.finalPlanContentHash`);
    canonical.finalDocumentContentHash = requireContentHash(
      record.finalDocumentContentHash,
      `${path}.finalDocumentContentHash`
    );
  }
  if (record.renderId !== undefined || record.renderContentHash !== undefined) {
    if (record.renderId === undefined || record.renderContentHash === undefined) {
      throw new Error(`${path}.renderId 与 renderContentHash 必须成组提供`);
    }
    if (canonical.source !== "import") throw new Error(`${path}.渲染包指纹只能用于导入版本`);
    canonical.renderId = requireSafeId(record.renderId, `${path}.renderId`);
    canonical.renderContentHash = requireContentHash(record.renderContentHash, `${path}.renderContentHash`);
  }
  if (record.sourceFileContentHash !== undefined) {
    if (canonical.source !== "import") throw new Error(`${path}.导入文件指纹只能用于导入版本`);
    if (canonical.fileName === undefined) throw new Error(`${path}.导入文件指纹必须同时记录 fileName`);
    canonical.sourceFileContentHash = requireContentHash(
      record.sourceFileContentHash,
      `${path}.sourceFileContentHash`
    );
  }
  return canonical;
}

export async function canonicalizeResumeLibrary(
  value: unknown,
  allowedTemplates: readonly ResumeTemplate[]
): Promise<CanonicalResumeLibrary> {
  const templateIds = new Set(allowedTemplates.map(template => template.id));
  if (templateIds.size === 0) throw new Error("简历模板目录不能为空");
  const record = asRecord(value);
  rejectUnknownFields(record, LIBRARY_FIELDS, "简历版本库");
  if (record.schema !== RESUME_LIBRARY_SCHEMA) {
    throw new Error("只支持 get-yourself.resume-library v1 文件");
  }
  if (record.schemaVersion !== 1) throw new Error("简历版本库版本不支持");
  if (record.confirmation !== "user_confirmed") throw new Error("简历版本库尚未经过用户确认");

  const rawDocuments = requireArray(record.documents, "简历版本库.documents", 0, 100);
  const documentIds = new Set<string>();
  const versionIds = new Set<string>();
  const documents = rawDocuments.map((rawDocument, documentIndex) => {
    const path = `简历线 ${documentIndex + 1}`;
    const documentRecord = asRecord(rawDocument);
    rejectUnknownFields(documentRecord, DOCUMENT_FIELDS, path);
    const documentId = requireSafeId(documentRecord.documentId, `${path}.documentId`);
    if (documentIds.has(documentId)) throw new Error(`${path}.documentId 不能重复`);
    documentIds.add(documentId);

    const versions = requireArray(documentRecord.versions, `${path}.versions`, 1, 100).map(
      (version, versionIndex) => {
        const canonical = canonicalizeVersion(version, `${path}.版本 ${versionIndex + 1}`, templateIds);
        if (versionIds.has(canonical.versionId)) {
          throw new Error(`${path}.版本 ${versionIndex + 1}.versionId 在全库重复`);
        }
        versionIds.add(canonical.versionId);
        return canonical;
      }
    );
    versions.forEach((version, index) => {
      if (version.version !== index + 1) throw new Error(`${path}.versions 必须按 1..N 连续排序`);
    });
    if (versions.filter(version => version.status === "draft").length > 1) {
      throw new Error(`${path} 同时最多只能有一个草稿`);
    }
    const activeVersionId = requireSafeId(documentRecord.activeVersionId, `${path}.activeVersionId`);
    const activeVersion = versions.find(version => version.versionId === activeVersionId);
    if (!activeVersion) throw new Error(`${path}.activeVersionId 必须指向本简历线版本`);
    if (activeVersion.status === "draft") throw new Error(`${path}.当前投递版不能是草稿`);

    return {
      documentId,
      title: requireString(documentRecord.title, `${path}.title`, { min: 2, max: 100 }),
      targetRole: requireString(documentRecord.targetRole, `${path}.targetRole`, { min: 2, max: 100 }),
      activeVersionId,
      versions
    };
  });

  const library: ResumeLibrary = {
    schema: RESUME_LIBRARY_SCHEMA,
    schemaVersion: 1,
    libraryId: requireSafeId(record.libraryId, "简历版本库.libraryId"),
    generatedAt: requireTimestamp(record.generatedAt, "简历版本库.generatedAt"),
    traceId: requireSafeId(record.traceId, "简历版本库.traceId"),
    confirmation: "user_confirmed",
    documents
  };
  const {
    generatedAt: _generatedAt,
    traceId: _traceId,
    ...hashValue
  } = library;
  return {
    library,
    contentHash: await sha256Json(hashValue),
    documentCount: documents.length,
    versionCount: documents.reduce((total, document) => total + document.versions.length, 0)
  };
}

function defaultDocumentContractId(document: ResumeDocument) {
  return `resume-doc-${document.id}`;
}

function defaultVersionContractId(version: ResumeVersion) {
  return `resume-version-${version.id}`;
}

function lockContractId(requested: string, used: Set<string>) {
  if (used.has(requested)) throw new Error("简历契约 ID 重复");
  used.add(requested);
  return requested;
}

function allocateDefaultContractId(requested: string, used: Set<string>) {
  if (!used.has(requested)) {
    used.add(requested);
    return requested;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${requested.slice(0, 64 - ending.length)}${ending}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error("无法分配唯一的简历契约 ID");
}

function contractTimestamp(value: string, fallback: string) {
  if (TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (DISPLAY_TIMESTAMP_PATTERN.test(value)) {
    const seconds = value.length === 16 ? ":00" : "";
    const time = new Date(`${value.replace(" ", "T")}${seconds}+08:00`);
    if (!Number.isNaN(time.getTime())) return time.toISOString();
  }
  return fallback;
}

export function formatResumeLibraryTimestamp(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export async function buildResumeLibrary(input: {
  documents: ResumeDocument[];
  allowedTemplates: readonly ResumeTemplate[];
}): Promise<CanonicalResumeLibrary> {
  const generatedAt = new Date().toISOString();
  const stamp = Date.now().toString(36);
  const sortedDocuments = [...input.documents].sort((a, b) => a.id - b.id);
  const usedDocumentIds = new Set<string>();
  const allVersions = sortedDocuments.flatMap(document => [...document.versions]
    .sort((a, b) => a.version - b.version));
  const usedVersionIds = new Set<string>();
  const versionContractIds = new Map<number, string>();
  for (const version of allVersions) {
    if (version.libraryVersionId) {
      versionContractIds.set(version.id, lockContractId(version.libraryVersionId, usedVersionIds));
    }
  }
  for (const version of allVersions) {
    if (!versionContractIds.has(version.id)) {
      versionContractIds.set(
        version.id,
        allocateDefaultContractId(defaultVersionContractId(version), usedVersionIds)
      );
    }
  }
  for (const document of sortedDocuments) {
    if (document.libraryDocumentId) lockContractId(document.libraryDocumentId, usedDocumentIds);
  }
  const documents = sortedDocuments.map(document => {
    const documentId = document.libraryDocumentId
      ?? allocateDefaultContractId(defaultDocumentContractId(document), usedDocumentIds);
    const versions = [...document.versions]
      .sort((a, b) => a.version - b.version)
      .map(version => ({
        versionId: versionContractIds.get(version.id) ?? defaultVersionContractId(version),
        version: version.version,
        status: version.status,
        templateId: version.templateId,
        updatedAt: contractTimestamp(version.updatedAt, generatedAt),
        source: version.source,
        changeNote: version.changeNote,
        content: version.content,
        ...(version.fileName ? { fileName: version.fileName } : {}),
        ...(version.provenance ? versionProvenanceToContract(version.provenance) : {})
      }));
    const activeVersion = document.versions.find(version => version.id === document.activeVersionId)
      ?? document.versions[0];
    const activeVersionId = versionContractIds.get(activeVersion.id);
    return {
      documentId,
      title: document.title,
      targetRole: document.targetRole,
      activeVersionId: activeVersionId ?? versions[0].versionId,
      versions
    };
  });
  return canonicalizeResumeLibrary(
    {
      schema: RESUME_LIBRARY_SCHEMA,
      schemaVersion: 1,
      libraryId: "web-resume-library",
      generatedAt,
      traceId: `trace.resume-library-${stamp}`,
      confirmation: "user_confirmed",
      documents
    },
    input.allowedTemplates
  );
}

function versionProvenanceToContract(provenance: ResumeVersionProvenance) {
  return {
    ...(provenance.finalPlanId ? {
      finalPlanId: provenance.finalPlanId,
      finalPlanContentHash: provenance.finalPlanContentHash,
      finalDocumentContentHash: provenance.finalDocumentContentHash
    } : {}),
    ...(provenance.renderId ? {
      renderId: provenance.renderId,
      renderContentHash: provenance.renderContentHash
    } : {}),
    ...(provenance.sourceFileContentHash ? {
      sourceFileContentHash: provenance.sourceFileContentHash
    } : {})
  };
}

export async function importResumeLibraryFile(
  text: string,
  fileName: string,
  allowedTemplates: readonly ResumeTemplate[]
) {
  const parsed = await canonicalizeResumeLibrary(JSON.parse(text), allowedTemplates);
  return { ...parsed, fileName };
}
