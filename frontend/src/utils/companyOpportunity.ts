export const COMPANY_OPPORTUNITY_SCHEMA = "get-yourself.company-opportunity";
export const COMPANY_OPPORTUNITY_NODE_SCHEMA =
  "get-yourself.company-opportunity-node-mutation";

export type LocalProcessNodeType =
  | "jd_analysis"
  | "resume_adaptation"
  | "submission"
  | "interview"
  | "offer"
  | "review_sedimentation"
  | "custom";

export type LocalProcessNodeStatus =
  | "todo"
  | "active"
  | "waiting"
  | "passed"
  | "failed"
  | "offer";

export type LocalArtifactKind =
  | "job_analysis"
  | "resume_render"
  | "interview_prep"
  | "interview_review"
  | "capability_feedback";

export interface LocalMountedArtifact {
  kind: LocalArtifactKind;
  title: string;
  path: string;
  contentHash: string;
  mountId: string;
}

export interface LocalProcessNode {
  id: string;
  type: LocalProcessNodeType;
  title: string;
  status: LocalProcessNodeStatus;
  skillKey?: string;
  note?: string;
}

export interface LocalInstalledProcessNode extends LocalProcessNode {
  artifacts?: LocalMountedArtifact[];
}

export interface LocalCompanyOpportunity {
  schema: string;
  schemaVersion: number;
  opportunityId: string;
  generatedAt: string;
  traceId: string;
  confirmation: string;
  analysisId: string;
  analysisContentHash: string;
  company: string;
  role: string;
  recruitmentBatch: string;
  location: string;
  initialTrackerStatus: string;
  trackerStatus?: string;
  processNodes: LocalInstalledProcessNode[];
}

export interface ImportedLocalOpportunity {
  opportunity: LocalCompanyOpportunity;
  contentHash: string;
  fileName: string;
}

export interface CompanyOpportunityNodeMutationPlan {
  schema: string;
  schemaVersion: number;
  mutationId: string;
  opportunityId: string;
  generatedAt: string;
  traceId: string;
  confirmation: string;
  expectedOpportunityContentHash: string;
  changeSummary: string;
  processNodes: LocalProcessNode[];
}

type UnknownRecord = Record<string, unknown>;

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const NODE_TYPES = new Set<LocalProcessNodeType>([
  "jd_analysis",
  "resume_adaptation",
  "submission",
  "interview",
  "offer",
  "review_sedimentation",
  "custom"
]);

const NODE_STATUSES = new Set<LocalProcessNodeStatus>([
  "todo",
  "active",
  "waiting",
  "passed",
  "failed",
  "offer"
]);

const OPPORTUNITY_FIELDS = [
  "schema",
  "schemaVersion",
  "opportunityId",
  "generatedAt",
  "traceId",
  "confirmation",
  "analysisId",
  "analysisContentHash",
  "company",
  "role",
  "recruitmentBatch",
  "location",
  "initialTrackerStatus",
  "trackerStatus",
  "processNodes"
];

const NODE_FIELDS = ["id", "type", "title", "status", "skillKey", "note"];
const INSTALLED_NODE_FIELDS = [...NODE_FIELDS, "artifacts"];
const ARTIFACT_KINDS = new Set<LocalArtifactKind>([
  "job_analysis",
  "resume_render",
  "interview_prep",
  "interview_review",
  "capability_feedback"
]);
const ARTIFACT_KIND_PREFIXES: Record<LocalArtifactKind, string[]> = {
  job_analysis: ["data/job-analysis/", "reports/job-analysis/"],
  resume_render: ["data/resume-render/", "output/resume/"],
  interview_prep: ["data/interview-prep/", "interview-prep/"],
  interview_review: ["data/interview-review/", "interview-prep/sessions/"],
  capability_feedback: ["data/capability-feedback/", "reports/capability-feedback/"]
};
const ARTIFACT_NODE_TYPES: Record<LocalArtifactKind, LocalProcessNodeType[]> = {
  job_analysis: ["jd_analysis", "custom"],
  resume_render: ["resume_adaptation", "submission", "custom"],
  interview_prep: ["interview", "custom"],
  interview_review: ["interview", "review_sedimentation", "custom"],
  capability_feedback: ["review_sedimentation", "custom"]
};

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("本地机会文件结构无效");
  }
  return value as UnknownRecord;
}

