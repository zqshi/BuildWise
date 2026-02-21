"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scaffoldRepository = scaffoldRepository;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
function safeSegment(value, fallback) {
    const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || fallback;
}
function ensureDir(path, createdPaths) {
    if (!(0, node_fs_1.existsSync)(path)) {
        (0, node_fs_1.mkdirSync)(path, { recursive: true });
        createdPaths.push(path);
    }
}
function ensureFile(path, content, createdPaths) {
    if (!(0, node_fs_1.existsSync)(path)) {
        (0, node_fs_1.writeFileSync)(path, content, "utf-8");
        createdPaths.push(path);
    }
}
function writeScaffoldFiles(repoPath, createdPaths) {
    ensureFile((0, node_path_1.join)(repoPath, "README.md"), "# Project Repository\n\nThis repository is scaffolded by BuildWise.\n", createdPaths);
    ensureFile((0, node_path_1.join)(repoPath, ".gitignore"), "node_modules/\ndist/\n.env\n.DS_Store\ncoverage/\n", createdPaths);
    ensureFile((0, node_path_1.join)(repoPath, ".editorconfig"), "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n", createdPaths);
    ensureFile((0, node_path_1.join)(repoPath, "docs", "README.md"), "# Docs\n\n- PRD\n- ADR\n- Iteration notes\n", createdPaths);
    ensureFile((0, node_path_1.join)(repoPath, ".github", "workflows", "ci.yml"), "name: CI\non: [push, pull_request]\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Placeholder\n        run: echo \"Add project checks\"\n", createdPaths);
}
function ensureLayout(repoPath, layout, createdPaths) {
    for (const item of layout) {
        const dirPath = (0, node_path_1.join)(repoPath, item.path);
        ensureDir(dirPath, createdPaths);
        const entries = (0, node_fs_1.readdirSync)(dirPath);
        if (entries.length === 0) {
            ensureFile((0, node_path_1.join)(dirPath, ".gitkeep"), "", createdPaths);
        }
    }
}
function runGit(args, cwd) {
    return (0, node_child_process_1.spawnSync)("git", args, { cwd, encoding: "utf-8" });
}
function initGit(repoPath, defaultBranch, createInitialCommit) {
    const gitDir = (0, node_path_1.join)(repoPath, ".git");
    if (!(0, node_fs_1.existsSync)(gitDir)) {
        const initWithBranch = runGit(["init", "-b", defaultBranch], repoPath);
        if (initWithBranch.status !== 0) {
            const initLegacy = runGit(["init"], repoPath);
            if (initLegacy.status !== 0) {
                throw new Error(`git init failed: ${initLegacy.stderr || initLegacy.stdout}`);
            }
            const checkout = runGit(["checkout", "-b", defaultBranch], repoPath);
            if (checkout.status !== 0) {
                throw new Error(`git checkout -b failed: ${checkout.stderr || checkout.stdout}`);
            }
        }
    }
    if (!createInitialCommit) {
        return { gitInitialized: true, commit: "" };
    }
    const add = runGit(["add", "."], repoPath);
    if (add.status !== 0) {
        throw new Error(`git add failed: ${add.stderr || add.stdout}`);
    }
    const diff = runGit(["status", "--porcelain"], repoPath);
    if (diff.status !== 0) {
        throw new Error(`git status failed: ${diff.stderr || diff.stdout}`);
    }
    if (!diff.stdout.trim()) {
        const head = runGit(["rev-parse", "HEAD"], repoPath);
        return { gitInitialized: true, commit: head.status === 0 ? head.stdout.trim() : "" };
    }
    const commit = runGit(["-c", "user.name=BuildWise Bot", "-c", "user.email=buildwise@local", "commit", "-m", "chore: scaffold repository structure"], repoPath);
    if (commit.status !== 0) {
        throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    const head = runGit(["rev-parse", "HEAD"], repoPath);
    return { gitInitialized: true, commit: head.status === 0 ? head.stdout.trim() : "" };
}
function scaffoldRepository(input) {
    const org = safeSegment(input.organization, "org");
    const repoName = safeSegment(input.repositoryName, "project-repo");
    const rootDir = input.rootDir.trim();
    if (!rootDir) {
        throw new Error("rootDir is required");
    }
    const repoPath = (0, node_path_1.join)(rootDir, org, repoName);
    const createdPaths = [];
    if (input.dryRun) {
        return {
            repoPath,
            createdPaths: [
                (0, node_path_1.join)(repoPath, "apps/web"),
                (0, node_path_1.join)(repoPath, "apps/api"),
                (0, node_path_1.join)(repoPath, "packages/domain"),
                (0, node_path_1.join)(repoPath, "docs")
            ],
            gitInitialized: input.initializeGit,
            commit: "",
            dryRun: true
        };
    }
    ensureDir(repoPath, createdPaths);
    for (const parent of ["docs", ".github", (0, node_path_1.join)(".github", "workflows")]) {
        ensureDir((0, node_path_1.join)(repoPath, parent), createdPaths);
    }
    ensureLayout(repoPath, input.layout, createdPaths);
    writeScaffoldFiles(repoPath, createdPaths);
    const git = input.initializeGit ? initGit(repoPath, input.defaultBranch, input.createInitialCommit) : { gitInitialized: false, commit: "" };
    return {
        repoPath,
        createdPaths,
        gitInitialized: git.gitInitialized,
        commit: git.commit,
        dryRun: false
    };
}
