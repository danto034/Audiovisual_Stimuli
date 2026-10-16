"use strict";

const elements = {
  setup: document.querySelector("#setup-screen"),
  setupForm: document.querySelector("#setup-form"),
  participantId: document.querySelector("#participant-id"),
  participantError: document.querySelector("#participant-error"),
  audioCheck: document.querySelector("#audio-check"),
  startButton: document.querySelector("#start-button"),
  ready: document.querySelector("#ready-screen"),
  beginVideos: document.querySelector("#begin-videos"),
  playerScreen: document.querySelector("#player-screen"),
  loadingOverlay: document.querySelector("#loading-overlay"),
  loadingMessage: document.querySelector("#loading-message"),
  rating: document.querySelector("#rating-screen"),
  ratingProgress: document.querySelector("#rating-progress"),
  ratingEyebrow: document.querySelector("#rating-eyebrow"),
  ratingTitle: document.querySelector("#rating-title"),
  ratingInstruction: document.querySelector("#rating-instruction"),
  scaleImage: document.querySelector("#scale-image"),
  ratingButtons: document.querySelector("#rating-buttons"),
  error: document.querySelector("#error-screen"),
  playbackErrorMessage: document.querySelector("#playback-error-message"),
  retryVideo: document.querySelector("#retry-video"),
  complete: document.querySelector("#complete-screen"),
  completeTitle: document.querySelector("#complete-title"),
  completeMessage: document.querySelector("#complete-message"),
  resultsChartPanel: document.querySelector("#results-chart-panel"),
  responseChart: document.querySelector("#response-chart"),
  downloadGraph: document.querySelector("#download-graph"),
  downloadButton: document.querySelector("#download-button"),
  retrySave: document.querySelector("#retry-save"),
  savedLocation: document.querySelector("#saved-location"),
};

let config = null;
let player = null;
let playerReady = false;
let currentVideoIndex = 0;
let currentDimensionIndex = 0;
let mode = "setup";
let stimulusHasPlayed = false;
let dimensionStartedAt = 0;
let noiseMonitorId = null;
let noiseStartedAt = null;
let advanceLocked = false;

const experiment = {
  participant_id: "",
  session_id: "",
  started_at: "",
  finished_at: "",
  baseline: null,
  records: [],
};

function createSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function showScreen(target) {
  [
    elements.setup,
    elements.ready,
    elements.playerScreen,
    elements.rating,
    elements.error,
    elements.complete,
  ].forEach((screen) => screen.classList.toggle("hidden", screen !== target));
}

function setLoading(visible, message = "Preparing video…") {
  elements.loadingMessage.textContent = message;
  elements.loadingOverlay.classList.toggle("hidden", !visible);
}

function updateStartState() {
  const ready = Boolean(config && playerReady);
  elements.startButton.disabled = !ready;
  elements.startButton.textContent = ready ? "Begin baseline scales" : "Loading player…";
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load experiment settings");
    config = await response.json();
    config.dimensions.forEach((dimension) => {
      const image = new Image();
      image.src = dimension.image;
    });
    updateStartState();
  } catch (error) {
    elements.startButton.textContent = "Application could not start";
    elements.participantError.textContent = `${error.message}. Restart the Python application.`;
  }
}

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  player = new YT.Player("youtube-player", {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      enablejsapi: 1,
      fs: 0,
      iv_load_policy: 3,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        playerReady = true;
        player.setVolume(100);
        updateStartState();
      },
      onStateChange: handlePlayerState,
      onError: handlePlayerError,
    },
  });
};

function validateParticipantId() {
  const value = elements.participantId.value.trim();
  const valid = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value);
  elements.participantError.textContent = valid
    ? ""
    : "Use 1–64 letters, numbers, dots, hyphens, or underscores; start with a letter or number.";
  return valid;
}

elements.participantId.addEventListener("input", () => {
  if (elements.participantError.textContent) validateParticipantId();
});

elements.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateParticipantId() || !elements.audioCheck.checked || !playerReady || !config) return;

  experiment.participant_id = elements.participantId.value.trim();
  experiment.session_id = createSessionId();
  experiment.started_at = new Date().toISOString();
  try {
    await document.documentElement.requestFullscreen();
  } catch (_error) {
    // Fullscreen can be denied by browser policy; the experiment remains usable.
  }
  beginBaseline();
});

function beginBaseline() {
  mode = "baseline";
  currentDimensionIndex = 0;
  experiment.baseline = {
    rating_started_at: new Date().toISOString(),
    ratings: { valence: null, arousal: null },
    response_ms: { valence: null, arousal: null },
  };
  showDimension();
}

