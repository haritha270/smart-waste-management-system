'use strict';

/**
 * /api/tracking - Automatic Live Vehicle GPS Tracking Service.
 *
 * Provides real-time dynamic GPS telemetry, vehicle movement simulation along
 * multi-point road waypoints, live speed/heading calculation, distance remaining,
 * and estimated time of arrival (ETA) for municipal waste collection vehicles.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { REPORT_SELECT } = require('../utils/serialize');

const router = express.Router();

// Municipal depots and zone headquarters across the city
const DEPOTS = {
  'East Zone - Indiranagar': { name: 'Indiranagar Ward 42 Depot', lat: 12.9805, lng: 77.6350 },
  'Indiranagar': { name: 'Indiranagar Ward 42 Depot', lat: 12.9805, lng: 77.6350 },
  'South Zone - Koramangala': { name: 'Koramangala Ward 58 Depot', lat: 12.9300, lng: 77.6200 },
  'Koramangala': { name: 'Koramangala Ward 58 Depot', lat: 12.9300, lng: 77.6200 },
  'Central Zone': { name: 'Central Municipal HQ Garage', lat: 12.9716, lng: 77.5946 },
  'Central': { name: 'Central Municipal HQ Garage', lat: 12.9716, lng: 77.5946 },
  'West Zone': { name: 'Malleshwaram Municipal Depot', lat: 13.0031, lng: 77.5684 },
  'North Zone': { name: 'Hebbal Sanitation Yard', lat: 13.0358, lng: 77.5970 },
  'default': { name: 'City Central Dispatch Depot', lat: 12.9716, lng: 77.5946 },
};

function getDepot(zone) {
  if (!zone) return DEPOTS['default'];
  const key = Object.keys(DEPOTS).find((k) => zone.toLowerCase().includes(k.toLowerCase()));
  return key ? DEPOTS[key] : DEPOTS['default'];
}

/**
 * Haversine formula to calculate distance in meters between two lat/lng coordinates.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Compute heading angle in degrees between two GPS points.
 */
function calculateBearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lng2 - lng1) * (Math.PI / 180));
  const θ = Math.atan2(y, x);
  const brng = (θ * (180 / Math.PI) + 360) % 360;
  return Math.round(brng);
}

/**
 * Generates intermediate street waypoint coordinates simulating real roads.
 */
function generateWaypoints(start, end, numSegments = 6) {
  const waypoints = [[start.lat, start.lng]];
  const dLat = end.lat - start.lat;
  const dLng = end.lng - start.lng;

  // Use a pseudo-random jitter offset based on coordinate values to simulate turns along streets
  for (let i = 1; i < numSegments; i++) {
    const t = i / numSegments;
    const jitterFactor = Math.sin(t * Math.PI) * 0.0018;
    const lat = start.lat + dLat * t + (i % 2 === 0 ? jitterFactor : -jitterFactor * 0.5);
    const lng = start.lng + dLng * t + (i % 2 === 1 ? jitterFactor * 0.7 : -jitterFactor * 0.3);
    waypoints.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
  }

  waypoints.push([Number(end.lat.toFixed(6)), Number(end.lng.toFixed(6))]);
  return waypoints;
}

/**
 * Computes the live tracking telemetry object for a given report row.
 */
