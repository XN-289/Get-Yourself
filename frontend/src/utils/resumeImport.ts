import type { ResumeDocumentInput } from "@/stores/studentWorkbench";
import { sha256Text } from "@/utils/resumeLibrary";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asBullets(value: unknown) {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return asString(record?.bullet ?? record?.description ?? record?.detail);
    })
    .filter(Boolean);
}

function pushSection(lines: string[], title: string, rows: string[]) {
  if (rows.length === 0) return;
  lines.push("", `## ${title}`);
  for (const row of rows) {
    if (row.startsWith("### ") || row.startsWith("- ")) lines.push(row);
    else lines.push(`- ${row}`);
  }
}

function joinParts(parts: string[], separator = " · ") {
  return parts.filter(Boolean).join(separator);
}

function formatPeriod(start: unknown, end: unknown) {
  return joinParts([asString(start), asString(end)], " - ");
}

function renderPackageToInput(
  text: string,
  fileName: string,
  sourceFileContentHash: string
): ResumeDocumentInput {
  const parsed: unknown = JSON.parse(text);
  const root = asRecord(parsed);
  if (!root || asString(root.schema) !== "get-yourself.resume-render" || root.schemaVersion !== 1) {
    throw new Error("只支持 get-yourself.resume-render v1 JSON");
  }
  if (root.confirmation !== "user_confirmed") {
    throw new Error("渲染包尚未经过用户确认");
  }

  const resume = asRecord(root.resume);
  if (!resume) throw new Error("渲染包缺少 resume 字段");
  const header = asRecord(resume.header);
  const name = asString(header?.name, "未命名学生");
  const headline = asString(header?.headline, "未标注岗位");
  const lines = [`# ${name} · ${headline}`];
  const contact = joinParts([asString(header?.location), asString(header?.email), asString(header?.phone)], " / ");
  if (contact) lines.push("", contact);

  const linkRows = asArray(header?.links)
    .map((item) => {
      const record = asRecord(item);
      const label = asString(record?.name, "链接");
      const url = asString(record?.url);
      return url ? `${label}：${url}` : "";
    })
    .filter(Boolean);
  pushSection(lines, "链接", linkRows);

  const summary = asString(resume.summary);
  if (summary) lines.push("", "## 摘要", summary);

  const experienceRows = asArray(resume.experience).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const company = asString(record.company, "未命名组织");
    const role = asString(record.role, "成员");
    const meta = joinParts([formatPeriod(record.start, record.end), asString(record.location)]);
    return [`### ${joinParts([company, role])}${meta ? ` · ${meta}` : ""}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "实习与工作", experienceRows);

  const projectRows = asArray(resume.projects).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const title = asString(record.name, "未命名项目");
    const role = asString(record.role);
    const meta = joinParts([asString(record.date), asString(record.link)]);
    return [`### ${joinParts([title, role])}${meta ? ` · ${meta}` : ""}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "项目经历", projectRows);

  const educationRows = asArray(resume.education).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const heading = joinParts([
      asString(record.school, "未命名学校"),
      asString(record.degree),
      formatPeriod(record.start, record.end),
      asString(record.location)
    ]);
    const detail = asString(record.detail);
    return [`### ${heading}`, ...(detail ? [`- ${detail}`] : [])];
  });
  pushSection(lines, "教育经历", educationRows);

  const skillRows = asArray(resume.skills)
    .map((item) => {
      const record = asRecord(item);
      const group = asString(record?.group, "技能");
      const items = asBullets(record?.items).join(" / ");
      return items ? `${group}：${items}` : "";
    })
    .filter(Boolean);
  pushSection(lines, "技能", skillRows);

  const certificationRows = asArray(resume.certifications)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.name), asString(record?.issuer), asString(record?.date)]);
    })
    .filter(Boolean);
  pushSection(lines, "证书", certificationRows);

  const awardRows = asArray(resume.awards)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.title), asString(record?.date), asString(record?.note)]);
    })
    .filter(Boolean);
  pushSection(lines, "奖项", awardRows);

  const languageRows = asArray(resume.languages)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.language, "语言"), asString(record?.level)]);
    })
    .filter(Boolean);
  pushSection(lines, "语言", languageRows);

  const publicationRows = asArray(resume.publications)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.title), asString(record?.venue), asString(record?.date)]);
    })
    .filter(Boolean);
  pushSection(lines, "发表", publicationRows);

  const volunteerRows = asArray(resume.volunteer).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const heading = joinParts([
      asString(record.organization, "志愿经历"),
      asString(record.role),
      formatPeriod(record.start, record.end)
    ]);
    return [`### ${heading}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "志愿经历", volunteerRows);

  return {
    title: `${name} · ${headline}`,
    targetRole: headline,
    templateId: asString(root.templateId, "classic-ats"),
    content: lines.join("\n"),
    source: "import",
    fileName,
    provenance: {
      ...(root.finalPlanId && root.finalPlanContentHash && root.finalDocumentContentHash ? {
        finalPlanId: asString(root.finalPlanId),
        finalPlanContentHash: asString(root.finalPlanContentHash),
        finalDocumentContentHash: asString(root.finalDocumentContentHash)
      } : {}),
      sourceFileContentHash
    }
  };
}

export async function documentInputFromText(text: string, fileName: string): Promise<ResumeDocumentInput> {
  const sourceFileContentHash = await sha256Text(text);
  if (fileName.toLowerCase().endsWith(".json")) {
    return renderPackageToInput(text, fileName, sourceFileContentHash);
  }
  return {
    title: fileName.replace(/\.[^.]+$/, "") || "导入简历",
    targetRole: "未标注岗位",
    templateId: "classic-ats",
    content: text,
    source: "import",
    changeNote: "本机成品导入",
    fileName,
    provenance: { sourceFileContentHash }
  };
}