elements.beginVideos.addEventListener("click", () => {
  playStimulus(0);
});

function playStimulus(index) {
  clearTimers();
  currentVideoIndex = index;
  mode = "stimulus";
  stimulusHasPlayed = false;
  advanceLocked = false;
  showScreen(elements.playerScreen);
  setLoading(true, `Preparing video ${index + 1} of ${config.videos.length}…`);
  player.loadVideoById({ videoId: config.videos[index].youtube_id, startSeconds: 0 });
}

function handlePlayerState(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    setLoading(false);
    if (mode === "stimulus") {
      stimulusHasPlayed = true;
      if (currentVideoIndex === 2) disableCaptions();
    }
    if (mode === "noise" && noiseStartedAt === null) {
      noiseStartedAt = player.getCurrentTime();
      startNoiseMonitor();
    }
    return;
  }

  if (event.data === YT.PlayerState.BUFFERING) {
    setLoading(true, mode === "noise" ? "" : "Buffering…");
    return;
  }

  if (
    event.data === YT.PlayerState.ENDED &&
    mode === "stimulus" &&
    stimulusHasPlayed &&
    !advanceLocked
  ) {
    advanceLocked = true;
    beginRatings();
  }
}

function disableCaptions() {
  // The player setting turns off selectable YouTube caption tracks. Captions that
  // are permanently burned into the uploaded picture cannot be removed by an app.
  try {
    if (typeof player.unloadModule === "function") player.unloadModule("captions");
    if (typeof player.setOption === "function") player.setOption("captions", "track", {});
  } catch (error) {
    console.warn("The caption track could not be disabled", error);
  }
}

function handlePlayerError(event) {
  clearTimers();
  const descriptions = {
    2: "The YouTube video ID is invalid.",
    5: "The browser could not play the video.",
    100: "The video is unavailable or private.",
    101: "The video owner does not allow embedded playback.",
    150: "The video owner does not allow embedded playback.",
  };
  elements.playbackErrorMessage.textContent = `${descriptions[event.data] || "YouTube reported a playback error."} Check the connection or video availability, then retry. No video will be skipped.`;
  showScreen(elements.error);
}

elements.retryVideo.addEventListener("click", () => {
  if (mode === "noise") {
    playNoise();
  } else {
    playStimulus(currentVideoIndex);
  }
});

function beginRatings() {
  player.stopVideo();
  currentDimensionIndex = 0;
  mode = "rating";
  experiment.records.push({
    sequence: currentVideoIndex + 1,
    rating_started_at: new Date().toISOString(),
    ratings: { valence: null, arousal: null },
    response_ms: { valence: null, arousal: null },
  });
  showDimension();
}

function showDimension() {
  const isBaseline = mode === "baseline";
  advanceLocked = false;
  showScreen(elements.rating);

  const dimension = config.dimensions[currentDimensionIndex];
  elements.ratingProgress.textContent = `${isBaseline ? "Baseline scale" : "Question"} ${currentDimensionIndex + 1} of ${config.dimensions.length}`;
  elements.ratingEyebrow.textContent = isBaseline
    ? "Pre-video baseline — this response is recorded"
    : "How did you feel while watching the video?";
  elements.ratingTitle.textContent = dimension.label;
  elements.ratingInstruction.textContent = isBaseline
    ? "Select the number that best describes how you feel now. You must respond to continue."
    : "Select the number that best describes your response. You must respond to continue.";
  elements.scaleImage.src = dimension.image;
  elements.scaleImage.alt = dimension.image_alt;
  elements.ratingButtons.replaceChildren();

  for (let value = 1; value <= 9; value += 1) {
    const button = document.createElement("button");
    button.className = "rating-button";
    button.type = "button";
    button.textContent = String(value);
    button.dataset.value = String(value);
    button.setAttribute("aria-label", `${value} out of 9`);
    button.addEventListener("click", () => chooseRating(value));
    elements.ratingButtons.appendChild(button);
  }

  dimensionStartedAt = performance.now();
  elements.ratingButtons.querySelector("button")?.focus({ preventScroll: true });
}

function chooseRating(value) {
  if (!["baseline", "rating"].includes(mode) || advanceLocked) return;
  advanceLocked = true;
  const dimension = config.dimensions[currentDimensionIndex];
  const record =
    mode === "baseline" ? experiment.baseline : experiment.records[experiment.records.length - 1];
  record.ratings[dimension.key] = value;
  record.response_ms[dimension.key] = Math.round(performance.now() - dimensionStartedAt);
  elements.ratingButtons.querySelector(`[data-value="${value}"]`)?.classList.add("selected");
  window.setTimeout(advanceDimension, 180);
}

