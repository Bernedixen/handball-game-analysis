const players = Array.from({ length: 16 }, (_, index) => ({
  id: `p${index + 1}`,
  number: index + 1,
  name: `Player ${index + 1}`,
}));

const actionDefinitions = [
  { id: "SHOT", label: "Shot", description: "Creates shot and outcome events" },
  { id: "PENALTY", label: "Penalty", description: "Records a 7m attempt and outcome" },
  { id: "SAVE", label: "Save", description: "Manual goalkeeper save entry" },
  { id: "MISS", label: "Miss", description: "Manual missed attempt" },
  { id: "ASSIST", label: "Assist", description: "Standalone assist entry" },
  { id: "TECH_FAULT", label: "Tech Fault", description: "Turnover or handling fault" },
  { id: "STEAL", label: "Steal", description: "Defensive possession win" },
  { id: "BLOCK", label: "Block", description: "Blocked attacking action" },
  { id: "CARD", label: "Card", description: "Warning or discipline event" },
  { id: "SUSPENSION", label: "Suspension", description: "Timed exclusion" },
];

const contextDefinitions = {
  SHOT: [
    { key: "height", label: "Height", options: ["HIGH", "LOW"] },
    { key: "location", label: "Location", options: ["WING", "BACKCOURT", "LINE", "BREAKTHROUGH", "FAST_BREAK"] },
    { key: "outcome", label: "Outcome", options: ["GOAL", "SAVE", "MISS", "BLOCK"] },
  ],
  PENALTY: [
    { key: "height", label: "Height", options: ["HIGH", "LOW"] },
    { key: "outcome", label: "Outcome", options: ["GOAL", "SAVE", "MISS", "BLOCK"] },
  ],
  SAVE: [
    { key: "height", label: "Shot height", options: ["HIGH", "LOW"] },
    { key: "location", label: "Shot source", options: ["WING", "BACKCOURT", "LINE", "BREAKTHROUGH", "PENALTY", "FAST_BREAK"] },
  ],
  MISS: [
    { key: "height", label: "Shot height", options: ["HIGH", "LOW"] },
    { key: "location", label: "Shot source", options: ["WING", "BACKCOURT", "LINE", "BREAKTHROUGH", "PENALTY", "FAST_BREAK"] },
  ],
  ASSIST: [
    { key: "targetPlayerId", label: "Assisted scorer", options: players.map((player) => player.id) },
  ],
  CARD: [
    { key: "cardType", label: "Card type", options: ["YELLOW", "RED"] },
  ],
  SUSPENSION: [
    { key: "duration", label: "Duration", options: ["2 MIN"] },
  ],
};

const contextSettings = Object.fromEntries(
  Object.entries(contextDefinitions).map(([actionId, groups]) => [
    actionId,
    Object.fromEntries(groups.map((group) => [group.key, true])),
  ]),
);

const state = {
  selectedPlayerId: null,
  selectedActionId: null,
  context: {},
  editingPlayId: null,
  currentStageIndex: 0,
  contextSettings,
  plays: [],
  events: [],
};

const actionGrid = document.querySelector("#action-grid");
const flowTitle = document.querySelector("#flow-title");
const flowCopy = document.querySelector("#flow-copy");
const flowProgress = document.querySelector("#flow-progress");
const flowStageLabel = document.querySelector("#flow-stage-label");
const stageHost = document.querySelector("#stage-host");
const selectionSummary = document.querySelector("#selection-summary");
const backStepButton = document.querySelector("#back-step");
const nextStepButton = document.querySelector("#next-step");
const commitButton = document.querySelector("#commit-play");
const playLog = document.querySelector("#play-log");
const eventLog = document.querySelector("#event-log");
const toggleSettingsButton = document.querySelector("#toggle-settings");
const closeSettingsButton = document.querySelector("#close-settings");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsPanel = document.querySelector("#settings-panel");
const playCount = document.querySelector("#play-count");
const eventCount = document.querySelector("#event-count");
const metricsGrid = document.querySelector("#metrics-grid");
const lastPlayLabel = document.querySelector("#last-play-label");

document.querySelector("#reset-flow").addEventListener("click", resetFlow);
document.querySelector("#commit-play").addEventListener("click", commitPlay);
document.querySelector("#seed-demo").addEventListener("click", seedDemoSequence);
toggleSettingsButton.addEventListener("click", openSettingsDialog);
closeSettingsButton.addEventListener("click", closeSettingsDialog);
backStepButton.addEventListener("click", goToPreviousStage);
nextStepButton.addEventListener("click", goToNextStage);
settingsDialog.addEventListener("close", renderSettingsButtonState);
settingsDialog.addEventListener("click", handleDialogBackdropClick);

