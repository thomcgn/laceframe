import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SharedFreeBudget, RateLimitPause, isFreeQuotaError, parseRetryAfter, type FreeBudgetConfig } from "./rate-limit.js";
import { runKiloStreaming, type KiloResult } from "./kilo-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
  priority: "high" | "medium" | "low";
  dependencies: number[];
  requiredValidation: string[];
  relevantFiles: string[];
}

export interface ControllerState {
  currentIssue: number | null;
  reviewIteration: number;
  lastProcessedIssue: number | null;
  processedIssues: number[];
  failedIssues: number[];
  dryRun: boolean;
  lastRun: string | null;
  /** Checkpoint for safe pause/resume */
  checkpoint: SessionCheckpoint | null;
}

export interface SessionCheckpoint {
  issueNumber: number;
  reviewIteration: number;
  phase: "builder" | "reviewer" | "quality-gates" | "finalize";
  sessionId: string | null;
  kiloAgent: "builder" | "reviewer";
  prompt: string;
  timestamp: string;
  reason: "rate-limit" | "inactivity" | "signal" | "manual";
  gitStatus: string;
  headCommit: string;
}

export interface ReviewResult {
  status: "PASS" | "FAIL" | "NEEDS_REVIEW";
  blockers: number;
  findings: string;
  reportPath: string;
}

export interface BuildResult {
  success: boolean;
  commitHash: string | null;
  testResults: string;
  error?: string;
}

export interface AutodevConfig {
  repo: string;
  branch: string;
  labels: {
    approved: string;
    inProgress: string;
    review: string;
    blocked: string;
    implemented: string;
  };
  maxReviewIterations: number;
  qualityGates: string[];
  smokeTests: string[];
  github?: {
    apiTimeout: number;
    retryAttempts: number;
    retryBackoffMs: number;
  };
  kilo?: {
    builderAgent: string;
    reviewerAgent: string;
    model?: string;
    inactivityTimeoutMs: number;
    sessionResume: boolean;
  };
  git?: {
    protectedBranches: string[];
    allowForcePush: boolean;
    requireCleanWorkingTree: boolean;
  };
  freeBudget?: FreeBudgetConfig;
  logging?: {
    level: string;
    retentionDays: number;
  };
}

interface GitHubIssueRaw {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
  state: "open" | "closed";
}

const STATE_FILE = path.join(__dirname, "..", "..", ".autodev-state.json");
const CONFIG_FILE = path.join(__dirname, "..", "..", ".autodev-config.json");
const LOG_DIR = path.join(__dirname, "..", "..", "logs", "autodev");
const CONTROLLER_LOCK = path.join(__dirname, "..", "..", ".autodev-controller.lock");
const CHECKPOINT_FILE = path.join(__dirname, "..", "..", ".autodev-checkpoint.json");

class KiloExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KiloExecutionError";
  }
}

export class AutodevController {
  private state: ControllerState;
  private config: AutodevConfig;
  private isRunning = false;
  private taskFiles: string[] = [];
  private taskDiffHash = "";
  private initialHead = "";
  private readonly freeBudget: SharedFreeBudget;
  private terminateKilo: (() => void) | null = null;
  private currentKiloSessionId: string | null = null;

