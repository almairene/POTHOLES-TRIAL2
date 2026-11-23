// Intelligence Engine: Duplicate Clustering, Crowd Verification, Road Risk Score (0-100) & Vehicle Alerts

const IntelligenceEngine = {
  SEVERITY_RANK: {
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 4
  },

  haversineMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  findNearbyHazard(hazards, lat, lng, radiusMeters = 20) {
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const h of hazards) {
      if (h.status === "Resolved") continue;
      const dist = this.haversineMeters(lat, lng, Number(h.lat), Number(h.lng));
      if (dist <= radiusMeters && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = h;
      }
    }

    return bestMatch ? { hazard: bestMatch, distanceMeters: bestDistance } : null;
  },

  processIncomingReport(hazards, reportInput, radiusMeters = 20) {
    const lat = Number(reportInput.lat);
    const lng = Number(reportInput.lng);
    const vehicleId = (reportInput.vehicleId || "VEH-ANON").trim();
    const severity = reportInput.severity || "Medium";
    const waterlogged = Boolean(reportInput.waterlogged);
    const now = Date.now();

    const match = this.findNearbyHazard(hazards, lat, lng, radiusMeters);

    if (match) {
      const existing = { ...match.hazard };
      const vehiclesSet = new Set(Array.isArray(existing.vehicles) ? existing.vehicles : []);
      const hadVehicle = vehiclesSet.has(vehicleId);
      vehiclesSet.add(vehicleId);

      const oldRank = this.SEVERITY_RANK[existing.severity] || 2;
      const newRank = this.SEVERITY_RANK[severity] || 2;
      const upgradedSeverity = newRank > oldRank ? severity : existing.severity;

      const updatedHazard = {
        ...existing,
        reportCount: Number(existing.reportCount || 1) + 1,
        vehicles: Array.from(vehiclesSet),
        vehicleCount: Math.max(Number(existing.vehicleCount || 1), vehiclesSet.size),
        severity: upgradedSeverity,
        waterlogged: Boolean(existing.waterlogged || waterlogged),
        lastVerifiedAt: now,
        notes: reportInput.notes
          ? `${existing.notes || ""} | ${reportInput.notes}`.trim()
          : existing.notes
      };

      return {
        action: "merged",
        distanceMeters: Math.round(match.distanceMeters),
        hadNewVehicle: !hadVehicle,
        hazard: updatedHazard
      };
    }

    const newHazard = {
      id: `HZ-${Math.floor(100 + Math.random() * 899)}-${Date.now().toString().slice(-3)}`,
      roadName: (reportInput.roadName || "Unnamed Road Segment").trim(),
      lat,
      lng,
      severity,
      reportCount: 1,
      vehicleCount: 1,
      vehicles: [vehicleId],
      waterlogged,
      status: reportInput.status || "Pending",
      assignedCrew: reportInput.assignedCrew || "Unassigned",
      source: reportInput.source || "Smartphone GPS + Accelerometer",
      notes: (reportInput.notes || "").trim(),
      createdAt: now,
      lastVerifiedAt: now
    };

    return {
      action: "created",
      distanceMeters: 0,
      hadNewVehicle: true,
      hazard: newHazard
    };
  },

  verifyHazard(hazard, vehicleId = null) {
    const id = vehicleId || `VER-${Math.floor(10 + Math.random() * 89)}`;
    const vehiclesSet = new Set(Array.isArray(hazard.vehicles) ? hazard.vehicles : []);
    vehiclesSet.add(id);

    return {
      ...hazard,
      reportCount: Number(hazard.reportCount || 1) + 1,
      vehicles: Array.from(vehiclesSet),
      vehicleCount: Math.max(Number(hazard.vehicleCount || 1), vehiclesSet.size),
      lastVerifiedAt: Date.now()
    };
  },

  calculateRoadRiskScore(hazard, weather = null) {
    const reports = Number(hazard.reportCount || 1);
    const vehicles = Number(hazard.vehicleCount || 1);
    const severity = hazard.severity || "Medium";
    const waterlogged = Boolean(hazard.waterlogged);
    const rainMm = Number(weather?.precipitationMm ?? 0);

    // 1. Number of pothole reports (max 25 pts)
    const reportPoints = Math.min(25, reports * 2.2);

    // 2. Number of vehicles detecting same location (max 20 pts)
    const vehiclePoints = Math.min(20, vehicles * 4);

    // 3. Severity of reported impact (max 25 pts)
    const severityMap = {
      Low: 8,
      Medium: 15,
      High: 21,
      Critical: 25
    };
    const severityPoints = severityMap[severity] ?? 15;

    // 4. Age of last verified report (max 15 pts; fresh/recent reports carry high immediacy)
    const lastTs = Number(hazard.lastVerifiedAt || hazard.createdAt || Date.now());
    const ageHours = Math.max(0, (Date.now() - lastTs) / (1000 * 60 * 60));
    let agePoints = 15;
    if (ageHours > 72) agePoints = 6;
    else if (ageHours > 24) agePoints = 10;
    else if (ageHours > 6) agePoints = 13;

    // 5. Waterlogging or weather-related information (max 15 pts)
    let weatherPoints = 0;
    if (waterlogged) weatherPoints += 9;
    if (rainMm > 0) {
      weatherPoints += Math.min(6, Number((rainMm * 1.5).toFixed(1)));
    }
    weatherPoints = Math.min(15, weatherPoints);

    let rawScore = reportPoints + vehiclePoints + severityPoints + agePoints + weatherPoints;

    if (hazard.status === "Resolved") {
      rawScore = Math.min(20, rawScore * 0.25);
    } else if (hazard.status === "In Progress") {
      rawScore = Math.max(10, rawScore * 0.85);
    }

    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    let tier = "Low";
    let tierClass = "risk-low";
    if (score >= 75) {
      tier = "Critical";
      tierClass = "risk-critical";
    } else if (score >= 55) {
      tier = "High";
      tierClass = "risk-high";
    } else if (score >= 30) {
      tier = "Moderate";
      tierClass = "risk-moderate";
    }

    return {
      score,
      tier,
      tierClass,
      breakdown: {
        reports: Math.round(reportPoints),
        vehicles: Math.round(vehiclePoints),
        severity: Math.round(severityPoints),
        age: Math.round(agePoints),
        weather: Math.round(weatherPoints)
      }
    };
  },

  evaluateVehicleAlerts(vehicleLat, vehicleLng, hazards, radiusMeters = 300, weather = null) {
    const alerts = [];

    for (const h of hazards) {
      if (h.status === "Resolved") continue;
      const dist = this.haversineMeters(
        Number(vehicleLat),
        Number(vehicleLng),
        Number(h.lat),
        Number(h.lng)
      );

      if (dist <= radiusMeters) {
        const risk = this.calculateRoadRiskScore(h, weather);
        const speedAdvice =
          h.severity === "Critical" || risk.score >= 75
            ? "Reduce speed immediately & watch for deep hazard"
            : h.severity === "High" || risk.score >= 55
            ? "Slow down & keep safe lane distance"
            : "Proceed with caution";

        alerts.push({
          hazardId: h.id,
          roadName: h.roadName,
          severity: h.severity,
          distanceMeters: Math.round(dist),
          riskScore: risk.score,
          waterlogged: Boolean(h.waterlogged),
          speedAdvice
        });
      }
    }

    return alerts.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
};