render();

function render() {
  renderActions();
  normalizeFlowState();
  renderFlow();
  renderMetrics();
  renderSettingsButtonState();
  renderSettings();
  renderPlayLog();
  renderEventLog();
  playCount.textContent = String(state.plays.length);
  eventCount.textContent = String(state.events.length);
}

function renderActions() {
  actionGrid.innerHTML = "";

  actionDefinitions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "select-button",
      state.selectedActionId === action.id ? "is-selected" : "",
    ].join(" ").trim();
    button.innerHTML = `${action.label}<small>${action.description}</small>`;
    button.addEventListener("click", () => {
      const isSameAction = state.selectedActionId === action.id;
      state.selectedActionId = action.id;
      state.context = isSameAction ? state.context : {};
      state.currentStageIndex = 0;
      render();
    });
    actionGrid.appendChild(button);
  });
}

function renderFlow() {
  renderSummary();
  const stages = getFlowStages();

  if (!state.selectedActionId) {
    flowTitle.textContent = "Guided Flow";
    flowCopy.textContent = "Pick an action to start the staged entry flow.";
    flowProgress.innerHTML = "";
    flowStageLabel.textContent = "Waiting for action";
    stageHost.className = "stage-host empty-state";
    stageHost.textContent = "Select a primary action above to begin.";
    backStepButton.disabled = true;
    nextStepButton.disabled = true;
    commitButton.disabled = true;
    commitButton.textContent = state.editingPlayId ? "Save changes" : "Record play";
    return;
  }

  const activeIndex = Math.min(state.currentStageIndex, Math.max(0, stages.length - 1));
  state.currentStageIndex = activeIndex;
  const activeStage = stages[activeIndex];

  flowTitle.textContent = `${getActionLabel(state.selectedActionId)} flow`;
  flowCopy.textContent = activeStage.description;
  flowStageLabel.textContent = `Step ${activeIndex + 1} of ${stages.length}`;
  flowProgress.innerHTML = stages
    .map((stage, index) => {
      const classes = [
        "progress-pill",
        index === activeIndex ? "is-active" : "",
        isStageComplete(stage) ? "is-complete" : "",
      ].filter(Boolean).join(" ");
      return `<span class="${classes}">${stage.shortLabel}</span>`;
    })
    .join("");

  stageHost.className = "stage-host";
  stageHost.innerHTML = "";
  renderStage(activeStage);

  backStepButton.disabled = activeIndex === 0;
  nextStepButton.disabled = activeIndex >= stages.length - 1 || !isStageComplete(activeStage);
  commitButton.disabled = !isFlowComplete();
  commitButton.textContent = state.editingPlayId ? "Save changes" : "Record play";
}

function renderStage(stage) {
  const wrapper = document.createElement("div");
  wrapper.className = "context-group stage-group";

  const label = document.createElement("p");
  label.className = "context-group-label";
  label.textContent = stage.label;
  wrapper.appendChild(label);

  const caption = document.createElement("p");
  caption.className = "stage-copy";
  caption.textContent = stage.description;
  wrapper.appendChild(caption);

  const options = document.createElement("div");
  options.className = stage.type === "player" ? "player-grid" : "context-options";

  if (stage.type === "player") {
    players.forEach((player) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `select-button ${state.selectedPlayerId === player.id ? "is-selected" : ""}`.trim();
      button.innerHTML = `#${player.number}<small>${player.name}</small>`;
      button.addEventListener("click", () => {
        state.selectedPlayerId = player.id;
        render();
      });
      options.appendChild(button);
    });
  } else {
    stage.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      const isSelected = state.context[stage.key] === option;
      button.className = `select-button ${isSelected ? "is-selected" : ""}`.trim();
      button.textContent = formatContextOption(stage.key, option);
      button.addEventListener("click", () => {
        state.context[stage.key] = option;
        render();
      });
      options.appendChild(button);
    });
  }

  wrapper.appendChild(options);
  stageHost.appendChild(wrapper);
}

