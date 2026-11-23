// Main Application Controller: 5 Modules, Map, Event Handlers & UI Rendering

const AppState = {
  hazards: [],
  crowdEvents: [],
  activeAlerts: [],
  simulatedVehicle: null,
  simTimer: null,
  filters: {
    search: "",
    severity: "ALL",
    status: "ALL",
    sortRisk: "SCORE_DESC"
  },
  map: null,
  markersLayer: null,
  vehicleMarker: null,
  userMarker: null
};

function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3600);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getMarkerColor(hazard, riskScore) {
  if (hazard.status === "Resolved") return "#16a34a";
  if (riskScore >= 75 || hazard.severity === "Critical") return "#991b1b";
  if (riskScore >= 55 || hazard.severity === "High") return "#ea580c";
  if (hazard.severity === "Medium") return "#d97706";
  return "#2563eb";
}

function initMap() {
  const { lat, lng } = SensorService.coords;
  AppState.map = L.map("map").setView([lat, lng], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(AppState.map);

  AppState.markersLayer = L.layerGroup().addTo(AppState.map);

  // Clicking map picks coordinates & opens report modal with those coords
  AppState.map.on("click", (e) => {
    const clickedLat = Number(e.latlng.lat.toFixed(6));
    const clickedLng = Number(e.latlng.lng.toFixed(6));
    SensorService.setCoords(clickedLat, clickedLng, null, "Map Pin");
    openReportModal({ lat: clickedLat, lng: clickedLng });
    showToast(`Selected map location: ${clickedLat}, ${clickedLng}`);
  });

  updateUserMapMarker();
}

function updateUserMapMarker() {
  if (!AppState.map) return;
  const { lat, lng } = SensorService.coords;

  if (!AppState.userMarker) {
    AppState.userMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: "#1d4ed8",
      fillColor: "#3b82f6",
      fillOpacity: 0.9,
      weight: 2
    })
      .addTo(AppState.map)
      .bindPopup("Active GPS / Reference Point");
  } else {
    AppState.userMarker.setLatLng([lat, lng]);
  }
}

function getFilteredHazards() {
  const q = AppState.filters.search.trim().toLowerCase();
  const sev = AppState.filters.severity;
  const st = AppState.filters.status;

  return AppState.hazards.filter((h) => {
    const matchesSearch =
      !q ||
      String(h.roadName || "").toLowerCase().includes(q) ||
      String(h.id || "").toLowerCase().includes(q) ||
      String(h.notes || "").toLowerCase().includes(q);
    const matchesSev = sev === "ALL" || h.severity === sev;
    const matchesStatus = st === "ALL" || h.status === st;
    return matchesSearch && matchesSev && matchesStatus;
  });
}

