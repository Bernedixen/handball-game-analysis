#!/usr/bin/env node

const DEFAULT_BOOTSTRAP_SLUG = "flint-u14-cup-2026";
const DEFAULT_USER_AGENT = "HandbollGameAnalysis/1.0 (+local import tool)";

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || options.help) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  try {
    switch (command) {
      case "list":
        await handleList(options);
        break;
      case "timeline":
        await handleTimeline(options);
        break;
      default:
        throw new Error(`Unknown command "${command}".`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function handleList(options) {
  const teamContext = await resolveTeamContext(options);
  const matches = parseMatchesFromTeamPage(teamContext.html);
  const playedMatches = matches.filter((match) => match.hasResult);

  printJson({
    teamId: teamContext.teamId,
    teamName: teamContext.teamName,
    canonicalTeamUrl: teamContext.teamUrl,
    totalMatches: matches.length,
    playedMatches: playedMatches.length,
    upcomingMatches: matches.length - playedMatches.length,
    matches,
  });
}

async function handleTimeline(options) {
  const teamContext = await resolveTeamContext(options);
  const matchId = requiredNumber(options["match-id"] ?? options.matchId, "--match-id");
  const matches = parseMatchesFromTeamPage(teamContext.html);
  const selectedMatch = matches.find((match) => match.matchId === matchId) ?? null;
  const expandedHtml = await fetchText(buildExpandedMatchUrl(teamContext.teamUrl, matchId));
  const empApiUrl = extractEmpApiUrl(expandedHtml);
  const empData = await fetchJson(empApiUrl);
  const normalized = normalizeEmpTimeline(empData, teamContext.teamId);

  printJson({
    teamId: teamContext.teamId,
    teamName: teamContext.teamName,
    canonicalTeamUrl: teamContext.teamUrl,
    match: selectedMatch ?? { matchId },
    empApiUrl,
    summary: normalized.summary,
    timeline: normalized.timeline,
  });
}

async function resolveTeamContext(options) {
  const teamId = requiredNumber(options["team-id"] ?? options.teamId, "--team-id");
  const teamUrl = buildInitialTeamUrl(options, teamId);
  const html = await fetchText(teamUrl);
  const canonicalTeamUrl = extractCanonicalTeamUrl(html, teamUrl, teamId);
  const canonicalHtml = canonicalTeamUrl === teamUrl ? html : await fetchText(canonicalTeamUrl);

  return {
    teamId,
    teamUrl: canonicalTeamUrl,
    teamName: extractTeamName(canonicalHtml),
    html: canonicalHtml,
  };
}

function buildInitialTeamUrl(options, teamId) {
  if (options["team-url"] ?? options.teamUrl) {
    return options["team-url"] ?? options.teamUrl;
  }

  const leagueSlug = options["league-slug"] ?? options.leagueSlug;
  if (leagueSlug) {
    return `https://www.profixio.com/app/${leagueSlug}/teams/${teamId}`;
  }

  const bootstrapSlug = options["bootstrap-slug"] ?? options.bootstrapSlug ?? DEFAULT_BOOTSTRAP_SLUG;
  return `https://www.profixio.com/app/${bootstrapSlug}/teams/${teamId}`;
}

function buildExpandedMatchUrl(teamUrl, matchId) {
  const url = new URL(teamUrl);
  url.searchParams.set("expandmatch", String(matchId));
  return url.toString();
}

function extractCanonicalTeamUrl(html, fallbackUrl, teamId) {
  const hrefMatch = html.match(
    new RegExp(`href="(https://www\\.profixio\\.com/app/[^"?]+/teams/${teamId}(?:\\?k=\\d+)?)"`),
  );

  if (!hrefMatch) {
    return fallbackUrl;
  }

  const canonical = new URL(hrefMatch[1]);
  canonical.search = "";
  return canonical.toString();
}

function extractTeamName(html) {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*-\s*Profixio\s*<\/title>/i);
  return titleMatch ? cleanupWhitespace(titleMatch[1]) : null;
}

function parseMatchesFromTeamPage(html) {
  const blocks = html.split(/<li wire:key="listkamp_/).slice(1);

  return blocks
    .map((block) => parseMatchBlock(block))
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function parseMatchBlock(block) {
  const idMatch = block.match(/^(\d+)/);
  const hasResultMatch = block.match(/hasResult:\s*(true|false)/);
  const timestampMatch = block.match(/timestamp:\s*(\d+)/);

  if (!idMatch || !hasResultMatch || !timestampMatch) {
    return null;
  }

  const matchId = Number(idMatch[1]);
  const timestamp = Number(timestampMatch[1]);
  const textXs = extractTextMatches(block, /<div class="text-xs">\s*([^<]+?)\s*<\/div>/g);
  const teamNames = unique(
    extractTextMatches(
      block,
      /class="leading-5 max-w-60 md:max-w-\[20rem\] truncate(?: font-bold)?">\s*(?:<!--\[if BLOCK\]><!\[endif\]-->)*\s*([^<]+?)\s*(?:<!--\[if ENDBLOCK\]><!\[endif\]-->)*\s*<\/div>/g,
    ),
  );

  return {
    matchId,
    matchNumber: textXs[0] ?? null,
    hasResult: hasResultMatch[1] === "true",
    timestamp,
    dateIso: new Date(timestamp * 1000).toISOString(),
    homeTeam: teamNames[0] ?? null,
    awayTeam: teamNames[1] ?? null,
  };
}

function extractEmpApiUrl(html) {
  const decoded = decodeHtmlEntities(html);
  const match = decoded.match(/apiurl:\s*'([^']+)'/);

  if (!match) {
    throw new Error("Could not find EMP API URL in expanded match view.");
  }

  return match[1]
    .replace(/\\+\//g, "/")
    .replace(/\\+u0026/g, "&")
    .replace(/\\&/g, "&");
}
function normalizeEmpTimeline(empData, selectedTeamId) {
  const timeline = (empData.events ?? [])
    .filter((event) => event.teamId === selectedTeamId)
    .sort((left, right) => {
      const leftOrder = left.sortOrder ?? 0;
      const rightOrder = right.sortOrder ?? 0;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return (left.id ?? 0) - (right.id ?? 0);
    })
    .map((event) => ({
      eventId: event.id ?? null,
      eventTypeId: event.eventTypeId ?? null,
      action: inferEventAction(event),
      description: event.description ?? null,
      teamId: event.teamId ?? null,
      teamName: event.teamName ?? null,
      playerId: event.person?.id ?? null,
      playerName: cleanupWhitespace(event.person?.name ?? "") || null,
      playerNumber: event.person?.number ?? null,
      assistPlayerId: event.person2?.id ?? null,
      assistPlayerName: cleanupWhitespace(event.person2?.name ?? "") || null,
      assistPlayerNumber: event.person2?.number ?? null,
      displayGameTime: event.displayGameTime ?? null,
      period: event.period ?? null,
      timeInPeriod: event.timeInPeriod ?? null,
      score: normalizeScore(event.currentScore),
      goals: event.goals ?? null,
      comment: event.comment ?? null,
      createdAt: event.created_at ?? null,
      sortOrder: event.sortOrder ?? null,
    }));

  return {
    summary: {
      totalTeamTimelineEvents: timeline.length,
      goals: timeline.filter((event) => event.action === "GOAL").length,
      saves: timeline.filter((event) => event.action === "SAVE").length,
      warnings: timeline.filter((event) => event.action === "WARNING").length,
      suspensions: timeline.filter((event) => event.action === "SUSPENSION").length,
      uniquePlayers: unique(
        timeline
          .map((event) => event.playerName)
          .filter(Boolean),
      ).length,
    },
    timeline,
  };
}

function normalizeScore(score) {
  if (!score) {
    return null;
  }

  return {
    home: score.home ?? score.homeGoals ?? null,
    away: score.away ?? score.awayGoals ?? null,
  };
}

function inferEventAction(event) {
  const description = String(event.description ?? "").toLowerCase();

  if (event.goals && event.goals > 0) {
    return "GOAL";
  }
  if (description.includes("räddning")) {
    return "SAVE";
  }
  if (description.includes("gult kort")) {
    return "WARNING";
  }
  if (description.includes("rött kort") || description.includes("kort")) {
    return "CARD";
  }
  if (description.includes("utvisning")) {
    return "SUSPENSION";
  }
  if (description.includes("timeout")) {
    return "TIMEOUT";
  }
  if (description.includes("miss")) {
    return "MISS";
  }
  return "EVENT";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_USER_AGENT,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`JSON request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument "${token}".`);
    }

    const key = token.slice(2);
    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

function printUsage() {
  console.log(`Usage:
  node scripts/profixio-import.mjs list --team-id <id> [--team-url <url>] [--league-slug <slug>]
  node scripts/profixio-import.mjs timeline --team-id <id> --match-id <id> [--team-url <url>] [--league-slug <slug>]

Notes:
  - For reliable imports, prefer --team-url with the team's canonical Profixio page.
  - If only --team-id is provided, the script bootstraps via a known Profixio slug and then resolves the canonical team URL.
  - The timeline command filters the EMP timeline to the selected team only and returns a minimal JSON structure.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function requiredNumber(value, optionName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required option ${optionName}.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric value for ${optionName}, got "${value}".`);
  }

  return parsed;
}

function cleanupWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractTextMatches(value, expression) {
  return [...value.matchAll(expression)].map((match) => cleanupWhitespace(match[1]));
}

function unique(values) {
  return [...new Set(values)];
}

await main();