document.addEventListener("keydown", (event) => {
  if (["baseline", "rating"].includes(mode) && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    chooseRating(Number(event.key));
  }
});

function advanceDimension() {
  const completedBaseline = mode === "baseline";
  currentDimensionIndex += 1;
  if (currentDimensionIndex < config.dimensions.length) {
    showDimension();
    return;
  }

  if (completedBaseline) {
    checkpoint();
    mode = "ready";
    showScreen(elements.ready);
    elements.beginVideos.focus();
    return;
  }

  if (currentVideoIndex < config.videos.length - 1) {
    checkpoint();
    playNoise();
  } else {
    finishExperiment();
  }
}

async function checkpoint() {
  try {
    await fetch("/api/checkpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(experiment),
    });
  } catch (error) {
    console.warn("Checkpoint could not be saved", error);
  }
}

function playNoise() {
  if (currentVideoIndex >= config.videos.length - 1) {
    finishExperiment();
    return;
  }
  clearTimers();
  mode = "noise";
  noiseStartedAt = null;
  showScreen(elements.playerScreen);
  setLoading(true, "");
  player.loadVideoById({
    videoId: config.noise_video.youtube_id,
    startSeconds: config.noise_start_seconds,
  });
}

function startNoiseMonitor() {
  window.clearInterval(noiseMonitorId);
  noiseMonitorId = window.setInterval(() => {
    if (mode !== "noise" || noiseStartedAt === null || player.getPlayerState() !== YT.PlayerState.PLAYING) {
      return;
    }
    const playedSeconds = player.getCurrentTime() - noiseStartedAt;
    if (playedSeconds >= config.noise_seconds) {
      window.clearInterval(noiseMonitorId);
      noiseMonitorId = null;
      player.stopVideo();
      playStimulus(currentVideoIndex + 1);
    }
  }, 100);
}

async function finishExperiment() {
  clearTimers();
  mode = "saving";
  experiment.finished_at = new Date().toISOString();
  showScreen(elements.complete);
  renderResultsChart();
  elements.completeTitle.textContent = "Saving responses…";
  elements.completeMessage.textContent = "Please wait while the Excel workbook is created.";
  elements.downloadButton.classList.add("hidden");
  elements.retrySave.classList.add("hidden");
  elements.savedLocation.textContent = "";
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch (_error) {
    // The completion screen still works when the browser retains fullscreen mode.
  }
  await saveResults();
}

function createSvgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text) element.textContent = text;
  return element;
}

