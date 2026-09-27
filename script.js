// ---- Config ----
// Point this at your running FastAPI server.
const API_URL = "https://nightstay-a-room-type-predictor-for-nyc-vrk3.onrender.com/predict";

// Rough NYC bounding box, used only to place the glowing pin on the grid.
const NYC_BOUNDS = { latMin: 40.49, latMax: 40.92, lonMin: -74.26, lonMax: -73.68 };

// ---- Night-map grid ----
const canvas = document.getElementById("map-grid");
const ctx = canvas.getContext("2d");

function drawGrid() {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#0d121c";
  ctx.fillRect(0, 0, width, height);

  const spacing = 26;
  ctx.fillStyle = "rgba(233,236,242,0.06)";
  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // a few faint "avenue" lines for texture
  ctx.strokeStyle = "rgba(233,236,242,0.045)";
  ctx.lineWidth = 1;
  [0.28, 0.52, 0.74].forEach((f) => {
    ctx.beginPath();
    ctx.moveTo(width * f, 0);
    ctx.lineTo(width * f, height);
    ctx.stroke();
  });
  [0.35, 0.65].forEach((f) => {
    ctx.beginPath();
    ctx.moveTo(0, height * f);
    ctx.lineTo(width, height * f);
    ctx.stroke();
  });
}
drawGrid();
window.addEventListener("resize", () => {
  canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
  canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
  drawGrid();
});

function placePin(lat, lon) {
  const clampedLat = Math.min(Math.max(lat, NYC_BOUNDS.latMin), NYC_BOUNDS.latMax);
  const clampedLon = Math.min(Math.max(lon, NYC_BOUNDS.lonMin), NYC_BOUNDS.lonMax);

  const xPct = ((clampedLon - NYC_BOUNDS.lonMin) / (NYC_BOUNDS.lonMax - NYC_BOUNDS.lonMin)) * 100;
  const yPct = 100 - ((clampedLat - NYC_BOUNDS.latMin) / (NYC_BOUNDS.latMax - NYC_BOUNDS.latMin)) * 100;

  const pin = document.getElementById("pin");
  pin.style.left = `${xPct}%`;
  pin.style.top = `${yPct}%`;

  document.getElementById("coord-readout").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
placePin(40.73, -73.995); // default pin

// ---- Live pin preview as the person types coordinates ----
const latInput = document.getElementById("latitude");
const lonInput = document.getElementById("longitude");
function syncPinFromInputs() {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) placePin(lat, lon);
}
latInput.addEventListener("input", syncPinFromInputs);
lonInput.addEventListener("input", syncPinFromInputs);

// ---- Form submit → API call ----
const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const errorMsg = document.getElementById("error-msg");
const resultEmpty = document.getElementById("result-empty");
const resultFilled = document.getElementById("result-filled");
const resultLabel = document.getElementById("result-label");

const ROOM_COLORS = {
  "Entire home/apt": "#4fd8c4",
  "Private room": "#f2a93b",
  "Shared room": "#b98ce0",
};

function fieldValue(id, isFloat = true) {
  const raw = document.getElementById(id).value;
  return isFloat ? parseFloat(raw) : parseInt(raw, 10);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.hidden = true;

  const payload = {
    latitude: fieldValue("latitude"),
    longitude: fieldValue("longitude"),
    price: fieldValue("price"),
    minimum_nights: fieldValue("minimum_nights", false),
    number_of_reviews: fieldValue("number_of_reviews", false),
    reviews_per_month: fieldValue("reviews_per_month"),
    calculated_host_listings_count: fieldValue("calculated_host_listings_count", false),
    availability_365: fieldValue("availability_365", false),
    neighbourhood_group: document.getElementById("neighbourhood_group").value,
    neighbourhood: document.getElementById("neighbourhood").value.trim(),
  };

  submitBtn.classList.add("loading");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Server responded ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    renderResult(data);
    placePin(payload.latitude, payload.longitude);
  } catch (err) {
    errorMsg.textContent = `Couldn't reach the prediction API. ${err.message}`;
    errorMsg.hidden = false;
  } finally {
    submitBtn.classList.remove("loading");
  }
});

function renderResult(data) {
  const label = data.Predicted_room_type;
  const probs = data.Probability; // array aligned to model.classes_ order

  // model.classes_ order, from the trained pipeline
  const classOrder = ["Entire home/apt", "Private room", "Shared room"];

  resultEmpty.hidden = true;
  resultFilled.hidden = false;
  resultLabel.textContent = label;
  resultLabel.style.color = ROOM_COLORS[label] || "var(--text)";

  document.querySelectorAll(".bar-row").forEach((row) => {
    const room = row.dataset.room;
    const idx = classOrder.indexOf(room);
    const pct = idx >= 0 && probs[idx] != null ? probs[idx] * 100 : 0;
    const fill = row.querySelector(".bar-fill");
    const pctLabel = row.querySelector(".bar-pct");

    // restart the width transition
    fill.style.width = "0%";
    requestAnimationFrame(() => {
      fill.style.width = `${pct.toFixed(1)}%`;
    });
    pctLabel.textContent = `${pct.toFixed(0)}%`;
  });
}