function renderSummary() {
  const player = getSelectedPlayer();
  const action = state.selectedActionId ? getActionLabel(state.selectedActionId) : "None";
  const parts = [
    `MODE: ${state.editingPlayId ? "Editing existing play" : "Creating new play"}`,
    `PLAYER: ${player ? `#${player.number} ${player.name}` : "Not selected"}`,
    `ACTION: ${action ?? "None"}`,
  ];

  const contextEntries = Object.entries(state.context);
  if (contextEntries.length) {
    contextEntries.forEach(([key, value]) => {
      parts.push(`${key.toUpperCase()}: ${formatContextOption(key, value)}`);
    });
  } else {
    parts.push("CONTEXT: No context selected");
  }

  selectionSummary.innerHTML = parts.join("<br>");
}

function renderMetrics() {
  const summary = calculateSummary(state.events);
  const cards = [
    { label: "Goals", value: summary.goals, caption: "Derived from shot outcomes and scoring events" },
    { label: "Shots on goal", value: summary.shotsOnGoal, caption: "Goals and saves" },
    { label: "Shot efficiency", value: `${summary.shotEfficiency}%`, caption: "Goals divided by total shots" },
    { label: "Keeper saves", value: summary.keeperSaves, caption: "Auto-created or manual goalkeeper saves" },
    { label: "Penalty goals", value: summary.penaltyGoals, caption: "Goals tagged as penalties" },
    { label: "Warnings", value: summary.warnings, caption: "Cards mapped to warning events" },
  ];

  metricsGrid.innerHTML = "";
  cards.forEach((card) => {
    const node = document.createElement("article");
    node.className = "metric-card";
    node.innerHTML = `
      <span class="stat-label">${card.label}</span>
      <strong class="metric-value">${card.value}</strong>
      <p class="metric-caption">${card.caption}</p>
    `;
    metricsGrid.appendChild(node);
  });
}

function renderSettings() {
  settingsPanel.innerHTML = "";

  if (!Object.keys(contextDefinitions).length) {
    settingsPanel.className = "settings-panel empty-state";
    settingsPanel.textContent = "No configurable context groups available.";
    return;
  }

  settingsPanel.className = "settings-panel";

  Object.entries(contextDefinitions).forEach(([actionId, groups]) => {
    const card = document.createElement("article");
    card.className = "settings-card";

    const heading = document.createElement("div");
    heading.className = "settings-card-header";
    heading.innerHTML = `
      <div>
        <p class="log-item-title">${getActionLabel(actionId)}</p>
        <p class="log-item-subtitle">Choose which context steps should appear in the guided flow.</p>
      </div>
    `;
    card.appendChild(heading);

    const toggleRow = document.createElement("div");
    toggleRow.className = "settings-toggle-list";

    groups.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      const isEnabled = isContextEnabled(actionId, group.key);
      button.className = `settings-toggle ${isEnabled ? "is-enabled" : "is-disabled"}`.trim();
      button.innerHTML = `
        <span>${group.label}</span>
        <strong>${isEnabled ? "On" : "Off"}</strong>
      `;
      button.addEventListener("click", () => {
        toggleContextSetting(actionId, group.key);
      });
      toggleRow.appendChild(button);
    });

    card.appendChild(toggleRow);
    settingsPanel.appendChild(card);
  });
}

function renderSettingsButtonState() {
  const isOpen = settingsDialog.open;
  toggleSettingsButton.setAttribute("aria-expanded", String(isOpen));
  toggleSettingsButton.classList.toggle("is-active", isOpen);
}

