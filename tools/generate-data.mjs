#!/usr/bin/env node
/* Regenerates site/js/data.js: merges the curated card content in tools/projects.config.json
   (blurbs, icons, downloads, ordering - the things a human writes) with live repository data
   from the GitHub API (visibility, stars, languages, 52-week commit activity, latest release).

   Auth: set GH_TOKEN to a token that can READ every repo in the config. In CI that is the
   STATS_TOKEN secret (fine-grained PAT, LuluStudioX repos, Contents: read). Locally:
     GH_TOKEN=$(gh auth token) node tools/generate-data.mjs */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GH_TOKEN not set; refusing to emit a data.js with no stats.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const api = async (path, { retries = 0 } = {}) => {
  const res = await fetch(`https://api.github.com${path}`, { headers: HEADERS });
  // 202 = stats still being computed server-side; retry briefly, else give up gracefully.
  if (res.status === 202 && retries < 5) {
    await new Promise((r) => setTimeout(r, 3000));
    return api(path, { retries: retries + 1 });
  }
  if (res.status === 404 || res.status === 202) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const slugOf = (repoUrl) => repoUrl.replace("https://github.com/", "");
const MAX_COMMIT_PAGES = 50;

// /stats/commit_activity is computed lazily server-side and stays empty for a while after a repo
// is created or transferred. When it yields nothing, rebuild the 52 weekly buckets from the commit
// list itself.
async function activityFromCommits(repoPath) {
  const weekMs = 7 * 24 * 3600 * 1000;
  const sinceMs = Date.now() - 52 * weekMs;
  const since = new Date(sinceMs).toISOString();
  const weeks = new Array(52).fill(0);
  for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repoPath}/commits?since=${since}&per_page=100&page=${page}`,
      { headers: HEADERS });
    if (!res.ok) break;
    const commits = await res.json();
    for (const c of commits) {
      const t = Date.parse(c.commit?.committer?.date ?? c.commit?.author?.date ?? "");
      if (Number.isNaN(t)) continue;
      weeks[Math.min(51, Math.max(0, Math.floor((t - sinceMs) / weekMs)))]++;
    }
    if (commits.length < 100) break;
  }
  return weeks;
}

async function enrich(entry) {
  const repoPath = slugOf(entry.repo);
  const repo = await api(`/repos/${repoPath}`);
  if (!repo) {
    console.warn(`! ${repoPath}: not accessible with this token; keeping curated fields only`);
    return { ...entry, private: true, fork: false, archived: false };
  }

  const [languages, activityRaw, release] = await Promise.all([
    api(`/repos/${repoPath}/languages`),
    api(`/repos/${repoPath}/stats/commit_activity`),
    api(`/repos/${repoPath}/releases/latest`),
  ]);

  const weeks = Array.isArray(activityRaw) ? activityRaw.map((w) => w.total) : [];
  let activity = weeks.length === 52 ? weeks : new Array(52).fill(0);
  if (activity.every((v) => v === 0))
    activity = await activityFromCommits(repoPath);

  const langTotal = Object.values(languages ?? {}).reduce((a, b) => a + b, 0);
  const languageList = Object.entries(languages ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({
      name,
      percent: langTotal ? Math.round((bytes / langTotal) * 100) : 0,
    }));

  const out = {
    ...entry,
    private: repo.private,
    fork: repo.fork,
    archived: repo.archived,
    stats: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      created: repo.created_at.slice(0, 10),
      updated: (repo.pushed_at ?? repo.updated_at).slice(0, 10),
      language: repo.language,
      commitsLastYear: activity.reduce((a, b) => a + b, 0),
    },
    languages: languageList,
    activity,
  };

  if (release?.tag_name) {
    out.release = {
      version: release.tag_name,
      date: (release.published_at ?? release.created_at).slice(0, 10),
    };
  }

  console.log(`  + ${repoPath} (${out.stats.commitsLastYear} commits/yr${out.release ? ", " + out.release.version : ""})`);
  return out;
}

// Field order mirrors the historical generator output so diffs stay readable.
const fieldOrder = [
  "name", "slug", "blurb", "summary", "release", "feed", "icon", "facts", "repo", "site",
  "private", "fork", "archived", "status", "page", "downloads", "tags", "stats",
  "languages", "activity", "order",
];
const ordered = (e) =>
  Object.fromEntries(fieldOrder.filter((f) => e[f] !== undefined).map((f) => [f, e[f]]));

const config = JSON.parse(readFileSync(join(root, "tools/projects.config.json"), "utf8"));
const hub = {
  projects: await Promise.all(config.projects.map(enrich)).then((l) => l.map(ordered)),
  bots: await Promise.all(config.bots.map(enrich)).then((l) => l.map(ordered)),
};

const banner =
  "/* data.js - GENERATED by tools/generate-data.mjs. Do not edit by hand.\n" +
  "   Refresh with: GH_TOKEN=$(gh auth token) node tools/generate-data.mjs\n" +
  "   Curate which repos appear (and their blurbs/icons/downloads) in tools/projects.config.json. */\n";

writeFileSync(join(root, "site/js/data.js"), banner + "const HUB = " + JSON.stringify(hub, null, 2) + ";\n");
console.log(`site/js/data.js written: ${hub.projects.length} projects, ${hub.bots.length} bots`);