function computeReportTelemetry(row) {
  const isAssigned = row.status === 'assigned';
  const isInProgress = row.status === 'in_progress';
  const isResolved = row.status === 'resolved';

  const depot = getDepot(row.worker_zone);
  const target = { lat: Number(row.latitude), lng: Number(row.longitude) };
  const waypoints = generateWaypoints(depot, target, 7);

  // Time-based periodic position simulation (smoothly cycles over ~120 seconds for continuous live animation)
  const nowMs = Date.now();
  const cycleSeconds = 90;
  const phase = (nowMs % (cycleSeconds * 1000)) / (cycleSeconds * 1000);

  let progress = 0.0;
  if (isResolved) {
    progress = 1.0;
  } else if (isInProgress) {
    // In progress: oscillating near the destination (0.85 to 1.0)
    progress = 0.85 + (Math.sin(nowMs / 6000) * 0.5 + 0.5) * 0.15;
  } else if (isAssigned) {
    // Assigned: moving from depot to target along route
    progress = phase;
  } else {
    progress = 0.0;
  }

  // Find corresponding waypoint segment
  const totalWaypoints = waypoints.length;
  const scaledIndex = progress * (totalWaypoints - 1);
  const segIndex = Math.min(Math.floor(scaledIndex), totalWaypoints - 2);
  const segFraction = scaledIndex - segIndex;

  const p1 = waypoints[segIndex];
  const p2 = waypoints[segIndex + 1];

  const currentLat = Number((p1[0] + (p2[0] - p1[0]) * segFraction).toFixed(6));
  const currentLng = Number((p1[1] + (p2[1] - p1[1]) * segFraction).toFixed(6));

  const heading = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
  const distanceRemainingMeters = calculateDistanceMeters(currentLat, currentLng, target.lat, target.lng);
  
  // Speed simulation (32-45 km/h while en route, 0-5 km/h when arrived)
  let speedKmH = 0;
  if (isResolved) {
    speedKmH = 0;
  } else if (distanceRemainingMeters < 30) {
    speedKmH = 0;
  } else if (isInProgress) {
    speedKmH = Math.round(10 + Math.random() * 8);
  } else {
    speedKmH = Math.round(32 + Math.sin(nowMs / 4000) * 8);
  }

  // ETA in minutes
  const etaMinutes = distanceRemainingMeters <= 30 ? 0 : Math.max(1, Math.round((distanceRemainingMeters / 1000) / (Math.max(15, speedKmH) / 60)));

  const isArrived = distanceRemainingMeters <= 35 || isResolved;
  const statusLabel = isResolved
    ? 'Completed & Cleared'
    : isArrived
    ? 'Arrived on Site · Collection Active'
    : isInProgress
    ? 'On Site · Collection In Progress'
    : 'En Route to Waste Location (Live Driving)';

  return {
    reportCode: row.report_code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    destination: {
      address: row.address,
      locality: row.locality,
      latitude: target.lat,
      longitude: target.lng,
    },
    depot: {
      name: depot.name,
      latitude: depot.lat,
      longitude: depot.lng,
    },
    worker: {
      id: row.assigned_worker_id,
      code: row.worker_code,
      name: row.worker_name,
      phone: row.worker_phone,
      email: row.worker_email,
      zone: row.worker_zone,
      vehicle: row.worker_vehicle || 'Municipal Collection Truck',
    },
    currentPosition: {
      latitude: currentLat,
      longitude: currentLng,
      heading,
      speedKmH,
    },
    telemetry: {
      distanceRemainingMeters,
      distanceRemainingKm: (distanceRemainingMeters / 1000).toFixed(2),
      etaMinutes,
      progressPct: Math.round(progress * 100),
      isArrived,
      statusLabel,
      liveActive: true,
      lastUpdated: new Date().toISOString(),
    },
    routeWaypoints: waypoints,
  };
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

/**
 * GET /api/tracking/live
 * Returns real-time automatic GPS telemetry for all active collection vehicles in the city.
 */
router.get('/live', (req, res) => {
  const db = req.db;
  const rows = db.all(`
    ${REPORT_SELECT}
    WHERE r.status IN ('assigned', 'in_progress') AND r.assigned_worker_id IS NOT NULL
    ORDER BY r.reported_at DESC
  `);

  const vehicles = rows.map((r) => computeReportTelemetry(r));
  res.json({
    ok: true,
    count: vehicles.length,
    timestamp: new Date().toISOString(),
    vehicles,
  });
});

/**
 * GET /api/tracking/:code
 * Returns detailed telemetry and route waypoints for a specific complaint code.
 */
router.get('/:code', (req, res) => {
  const db = req.db;
  const row = db.get(`${REPORT_SELECT} WHERE r.report_code = ?`, [req.params.code]);

  if (!row) {
    return res.status(404).json({ ok: false, message: 'Complaint not found.' });
  }

  const telemetry = computeReportTelemetry(row);
  res.json({
    ok: true,
    tracking: telemetry,
  });
});

module.exports = router;
module.exports.computeReportTelemetry = computeReportTelemetry;
