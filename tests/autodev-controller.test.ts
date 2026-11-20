import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutodevController, GitHubIssue, ControllerState } from "../src/autodev/controller";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: vi.fn(), execFileSync: vi.fn() };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mocked = {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(() => undefined),
    appendFileSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(),
    rmdirSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";

const mockExecSync = vi.mocked(execSync);
const mockExecFileSync = vi.mocked(execFileSync);
const mockFs = vi.mocked(fs);

interface GitHubIssueRaw {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
  state: "open" | "closed";
}

describe("AutodevController", () => {
  let controller: AutodevController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controllerAny: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue("{}");
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockExecFileSync.mockReturnValue("");

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("git status")) return "";
      if (cmd.includes("git branch")) return "develop\n";
      if (cmd.includes("git fetch")) return "";
      if (cmd.includes("gh auth")) return "Authenticated";
      return "";
    });

    controller = new AutodevController(true);
    controllerAny = controller;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("loadState", () => {
    it("returns default state when no file exists", () => {
      mockFs.existsSync.mockReturnValue(false);
      const state = controllerAny.loadState();
      expect(state.currentIssue).toBeNull();
      expect(state.reviewIteration).toBe(0);
      expect(state.processedIssues).toEqual([]);
    });

    it("loads state from file when exists", () => {
      const savedState: ControllerState = {
        currentIssue: 42,
        reviewIteration: 2,
        lastProcessedIssue: 41,
        processedIssues: [41],
        failedIssues: [],
        dryRun: true,
        lastRun: "2026-01-01T00:00:00Z",
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedState));
      const state = controllerAny.loadState();
      expect(state.currentIssue).toBe(42);
      expect(state.reviewIteration).toBe(2);
    });
  });

  describe("saveState", () => {
    it("writes state to file", () => {
      controllerAny.saveState();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("loadConfig", () => {
    it("returns default config when no file exists", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = controllerAny.loadConfig();
      expect(config.repo).toBe("thomcgn/laceframe");
      expect(config.branch).toBe("develop");
      expect(config.maxReviewIterations).toBe(3);
    });
  });

  describe("parseIssue", () => {
    it("parses issue with all fields", () => {
      const issue: GitHubIssueRaw = {
        number: 123,
        title: "Test Issue",
        body: `Priority: high
Dependencies: #1, #2
Required Validation: npm test
npm run lint
Relevant Files: src/file.ts
src/other.ts`,
        labels: [{ name: "autodev:approved" }, { name: "bug" }],
        state: "open",
      };

      const parsed = controllerAny.parseIssue(issue);

      expect(parsed.number).toBe(123);
      expect(parsed.title).toBe("Test Issue");
      expect(parsed.priority).toBe("high");
      expect(parsed.dependencies).toEqual([1, 2]);
      expect(parsed.requiredValidation).toEqual(["npm test", "npm run lint"]);
      expect(parsed.relevantFiles).toEqual(["src/file.ts", "src/other.ts"]);
    });

    it("uses defaults for missing fields", () => {
      const issue: GitHubIssueRaw = {
        number: 456,
        title: "Minimal Issue",
        body: "",
        labels: [{ name: "autodev:approved" }],
        state: "open",
      };

      const parsed = controllerAny.parseIssue(issue);

      expect(parsed.priority).toBe("medium");
      expect(parsed.dependencies).toEqual([]);
      expect(parsed.requiredValidation).toEqual([]);
      expect(parsed.relevantFiles).toEqual([]);
    });
  });

  describe("priorityValue", () => {
    it("returns correct priority values", () => {
      expect(controllerAny.priorityValue("high")).toBe(3);
      expect(controllerAny.priorityValue("medium")).toBe(2);
      expect(controllerAny.priorityValue("low")).toBe(1);
      expect(controllerAny.priorityValue("unknown")).toBe(0);
    });
  });

  describe("areDependenciesSatisfied", () => {
    it("returns true when all dependencies processed", () => {
      controllerAny.state.processedIssues = [1, 2, 3];
      const issue: GitHubIssue = {
        number: 4,
        title: "",
        body: "",
        labels: [],
        state: "open",
        priority: "medium",
        dependencies: [1, 3],
        requiredValidation: [],
        relevantFiles: [],
      };
      expect(controllerAny.areDependenciesSatisfied(issue)).toBe(true);
    });

    it("returns false when dependency missing", () => {
      controllerAny.state.processedIssues = [1, 2];
      const issue: GitHubIssue = {
        number: 4,
        title: "",
        body: "",
        labels: [],
        state: "open",
        priority: "medium",
        dependencies: [1, 3],
        requiredValidation: [],
        relevantFiles: [],
      };
      expect(controllerAny.areDependenciesSatisfied(issue)).toBe(false);
    });

    it("returns true for no dependencies", () => {
      controllerAny.state.processedIssues = [];
      const issue: GitHubIssue = {
        number: 4,
        title: "",
        body: "",
        labels: [],
        state: "open",
        priority: "medium",
        dependencies: [],
        requiredValidation: [],
        relevantFiles: [],
      };
      expect(controllerAny.areDependenciesSatisfied(issue)).toBe(true);
    });
  });

  describe("buildBuilderPrompt", () => {
    it("includes issue details in prompt", () => {
      const issue: GitHubIssue = {
        number: 789,
        title: "Feature Request",
        body: "Implement feature X",
        labels: ["autodev:approved"],
        state: "open",
        priority: "high",
        dependencies: [],
        requiredValidation: ["npm test"],
        relevantFiles: ["src/feature.ts"],
      };

      const prompt = controllerAny.buildBuilderPrompt(issue);

      expect(prompt).toContain("#789");
      expect(prompt).toContain("Feature Request");
      expect(prompt).toContain("Implement feature X");
      expect(prompt).toContain("src/feature.ts");
      expect(prompt).toContain("npm test");
    });
  });

  describe("buildReviewerPrompt", () => {
    it("includes build results and diff", () => {
      const issue: GitHubIssue = {
        number: 999,
        title: "Bug Fix",
        body: "Fix bug Y",
        labels: ["autodev:approved"],
        state: "open",
        priority: "high",
        dependencies: [],
        requiredValidation: [],
        relevantFiles: [],
      };

      const buildResult = {
        success: true,
        commitHash: "abc123",
        testResults: "All tests passed",
      };

      mockExecFileSync.mockImplementation((_file, args) => {
        if (args?.includes("--cached") && args.includes("--binary")) return "diff content";
        return "";
      });
      // Current reviewer sees the frozen list of task files, not git diff HEAD~1.
      (controllerAny as { taskFiles: string[] }).taskFiles = ["file1.ts", "file2.ts"];
      (controllerAny as { taskDiffHash: string }).taskDiffHash = "digest";

      const prompt = controllerAny.buildReviewerPrompt(issue, buildResult);

      expect(prompt).toContain("#999");
      expect(prompt).toContain("Bug Fix");
      expect(prompt).toContain("digest");
      expect(prompt).toContain("All tests passed");
      expect(prompt).toContain("diff content");
      expect(prompt).toContain("file1.ts");
    });
  });

  describe("readReviewReport", () => {
    it("returns NEEDS_REVIEW when no report exists", () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = controllerAny.readReviewReport();
      expect(result.status).toBe("NEEDS_REVIEW");
      expect(result.findings).toContain("No review report found");
    });

    it("parses PASS status from report", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
# LaceFrame Code Review
## Status
PASS
BLOCKERS: 0
      `);
      const result = controllerAny.readReviewReport();
      expect(result.status).toBe("PASS");
      expect(result.blockers).toBe(0);
    });

    it("parses FAIL status from report", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
# LaceFrame Code Review
## Status
FAIL
BLOCKERS: 2
      `);
      const result = controllerAny.readReviewReport();
      expect(result.status).toBe("FAIL");
      expect(result.blockers).toBe(2);
    });
  });

  describe("verifyPrerequisites", () => {
    it("passes with clean working tree on develop", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("git status")) return "";
        if (cmd.includes("git branch")) return "develop\n";
        if (cmd.includes("git fetch")) return "";
        if (cmd.includes("gh auth")) return "Authenticated";
        return "";
      });

      await expect(controllerAny.verifyPrerequisites()).resolves.not.toThrow();
    });

    it("throws when working tree not clean", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("git status")) return "M file.ts\n";
        if (cmd.includes("git branch")) return "develop\n";
        return "";
      });

      controllerAny.state.dryRun = false;

      await expect(controllerAny.verifyPrerequisites()).rejects.toThrow("Working tree not clean");
    });

    it("throws when not on develop branch", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("git status")) return "";
        if (cmd.includes("git branch")) return "main\n";
        return "";
      });

      await expect(controllerAny.verifyPrerequisites()).rejects.toThrow("Not on develop");
    });

    it("throws when gh not authenticated", async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("git status")) return "";
        if (cmd.includes("git branch")) return "develop\n";
        if (cmd.includes("git fetch")) return "";
        if (cmd.includes("gh auth")) throw new Error("Not authenticated");
        return "";
      });

      await expect(controllerAny.verifyPrerequisites()).rejects.toThrow("GitHub CLI not authenticated");
    });
  });

  describe("finalizeIssue", () => {
    it("commits, pushes, verifies, and closes in dry run", async () => {
      const issue: GitHubIssue = {
        number: 111,
        title: "Test",
        body: "",
        labels: [],
        state: "open",
        priority: "medium",
        dependencies: [],
        requiredValidation: [],
        relevantFiles: [],
      };

      const buildResult = { success: true, commitHash: "def456", testResults: "passed" };

      await expect(controllerAny.finalizeIssue(issue, buildResult)).resolves.toBe(true);
    });
  });
  describe("controller lock recovery", () => {
    it("automatically recovers an old empty legacy lock", () => {
      const exists = Object.assign(new Error("already exists"), { code: "EEXIST" });
      mockFs.mkdirSync.mockImplementationOnce(() => { throw exists; }).mockImplementation(() => undefined);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() - 10_000 } as fs.Stats);
      mockFs.readdirSync.mockReturnValue([] as never);

      expect(() => controllerAny.acquireControllerLock()).not.toThrow();
      expect(mockFs.rmdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("pid"),
        String(process.pid),
        { flag: "wx" },
      );
      controllerAny.releaseControllerLock();
    });

    it("does not remove a lock owned by a running controller", () => {
      const exists = Object.assign(new Error("already exists"), { code: "EEXIST" });
      mockFs.mkdirSync.mockImplementationOnce(() => { throw exists; });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(String(process.pid));

      expect(() => controllerAny.acquireControllerLock()).toThrow("already running");
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
      expect(mockFs.rmdirSync).not.toHaveBeenCalled();
    });

    it("releases the current owner's lock and removes signal listeners", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(String(process.pid));
      const count = process.listenerCount("SIGINT");

      controllerAny.acquireControllerLock();
      expect(process.listenerCount("SIGINT")).toBe(count + 1);
      controllerAny.releaseControllerLock();

      expect(process.listenerCount("SIGINT")).toBe(count);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining("pid"));
      expect(mockFs.rmdirSync).toHaveBeenCalled();
    });
  });

});