function renderMapMarkers(hazards) {
  if (!AppState.map || !AppState.markersLayer) return;
  AppState.markersLayer.clearLayers();

  hazards.forEach((h) => {
    const risk = IntelligenceEngine.calculateRoadRiskScore(h, WeatherService.latest);
    const color = getMarkerColor(h, risk.score);

    const marker = L.circleMarker([Number(h.lat), Number(h.lng)], {
      radius: Math.max(8, Math.min(16, 7 + Number(h.vehicleCount || 1))),
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92
    });

    const popupHtml = `
      <div style="min-width:200px">
        <strong>${escapeHtml(h.roadName)}</strong><br/>
        <small>ID: ${escapeHtml(h.id)} • Status: <b>${escapeHtml(h.status)}</b></small><br/>
        <div style="margin-top:6px;font-size:12px">
          Risk Score: <b>${risk.score}/100</b> (${escapeHtml(risk.tier)})<br/>
          Reports: <b>${h.reportCount}</b> • Vehicles: <b>${h.vehicleCount}</b><br/>
          Severity: <b>${escapeHtml(h.severity)}</b> • Waterlogged: <b>${h.waterlogged ? "Yes" : "No"}</b>
        </div>
        <div class="map-popup-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick="window.handleVerifyHazard('${escapeHtml(h.id)}')">
            ✓ Verify (+1)
          </button>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.handleFocusHazard('${escapeHtml(h.id)}')">
            Zoom
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.addTo(AppState.markersLayer);
  });
}

function renderKpis(allHazards) {
  const total = allHazards.length;
  const verified = allHazards.filter((h) => Number(h.vehicleCount || 1) >= 2 || Number(h.reportCount || 1) >= 2).length;
  const highRisk = allHazards.filter((h) => {
    const r = IntelligenceEngine.calculateRoadRiskScore(h, WeatherService.latest);
    return r.score >= 70 && h.status !== "Resolved";
  }).length;
  const pendingRepairs = allHazards.filter((h) => h.status !== "Resolved").length;

  document.getElementById("kpiTotalHazards").textContent = String(total);
  document.getElementById("kpiVerifiedHazards").textContent = String(verified);
  document.getElementById("kpiHighRisk").textContent = String(highRisk);
  document.getElementById("kpiPendingRepairs").textContent = String(pendingRepairs);
}

function renderCrowdModule(allHazards) {
  const feedEl = document.getElementById("crowdActivityFeed");
  if (AppState.crowdEvents.length === 0) {
    feedEl.innerHTML = `<p class="empty-state">No crowd or duplicate events yet. Submit a nearby report or click Verify on a hazard.</p>`;
  } else {
    feedEl.innerHTML = AppState.crowdEvents
      .slice(0, 5)
      .map((ev) => `<div class="feed-item">${escapeHtml(ev)}</div>`)
      .join("");
  }

  const listEl = document.getElementById("crowdCandidatesList");
  const sortedByCrowd = [...allHazards].sort(
    (a, b) => Number(b.vehicleCount || 1) - Number(a.vehicleCount || 1)
  );

  listEl.innerHTML = sortedByCrowd
    .slice(0, 5)
    .map(
      (h) => `
      <div class="crowd-card">
        <div class="crowd-top">
          <span class="crowd-road">${escapeHtml(h.roadName)}</span>
          <span class="badge badge-${escapeHtml(String(h.severity || "Medium").toLowerCase())}">${escapeHtml(h.severity)}</span>
        </div>
        <div class="alert-meta" style="margin-top:4px">
          <strong>${h.reportCount}</strong> total reports • <strong>${h.vehicleCount}</strong> vehicles • Status: <strong>${escapeHtml(h.status)}</strong>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px">
          <button type="button" class="btn btn-outline btn-sm" onclick="window.handleVerifyHazard('${escapeHtml(h.id)}')">
            ✓ Confirm / Verify Hazard
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.handleFocusHazard('${escapeHtml(h.id)}')">
            📍 Locate
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderRiskModule(allHazards) {
  const listEl = document.getElementById("roadRiskList");
  const scored = allHazards.map((h) => ({
    hazard: h,
    risk: IntelligenceEngine.calculateRoadRiskScore(h, WeatherService.latest)
  }));

  const sortMode = AppState.filters.sortRisk;
  scored.sort((a, b) => {
    if (sortMode === "SCORE_ASC") return a.risk.score - b.risk.score;
    if (sortMode === "REPORTS_DESC") return Number(b.hazard.reportCount || 0) - Number(a.hazard.reportCount || 0);
    return b.risk.score - a.risk.score;
  });

  listEl.innerHTML = scored
    .map(({ hazard: h, risk }) => {
      const b = risk.breakdown;
      return `
        <div class="risk-card">
          <div class="risk-top">
            <div>
              <div class="risk-road">${escapeHtml(h.roadName)}</div>
              <div class="alert-meta">
                ${h.reportCount} reports • ${h.vehicleCount} vehicles • ${h.waterlogged ? "Waterlogged • " : ""}${escapeHtml(h.status)}
              </div>
            </div>
            <span class="risk-score-badge ${risk.tierClass}">${risk.score}/100 • ${escapeHtml(risk.tier)}</span>
          </div>
          <div class="risk-breakdown">
            <span>Reports: +${b.reports}</span>
            <span>Crowd: +${b.vehicles}</span>
            <span>Severity: +${b.severity}</span>
            <span>Recency: +${b.age}</span>
            <span>Weather/Water: +${b.weather}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAuthorityTable(allHazards) {
  const tbody = document.getElementById("authorityTableBody");
  if (!tbody) return;

  tbody.innerHTML = allHazards
    .map((h) => {
      const risk = IntelligenceEngine.calculateRoadRiskScore(h, WeatherService.latest);
      const statuses = ["Pending", "Assigned", "In Progress", "Resolved"];
      const optionsHtml = statuses
        .map(
          (st) =>
            `<option value="${st}" ${h.status === st ? "selected" : ""}>${st}</option>`
        )
        .join("");

      return `
        <tr>
          <td>
            <strong>${escapeHtml(h.roadName)}</strong><br/>
            <span class="alert-meta">${escapeHtml(h.id)} • <span class="badge badge-${escapeHtml(String(h.severity || "Medium").toLowerCase())}">${escapeHtml(h.severity)}</span></span>
          </td>
          <td class="alert-meta">${Number(h.lat).toFixed(4)}, ${Number(h.lng).toFixed(4)}</td>
          <td><strong>${h.reportCount}</strong> rep / <strong>${h.vehicleCount}</strong> veh</td>
          <td><span class="risk-score-badge ${risk.tierClass}">${risk.score}/100</span></td>
          <td>
            ${h.waterlogged ? '<span class="badge badge-water">Waterlogged</span> ' : ""}
            <span class="alert-meta">${WeatherService.latest.precipitationMm.toFixed(1)}mm</span>
          </td>
          <td>
            <select class="select select-sm" onchange="window.handleStatusChange('${escapeHtml(h.id)}', this.value)">
              ${optionsHtml}
            </select>
          </td>
          <td>
            <input
              type="text"
              class="input crew-input"
              id="crew-${escapeHtml(h.id)}"
              value="${escapeHtml(h.assignedCrew || "")}"
              placeholder="Assign crew..."
            />
          </td>
          <td>
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.handleSaveCrew('${escapeHtml(h.id)}')">
                Save
              </button>
              <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.handleDeleteHazard('${escapeHtml(h.id)}')">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderVehicleAlerts() {
  const listEl = document.getElementById("vehicleAlertsList");
  if (!AppState.activeAlerts || AppState.activeAlerts.length === 0) {
    listEl.innerHTML = `<p class="empty-state">No active proximity warnings right now.</p>`;
    return;
  }

  listEl.innerHTML = AppState.activeAlerts
    .map((al) => {
      const cls = String(al.severity || "").toLowerCase();
      return `
        <div class="alert-item ${cls}">
          <div>
            <div class="alert-title">⚠️ ${escapeHtml(al.roadName)} — ${al.distanceMeters}m ahead</div>
            <div class="alert-meta">
              Severity: <strong>${escapeHtml(al.severity)}</strong> • Risk Score: <strong>${al.riskScore}/100</strong> • ${escapeHtml(al.speedAdvice)}
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.handleFocusHazard('${escapeHtml(al.hazardId)}')">
            View
          </button>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  const filtered = getFilteredHazards();
  renderKpis(AppState.hazards);
  renderMapMarkers(filtered);
  renderCrowdModule(AppState.hazards);
  renderRiskModule(AppState.hazards);
  renderAuthorityTable(AppState.hazards);
  renderVehicleAlerts();
}

// Global window handlers for inline table/popup buttons
window.handleVerifyHazard = async function (id) {
  const target = AppState.hazards.find((h) => h.id === id);
  if (!target) return;
  const updated = IntelligenceEngine.verifyHazard(target);
  await RoadStore.saveHazard(updated);
  const msg = `Crowd verified ${updated.roadName} (${updated.reportCount} reports, ${updated.vehicleCount} vehicles).`;
  AppState.crowdEvents.unshift(msg);
  showToast(msg);
};

window.handleFocusHazard = function (id) {
  const target = AppState.hazards.find((h) => h.id === id);
  if (!target || !AppState.map) return;
  AppState.map.setView([Number(target.lat), Number(target.lng)], 15);
  showToast(`Focused on ${target.roadName}`);
};

window.handleStatusChange = async function (id, newStatus) {
  const target = AppState.hazards.find((h) => h.id === id);
  if (!target) return;
  const updated = { ...target, status: newStatus };
  await RoadStore.saveHazard(updated);
  showToast(`${target.roadName} status updated to ${newStatus}`);
};

window.handleSaveCrew = async function (id) {
  const target = AppState.hazards.find((h) => h.id === id);
  const inputEl = document.getElementById(`crew-${id}`);
  if (!target || !inputEl) return;
  const crewName = inputEl.value.trim() || "Unassigned";
  const updated = { ...target, assignedCrew: crewName };
  await RoadStore.saveHazard(updated);
  showToast(`Assigned "${crewName}" to ${target.roadName}`);
};

window.handleDeleteHazard = async function (id) {
  const target = AppState.hazards.find((h) => h.id === id);
  await RoadStore.deleteHazard(id);
  showToast(`Removed ${target ? target.roadName : id}`);
};

function openReportModal(prefill = {}) {
  const modal = document.getElementById("reportModal");
  document.getElementById("inputLat").value = prefill.lat ?? SensorService.coords.lat.toFixed(6);
  document.getElementById("inputLng").value = prefill.lng ?? SensorService.coords.lng.toFixed(6);
  if (prefill.roadName) {
    document.getElementById("inputRoadName").value = prefill.roadName;
  }
  if (prefill.severity) {
    document.getElementById("inputSeverity").value = prefill.severity;
  }
  if (prefill.notes) {
    document.getElementById("inputNotes").value = prefill.notes;
  }

  checkDuplicatePreview();
  modal.classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
  document.getElementById("potholeReportForm").reset();
  document.getElementById("duplicatePreviewBanner").classList.add("hidden");
}

function checkDuplicatePreview() {
  const lat = parseFloat(document.getElementById("inputLat").value);
  const lng = parseFloat(document.getElementById("inputLng").value);
  const banner = document.getElementById("duplicatePreviewBanner");
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    banner.classList.add("hidden");
    return;
  }

  const nearby = IntelligenceEngine.findNearbyHazard(AppState.hazards, lat, lng, 20);
  if (nearby) {
    banner.textContent = `Duplicate / Crowd-Merge Detected: Within ${Math.round(
      nearby.distanceMeters
    )}m of "${nearby.hazard.roadName}". Submitting will merge into this hazard and boost crowd verification.`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

function runProximityCheck(lat, lng, label = "Current Location") {
  const radius = Number(document.getElementById("alertRadiusSelect").value || 300);
  const alerts = IntelligenceEngine.evaluateVehicleAlerts(
    lat,
    lng,
    AppState.hazards,
    radius,
    WeatherService.latest
  );
  AppState.activeAlerts = alerts;
  document.getElementById("vehicleStatusBar").innerHTML =
    `Vehicle Tracker (<strong>${escapeHtml(label)}</strong> at ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}) • Radius: <strong>${radius}m</strong> • Active Warnings: <strong>${alerts.length}</strong>`;
  renderVehicleAlerts();
  return alerts;
}

function startVehicleSimulation() {
  if (AppState.simTimer) {
    clearInterval(AppState.simTimer);
    AppState.simTimer = null;
  }

  const activeTargets = AppState.hazards.filter((h) => h.status !== "Resolved");
  const goal = activeTargets[0] || { lat: 11.0245, lng: 76.9825, roadName: "Target Segment" };

  let step = 0;
  const totalSteps = 8;
  const startLat = Number(goal.lat) - 0.0045;
  const startLng = Number(goal.lng) - 0.0045;

  showToast(`Simulating vehicle approaching ${goal.roadName}...`);

  const tick = () => {
    step += 1;
    const progress = Math.min(1, step / totalSteps);
    const curLat = startLat + (Number(goal.lat) - startLat) * progress;
    const curLng = startLng + (Number(goal.lng) - startLng) * progress;

    AppState.simulatedVehicle = { lat: curLat, lng: curLng };

    if (AppState.map) {
      if (!AppState.vehicleMarker) {
        AppState.vehicleMarker = L.circleMarker([curLat, curLng], {
          radius: 8,
          color: "#0f172a",
          fillColor: "#facc15",
          fillOpacity: 1,
          weight: 2
        })
          .addTo(AppState.map)
          .bindPopup("Simulated Approaching Vehicle");
      } else {
        AppState.vehicleMarker.setLatLng([curLat, curLng]);
      }
    }

    const alerts = runProximityCheck(curLat, curLng, `Sim Vehicle (${step}/${totalSteps})`);
    if (alerts.length > 0 && step % 2 === 1) {
      showToast(`Alert: ${alerts[0].roadName} (${alerts[0].distanceMeters}m ahead)`);
    }

    if (step >= totalSteps) {
      clearInterval(AppState.simTimer);
      AppState.simTimer = null;
    }
  };

  tick();
  AppState.simTimer = setInterval(tick, 1200);
}

function bindEvents() {
  // Open / close report modal
  document.getElementById("btnOpenReportModal").addEventListener("click", () => openReportModal());
  document.getElementById("btnAuthorityNewComplaint").addEventListener("click", () => openReportModal());
  document.getElementById("btnCloseReportModal").addEventListener("click", closeReportModal);
  document.getElementById("btnCancelReportModal").addEventListener("click", closeReportModal);

  document.getElementById("inputLat").addEventListener("input", checkDuplicatePreview);
  document.getElementById("inputLng").addEventListener("input", checkDuplicatePreview);

  document.getElementById("btnModalUseGps").addEventListener("click", async () => {
    try {
      const c = await SensorService.fetchCurrentGps();
      document.getElementById("inputLat").value = c.lat.toFixed(6);
      document.getElementById("inputLng").value = c.lng.toFixed(6);
      checkDuplicatePreview();
      showToast("Captured current GPS into form.");
    } catch (err) {
      showToast(err.message);
    }
  });

  // Submit pothole report / complaint
  document.getElementById("potholeReportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const roadName = document.getElementById("inputRoadName").value.trim();
    const vehicleId = document.getElementById("inputVehicleId").value.trim() || "VEH-101";
    const lat = parseFloat(document.getElementById("inputLat").value);
    const lng = parseFloat(document.getElementById("inputLng").value);
    const severity = document.getElementById("inputSeverity").value;
    const source = document.getElementById("inputSource").value;
    const waterlogged = document.getElementById("inputWaterlogged").checked;
    const notes = document.getElementById("inputNotes").value.trim();

    if (!roadName || Number.isNaN(lat) || Number.isNaN(lng)) {
      showToast("Please enter a valid road name and GPS coordinates.");
      return;
    }

    const result = IntelligenceEngine.processIncomingReport(
      AppState.hazards,
      { roadName, vehicleId, lat, lng, severity, source, waterlogged, notes },
      20
    );

    await RoadStore.saveHazard(result.hazard);

    if (result.action === "merged") {
      const evMsg = `Duplicate Merged (${result.distanceMeters}m): "${result.hazard.roadName}" now has ${result.hazard.reportCount} reports & ${result.hazard.vehicleCount} vehicles.`;
      AppState.crowdEvents.unshift(evMsg);
      showToast(evMsg);
    } else {
      const evMsg = `New Hazard Logged: "${result.hazard.roadName}" (${result.hazard.severity}).`;
      AppState.crowdEvents.unshift(evMsg);
      showToast(evMsg);
    }

    closeReportModal();
    if (AppState.map) {
      AppState.map.setView([lat, lng], 14);
    }
  });

  // GPS & Accelerometer controls
  document.getElementById("btnUseGps").addEventListener("click", async () => {
    try {
      const c = await SensorService.fetchCurrentGps();
      updateUserMapMarker();
      if (AppState.map) AppState.map.setView([c.lat, c.lng], 14);
      showToast(`GPS updated: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`);
    } catch (err) {
      showToast(`GPS fallback: ${err.message}`);
    }
  });

  document.getElementById("btnToggleWatchGps").addEventListener("click", (e) => {
    try {
      const active = SensorService.toggleWatchGps();
      e.target.textContent = active ? "🛰 Live GPS: ON" : "🛰 Live GPS: OFF";
      showToast(active ? "Continuous GPS tracking enabled." : "Continuous GPS tracking stopped.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("btnEnableMotion").addEventListener("click", async () => {
    try {
      await SensorService.enableMotionSensor();
      document.getElementById("accelSummary").textContent = `Active (Threshold ${SensorService.joltThreshold} m/s²)`;
      showToast("Accelerometer motion detection enabled.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("btnSimulateJolt").addEventListener("click", () => {
    const force = SensorService.simulateJolt();
    showToast(`Simulated pothole jolt (${force} m/s²) — opening report form.`);
  });

  // Weather refresh
  document.getElementById("btnFetchWeather").addEventListener("click", async () => {
    const w = await WeatherService.fetchWeather(SensorService.coords.lat, SensorService.coords.lng);
    document.getElementById("weatherSummary").textContent = WeatherService.formatSummary(w);
    renderAll();
    showToast("Live weather & rainfall updated.");
  });

  // Sample & Reset demo data
  document.getElementById("btnLoadSample").addEventListener("click", async () => {
    await RoadStore.replaceAllHazards(getSampleHazards());
    showToast("Loaded sample road intelligence dataset.");
  });

  document.getElementById("btnResetDemoData").addEventListener("click", async () => {
    AppState.crowdEvents = [];
    AppState.activeAlerts = [];
    await RoadStore.replaceAllHazards(getSampleHazards());
    showToast("Reset demo hazards and activity log.");
  });

  // Map & Filter controls
  document.getElementById("btnCenterMapGps").addEventListener("click", () => {
    if (AppState.map) {
      AppState.map.setView([SensorService.coords.lat, SensorService.coords.lng], 13);
      showToast("Centered map on active GPS coordinates.");
    }
  });

  document.getElementById("searchRoadInput").addEventListener("input", (e) => {
    AppState.filters.search = e.target.value;
    renderAll();
  });

  document.getElementById("filterSeverity").addEventListener("change", (e) => {
    AppState.filters.severity = e.target.value;
    renderAll();
  });

  document.getElementById("filterStatus").addEventListener("change", (e) => {
    AppState.filters.status = e.target.value;
    renderAll();
  });

  document.getElementById("sortRiskSelect").addEventListener("change", (e) => {
    AppState.filters.sortRisk = e.target.value;
    renderAll();
  });

  document.getElementById("btnResetFilters").addEventListener("click", () => {
    AppState.filters.search = "";
    AppState.filters.severity = "ALL";
    AppState.filters.status = "ALL";
    document.getElementById("searchRoadInput").value = "";
    document.getElementById("filterSeverity").value = "ALL";
    document.getElementById("filterStatus").value = "ALL";
    renderAll();
    showToast("Filters reset.");
  });

  // Vehicle Alert Network buttons
  document.getElementById("btnCheckAlerts").addEventListener("click", () => {
    const { lat, lng } = SensorService.coords;
    const alerts = runProximityCheck(lat, lng, "Active GPS");
    showToast(`Found ${alerts.length} hazard warning(s) within radius.`);
  });

  document.getElementById("btnSimulateVehicle").addEventListener("click", startVehicleSimulation);

  document.getElementById("btnClearAlerts").addEventListener("click", () => {
    if (AppState.simTimer) {
      clearInterval(AppState.simTimer);
      AppState.simTimer = null;
    }
    AppState.activeAlerts = [];
    renderVehicleAlerts();
    showToast("Cleared active vehicle alerts.");
  });
}

async function bootstrap() {
  RoadStore.init();

  const badge = document.getElementById("dbStatusBadge");
  if (RoadStore.isLiveFirebase) {
    badge.textContent = "● Firebase Live Sync";
    badge.className = "status-pill status-live";
  } else {
    badge.textContent = "● Demo / Local Mode";
    badge.className = "status-pill status-demo";
  }

  SensorService.onGpsUpdate = (coords) => {
    document.getElementById("gpsSummary").textContent = SensorService.formatGpsSummary(coords);
    updateUserMapMarker();
  };

  SensorService.onJoltDetected = (jolt) => {
    document.getElementById("accelSummary").textContent =
      `Jolt ${jolt.forceMs2} m/s² (${jolt.gForce}g) via ${jolt.source}`;
    openReportModal({
      lat: jolt.coords.lat.toFixed(6),
      lng: jolt.coords.lng.toFixed(6),
      severity: jolt.forceMs2 >= 15 ? "High" : "Medium",
      notes: `Auto-flagged from ${jolt.source}: ${jolt.forceMs2} m/s² (${jolt.gForce}g)`
    });
  };

  document.getElementById("gpsSummary").textContent = SensorService.formatGpsSummary();
  document.getElementById("weatherSummary").textContent = WeatherService.formatSummary();

  initMap();
  bindEvents();

  RoadStore.subscribe((hazards) => {
    AppState.hazards = hazards;
    renderAll();
  });

  const w = await WeatherService.fetchWeather(SensorService.coords.lat, SensorService.coords.lng);
  document.getElementById("weatherSummary").textContent = WeatherService.formatSummary(w);
  renderAll();
}

document.addEventListener("DOMContentLoaded", bootstrap);