function readString(
  value: unknown,
  path: string,
  { min = 1, max = 240 }: { min?: number; max?: number } = {}
) {
  if (typeof value !== "string") throw new Error(`${path} 必须是字符串`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new Error(`${path} 长度必须在 ${min} 到 ${max} 之间`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(text)) throw new Error(`${path} 包含控制字符`);
  return text;
}

function readSafeId(value: unknown, path: string) {
  const text = readString(value, path, { min: 1, max: 64 });
  if (!SAFE_ID_PATTERN.test(text)) throw new Error(`${path} 包含不支持的字符`);
  return text;
}

function readTimestamp(value: unknown, path: string) {
  const text = readString(value, path, { min: 20, max: 40 });
  if (!TIMESTAMP_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${path} 必须是 UTC 时间`);
  }
  return text;
}

function readContentHash(value: unknown, path: string) {
  const text = readString(value, path, { min: 71, max: 71 });
  if (!CONTENT_HASH_PATTERN.test(text)) throw new Error(`${path} 必须是 sha256 哈希`);
  return text;
}

function readEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: Set<T>
): T {
  const text = readString(value, path, { min: 1, max: 40 });
  if (!allowed.has(text as T)) throw new Error(`${path} 不是支持的枚举值`);
  return text as T;
}

function rejectUnknownFields(record: UnknownRecord, fields: string[], path: string) {
  const unknown = Object.keys(record).filter(key => !fields.includes(key));
  if (unknown.length > 0) throw new Error(`${path} 包含未知字段：${unknown.join(", ")}`);
}

function canonicalizeNode(value: unknown, index: number): LocalProcessNode {
  const record = asRecord(value);
  const path = `流程节点 ${index + 1}`;
  rejectUnknownFields(record, NODE_FIELDS, path);
  const node: LocalProcessNode = {
    id: readSafeId(record.id, `${path}.id`),
    type: readEnumValue(record.type, `${path}.type`, NODE_TYPES),
    title: readString(record.title, `${path}.title`, { min: 2, max: 80 }),
    status: readEnumValue(record.status, `${path}.status`, NODE_STATUSES)
  };
  if (record.skillKey !== undefined) {
    node.skillKey = readSafeId(record.skillKey, `${path}.skillKey`);
  }
  if (record.note !== undefined) {
    node.note = readString(record.note, `${path}.note`, { min: 1, max: 500 });
  }
  return node;
}

function normalizeArtifactPath(value: unknown, path: string) {
  const text = readString(value, path, { min: 5, max: 240 });
  if (text.includes("\\") || text.split("/").some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error(`${path} 必须是本地数据根下的标准化相对路径`);
  }
  return text;
}

function canonicalizeInstalledNode(value: unknown, index: number): LocalInstalledProcessNode {
  const record = asRecord(value);
  const path = `流程节点 ${index + 1}`;
  rejectUnknownFields(record, INSTALLED_NODE_FIELDS, path);
  const node = canonicalizeNode(
    Object.fromEntries(NODE_FIELDS.map(field => [field, record[field]])),
    index
  );
  if (record.artifacts === undefined) return node;
  if (!Array.isArray(record.artifacts) || record.artifacts.length > 20) {
    throw new Error(`${path}.artifacts 数量无效`);
  }

  const artifacts = record.artifacts.map((artifact, artifactIndex) => {
    const artifactRecord = asRecord(artifact);
    const artifactPath = `${path}.artifacts ${artifactIndex + 1}`;
    rejectUnknownFields(
      artifactRecord,
      ["kind", "title", "path", "contentHash", "mountId"],
      artifactPath
    );
    const kind = readEnumValue(artifactRecord.kind, `${artifactPath}.kind`, ARTIFACT_KINDS);
    const mountedPath = normalizeArtifactPath(artifactRecord.path, `${artifactPath}.path`);
    if (!ARTIFACT_KIND_PREFIXES[kind].some(prefix => mountedPath.startsWith(prefix))) {
      throw new Error(`${artifactPath}.path 不是该产物类型允许的本地目录`);
    }
    if (!ARTIFACT_NODE_TYPES[kind].includes(node.type)) {
      throw new Error(`${artifactPath}.kind 与节点类型不兼容`);
    }
    return {
      kind,
      title: readString(artifactRecord.title, `${artifactPath}.title`, { min: 2, max: 80 }),
      path: mountedPath,
      contentHash: readContentHash(artifactRecord.contentHash, `${artifactPath}.contentHash`),
      mountId: readSafeId(artifactRecord.mountId, `${artifactPath}.mountId`)
    };
  });
  if (new Set(artifacts.map(artifact => artifact.mountId)).size !== artifacts.length) {
    throw new Error(`${path}.artifacts 的 mountId 不能重复`);
  }
  if (new Set(artifacts.map(artifact => artifact.path)).size !== artifacts.length) {
    throw new Error(`${path}.artifacts 的产物路径不能重复`);
  }
  return { ...node, artifacts };
}

export function canonicalizeLocalOpportunity(value: unknown): LocalCompanyOpportunity {
  const record = asRecord(value);
  rejectUnknownFields(record, OPPORTUNITY_FIELDS, "本地机会");

  if (record.schema !== COMPANY_OPPORTUNITY_SCHEMA) {
    throw new Error("只支持 get-yourself.company-opportunity v1 文件");
  }
  if (record.schemaVersion !== 1) throw new Error("本地机会版本不支持");
  if (record.confirmation !== "user_confirmed") throw new Error("本地机会尚未经过用户确认");

  const nodes = Array.isArray(record.processNodes) ? record.processNodes : [];
  if (nodes.length < 1 || nodes.length > 50) throw new Error("流程节点数量必须在 1 到 50 之间");

  const opportunity: LocalCompanyOpportunity = {
    schema: COMPANY_OPPORTUNITY_SCHEMA,
    schemaVersion: 1,
    opportunityId: readSafeId(record.opportunityId, "opportunityId"),
    generatedAt: readTimestamp(record.generatedAt, "generatedAt"),
    traceId: readSafeId(record.traceId, "traceId"),
    confirmation: "user_confirmed",
    analysisId: readSafeId(record.analysisId, "analysisId"),
    analysisContentHash: readContentHash(record.analysisContentHash, "analysisContentHash"),
    company: readString(record.company, "company", { min: 2, max: 100 }),
    role: readString(record.role, "role", { min: 2, max: 100 }),
    recruitmentBatch: readString(record.recruitmentBatch, "recruitmentBatch", { min: 1, max: 80 }),
    location: readString(record.location, "location", { min: 1, max: 80 }),
    initialTrackerStatus: readString(record.initialTrackerStatus, "initialTrackerStatus"),
    processNodes: []
  };
  if (opportunity.initialTrackerStatus !== "Evaluated") {
    throw new Error("initialTrackerStatus 必须是 Evaluated");
  }
  if (record.trackerStatus !== undefined) {
    opportunity.trackerStatus = readString(record.trackerStatus, "trackerStatus", { min: 1, max: 40 });
  }
  opportunity.processNodes = nodes.map(canonicalizeInstalledNode);
  const allArtifacts = opportunity.processNodes.flatMap(node => node.artifacts ?? []);
  if (new Set(allArtifacts.map(artifact => artifact.mountId)).size !== allArtifacts.length) {
    throw new Error("同一 mountId 不能挂载到多个流程节点");
  }
  if (new Set(allArtifacts.map(artifact => artifact.path)).size !== allArtifacts.length) {
    throw new Error("同一路径的产物不能挂载到多个流程节点");
  }
  if (new Set(opportunity.processNodes.map(node => node.id)).size !== opportunity.processNodes.length) {
    throw new Error("流程节点 id 不能重复");
  }
  return opportunity;
}

export async function localOpportunityContentHash(opportunity: LocalCompanyOpportunity) {
  const { trackerStatus: _trackerStatus, generatedAt: _generatedAt, ...hashValue } = opportunity;
  const bytes = new TextEncoder().encode(JSON.stringify(hashValue));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function importLocalOpportunity(text: string, fileName: string) {
  const opportunity = canonicalizeLocalOpportunity(JSON.parse(text));
  return {
    opportunity,
    contentHash: await localOpportunityContentHash(opportunity),
    fileName
  };
}

export function createLocalProcessNode(input: {
  title: string;
  type: LocalProcessNodeType;
  seed?: number;
}): LocalProcessNode {
  const stamp = Date.now().toString(36);
  return {
    id: `node-${stamp}-${(input.seed ?? 0).toString(36)}`,
    type: input.type,
    title: input.title.trim(),
    status: "todo"
  };
}

export function buildCompanyOpportunityNodeMutationPlan(input: {
  imported: ImportedLocalOpportunity;
  processNodes: LocalProcessNode[];
  changeSummary: string;
}): CompanyOpportunityNodeMutationPlan {
  const summary = input.changeSummary.trim();
  if (summary.length < 2 || summary.length > 500) {
    throw new Error("变更说明必须在 2 到 500 字之间");
  }
  if (input.processNodes.length < 1 || input.processNodes.length > 50) {
    throw new Error("目标流程节点数量必须在 1 到 50 之间");
  }
  const processNodes = input.processNodes.map((node, index) => canonicalizeNode(node, index));
  if (new Set(processNodes.map(node => node.id)).size !== processNodes.length) {
    throw new Error("目标流程节点 id 不能重复");
  }

  const stamp = Date.now().toString(36);
  const hashTail = input.imported.contentHash.slice(-8);
  return {
    schema: COMPANY_OPPORTUNITY_NODE_SCHEMA,
    schemaVersion: 1,
    mutationId: `node-${stamp}-${hashTail}`,
    opportunityId: input.imported.opportunity.opportunityId,
    generatedAt: new Date().toISOString(),
    traceId: `trace-node-${stamp}-${hashTail}`,
    confirmation: "user_confirmed",
    expectedOpportunityContentHash: input.imported.contentHash,
    changeSummary: summary,
    processNodes
  };
}