function renderResultsChart() {
  const svg = elements.responseChart;
  svg.replaceChildren();

  const timepoints = [
    { label: "Baseline", record: experiment.baseline },
    ...experiment.records.map((record) => ({ label: `Video ${record.sequence}`, record })),
  ];
  const series = [
    { name: "Pleasure", key: "valence", color: "#2A9D8F" },
    { name: "Arousal", key: "arousal", color: "#E76F51" },
  ];
  const width = 900;
  const height = 470;
  const margin = { top: 68, right: 32, bottom: 72, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index) => margin.left + (index * plotWidth) / (timepoints.length - 1);
  const y = (value) => margin.top + ((9 - value) * plotHeight) / 8;

  svg.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width,
      height,
      fill: "#FFFFFF",
    }),
  );

  svg.appendChild(
    createSvgElement(
      "title",
      {},
      "Pleasure and arousal ratings from baseline through video four",
    ),
  );

  for (let value = 1; value <= 9; value += 1) {
    const yPosition = y(value);
    svg.appendChild(
      createSvgElement("line", {
        x1: margin.left,
        y1: yPosition,
        x2: width - margin.right,
        y2: yPosition,
        stroke: value === 1 ? "#88979F" : "#DFE5E8",
        "stroke-width": value === 1 ? 1.5 : 1,
      }),
    );
    svg.appendChild(
      createSvgElement(
        "text",
        {
          x: margin.left - 16,
          y: yPosition + 5,
          fill: "#52646E",
          "font-size": 14,
          "text-anchor": "end",
          "font-family": "Arial, sans-serif",
        },
        String(value),
      ),
    );
  }

  timepoints.forEach((timepoint, index) => {
    svg.appendChild(
      createSvgElement(
        "text",
        {
          x: x(index),
          y: height - 38,
          fill: "#334751",
          "font-size": 14,
          "font-weight": 700,
          "text-anchor": "middle",
          "font-family": "Arial, sans-serif",
        },
        timepoint.label,
      ),
    );
  });

  svg.appendChild(
    createSvgElement(
      "text",
      {
        x: 20,
        y: margin.top + plotHeight / 2,
        fill: "#52646E",
        "font-size": 14,
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        transform: `rotate(-90 20 ${margin.top + plotHeight / 2})`,
      },
      "Rating (1–9)",
    ),
  );

  series.forEach((item, seriesIndex) => {
    const values = timepoints.map((timepoint) => timepoint.record.ratings[item.key]);
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    svg.appendChild(
      createSvgElement("polyline", {
        points,
        fill: "none",
        stroke: item.color,
        "stroke-width": 4,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }),
    );

    values.forEach((value, index) => {
      const circle = createSvgElement("circle", {
        cx: x(index),
        cy: y(value),
        r: 7,
        fill: item.color,
        stroke: "#FFFFFF",
        "stroke-width": 2,
        tabindex: 0,
        role: "img",
        "aria-label": `${item.name}, ${timepoints[index].label}: ${value}`,
      });
      circle.appendChild(
        createSvgElement("title", {}, `${item.name}, ${timepoints[index].label}: ${value}`),
      );
      svg.appendChild(circle);
    });

    const legendX = 300 + seriesIndex * 220;
    svg.appendChild(
      createSvgElement("line", {
        x1: legendX,
        y1: 27,
        x2: legendX + 34,
        y2: 27,
        stroke: item.color,
        "stroke-width": 4,
        "stroke-linecap": "round",
      }),
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: legendX + 17,
        cy: 27,
        r: 6,
        fill: item.color,
        stroke: "#FFFFFF",
        "stroke-width": 2,
      }),
    );
    svg.appendChild(
      createSvgElement(
        "text",
        {
          x: legendX + 44,
          y: 32,
          fill: "#334751",
          "font-size": 15,
          "font-weight": 700,
          "font-family": "Arial, sans-serif",
        },
        item.name,
      ),
    );
  });

  elements.resultsChartPanel.classList.remove("hidden");
}

function downloadGraphAsPng() {
  const svg = elements.responseChart;
  const serialized = new XMLSerializer().serializeToString(svg);
  const source = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const sourceUrl = URL.createObjectURL(source);
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 940;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(sourceUrl);
      return;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(sourceUrl);
    canvas.toBlob((png) => {
      if (!png) return;
      const pngUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${experiment.participant_id}_responses.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }, "image/png");
  };
  image.onerror = () => URL.revokeObjectURL(sourceUrl);
  image.src = sourceUrl;
}

elements.downloadGraph.addEventListener("click", downloadGraphAsPng);

async function saveResults() {
  try {
    const response = await fetch("/api/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(experiment),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "The workbook could not be saved");

    mode = "complete";
    elements.completeTitle.textContent = "Responses saved";
    elements.completeMessage.textContent = result.warning
      ? `Thank you. ${result.warning}`
      : "Thank you. The individual workbook and cumulative study workbook are ready.";
    elements.downloadButton.href = result.download_url;
    elements.downloadButton.setAttribute("download", result.filename);
    elements.downloadButton.classList.remove("hidden");
    elements.savedLocation.textContent = `Saved locally: ${result.saved_path}`;
  } catch (error) {
    mode = "save_error";
    elements.completeTitle.textContent = "Responses are ready but not yet saved";
    elements.completeMessage.textContent = `${error.message}. Keep this page open and try again.`;
    elements.retrySave.classList.remove("hidden");
  }
}

elements.retrySave.addEventListener("click", () => {
  elements.retrySave.classList.add("hidden");
  elements.completeTitle.textContent = "Saving responses…";
  elements.completeMessage.textContent = "Please wait while the Excel workbook is created.";
  saveResults();
});

function clearTimers() {
  window.clearInterval(noiseMonitorId);
  noiseMonitorId = null;
}

window.addEventListener("beforeunload", (event) => {
  if (!["setup", "complete"].includes(mode)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

loadConfig();

// Load the IFrame API only after this file has installed the required global
// callback.  This avoids a race when the API is already cached by the browser.
const youtubeApiScript = document.createElement("script");
youtubeApiScript.src = "https://www.youtube.com/iframe_api";
youtubeApiScript.async = true;
youtubeApiScript.onerror = () => {
  elements.startButton.textContent = "YouTube could not be reached";
  elements.participantError.textContent =
    "The YouTube player could not load. Check the internet connection and refresh the page.";
};
document.head.appendChild(youtubeApiScript);
