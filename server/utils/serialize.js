'use strict';

/**
 * Row -> API serialisation helpers.
 * Keeps SQL joins in one place and returns clean JSON for the frontend.
 */

const { STATUS, STATUS_FLOW } = require('./helpers');

/** Shared SELECT used by every report query. */
const REPORT_SELECT = `
  SELECT r.*,
         u.name  AS reporter_name,
         u.email AS reporter_email,
         u.phone AS reporter_phone,
         u.address AS reporter_address,
         w.id AS worker_id,
         w.employee_code AS worker_code,
         w.zone AS worker_zone,
         w.vehicle AS worker_vehicle,
         w.specialization AS worker_spec,
         wu.name AS worker_name,
         wu.phone AS worker_phone
    FROM reports r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN workers w ON w.id = r.assigned_worker_id
    LEFT JOIN users wu ON wu.id = w.user_id
`;

function serializeReport(row, { history = null } = {}) {
  if (!row) return null;
  const meta = STATUS[row.status] || STATUS.pending;
  const out = {
    id: row.id,
    code: row.report_code,
    title: row.title,
    description: row.description,
    image: row.image_url,
    status: row.status,
    statusLabel: meta.label,
    statusStep: meta.step,
    statusTone: meta.tone,
    flow: STATUS_FLOW,
    priority: row.priority,
    address: row.address,
    locality: row.locality,
    latitude: row.latitude,
    longitude: row.longitude,
    reportedAt: row.reported_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    adminNote: row.admin_note,
    assignedWorkerId: row.assigned_worker_id || null,
    worker: row.worker_id ? {
      id: row.worker_id,
      code: row.worker_code,
      name: row.worker_name,
      phone: row.worker_phone,
      zone: row.worker_zone,
      vehicle: row.worker_vehicle,
      specialization: row.worker_spec,
    } : null,
    workerName: row.worker_name || null,
    reporter: {
      id: row.user_id,
      name: row.reporter_name,
      email: row.reporter_email,
      phone: row.reporter_phone,
      address: row.reporter_address || row.address,
    },
  };
  if (history) out.history = history;
  return out;
}

function serializeWorker(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    code: row.employee_code,
    zone: row.zone,
    vehicle: row.vehicle,
    specialization: row.specialization || 'General Collection',
    status: row.status || 'active',
    activeTasks: row.active_tasks || 0,
    completedTasks: row.completed_tasks || 0,
    createdAt: row.created_at,
  };
}

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    address: row.address,
    city: row.city,
    active: !!row.active,
    createdAt: row.created_at,
  };
}

function serializeHistory(rows) {
  return rows.map((h) => ({
    id: h.id,
    from: h.from_status,
    to: h.to_status,
    toLabel: (STATUS[h.to_status] || {}).label || h.to_status,
    by: h.changed_by_name || null,
    byRole: h.changed_by_role,
    note: h.note,
    at: h.created_at,
  }));
}

module.exports = { REPORT_SELECT, serializeReport, serializeWorker, serializeUser, serializeHistory };
