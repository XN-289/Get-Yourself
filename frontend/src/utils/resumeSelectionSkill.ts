import type { EvidenceAbility } from "@/stores/studentWorkbench";

export interface ResumeSelectionSkillResult {
  status: "blocked" | "suggested";
  message: string;
  suggestion: string;
  evidence: EvidenceAbility[];
  gaps: string[];
}

const MAX_SELECTION_LENGTH = 600;

function tokenize(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ");
  const tokens = new Set<string>();

  for (const chunk of normalized.split(" ")) {
    if (!chunk) continue;
    if (/^[a-z0-9]+$/.test(chunk)) {
      tokens.add(chunk);
      continue;
    }

    for (let index = 0; index < chunk.length - 1; index += 1) {
      tokens.add(chunk.slice(index, index + 2));
    }
    if (chunk.length === 1) tokens.add(chunk);
  }

  return tokens;
}

function similarity(left: string, right: string) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function blocked(message: string): ResumeSelectionSkillResult {
  return { status: "blocked", message, suggestion: "", evidence: [], gaps: [] };
}

export function buildResumeSelectionSuggestion(input: {
  selectedText: string;
  resumeContent: string;
  intent: string;
  abilities: EvidenceAbility[];
}): ResumeSelectionSkillResult {
  const selectedText = input.selectedText.trim();
  if (!selectedText) return blocked("请先选中要修改的简历片段。");
  if (selectedText.length > MAX_SELECTION_LENGTH) {
    return blocked("选区超过 600 字，请缩小到一条经历或一个表达片段。");
  }
  if (/^#{1,6}\s+/m.test(selectedText)) {
    return blocked("标题行不适合作为证据改写单元，请选中标题下的经历条目。");
  }
  const selectionIndex = input.resumeContent.indexOf(selectedText);
  if (selectionIndex < 0) {
    return blocked("选区已过期，请重新选中当前编辑器中的文本。");
  }
  if ((selectedText.match(/^\s*[-*]\s+/gm) ?? []).length > 1 || /\n\s*\n/.test(selectedText)) {
    return blocked("一次只改写一条经历或一个表达片段，请缩小选区。");
  }
  if (input.abilities.length === 0) {
    return blocked("能力资产尚未导入，兜底 skill 不能新增事实。");
  }

  const sectionHeading = input.resumeContent
    .slice(0, selectionIndex)
    .match(/^#{2,6}\s+.+$/gm)
    ?.at(-1);
  const query = [selectedText, input.intent.trim(), sectionHeading ?? ""]
    .filter(Boolean)
    .join(" ");
  const matches = input.abilities
    .map(ability => ({
      ability,
      score: similarity(query, `${ability.name} ${ability.evidence}`)
    }))
    .filter(item => item.score >= 0.12)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(item => item.ability);

  if (matches.length === 0) {
    return blocked("能力资产里没有与选区匹配的证据，兜底 skill 不会补写事实或指标。");
  }

  const evidenceText = matches.map(ability => ability.evidence).join(" ");
  const hasVerifiedNumber = /\d/.test(`${selectedText}${evidenceText}`);
  const gaps = hasVerifiedNumber
    ? []
    : ["当前资产没有可核验数字，不能自动生成量化结果。"];
  const bulletPrefix = selectedText.startsWith("- ") ? "- " : "";
  const body = selectedText.replace(/^-\s*/, "").replace(/\s+$/g, "");
  const segments = [
    `${bulletPrefix}${body}`,
    `证据支撑：${matches.map(ability => ability.name).join("、")}`
  ];
  if (!hasVerifiedNumber) segments.push("量化结果待补充");

  return {
    status: "suggested",
    message: "已按当前简历和全部能力资产生成可编辑替换稿；请复核后再替换。",
    suggestion: segments.join("；"),
    evidence: matches,
    gaps
  };
}
