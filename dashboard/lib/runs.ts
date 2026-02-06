import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_RUNS_DIR = path.join(process.cwd(), "../runs");

export type RunsConfig = {
  runsDir: string;
};

export type RunModelScore = {
  modelId: string;
  overallScoreMean: number | null;
  completed: number;
  totalQuestions: number;
  failures: number;
  autoFailCount: number;
};

export type RunListItem = {
  runId: string;
  createdAt?: string;
  datasetPath?: string;
  judgeModel?: string;
  judgeResolvedModel?: string;
  judgeMultipleModels?: boolean;
  modelsCount?: number;
  modelScores?: RunModelScore[];
  summaryAvailable: boolean;
  reportAvailable: boolean;
};

export type SummaryModelBreakdown = {
  modelId: string;
  totalQuestions: number;
  completed: number;
  failures: number;
  skipped: number;
  autoFailCount: number;
  autoFailRate: number | null;
  overallScore: number;
  overallScoreMean: number | null;
  categoryBreakdown?: Array<{
    category: string;
    totalQuestions: number;
    completed: number;
    failures: number;
    skipped: number;
    autoFailCount: number;
    autoFailRate: number | null;
    overallScore: number;
    overallScoreMean: number | null;
  }>;
  difficultyBreakdown?: Array<{
    difficulty: string;
    totalQuestions: number;
    completed: number;
    failures: number;
    skipped: number;
    autoFailCount: number;
    autoFailRate: number | null;
    overallScore: number;
    overallScoreMean: number | null;
  }>;
};

export type RunSummary = {
  runId: string;
  createdAt?: string;
  datasetPath?: string;
  judge?: {
    model?: string;
    provider?: string;
    resolvedModel?: string;
    resolvedModels?: Array<{ model: string; count: number }>;
  };
  models: SummaryModelBreakdown[];
};

export function getRunsConfig(): RunsConfig {
  const runsDir = process.env.RUNS_DIR?.trim() || DEFAULT_RUNS_DIR;
  return { runsDir };
}

export async function listRuns(config: RunsConfig): Promise<RunListItem[]> {
  const entries = await fs.readdir(config.runsDir, { withFileTypes: true });
  const runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const items = await Promise.all(
    runDirs.map(async (runId): Promise<RunListItem> => {
      const summaryPath = path.join(config.runsDir, runId, "summary.json");
      const reportPath = path.join(config.runsDir, runId, "report.html");

      const [summaryStat, reportStat] = await Promise.all([
        fs.stat(summaryPath).catch(() => null),
        fs.stat(reportPath).catch(() => null),
      ]);

      let summary: RunSummary | null = null;
      if (summaryStat?.isFile()) {
        summary = await readRunSummary(config, runId).catch(() => null);
      }

      return {
        runId,
        createdAt: summary?.createdAt,
        datasetPath: summary?.datasetPath,
        judgeModel: summary?.judge?.model,
        judgeResolvedModel: summary?.judge?.resolvedModel,
        judgeMultipleModels: (summary?.judge?.resolvedModels?.length ?? 0) > 1,
        modelsCount: summary?.models?.length,
        modelScores: summary?.models?.map((m) => ({
          modelId: m.modelId,
          overallScoreMean: m.overallScoreMean ?? null,
          completed: m.completed,
          totalQuestions: m.totalQuestions,
          failures: m.failures,
          autoFailCount: m.autoFailCount,
        })),
        summaryAvailable: Boolean(summaryStat?.isFile()),
        reportAvailable: Boolean(reportStat?.isFile()),
      };
    }),
  );

  return items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function listRunIds(config: RunsConfig): Promise<Set<string>> {
  const entries = await fs.readdir(config.runsDir, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

export async function readRunSummary(config: RunsConfig, runId: string): Promise<RunSummary> {
  const runIds = await listRunIds(config);
  if (!runIds.has(runId)) {
    throw new Error(`Unknown runId: ${runId}`);
  }

  const summaryPath = path.join(config.runsDir, runId, "summary.json");
  const raw = await fs.readFile(summaryPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid summary.json");
  }
  const obj = parsed as Record<string, unknown>;

  const models = obj.models;
  if (!Array.isArray(models)) {
    throw new Error("Invalid summary.json: models missing");
  }

  return {
    runId: String(obj.runId ?? runId),
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : undefined,
    datasetPath: typeof obj.datasetPath === "string" ? obj.datasetPath : undefined,
    judge:
      obj.judge && typeof obj.judge === "object"
        ? {
            model:
              typeof (obj.judge as Record<string, unknown>).model === "string"
                ? ((obj.judge as Record<string, unknown>).model as string)
                : undefined,
            provider:
              typeof (obj.judge as Record<string, unknown>).provider === "string"
                ? ((obj.judge as Record<string, unknown>).provider as string)
                : undefined,
            resolvedModel:
              typeof (obj.judge as Record<string, unknown>).resolvedModel === "string"
                ? ((obj.judge as Record<string, unknown>).resolvedModel as string)
                : undefined,
            resolvedModels: Array.isArray(
              (obj.judge as Record<string, unknown>).resolvedModels,
            )
              ? ((obj.judge as Record<string, unknown>).resolvedModels as Array<{ model: string; count: number }>)
              : undefined,
          }
        : undefined,
    models: models as SummaryModelBreakdown[],
  };
}

export async function getReportPath(config: RunsConfig, runId: string): Promise<string | null> {
  const runIds = await listRunIds(config);
  if (!runIds.has(runId)) {
    return null;
  }

  const reportPath = path.join(config.runsDir, runId, "report.html");
  const stat = await fs.stat(reportPath).catch(() => null);
  return stat?.isFile() ? reportPath : null;
}