function renderPlayLog() {
  if (!state.plays.length) {
    playLog.className = "log-list empty-state";
    playLog.textContent = "Record a play to start building the match timeline.";
    lastPlayLabel.textContent = "No plays yet";
    return;
  }

  playLog.className = "log-list";
  playLog.innerHTML = "";
  const latestPlay = state.plays[state.plays.length - 1];
  lastPlayLabel.textContent = latestPlay.timeLabel;

  state.plays.slice().reverse().forEach((play) => {
    const item = document.createElement("article");
    item.className = "log-item";
    const isEditing = state.editingPlayId === play.id;
    item.innerHTML = `
      <p class="log-item-title">${play.label}</p>
      <p class="log-item-subtitle">${play.timeLabel} • ${play.sourceText}</p>
      <div class="token-row">${play.contextTokens.map((token) => `<span class="token">${token}</span>`).join("")}</div>
      <div class="action-row">
        <button class="ghost-button log-action" type="button" data-action="edit">${isEditing ? "Editing" : "Edit"}</button>
        <button class="ghost-button log-action log-action-danger" type="button" data-action="delete">Delete</button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener("click", () => {
      loadPlayIntoEditor(play.id);
    });
    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deletePlay(play.id);
    });
    playLog.appendChild(item);
  });
}

function renderEventLog() {
  if (!state.events.length) {
    eventLog.className = "log-list empty-state";
    eventLog.textContent = "Derived stat events will appear here.";
    return;
  }

  eventLog.className = "log-list";
  eventLog.innerHTML = "";

  state.events.slice().reverse().forEach((event) => {
    const item = document.createElement("article");
    item.className = "log-item";
    const dimensions = Object.entries(event.dimensions)
      .map(([key, value]) => `${key}=${formatDimensionValue(key, value)}`);

    item.innerHTML = `
      <p class="log-item-title">${event.statType}</p>
      <p class="log-item-subtitle">${event.playerLabel} • ${event.timeLabel}</p>
      <div class="token-row">${dimensions.map((token) => `<span class="token">${token}</span>`).join("")}</div>
    `;
    eventLog.appendChild(item);
  });
}

function commitPlay() {
  if (!isFlowComplete()) {
    return;
  }

  const player = getSelectedPlayer();
  const actionId = state.selectedActionId;
  const existingPlay = state.editingPlayId
    ? state.plays.find((play) => play.id === state.editingPlayId) ?? null
    : null;
  const playId = existingPlay?.id ?? crypto.randomUUID();
  const timestamp = existingPlay ? new Date(existingPlay.time) : new Date();
  const derivedEvents = deriveEvents({
    playId,
    player,
    actionId,
    context: { ...state.context },
    timestamp,
  });

  const play = {
    id: playId,
    gameId: "demo-game",
    time: timestamp.toISOString(),
    timeLabel: formatTime(timestamp),
    playerId: player.id,
    actionId,
    context: { ...state.context },
    sourceText: `${player.name} -> ${actionId}`,
    label: `${player.name} ${actionId.replace("_", " ")}`,
    contextTokens: Object.entries(state.context).map(([key, value]) => `${key}:${formatContextOption(key, value)}`),
  };

  if (existingPlay) {
    const playIndex = state.plays.findIndex((entry) => entry.id === existingPlay.id);
    state.plays[playIndex] = play;
    state.events = state.events.filter((event) => event.playId !== existingPlay.id);
    state.events.push(...derivedEvents);
  } else {
    state.plays.push(play);
    state.events.push(...derivedEvents);
  }

  resetFlow();
  render();
}

function resetFlow() {
  state.selectedPlayerId = null;
  state.selectedActionId = null;
  state.context = {};
  state.editingPlayId = null;
  state.currentStageIndex = 0;
  render();
}

function getContextGroups(actionId) {
  if (!actionId) {
    return [];
  }

  return (contextDefinitions[actionId] ?? []).filter((group) => isContextEnabled(actionId, group.key));
}

function getFlowStages(actionId = state.selectedActionId) {
  if (!actionId) {
    return [];
  }

  return [
    {
      type: "player",
      key: "player",
      label: "Choose player",
      shortLabel: "Player",
      description: "Select the player responsible for this action.",
    },
    ...getContextGroups(actionId).map((group) => ({
      type: "context",
      key: group.key,
      label: group.label,
      shortLabel: group.label,
      description: `Capture ${group.label.toLowerCase()} before recording the play.`,
      options: group.options,
    })),
  ];
}

function getCurrentStage() {
  const stages = getFlowStages();
  if (!stages.length) {
    return null;
  }

  return stages[Math.min(state.currentStageIndex, stages.length - 1)];
}

function normalizeFlowState() {
  if (!state.selectedActionId) {
    return;
  }

  const stages = getFlowStages();
  if (!stages.length) {
    state.currentStageIndex = 0;
    return;
  }

  state.currentStageIndex = Math.min(state.currentStageIndex, stages.length - 1);

  for (let index = state.currentStageIndex; index < stages.length; index += 1) {
    const stage = stages[index];

    if (stage.type === "player") {
      if (!state.selectedPlayerId) {
        state.currentStageIndex = index;
        return;
      }
      continue;
    }

    if (state.context[stage.key]) {
      continue;
    }

    if (stage.options.length !== 1) {
      state.currentStageIndex = index;
      return;
    }

    state.context[stage.key] = stage.options[0];
  }

  state.currentStageIndex = stages.length - 1;
}

function isContextEnabled(actionId, key) {
  return Boolean(state.contextSettings[actionId]?.[key]);
}

function toggleContextSetting(actionId, key) {
  const nextValue = !state.contextSettings[actionId][key];
  state.contextSettings[actionId][key] = nextValue;

  if (!nextValue) {
    delete state.context[key];
  }

  if (state.selectedActionId === actionId) {
    const stages = getFlowStages(actionId);
    state.currentStageIndex = Math.min(state.currentStageIndex, Math.max(0, stages.length - 1));
  }

  render();
}

function openSettingsDialog() {
  if (!settingsDialog.open) {
    settingsDialog.showModal();
  }
  renderSettingsButtonState();
}

function closeSettingsDialog() {
  if (settingsDialog.open) {
    settingsDialog.close();
  }
  renderSettingsButtonState();
}

function handleDialogBackdropClick(event) {
  const bounds = settingsDialog.getBoundingClientRect();
  const clickedInside =
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom;

  if (!clickedInside) {
    closeSettingsDialog();
  }
}

function isStageComplete(stage) {
  if (!stage) {
    return false;
  }

  if (stage.type === "player") {
    return Boolean(state.selectedPlayerId);
  }

  return Boolean(state.context[stage.key]);
}

function goToPreviousStage() {
  if (!state.selectedActionId) {
    return;
  }

  state.currentStageIndex = Math.max(0, state.currentStageIndex - 1);
  render();
}

function goToNextStage() {
  const currentStage = getCurrentStage();
  const stages = getFlowStages();
  if (!currentStage || !isStageComplete(currentStage)) {
    return;
  }

  state.currentStageIndex = Math.min(stages.length - 1, state.currentStageIndex + 1);
  render();
}

function getActionLabel(actionId) {
  return actionDefinitions.find((entry) => entry.id === actionId)?.label ?? actionId;
}

function getSelectedPlayer() {
  return players.find((player) => player.id === state.selectedPlayerId) ?? null;
}

function isFlowComplete() {
  if (!state.selectedPlayerId || !state.selectedActionId) {
    return false;
  }

  const groups = getContextGroups(state.selectedActionId);
  return groups.every((group) => state.context[group.key]);
}

function deriveEvents({ playId, player, actionId, context, timestamp }) {
  const baseDimensions = buildBaseDimensions(context, actionId);
  const createEvent = (statType, playerLabel, dimensions = {}) => ({
    id: crypto.randomUUID(),
    playId,
    playerId: playerLabel,
    playerLabel,
    statType,
    dimensions: { ...dimensions },
    time: timestamp.toISOString(),
    timeLabel: formatTime(timestamp),
  });

  switch (actionId) {
    case "SHOT":
      return deriveShotEvents(player, baseDimensions, context, createEvent, "shot");
    case "PENALTY":
      return deriveShotEvents(player, baseDimensions, context, createEvent, "penalty");
    case "SAVE":
      return [
        createEvent("SAVE", player.name, baseDimensions),
        createEvent(`SAVE_${context.height}`, player.name, baseDimensions),
      ];
    case "MISS":
      return [
        createEvent("SHOT_OFF", player.name, baseDimensions),
      ];
    case "ASSIST":
      return [
        createEvent("ASSIST", player.name, {
          target_player: playerLabelFromId(context.targetPlayerId),
        }),
      ];
    case "TECH_FAULT":
      return [createEvent("TECH_FAULT", player.name)];
    case "STEAL":
      return [createEvent("STEAL", player.name)];
    case "BLOCK":
      return [createEvent("BLOCK", player.name)];
    case "CARD":
      return [
        createEvent(context.cardType === "YELLOW" ? "WARNING" : "CARD_RED", player.name, {
          card_type: context.cardType.toLowerCase(),
        }),
      ];
    case "SUSPENSION":
      return [
        createEvent("SUSPENSION_2", player.name, {
          duration: "2_min",
        }),
      ];
    default:
      return [createEvent(actionId, player.name)];
  }
}

function deriveShotEvents(player, baseDimensions, context, createEvent, shotType) {
  const events = [];
  const outcome = context.outcome;
  const shotDimensions = {
    ...baseDimensions,
    shot_type: shotType,
    ...(outcome ? { outcome: outcome.toLowerCase() } : {}),
  };

  if (outcome === "GOAL") {
    events.push(createEvent("GOAL", player.name, shotDimensions));
    events.push(createEvent("SHOT_ON_GOAL", player.name, baseDimensions));
    events.push(createEvent(`GOAL_ALLOWED_${context.height}`, "Goalkeeper", shotDimensions));
  }

  if (outcome === "SAVE") {
    events.push(createEvent("SHOT_ON_GOAL", player.name, baseDimensions));
    events.push(createEvent(`SAVE_${context.height}`, "Goalkeeper", shotDimensions));
  }

  if (outcome === "MISS") {
    events.push(createEvent("SHOT_OFF", player.name, baseDimensions));
  }

  if (outcome === "BLOCK") {
    events.push(createEvent("SHOT_BLOCKED", player.name, baseDimensions));
  }

  if (shotType === "penalty") {
    events.push(createEvent("PENALTY_SHOT", player.name, shotDimensions));
  }

  events.push(createEvent("SHOT", player.name, shotDimensions));
  return events;
}

function buildBaseDimensions(context, actionId) {
  const dimensions = {};

  if (context.height) {
    dimensions.height = context.height.toLowerCase();
  }

  if (context.location) {
    dimensions.location = context.location.toLowerCase();
    if (context.location === "FAST_BREAK") {
      dimensions.attack_type = "fast_break";
    }
  }

  if (actionId === "PENALTY") {
    dimensions.location = "penalty";
    dimensions.attack_type = "penalty";
  }

  return dimensions;
}

function calculateSummary(events) {
  const totalShots = events.filter((event) => event.statType === "SHOT").length;
  const goals = events.filter((event) => event.statType === "GOAL").length;
  const shotsOnGoal = events.filter((event) => event.statType === "SHOT_ON_GOAL").length;
  const keeperSaves = events.filter((event) => event.statType.startsWith("SAVE")).length;
  const warnings = events.filter((event) => event.statType === "WARNING").length;
  const penaltyGoals = events.filter(
    (event) => event.statType === "GOAL" && event.dimensions.attack_type === "penalty",
  ).length;

  return {
    goals,
    shotsOnGoal,
    keeperSaves,
    warnings,
    penaltyGoals,
    shotEfficiency: totalShots ? Math.round((goals / totalShots) * 100) : 0,
  };
}

function seedDemoSequence() {
  const demoEntries = [
    { playerId: "p9", actionId: "SHOT", context: { height: "HIGH", location: "FAST_BREAK", outcome: "GOAL" } },
    { playerId: "p10", actionId: "SHOT", context: { height: "LOW", location: "BACKCOURT", outcome: "SAVE" } },
    { playerId: "p7", actionId: "PENALTY", context: { height: "LOW", outcome: "GOAL" } },
    { playerId: "p5", actionId: "BLOCK", context: {} },
    { playerId: "p8", actionId: "CARD", context: { cardType: "YELLOW" } },
  ];

  demoEntries.forEach((entry) => {
    const player = players.find((candidate) => candidate.id === entry.playerId);
    const playId = crypto.randomUUID();
    const timestamp = new Date();
    const derivedEvents = deriveEvents({
      playId,
      player,
      actionId: entry.actionId,
      context: entry.context,
      timestamp,
    });

    state.plays.push({
      id: playId,
      gameId: "demo-game",
      time: timestamp.toISOString(),
      timeLabel: formatTime(timestamp),
      playerId: player.id,
      actionId: entry.actionId,
      context: { ...entry.context },
      sourceText: `${player.name} -> ${entry.actionId}`,
      label: `${player.name} ${entry.actionId.replace("_", " ")}`,
      contextTokens: Object.entries(entry.context).map(([key, value]) => `${key}:${formatContextOption(key, value)}`),
    });

    state.events.push(...derivedEvents);
  });

  render();
}

function loadPlayIntoEditor(playId) {
  const play = state.plays.find((entry) => entry.id === playId);
  if (!play) {
    return;
  }

  state.selectedPlayerId = play.playerId;
  state.selectedActionId = play.actionId;
  state.context = filterContextForAction(play.actionId, play.context);
  state.editingPlayId = play.id;
  state.currentStageIndex = Math.max(0, getFlowStages(play.actionId).length - 1);
  render();
}

function deletePlay(playId) {
  state.plays = state.plays.filter((play) => play.id !== playId);
  state.events = state.events.filter((event) => event.playId !== playId);

  if (state.editingPlayId === playId) {
    resetFlow();
    return;
  }

  render();
}

function playerLabelFromId(playerId) {
  const player = players.find((entry) => entry.id === playerId);
  return player ? player.name : playerId;
}

function formatContextOption(key, value) {
  if (key === "targetPlayerId") {
    return playerLabelFromId(value);
  }

  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDimensionValue(key, value) {
  if (key === "target_player") {
    return value;
  }

  return String(value).replaceAll("_", " ");
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function filterContextForAction(actionId, context) {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => isContextEnabled(actionId, key)),
  );
}
