const AppState = {
  hazards: [],
  crowdEvents: [],
  activeAlerts: [],
  currentPhotoDataUrl: "",
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
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compressImageFile(file, maxWidth = 640, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not load selected image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function getMarkerColor(hazard, riskScore) {
  if (hazard.status === "Resolved") return "#16a34a";
  if (riskScore >= 75 || hazard.severity === "Critical") return "#991b1b";
  if (riskScore >= 55 || hazard.severity === "High") return "#ea580c";
  if (hazard.severity === "Medium") return "#d97706";
  return "#2563eb";
}

function refreshMapLayout() {
  if (!AppState.map) return;
  setTimeout(() => {
    AppState.map.invalidateSize();
  }, 150);
}

function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl || typeof L === "undefined") return;

  const { lat, lng } = SensorService.coords;
  AppState.map = L.map("map").setView([lat, lng], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(AppState.map);

  AppState.markersLayer = L.layerGroup().addTo(AppState.map);

  AppState.map.on("click", (e) => {
    const clickedLat = Number(e.latlng.lat.toFixed(6));
    const clickedLng = Number(e.latlng.lng.toFixed(6));
    SensorService.setCoords(clickedLat, clickedLng, null, "Map Pin");
    openReportModal({ lat: clickedLat, lng: clickedLng });
    showToast(`Pin set at ${clickedLat}, ${clickedLng}`);
  });

  window.addEventListener("resize", refreshMapLayout);
  refreshMapLayout();
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
      .bindPopup("Active GPS Position");
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
      String(h.roadCondition || "").toLowerCase().includes(q) ||
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
    const cond = h.roadCondition || (h.waterlogged ? "Waterlogged" : "Dry Asphalt");

    const marker = L.circleMarker([Number(h.lat), Number(h.lng)], {
      radius: Math.max(8, Math.min(16, 7 + Number(h.vehicleCount || 1))),
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92
    });

    const photoHtml = h.photoUrl
      ? `<img src="${h.photoUrl}" alt="${escapeHtml(h.roadName)} photo" class="popup-photo" />`
      : "";

    const popupHtml = `
      <div style="min-width:210px">
        <strong>${escapeHtml(h.roadName)}</strong><br/>
        <small>Condition: <b>${escapeHtml(cond)}</b> • Status: <b>${escapeHtml(h.status)}</b></small><br/>
        <div style="margin-top:6px;font-size:12px">
          Risk Score: <b>${risk.score}/100</b> (${escapeHtml(risk.tier)})<br/>
          Reports: <b>${h.reportCount}</b> • Vehicles: <b>${h.vehicleCount}</b>
        </div>
        ${photoHtml}
        <div class="map-popup-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="verify" data-id="${escapeHtml(h.id)}">✓ Verify (+1)</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="focus" data-id="${escapeHtml(h.id)}">Zoom</button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.addTo(AppState.markersLayer);
  });
}

function renderKpis(allHazards) {
  document.getElementById("kpiTotalHazards").textContent = String(allHazards.length);
  document.getElementById("kpiVerifiedHazards").textContent = String(
    allHazards.filter((h) => Number(h.vehicleCount || 1) >= 2 || Number(h.reportCount || 1) >= 2).length
  );
  document.getElementById("kpiHighRisk").textContent = String(
    allHazards.filter(
      (h) =>
        IntelligenceEngine.calculateRoadRiskScore(h, WeatherService.latest).score >= 70 &&
        h.status !== "Resolved"
    ).length
  );
  document.getElementById("kpiPendingRepairs").textContent = String(
    allHazards.filter((h) => h.status !== "Resolved").length
  );
}

function renderCrowdModule(allHazards) {
  const feedEl = document.getElementById("crowdActivityFeed");
  feedEl.innerHTML =
    AppState.crowdEvents.length === 0
      ? `<p class="empty-state">No crowd or duplicate events yet.</p>`
      : AppState.crowdEvents
          .slice(0, 5)
          .map((ev) => `<div class="feed-item">${escapeHtml(ev)}</div>`)
          .join("");

  const listEl = document.getElementById("crowdCandidatesList");
  const sorted = [...allHazards].sort(
    (a, b) => Number(b.vehicleCount || 1) - Number(a.vehicleCount || 1)
  );

  listEl.innerHTML = sorted
    .slice(0, 5)
    .map((h) => {
      const cond = h.roadCondition || (h.waterlogged ? "Waterlogged" : "Dry Asphalt");
      return `
        <div class="crowd-card">
          <div class="crowd-top">
            <span class="crowd-road">${escapeHtml(h.roadName)}</span>
            <span class="badge badge-${escapeHtml(String(h.severity || "Medium").toLowerCase())}">${escapeHtml(h.severity)}</span>
          </div>
          <div class="alert-meta" style="margin-top:4px">
            <strong>${h.reportCount}</strong> reports • <strong>${h.vehicleCount}</strong> vehicles • <strong>${escapeHtml(cond)}</strong>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button type="button" class="btn btn-outline btn-sm" data-action="verify" data-id="${escapeHtml(h.id)}">✓ Verify Hazard</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="focus" data-id="${escapeHtml(h.id)}">📍 Locate</button>
          </div>
        </div>
      `;
    })
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
      const cond = h.roadCondition || (h.waterlogged ? "Waterlogged" : "Dry Asphalt");
      return `
        <div class="risk-card">
          <div class="risk-top">
            <div>
              <div class="risk-road">${escapeHtml(h.roadName)}</div>
              <div class="alert-meta">
                ${escapeHtml(cond)} • ${h.reportCount} reports • ${h.vehicleCount} vehicles • ${escapeHtml(h.status)}
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
      const cond = h.roadCondition || (h.waterlogged ? "Waterlogged" : "Dry Asphalt");
      const thumb = h.photoUrl
        ? `<img src="${h.photoUrl}" alt="${escapeHtml(h.roadName)}" class="hazard-thumb" />`
        : `<span class="info-chip">No Photo</span>`;

      const statuses = ["Pending", "Assigned", "In Progress", "Resolved"];
      const optionsHtml = statuses
        .map((st) => `<option value="${st}" ${h.status === st ? "selected" : ""}>${st}</option>`)
        .join("");

      return `
        <tr>
          <td>
            <div class="road-cell-flex">
              ${thumb}
              <div>
                <strong>${escapeHtml(h.roadName)}</strong><br/>
                <span class="alert-meta">${escapeHtml(h.id)} • <span class="badge badge-${escapeHtml(String(h.severity || "Medium").toLowerCase())}">${escapeHtml(h.severity)}</span></span>
              </div>
            </div>
          </td>
          <td>
            <strong>${escapeHtml(cond)}</strong><br/>
            <span class="alert-meta">${h.waterlogged ? "Waterlogged • " : ""}${WeatherService.latest.precipitationMm.toFixed(1)}mm rain</span>
          </td>
          <td class="alert-meta">${Number(h.lat).toFixed(4)}, ${Number(h.lng).toFixed(4)}</td>
          <td><strong>${h.reportCount}</strong> rep / <strong>${h.vehicleCount}</strong> veh</td>
          <td><span class="risk-score-badge ${risk.tierClass}">${risk.score}/100</span></td>
          <td>
            <select class="select select-sm" data-action="status" data-id="${escapeHtml(h.id)}">
              ${optionsHtml}
            </select>
          </td>
          <td>
            <input type="text" class="input crew-input" id="crew-${escapeHtml(h.id)}" value="${escapeHtml(h.assignedCrew || "")}" placeholder="Crew name..." />
          </td>
          <td>
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-outline btn-sm" data-action="save-crew" data-id="${escapeHtml(h.id)}">Save</button>
              <button type="button" class="btn btn-danger-outline btn-sm" data-action="delete" data-id="${escapeHtml(h.id)}">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderVehicleAlerts() {
  const listEl = document.getElementById("vehicleAlertsList");
  if (!AppState.activeAlerts.length) {
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
              Severity: <strong>${escapeHtml(al.severity)}</strong> • Risk: <strong>${al.riskScore}/100</strong> • ${escapeHtml(al.speedAdvice)}
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-action="focus" data-id="${escapeHtml(al.hazardId)}">View</button>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderKpis(AppState.hazards);
  renderMapMarkers(getFilteredHazards());
  renderCrowdModule(AppState.hazards);
  renderRiskModule(AppState.hazards);
  renderAuthorityTable(AppState.hazards);
  renderVehicleAlerts();
}

async function performAction(action, id, extraValue = null) {
  const target = AppState.hazards.find((h) => h.id === id);
  if (!target) return;

  if (action === "verify") {
    const updated = IntelligenceEngine.verifyHazard(target);
    await RoadStore.saveHazard(updated);
    const msg = `Crowd verified ${updated.roadName} (${updated.reportCount} reports, ${updated.vehicleCount} vehicles).`;
    AppState.crowdEvents.unshift(msg);
    showToast(msg);
  } else if (action === "focus") {
    if (AppState.map) {
      AppState.map.setView([Number(target.lat), Number(target.lng)], 15);
      refreshMapLayout();
    }
    showToast(`Focused on ${target.roadName}`);
  } else if (action === "status") {
    await RoadStore.saveHazard({ ...target, status: extraValue });
    showToast(`${target.roadName} status → ${extraValue}`);
  } else if (action === "save-crew") {
    const crewEl = document.getElementById(`crew-${id}`);
    const crewName = crewEl ? crewEl.value.trim() || "Unassigned" : "Unassigned";
    await RoadStore.saveHazard({ ...target, assignedCrew: crewName });
    showToast(`Assigned "${crewName}" to ${target.roadName}`);
  } else if (action === "delete") {
    await RoadStore.deleteHazard(id);
    showToast(`Removed ${target.roadName}`);
  }
}

function setPhotoPreview(dataUrl) {
  AppState.currentPhotoDataUrl = dataUrl || "";
  const box = document.getElementById("photoPreviewBox");
  const img = document.getElementById("photoPreviewImg");
  if (AppState.currentPhotoDataUrl) {
    img.src = AppState.currentPhotoDataUrl;
    box.classList.remove("hidden");
  } else {
    img.removeAttribute("src");
    box.classList.add("hidden");
  }
}

function openReportModal(prefill = {}) {
  const modal = document.getElementById("reportModal");
  document.getElementById("inputLat").value = prefill.lat ?? SensorService.coords.lat.toFixed(6);
  document.getElementById("inputLng").value = prefill.lng ?? SensorService.coords.lng.toFixed(6);
  if (prefill.roadName) document.getElementById("inputRoadName").value = prefill.roadName;
  if (prefill.severity) document.getElementById("inputSeverity").value = prefill.severity;
  if (prefill.notes) document.getElementById("inputNotes").value = prefill.notes;
  checkDuplicatePreview();
  modal.classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
  document.getElementById("potholeReportForm").reset();
  setPhotoPreview("");
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
    banner.textContent = `Duplicate / Crowd-Merge within ${Math.round(nearby.distanceMeters)}m of "${nearby.hazard.roadName}". Submitting will merge and boost crowd count.`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

function runProximityCheck(lat, lng, label = "Current GPS") {
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
    `Vehicle Tracker (<strong>${escapeHtml(label)}</strong>) • Radius: <strong>${radius}m</strong> • Active Alerts: <strong>${alerts.length}</strong>`;
  renderVehicleAlerts();
  return alerts;
}

function startVehicleSimulation() {
  if (AppState.simTimer) clearInterval(AppState.simTimer);
  const target = AppState.hazards.find((h) => h.status !== "Resolved") || {
    lat: 11.0245,
    lng: 76.9825,
    roadName: "Target Segment"
  };

  let step = 0;
  const totalSteps = 8;
  const startLat = Number(target.lat) - 0.004;
  const startLng = Number(target.lng) - 0.004;

  const tick = () => {
    step += 1;
    const progress = step / totalSteps;
    const curLat = startLat + (Number(target.lat) - startLat) * progress;
    const curLng = startLng + (Number(target.lng) - startLng) * progress;

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
          .bindPopup("Approaching Vehicle");
      } else {
        AppState.vehicleMarker.setLatLng([curLat, curLng]);
      }
    }

    runProximityCheck(curLat, curLng, `Sim Vehicle (${step}/${totalSteps})`);
    if (step >= totalSteps) {
      clearInterval(AppState.simTimer);
      AppState.simTimer = null;
    }
  };

  tick();
  AppState.simTimer = setInterval(tick, 1200);
}

function bindEvents() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) {
      performAction(btn.dataset.action, btn.dataset.id);
    }
  });

  document.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-action='status']");
    if (sel) {
      performAction("status", sel.dataset.id, sel.value);
    }
  });

  document.getElementById("inputPhotoFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setPhotoPreview(dataUrl);
      showToast("Pothole photo attached.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("btnRemovePhoto").addEventListener("click", () => {
    document.getElementById("inputPhotoFile").value = "";
    setPhotoPreview("");
  });

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
      showToast("GPS filled into form.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("potholeReportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const roadName = document.getElementById("inputRoadName").value.trim();
    const vehicleId = document.getElementById("inputVehicleId").value.trim() || "VEH-101";
    const lat = parseFloat(document.getElementById("inputLat").value);
    const lng = parseFloat(document.getElementById("inputLng").value);
    const severity = document.getElementById("inputSeverity").value;
    const roadCondition = document.getElementById("inputRoadCondition").value;
    const waterlogged =
      document.getElementById("inputWaterlogged").checked || roadCondition === "Waterlogged";
    const notes = document.getElementById("inputNotes").value.trim();

    if (!roadName || Number.isNaN(lat) || Number.isNaN(lng)) {
      showToast("Please enter road name and valid coordinates.");
      return;
    }

    const result = IntelligenceEngine.processIncomingReport(
      AppState.hazards,
      {
        roadName,
        vehicleId,
        lat,
        lng,
        severity,
        roadCondition,
        waterlogged,
        notes,
        photoUrl: AppState.currentPhotoDataUrl || ""
      },
      20
    );

    if (result.action === "merged" && AppState.currentPhotoDataUrl) {
      result.hazard.photoUrl = AppState.currentPhotoDataUrl;
    }
    result.hazard.roadCondition = roadCondition;

    await RoadStore.saveHazard(result.hazard);

    const msg =
      result.action === "merged"
        ? `Merged duplicate within ${result.distanceMeters}m into "${result.hazard.roadName}" (${result.hazard.reportCount} reports).`
        : `Added "${result.hazard.roadName}" (${roadCondition}, ${severity}).`;

    AppState.crowdEvents.unshift(msg);
    showToast(msg);
    closeReportModal();
    if (AppState.map) {
      AppState.map.setView([lat, lng], 14);
      refreshMapLayout();
    }
  });

  document.getElementById("btnUseGps").addEventListener("click", async () => {
    try {
      const c = await SensorService.fetchCurrentGps();
      updateUserMapMarker();
      if (AppState.map) {
        AppState.map.setView([c.lat, c.lng], 14);
        refreshMapLayout();
      }
      showToast(`GPS: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`);
    } catch (err) {
      showToast(`GPS notice: ${err.message}`);
    }
  });

  document.getElementById("btnToggleWatchGps").addEventListener("click", (e) => {
    try {
      const on = SensorService.toggleWatchGps();
      e.target.textContent = on ? "🛰 Live GPS: ON" : "🛰 Live GPS: OFF";
      showToast(on ? "Live GPS tracking ON" : "Live GPS tracking OFF");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("btnEnableMotion").addEventListener("click", async () => {
    try {
      await SensorService.enableMotionSensor();
      document.getElementById("accelSummary").textContent = "Motion Sensor Active";
      showToast("Accelerometer enabled.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("btnSimulateJolt").addEventListener("click", () => {
    const f = SensorService.simulateJolt();
    showToast(`Simulated jolt (${f} m/s²)`);
  });

  document.getElementById("btnFetchWeather").addEventListener("click", async () => {
    const w = await WeatherService.fetchWeather(SensorService.coords.lat, SensorService.coords.lng);
    document.getElementById("weatherSummary").textContent = WeatherService.formatSummary(w);
    renderAll();
    showToast("Weather conditions updated.");
  });

  document.getElementById("btnLoadSample").addEventListener("click", async () => {
    await RoadStore.replaceAllHazards(getSampleHazards());
    showToast("Sample data loaded.");
  });

  document.getElementById("btnResetDemoData").addEventListener("click", async () => {
    AppState.crowdEvents = [];
    AppState.activeAlerts = [];
    await RoadStore.replaceAllHazards(getSampleHazards());
    showToast("Demo data reset.");
  });

  document.getElementById("btnFixMapSize").addEventListener("click", () => {
    refreshMapLayout();
    showToast("Map layout refreshed.");
  });

  document.getElementById("btnCenterMapGps").addEventListener("click", () => {
    if (AppState.map) {
      AppState.map.setView([SensorService.coords.lat, SensorService.coords.lng], 13);
      refreshMapLayout();
      showToast("Centered on active GPS.");
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
    AppState.filters = { search: "", severity: "ALL", status: "ALL", sortRisk: "SCORE_DESC" };
    document.getElementById("searchRoadInput").value = "";
    document.getElementById("filterSeverity").value = "ALL";
    document.getElementById("filterStatus").value = "ALL";
    document.getElementById("sortRiskSelect").value = "SCORE_DESC";
    renderAll();
    showToast("Filters reset.");
  });

  document.getElementById("btnCheckAlerts").addEventListener("click", () => {
    const alerts = runProximityCheck(SensorService.coords.lat, SensorService.coords.lng, "Active GPS");
    showToast(`${alerts.length} proximity alert(s) found.`);
  });

  document.getElementById("btnSimulateVehicle").addEventListener("click", startVehicleSimulation);

  document.getElementById("btnClearAlerts").addEventListener("click", () => {
    if (AppState.simTimer) {
      clearInterval(AppState.simTimer);
      AppState.simTimer = null;
    }
    AppState.activeAlerts = [];
    renderVehicleAlerts();
    showToast("Alerts cleared.");
  });
}

async function bootstrap() {
  RoadStore.init();

  const badge = document.getElementById("dbStatusBadge");
  if (RoadStore.isLiveFirebase) {
    badge.textContent = "● Firebase Live Sync";
    badge.className = "status-pill status-live";
  }

  SensorService.onGpsUpdate = (coords) => {
    document.getElementById("gpsSummary").textContent = SensorService.formatGpsSummary(coords);
    updateUserMapMarker();
  };

  SensorService.onJoltDetected = (jolt) => {
    document.getElementById("accelSummary").textContent = `Jolt ${jolt.forceMs2} m/s² (${jolt.gForce}g)`;
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
