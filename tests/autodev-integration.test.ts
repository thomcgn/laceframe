import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutodevController, type GitHubIssue, type BuildResult, type ReviewResult } from "../src/autodev/controller";

// The controller calls fs through a default import; mocks must expose default.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mocked = {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    appendFileSync: vi.fn(),
    rmdirSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: vi.fn(), execFileSync: vi.fn() };
});

// Exercise the real review loop but replace external operations (Kilo, git, GitHub).
// This is an orchestration test, not an end-to-end Kilo CLI test.
interface ControllerSeams {
  config: { maxReviewIterations: number };
  state: { failedIssues: number[]; reviewIteration: number; processedIssues: number[] };
  processIssue(issue: GitHubIssue): Promise<boolean>;
  selectNextIssue(): Promise<GitHubIssue | null>;
  runBuilder(issue: GitHubIssue, feedback?: string): Promise<BuildResult>;
  runReviewer(issue: GitHubIssue, build: BuildResult): Promise<ReviewResult>;
  finalizeIssue(issue: GitHubIssue, build: BuildResult): Promise<boolean>;
  handleFailure(issue: GitHubIssue, reason: string): Promise<void>;
  fetchApprovedIssues(): Promise<GitHubIssue[]>;
  updateIssueLabels(issueNumber: number, labels: string[]): Promise<void>;
}

const issue = (number: number, priority: GitHubIssue["priority"] = "high", dependencies: number[] = []): GitHubIssue => ({
  number, title: `Issue ${number}`, body: "Implement behavior", labels: ["autodev:approved"], state: "open",
  priority, dependencies, requiredValidation: [], relevantFiles: [],
});

const build: BuildResult = { success: true, commitHash: null, testResults: "typecheck: PASSED" };
const review = (status: ReviewResult["status"], blockers = 0): ReviewResult => ({
  status, blockers, findings: status === "PASS" ? "Looks good" : "Fix findings", reportPath: "docs/reviews/LATEST_REVIEW.md",
});

describe("AutoDev controller orchestration", () => {
  let controller: AutodevController;
  let sut: ControllerSeams;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AutodevController(true);
    sut = controller as unknown as ControllerSeams;
    sut.config.maxReviewIterations = 3;
    vi.spyOn(sut, "handleFailure").mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("selects highest priority approved issue", async () => {
    vi.spyOn(sut, "fetchApprovedIssues").mockResolvedValue([issue(2, "low"), issue(1, "high")]);
    vi.spyOn(sut, "updateIssueLabels").mockResolvedValue(undefined);
    expect((await sut.selectNextIssue())?.number).toBe(1);
  });

  it("skips issues with unsatisfied dependencies", async () => {
    vi.spyOn(sut, "fetchApprovedIssues").mockResolvedValue([issue(10, "high", [999])]);
    vi.spyOn(sut, "updateIssueLabels").mockResolvedValue(undefined);
    expect(await sut.selectNextIssue()).toBeNull();
  });

  it("retries the Builder after review FAIL and then finalizes", async () => {
    const builder = vi.spyOn(sut, "runBuilder").mockResolvedValue(build);
    const reviewer = vi.spyOn(sut, "runReviewer")
      .mockResolvedValueOnce(review("FAIL", 1)).mockResolvedValueOnce(review("PASS"));
    const finalize = vi.spyOn(sut, "finalizeIssue").mockResolvedValue(true);
    expect(await sut.processIssue(issue(100))).toBe(true);
    expect(builder).toHaveBeenCalledTimes(2);
    expect(builder.mock.calls[1][1]).toContain("Fix findings");
    expect(reviewer).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("stops after three review FAIL outcomes without finalizing", async () => {
    vi.spyOn(sut, "runBuilder").mockResolvedValue(build);
    const reviewer = vi.spyOn(sut, "runReviewer").mockResolvedValue(review("FAIL", 1));
    const finalize = vi.spyOn(sut, "finalizeIssue").mockResolvedValue(true);
    expect(await sut.processIssue(issue(200))).toBe(false);
    expect(reviewer).toHaveBeenCalledTimes(3);
    expect(finalize).not.toHaveBeenCalled();
    expect(sut.handleFailure).toHaveBeenCalledTimes(1);
  });

  it("continues NEEDS_REVIEW and finalizes only after PASS", async () => {
    vi.spyOn(sut, "runBuilder").mockResolvedValue(build);
    const reviewer = vi.spyOn(sut, "runReviewer")
      .mockResolvedValueOnce(review("NEEDS_REVIEW"))
      .mockResolvedValueOnce(review("NEEDS_REVIEW"))
      .mockResolvedValueOnce(review("PASS"));
    const finalize = vi.spyOn(sut, "finalizeIssue").mockResolvedValue(true);
    expect(await sut.processIssue(issue(300))).toBe(true);
    expect(reviewer).toHaveBeenCalledTimes(3);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("does not finalize a PASS review containing blockers", async () => {
    vi.spyOn(sut, "runBuilder").mockResolvedValue(build);
    vi.spyOn(sut, "runReviewer").mockResolvedValue(review("PASS", 2));
    const finalize = vi.spyOn(sut, "finalizeIssue").mockResolvedValue(true);
    expect(await sut.processIssue(issue(400))).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
  });
});