  constructor(dryRun = false) {
    this.state = this.loadState();
    this.config = this.loadConfig();
    this.state.dryRun = dryRun;
    this.ensureLogDir();
    this.freeBudget = new SharedFreeBudget(
      path.join(__dirname, "..", "..", ".autodev-free-budget.json"),
      this.config.freeBudget ?? { windowMinutes: 60, limit: 200, warningAt: 160, pauseAt: 190, estimatedRequestsPerTask: 50, cooldownMinutes: 60 },
    );
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  private loadState(): ControllerState {
    if (fs.existsSync(STATE_FILE)) {
      // Corrupt checkpoints must stop AutoDev rather than restart a task.
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
    return this.defaultState();
  }

  private defaultState(): ControllerState {
    return {
      currentIssue: null,
      reviewIteration: 0,
      lastProcessedIssue: null,
      processedIssues: [],
      failedIssues: [],
      dryRun: false,
      lastRun: null,
      checkpoint: null,
    };
  }

  private saveState(): void {
    const temp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, STATE_FILE);
  }

  private loadConfig(): AutodevConfig {
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      } catch {
        return this.defaultConfig();
      }
    }
    return this.defaultConfig();
  }

  private defaultConfig(): AutodevConfig {
    return {
      repo: "thomcgn/laceframe",
      branch: "develop",
      labels: {
        approved: "autodev:approved",
        inProgress: "autodev:in-progress",
        review: "autodev:review",
        blocked: "autodev:blocked",
        implemented: "autodev:implemented",
      },
      maxReviewIterations: 3,
      qualityGates: ["typecheck", "test", "lint"],
      smokeTests: [],
      kilo: {
        builderAgent: "laceframe-builder",
        reviewerAgent: "laceframe-reviewer",
        model: "kilo/nvidia/nemotron-3-ultra-550b-a55b:free",
        inactivityTimeoutMs: 30 * 60 * 1000,
        sessionResume: true,
      },
    };
  }

  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);

    const logFile = path.join(LOG_DIR, `autodev-${new Date().toISOString().split("T")[0]}.log`);
    fs.appendFileSync(logFile, logMessage + "\n");
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      this.log("Controller already running", "warn");
      return;
    }

    this.acquireControllerLock();
    this.isRunning = true;

    try {
      this.log("Starting autodev controller");
      await this.verifyPrerequisites();
      this.initialHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();

      // Check for existing checkpoint to resume
      if (this.state.checkpoint) {
        await this.handleCheckpointResume();
      } else if (this.state.currentIssue !== null) {
        throw new Error(`Interrupted issue #${this.state.currentIssue} requires manual reconciliation before resume`);
      }

      while (true) {
        // Do not wait for quota when all approved issues are already failed/blocked.
        const eligible = (await this.fetchApprovedIssues()).some(issue =>
          !issue.labels.includes(this.config.labels.blocked) &&
          !issue.labels.includes(this.config.labels.implemented) &&
          !this.state.processedIssues.includes(issue.number) &&
          !this.state.failedIssues.includes(issue.number) &&
          this.areDependenciesSatisfied(issue));
        if (!eligible) {
          this.log("No eligible approved issues available; not waiting for model budget");
          break;
        }
        await this.waitForFreeBudget();
        const issue = await this.selectNextIssue();
        if (!issue) {
          this.log("No approved issues available");
          break;
        }

        if (!this.state.dryRun) {
          this.state.currentIssue = issue.number;
          this.state.reviewIteration = 0;
          this.saveState();
        }

        const success = await this.processIssue(issue);

        if (!this.state.dryRun) {
          if (success) {
            this.state.processedIssues.push(issue.number);
            this.state.lastProcessedIssue = issue.number;
          } else {
            this.state.failedIssues.push(issue.number);
          }
          this.state.currentIssue = null;
          this.state.reviewIteration = 0;
          this.state.checkpoint = null;
          this.saveState();
          this.clearCheckpointFile();
        }

        if (this.state.dryRun) {
          this.log("Dry run mode: stopping after first issue");
          break;
        }
        if (!success) {
          this.log("Issue was not finalized. Stop instead of starting another task with potentially dirty files.", "warn");
          throw new Error(`AutoDev did not finish issue #${issue.number}; inspect the issue and working tree`);
        }
      }
    } catch (error) {
      if (error instanceof RateLimitPause) {
        // A failed in-progress Kilo task is NOT safe to replay automatically: it
        // may have modified the working tree. Persist the issue and stop cleanly.
        this.saveState();
        this.log(`RATE LIMIT PAUSE until ${new Date(error.until).toISOString()}. Reason: ${error.message}. Inspect working tree before resuming interrupted issue.`, "warn");
        return;
      }
      if (error instanceof KiloExecutionError && this.state.currentIssue !== null) {
        // Infrastructure failure is not an issue failure. Requeue only if we can
        // prove the builder did not alter the tree or HEAD.
        const clean = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" }).trim() === "";
        const sameHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim() === this.initialHead;
        if (clean && sameHead) {
          const issueNumber = this.state.currentIssue;
          execFileSync("gh", ["issue", "edit", String(issueNumber), "--repo", this.config.repo,
            "--remove-label", this.config.labels.inProgress], { encoding: "utf-8" });
          this.state.currentIssue = null;
          this.state.reviewIteration = 0;
          this.state.checkpoint = null;
          this.saveState();
          this.clearCheckpointFile();
          this.log(`Kilo infrastructure failure; issue #${issueNumber} released for a later retry`, "warn");
        } else {
          this.log("Kilo failed after possible file modifications; state retained for manual review", "warn");
        }
      }
      this.log(`Controller error: ${error}. State and working tree preserved if reconciliation is needed.`, "error");
      throw error;
    } finally {
      this.isRunning = false;
      this.releaseControllerLock();
      this.log("Controller stopped");
    }
  }

  /** Only the owner removes the temporary lock; SIGINT/SIGTERM clean up as well. */
  private readonly onControllerSigint = (): void => this.onControllerSignal("SIGINT");
  private readonly onControllerSigterm = (): void => this.onControllerSignal("SIGTERM");

  private onControllerSignal(signal: "SIGINT" | "SIGTERM"): void {
    // Let the Kilo child close and drain its pipes before the controller's
    // normal finally block releases the lock and preserves the issue state.
    if (this.terminateKilo) {
      this.log(`Received ${signal}; stopping Kilo before AutoDev shutdown`, "warn");
      this.terminateKilo();
      process.exitCode = signal === "SIGINT" ? 130 : 143;
      return;
    }
    try {
      this.releaseControllerLock();
    } catch (error) {
      this.log(`Could not release AutoDev lock on ${signal}: ${String(error)}`, "warn");
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  }

  private acquireControllerLock(): void {
    const ownerFile = path.join(CONTROLLER_LOCK, "pid");
    const claim = (): void => {
      fs.mkdirSync(CONTROLLER_LOCK);
      try {
        fs.writeFileSync(ownerFile, String(process.pid), { flag: "wx" });
      } catch (error) {
        fs.rmdirSync(CONTROLLER_LOCK);
        throw error;
      }
    };

    try {
      claim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      if (fs.existsSync(ownerFile)) {
        const raw = fs.readFileSync(ownerFile, "utf-8").trim();
        const owner = Number(raw);
        if (!Number.isSafeInteger(owner) || owner <= 0) {
          throw new Error("Controller lock has an invalid PID; manual inspection required", { cause: error });
        }
        try {
          process.kill(owner, 0);
          throw new Error(`AutoDev is already running (PID ${owner}); not starting another instance`, { cause: error });
        } catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError;
        }
        // The owner is gone. A new contender may win the race; in that
        // case fail safely rather than removing the new owner's lock.
        if (fs.readFileSync(ownerFile, "utf-8").trim() !== raw) {
          throw new Error("AutoDev lock owner changed during recovery; retry", { cause: error });
        }
        fs.unlinkSync(ownerFile);
      } else {
        // Legacy locks predate PID recording. Allow a short grace period so
        // a concurrent controller can finish writing its PID.
        const ageMs = Date.now() - fs.statSync(CONTROLLER_LOCK).mtimeMs;
        if (ageMs < 5000) {
          throw new Error("AutoDev lock is being initialized; retry in a few seconds", { cause: error });
        }
        if (fs.readdirSync(CONTROLLER_LOCK).length !== 0) {
          throw new Error("Unknown files in AutoDev lock; refusing to delete them", { cause: error });
        }
      }
      fs.rmdirSync(CONTROLLER_LOCK);
      claim();
      this.log("Recovered an abandoned AutoDev controller lock", "warn");
    }

    process.once("SIGINT", this.onControllerSigint);
    process.once("SIGTERM", this.onControllerSigterm);
  }

  private releaseControllerLock(): void {
    process.removeListener("SIGINT", this.onControllerSigint);
    process.removeListener("SIGTERM", this.onControllerSigterm);
    const ownerFile = path.join(CONTROLLER_LOCK, "pid");
    if (!fs.existsSync(ownerFile)) return;
    if (fs.readFileSync(ownerFile, "utf-8").trim() !== String(process.pid)) {
      // A different controller owns the lock now.
      return;
    }
    fs.unlinkSync(ownerFile);
    fs.rmdirSync(CONTROLLER_LOCK);
  }

  /** Requeue a previously failed issue without resetting unrelated issue history. */
  retryIssue(issueNumber: number): void {
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error("Invalid issue number");
    this.acquireControllerLock();
    try {
      if (this.state.currentIssue !== null && this.state.currentIssue !== issueNumber) {
        throw new Error(`Another issue #${this.state.currentIssue} is interrupted; reconcile it first`);
      }
      const interrupted = this.state.currentIssue === issueNumber;
      if (!interrupted && !this.state.failedIssues.includes(issueNumber)) {
        throw new Error(`Issue #${issueNumber} is neither failed nor interrupted`);
      }
      const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" }).trim();
      if (status) throw new Error("Working tree not clean; cannot retry");
      const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf-8" }).trim();
      if (branch !== this.config.branch) throw new Error(`Not on ${this.config.branch}`);
      const issue = JSON.parse(execFileSync("gh", ["issue", "view", String(issueNumber), "--repo", this.config.repo,
        "--json", "state,labels"], { encoding: "utf-8" })) as { state: string; labels: {name:string}[] };
      if (issue.state !== "OPEN") throw new Error("Issue is not open");
      if (!issue.labels.some(label => label.name === this.config.labels.approved)) throw new Error("Issue is not approved");
      const staleLabels = [this.config.labels.blocked, this.config.labels.inProgress]
        .filter(label => issue.labels.some(item => item.name === label));
      if (staleLabels.length) {
        execFileSync("gh", ["issue", "edit", String(issueNumber), "--repo", this.config.repo,
          ...staleLabels.flatMap(label => ["--remove-label", label])], { encoding: "utf-8" });
      }
      this.state.failedIssues = this.state.failedIssues.filter(n => n !== issueNumber);
      this.state.currentIssue = null;
      this.state.reviewIteration = 0;
      this.state.checkpoint = null;
      this.saveState();
      this.clearCheckpointFile();
      this.log(`Issue #${issueNumber} requeued. Existing quota history remains untouched.`);
    } finally {
      this.releaseControllerLock();
    }
  }

  private async waitForFreeBudget(): Promise<void> {
    for (;;) {
      const status = this.freeBudget.status();
      if (status.resumeAt === null) {
        if (status.warning) {
          this.log(`Free model budget warning: ${status.used}/${status.remaining} estimated requests used (warning at ${this.config.freeBudget?.warningAt ?? 160})`, "warn");
        }
        return;
      }
      const ms = Math.max(1000, status.resumeAt - Date.now() + 250);
      this.log(`Free models paused (${status.reason}). Resuming no earlier than ${new Date(status.resumeAt).toISOString()}`);
      // Long waits are split because Node timers have a maximum delay.
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(ms, 60_000)));
    }
  }

  private async verifyPrerequisites(): Promise<void> {
    this.log("Verifying prerequisites...");

    const gitStatus = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    if (gitStatus && !this.state.dryRun) {
      throw new Error("Working tree not clean. Commit or stash changes before running.");
    }

    const currentBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    if (currentBranch !== this.config.branch) {
      throw new Error(`Not on ${this.config.branch} branch. Current: ${currentBranch}`);
    }

    try {
      execSync("git fetch origin", { encoding: "utf-8", stdio: "ignore" });
    } catch {
      throw new Error("Failed to fetch from origin. Check authentication.");
    }

    try {
      execSync("gh auth status", { encoding: "utf-8", stdio: "ignore" });
    } catch {
      throw new Error("GitHub CLI not authenticated. Run 'gh auth login'.");
    }

    this.log("Prerequisites verified");
  }

  private async selectNextIssue(): Promise<GitHubIssue | null> {
    this.log("Fetching approved issues...");

    const issues = (await this.fetchApprovedIssues()).filter(issue =>
      !issue.labels.includes(this.config.labels.blocked) &&
      !issue.labels.includes(this.config.labels.implemented) &&
      !this.state.processedIssues.includes(issue.number) &&
      !this.state.failedIssues.includes(issue.number));
    if (issues.length === 0) {
      return null;
    }

    const unblocked = issues.filter((issue) => this.areDependenciesSatisfied(issue));
    if (unblocked.length === 0) {
      this.log("All approved issues have unsatisfied dependencies", "warn");
      return null;
    }

    unblocked.sort((a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority));

    const selected = unblocked[0];
    this.log(`Selected issue #${selected.number}: ${selected.title} (${selected.priority})`);

    await this.updateIssueLabels(selected.number, [this.config.labels.inProgress]);

    return selected;
  }

  private async fetchApprovedIssues(): Promise<GitHubIssue[]> {
    const cmd = `gh issue list --repo ${this.config.repo} --state open --label "${this.config.labels.approved}" --json number,title,body,labels --limit 100`;
    const output = execSync(cmd, { encoding: "utf-8" });
    const issues: GitHubIssueRaw[] = JSON.parse(output);

    return issues.map((issue) => this.parseIssue(issue));
  }

  private parseIssue(issue: GitHubIssueRaw): GitHubIssue {
    const labels = issue.labels.map((l: { name: string }) => l.name);
    const body = issue.body || "";

    const priorityMatch = body.match(/Priority:\s*(high|medium|low)/i);
    const priority = (priorityMatch?.[1]?.toLowerCase() as "high" | "medium" | "low") || "medium";

    // Issue metadata sections end at the next recognized heading, not just a blank line.
    // This prevents validation requirements from swallowing "Relevant Files".
    const section = (label: string): string[] => {
      const lines = body.split(/\r?\n/);
      const start = lines.findIndex(line => line.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`));
      if (start < 0) return [];
      const first = lines[start].slice(lines[start].indexOf(":") + 1).trim();
      const values = first ? [first] : [];
      for (const line of lines.slice(start + 1)) {
        if (/^\s*(?:Priority|Dependencies|Required Validation|Relevant Files):/i.test(line) ||
            /^\s*#{1,6}\s+/.test(line) || !line.trim()) break;
        values.push(line.trim());
      }
      return values;
    };

    const dependencies = section("Dependencies")
      .join(",").split(",")
      .map(part => Number.parseInt(part.trim().replace(/^#/, ""), 10))
      .filter(Number.isInteger);
    const requiredValidation = section("Required Validation");
    const relevantFiles = section("Relevant Files");

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels,
      state: issue.state,
      priority,
      dependencies,
      requiredValidation,
      relevantFiles,
    };
  }

  private priorityValue(priority: string): number {
    switch (priority) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  }

  private areDependenciesSatisfied(issue: GitHubIssue): boolean {
    return issue.dependencies.every((dep) => this.state.processedIssues.includes(dep));
  }

  private async updateIssueLabels(issueNumber: number, labels: string[]): Promise<void> {
    if (this.state.dryRun) {
      this.log(`[DRY RUN] Would update issue #${issueNumber} labels: ${labels.join(", ")}`);
      return;
    }

    for (const label of labels) {
      execFileSync("gh", ["issue", "edit", String(issueNumber), "--repo", this.config.repo, "--add-label", label], { encoding: "utf-8" });
    }
  }

  private async processIssue(issue: GitHubIssue): Promise<boolean> {
    this.log(`Processing issue #${issue.number}: ${issue.title}`);

    let previousFeedback = "";
    for (let iteration = 1; iteration <= this.config.maxReviewIterations; iteration++) {
      this.state.reviewIteration = iteration;
      this.saveState();

      this.log(`Review iteration ${iteration}/${this.config.maxReviewIterations}`);

      const buildResult = await this.runBuilder(issue, previousFeedback);

      if (!buildResult.success) {
        this.log(`Builder failed: ${buildResult.error}`, "error");
        previousFeedback = `Prior attempt failed: ${buildResult.error}`;
        if (iteration === this.config.maxReviewIterations) {
          await this.handleFailure(issue, buildResult.error || "Builder failed");
          return false;
        }
        continue;
      }

      const reviewResult = await this.runReviewer(issue, buildResult);

      if (reviewResult.status === "PASS" && reviewResult.blockers === 0) {
        this.log("Review PASSED");
        return await this.finalizeIssue(issue, buildResult);
      }

      if (reviewResult.status === "FAIL" || (reviewResult.status === "PASS" && reviewResult.blockers > 0)) {
        this.log(`Review FAILED with ${reviewResult.blockers} blockers`);
        if (iteration === this.config.maxReviewIterations) {
          await this.handleFailure(issue, reviewResult.findings);
          return false;
        }
        previousFeedback = reviewResult.findings;
        this.log("Returning findings to builder for fixes");
        continue;
      }

      if (reviewResult.status === "NEEDS_REVIEW") {
        previousFeedback = reviewResult.findings;
        this.log("Review NEEDS_REVIEW - insufficient evidence");
        if (iteration === this.config.maxReviewIterations) {
          await this.handleFailure(issue, "Insufficient verification evidence after max iterations");
          return false;
        }
        continue;
      }
    }

    return false;
  }

  /** Stage only this task's files after a clean preflight, never git add -A.
   * Newly staged paths are frozen before review; only a separately reviewed
   * report may be added later. The Builder is not permitted to stage or commit.
   */
  private stageTaskChanges(): void {
    const actualHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
    if (actualHead !== this.initialHead) throw new Error("Builder modified Git history; refuse to continue");
    const stagedBefore = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
    if (stagedBefore.some(f => !this.taskFiles.includes(f))) {
      throw new Error("Unexpected staged files; refusing to inherit index changes");
    }
    const changed = execFileSync("git", ["ls-files", "--modified", "--others", "--exclude-standard", "-z"], { encoding: "utf-8" })
      .split("\0").filter(f => f && f !== "docs/reviews/LATEST_REVIEW.md");
    if (!changed.length && !stagedBefore.length) throw new Error("Builder produced no changed files");
    const excluded = changed.filter(f => f === ".autodev-state.json" || f.startsWith("logs/") ||
      f.startsWith(".autodev-") || f === "docs/reviews/LATEST_REVIEW.md" ||
      f.endsWith(".env") || f.includes(".env.") || f.includes("node_modules/"));
    if (excluded.length) throw new Error(`Unexpected or sensitive task files: ${excluded.join(", ")}`);
    if (changed.length) execFileSync("git", ["add", "--", ...changed]);
    this.taskFiles = [...new Set([...this.taskFiles, ...stagedBefore, ...changed])];
    this.taskDiffHash = this.stagedDiffHash();
    if (!this.taskDiffHash) throw new Error("Empty task diff");
  }

  private stagedDiffHash(): string {
    const diff = execFileSync("git", ["diff", "--cached", "--binary"], { encoding: "utf-8" });
    return diff ? createHash("sha256").update(diff).digest("hex") : "";
  }

  private assertReviewedContentUnchanged(): void {
    if (!this.taskDiffHash || this.stagedDiffHash() !== this.taskDiffHash) {
      throw new Error("Staged task diff changed since review; refuse commit");
    }
    const unstaged = execFileSync("git", ["diff", "--name-only"], { encoding: "utf-8" }).trim();
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf-8" }).trim();
    if (unstaged || (untracked && untracked !== "docs/reviews/LATEST_REVIEW.md")) {
      throw new Error(`Unreviewed working tree changes: ${unstaged} ${untracked}`);
    }
  }

  private async runBuilder(issue: GitHubIssue, previousFeedback = ""): Promise<BuildResult> {
    this.log("Starting Builder session...");

    try {
      const prompt = this.buildBuilderPrompt(issue) + (previousFeedback ? `\n\n## Mandatory fixes from previous attempt\n${previousFeedback}` : "");

      if (this.state.dryRun) {
        this.log("[DRY RUN] Would start Builder with prompt", "info");
        return { success: true, commitHash: "dry-run", testResults: "dry-run" };
      }

      await this.executeKiloTask(
        this.config.kilo?.builderAgent ?? "laceframe-builder",
        prompt,
        "builder"
      );

      this.stageTaskChanges();
      const testResults = await this.runQualityGates(issue);
      return { success: true, commitHash: null, testResults };
    } catch (error) {
      if (error instanceof RateLimitPause || error instanceof KiloExecutionError) throw error;
      return { success: false, commitHash: null, testResults: "", error: String(error) };
    }
  }

  private buildBuilderPrompt(issue: GitHubIssue): string {
    return `Implement GitHub Issue #${issue.number}: ${issue.title}

## Issue Details
${issue.body}

## Acceptance Criteria
- Implement the described functionality
- All tests must pass
- Code must pass typecheck and lint
- Follow existing architecture and conventions

## Relevant Files
${issue.relevantFiles.join("\n")}

## Required Validation
${issue.requiredValidation.join("\n")}

## Instructions
1. Read the relevant architecture, workflows, and testing documentation
2. Implement the smallest appropriate change
3. Add or update regression tests
4. Execute targeted tests
5. Run quality gates (typecheck, test, lint)
6. Do not commit - the controller will handle commit after review

Return a summary of what was implemented, files changed, and test results.`;
  }

  private async executeKiloTask(agentName: string, prompt: string, agentRole: "builder" | "reviewer"): Promise<KiloResult> {
    const receipt = this.freeBudget.reserve();
    const model = this.config.kilo?.model ?? "kilo/nvidia/nemotron-3-ultra-550b-a55b:free";
    const inactivityTimeoutMs = this.config.kilo?.inactivityTimeoutMs ?? 30 * 60 * 1000;
    const sessionResume = this.config.kilo?.sessionResume ?? true;
    const started = Date.now();
    const logPath = path.join(LOG_DIR, `kilo-${this.state.currentIssue ?? "manual"}-${agentName}-${Date.now()}.log`);
    this.log(`Kilo session: agent=${agentName}, model=${model}, inactivityTimeout=${inactivityTimeoutMs}ms, sessionResume=${sessionResume}, log=${logPath}`);

    try {
      // Build checkpoint for safe pause/resume
      const checkpoint: SessionCheckpoint = {
        issueNumber: this.state.currentIssue ?? -1,
        reviewIteration: this.state.reviewIteration,
        phase: agentRole === "builder" ? "builder" : "reviewer",
        sessionId: this.currentKiloSessionId,
        kiloAgent: agentRole,
        prompt,
        timestamp: new Date().toISOString(),
        reason: "signal",
        gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" }).trim(),
        headCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim(),
      };
      this.state.checkpoint = checkpoint;
      this.saveState();
      this.writeCheckpointFile(checkpoint);

      const result = await runKiloStreaming({
        agent: agentName,
        model,
        prompt,
        logPath,
        inactivityTimeoutMs,
        sessionId: sessionResume ? this.currentKiloSessionId ?? undefined : undefined,
        onOutput: (stream, chunk) => {
          (stream === "stdout" ? process.stdout : process.stderr).write(chunk);
        },
        onHeartbeat: (silenceMs, elapsedMs) => {
          this.log(`Kilo ${agentName}: elapsed ${Math.round(elapsedMs / 1000)}s; silence ${Math.round(silenceMs / 1000)}s (not proof of progress)`);
        },
        onInactivityWarning: (silenceMs) => {
          this.log(`Kilo ${agentName}: INACTIVITY WARNING - ${Math.round(silenceMs / 1000)}s silence, timeout at ${Math.round(inactivityTimeoutMs / 1000)}s`, "warn");
        },
        registerCancel: (cancel) => { this.terminateKilo = cancel; },
      });

      this.currentKiloSessionId = result.sessionId;
      this.log(`Kilo ${agentName} completed in ${Math.round((Date.now() - started) / 1000)}s${result.sessionId ? `, sessionId=${result.sessionId}` : ""}`);
      return result;
    } catch (error) {
      const failure = error as Error & { code?: string };
      if (isFreeQuotaError(error)) {
        // Try to extract Retry-After from error message
        const retryAfterMatch = String(error).match(/retry.after[:\s]+(\d+)/i);
        const retryAfterMs = retryAfterMatch ? parseRetryAfter(retryAfterMatch[1]) : undefined;
        const until = this.freeBudget.pauseForLimit("Kilo free-model quota exceeded", Date.now(), retryAfterMs ?? undefined);
        throw new RateLimitPause(until, "Kilo rejected the session with free-model rate limit", retryAfterMs ?? undefined);
      }
      // A spawned process may already have spent quota; only ENOENT is provably unused.
      if (failure.code === "ENOENT") this.freeBudget.release(receipt);
      throw new KiloExecutionError(`Kilo ${agentName} (${model}) failed: ${failure.message.slice(0, 450)}; log: ${logPath}`);
    } finally {
      this.terminateKilo = null;
      this.state.checkpoint = null;
      this.saveState();
      this.clearCheckpointFile();
    }
  }

  private writeCheckpointFile(checkpoint: SessionCheckpoint): void {
    const temp = `${CHECKPOINT_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(checkpoint, null, 2));
    fs.renameSync(temp, CHECKPOINT_FILE);
  }

  private clearCheckpointFile(): void {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }
  }

  private async handleCheckpointResume(): Promise<void> {
    if (!this.state.checkpoint) return;

    const checkpoint = this.state.checkpoint;
    this.log(`Found checkpoint for issue #${checkpoint.issueNumber}, iteration ${checkpoint.reviewIteration}, phase ${checkpoint.phase}, reason ${checkpoint.reason}`);

    // Verify git state matches checkpoint
    const currentGitStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" }).trim();
    const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();

    if (currentGitStatus !== checkpoint.gitStatus || currentHead !== checkpoint.headCommit) {
      this.log("Git state differs from checkpoint; cannot safely resume automatically", "warn");
      this.log(`Checkpoint git status: ${checkpoint.gitStatus || "(clean)"}`, "warn");
      this.log(`Current git status: ${currentGitStatus || "(clean)"}`, "warn");
      this.log(`Checkpoint HEAD: ${checkpoint.headCommit}`, "warn");
      this.log(`Current HEAD: ${currentHead}`, "warn");
      throw new Error("NEEDS_RECONCILIATION: Git state differs from checkpoint. Manual intervention required.");
    }

    // Verify no parallel children running
    const controllerLock = path.join(__dirname, "..", "..", ".autodev-controller.lock");
    if (fs.existsSync(controllerLock)) {
      const ownerFile = path.join(controllerLock, "pid");
      if (fs.existsSync(ownerFile)) {
        const raw = fs.readFileSync(ownerFile, "utf-8").trim();
        const owner = Number(raw);
        if (Number.isSafeInteger(owner) && owner > 0 && owner !== process.pid) {
          try {
            process.kill(owner, 0);
            throw new Error("NEEDS_RECONCILIATION: Another AutoDev controller instance is running.");
          } catch (probeError) {
            if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError;
            // Owner process is dead, lock is stale - we can proceed
          }
        }
      }
    }

    // Verify Kilo session can be resumed
    if (!this.config.kilo?.sessionResume || !checkpoint.sessionId) {
      this.log("Session resumption not configured or no session ID in checkpoint; starting fresh", "warn");
      this.currentKiloSessionId = null;
      return;
    }

    this.currentKiloSessionId = checkpoint.sessionId;
    this.log(`Resuming Kilo session ${checkpoint.sessionId} for ${checkpoint.kiloAgent}`);

    // For now, we log the resumption but let the new Kilo invocation handle --session
    // Actual resumption is handled by kilo-runner when sessionId is passed
  }

  rateLimitStatus(): ReturnType<SharedFreeBudget["status"]> {
    return this.freeBudget.status();
  }

  private async runQualityGates(issue: GitHubIssue): Promise<string> {
    this.log("Running quality gates...");

    const results: string[] = [];

    for (const gate of this.config.qualityGates) {
      try {
        if (gate === "typecheck") {
          execSync("npm run typecheck", { encoding: "utf-8", stdio: "pipe" });
          results.push("typecheck: PASSED");
        } else if (gate === "test") {
          execSync("npm test -- --maxWorkers=2", { encoding: "utf-8", stdio: "pipe" });
          results.push("test: PASSED");
        } else if (gate === "lint") {
          execSync("npm run lint", { encoding: "utf-8", stdio: "pipe" });
          results.push("lint: PASSED");
        }
      } catch (error) {
        const err = error as Error;
        results.push(`${gate}: FAILED - ${err.message}`);
        const newError = new Error(`Quality gate ${gate} failed`);
        Error.captureStackTrace(newError, this.runQualityGates);
        throw newError;
      }
    }

    // Issue bodies are untrusted input. Never exec() arbitrary validation strings.
    if (issue.requiredValidation.length > 0) {
      this.log(`Issue specifies ${issue.requiredValidation.length} validation requirements; evaluate via approved quality gates only`);
    }

    return results.join("\n");
  }

  private async runReviewer(issue: GitHubIssue, buildResult: BuildResult): Promise<ReviewResult> {
    this.log("Starting Reviewer session...");

    const prompt = this.buildReviewerPrompt(issue, buildResult);

    if (this.state.dryRun) {
      this.log("[DRY RUN] Would start Reviewer with prompt", "info");
      return { status: "PASS", blockers: 0, findings: "", reportPath: "docs/reviews/LATEST_REVIEW.md" };
    }

    const previous = fs.existsSync("docs/reviews/LATEST_REVIEW.md")
      ? fs.statSync("docs/reviews/LATEST_REVIEW.md").mtimeMs : 0;
    await this.executeKiloTask(this.config.kilo?.reviewerAgent ?? "laceframe-reviewer", prompt, "reviewer");
    const report = "docs/reviews/LATEST_REVIEW.md";
    if (!fs.existsSync(report) || fs.statSync(report).mtimeMs <= previous) {
      throw new Error("Reviewer did not generate a fresh report");
    }
    this.assertReviewedContentUnchanged();
    return this.readReviewReport();
  }

  private buildReviewerPrompt(issue: GitHubIssue, buildResult: BuildResult): string {
    const diff = execFileSync("git", ["diff", "--cached", "--binary"], { encoding: "utf-8" });
    const changedFiles = this.taskFiles;

    return `Review GitHub Issue #${issue.number}: ${issue.title}

## Original Requirements
${issue.body}

## Implementation Summary
- Pre-commit staged snapshot: ${this.taskDiffHash}
- Changed files: ${changedFiles.join(", ")}
- Test results: ${buildResult.testResults}

## Git Diff
${diff}

## Review Iteration
${this.state.reviewIteration}/${this.config.maxReviewIterations}

## Previous Review Findings
${this.state.reviewIteration > 1 ? "See previous review report" : "None"}

## Instructions
Review the implementation against the requirements. Write a structured report to docs/reviews/LATEST_REVIEW.md.
Return PASS, FAIL, or NEEDS_REVIEW.`;
  }

  private readReviewReport(): ReviewResult {
    const reportPath = "docs/reviews/LATEST_REVIEW.md";

    if (!fs.existsSync(reportPath)) {
      return { status: "NEEDS_REVIEW", blockers: 0, findings: "No review report found", reportPath };
    }

    const content = fs.readFileSync(reportPath, "utf-8");

    const statusMatch = content.match(/## Status\s*\n(PASS|FAIL|NEEDS_REVIEW)/);
    const status = (statusMatch?.[1] as "PASS" | "FAIL" | "NEEDS_REVIEW") || "NEEDS_REVIEW";

    const blockersMatch = content.match(/BLOCKERS:\s*(\d+)/);
    const blockers = blockersMatch ? parseInt(blockersMatch[1], 10) : 0;

    return { status, blockers, findings: content, reportPath };
  }

  private async finalizeIssue(issue: GitHubIssue, buildResult: BuildResult): Promise<boolean> {
    this.log("Finalizing issue...");

    if (this.state.dryRun) {
      this.log("[DRY RUN] Would commit, push, and close issue");
      return true;
    }

    try {
      this.assertReviewedContentUnchanged();
      // Re-run gates after review before the local commit.
      buildResult.testResults = await this.runQualityGates(issue);
      const hash = await this.commitChanges(issue);
      buildResult.commitHash = hash;
      await this.pushChanges();
      await this.verifyRemoteCommit(hash);
      await this.generateLearningReport(issue, buildResult);
      await this.closeIssue(issue, hash, buildResult.testResults);

      return true;
    } catch (error) {
      this.log(`Failed to finalize issue: ${error}`, "error");
      return false;
    }
  }

  private async commitChanges(issue: GitHubIssue): Promise<string> {
    this.log("Committing reviewed changes...");
    this.assertReviewedContentUnchanged();
    const report = "docs/reviews/LATEST_REVIEW.md";
    if (!fs.existsSync(report)) throw new Error("No reviewer report");
    execFileSync("git", ["add", "--", report]);
    const stagedNames = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf-8" })
      .trim().split("\n").filter(Boolean);
    if (stagedNames.some(f => f !== report && !this.taskFiles.includes(f))) {
      throw new Error("Unapproved staged file discovered before commit");
    }
    if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim() !== this.initialHead) {
      throw new Error("Unexpected commit created during review");
    }
    const message = `Issue #${issue.number}: ${issue.title}`;
    // Avoid 'Closes #N' in the commit because GitHub can close before verification.
    execFileSync("git", ["commit", "-m", message], { encoding: "utf-8" });
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
  }

  private async pushChanges(): Promise<void> {
    this.log("Pushing verified local commit to origin/develop...");
    // No pull --rebase or force push on rejected or diverged branches.
    execFileSync("git", ["fetch", "origin"], { encoding: "utf-8" });
    const local = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
    const remote = execFileSync("git", ["rev-parse", `origin/${this.config.branch}`], { encoding: "utf-8" }).trim();
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", remote, local]);
    } catch {
      throw new Error("Remote branch diverged; manual reconciliation required");
    }
    execFileSync("git", ["push", "origin", this.config.branch], { encoding: "utf-8" });
  }

  private async verifyRemoteCommit(commitHash: string): Promise<void> {
    this.log("Verifying remote commit...");

    execFileSync("git", ["fetch", "origin"], { encoding: "utf-8" });

    const remoteHash = execFileSync("git", ["rev-parse", `origin/${this.config.branch}`], { encoding: "utf-8" }).trim();

    if (remoteHash !== commitHash) {
      throw new Error(`Remote commit mismatch. Expected ${commitHash}, got ${remoteHash}`);
    }

    this.log("Remote commit verified");
  }

  private async closeIssue(issue: GitHubIssue, commitHash: string, testResults: string): Promise<void> {
    this.log("Closing issue...");

    const comment = `Implemented in commit ${commitHash}

## Test Results
${testResults}

## Learning Report
See learning report for implementation details.`;

    execFileSync("gh", ["issue", "comment", String(issue.number), "--repo", this.config.repo, "--body", comment], { encoding: "utf-8" });
    execFileSync("gh", ["issue", "close", String(issue.number), "--repo", this.config.repo, "--reason", "completed"], { encoding: "utf-8" });
    execFileSync("gh", ["issue", "edit", String(issue.number), "--repo", this.config.repo, "--add-label", this.config.labels.implemented, "--remove-label", this.config.labels.inProgress], { encoding: "utf-8" });
  }

  private async generateLearningReport(issue: GitHubIssue, buildResult: BuildResult): Promise<void> {
    const reportDir = path.join(__dirname, "..", "..", "docs", "learning");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `issue-${issue.number}-learning.md`);

    const report = `# Learning Report: Issue #${issue.number}

## What Was Changed
${issue.title}

## Why This Implementation Was Chosen
Based on the issue requirements and existing architecture.

## Important Architecture Decisions
- Followed existing patterns in the codebase
- Maintained separation of concerns
- Used typed IPC and validated schemas

## Tests and Their Purpose
${buildResult.testResults}

## Files Affected
${this.taskFiles.join("\n")}

## Lessons for Developer Learning from Agentic Coding
- Small, verifiable changes reduce review iterations
- Quality gates catch issues early
- Structured review process ensures quality`;

    fs.writeFileSync(reportPath, report);
    this.log(`Learning report saved to ${reportPath}`);
  }

  private async handleFailure(issue: GitHubIssue, reason: string): Promise<void> {
    this.log(`Issue #${issue.number} failed: ${reason}`, "error");

    if (!this.state.dryRun) {
      await this.updateIssueLabels(issue.number, [this.config.labels.blocked]);
      execFileSync("gh", ["issue", "comment", String(issue.number), "--repo", this.config.repo, "--body", `Autodev failed: ${reason}`], { encoding: "utf-8" });
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.saveState();
    this.log("Controller stopped gracefully");
  }
}

export async function runAutodev(dryRun = false): Promise<void> {
  const controller = new AutodevController(dryRun);
  await controller.run();
}