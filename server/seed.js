'use strict';

/**
 * Database seeder / initializer.
 * Populates default Administrator, Field Workers, Citizens, Complaints,
 * Assignments, and Status History if the database is freshly initialized.
 */

const { hashPassword } = require('./utils/helpers');

async function seed(db) {
  const userCount = db.get('SELECT COUNT(*) AS n FROM users');
  if (userCount && userCount.n > 0) {
    db.flush();
    return;
  }

  console.log('[seed] Seeding initial users, workers, complaints, and assignments...');

  const now = new Date().toISOString();
  const tMinus = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // 1. Admin
  const adminPass = hashPassword('Admin@123');
  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Municipal Chief Administrator', 'admin@smartwms.gov', '+91 80 2222 1111', adminPass, 'admin', 'City Municipal Corporation, Central HQ', 'Bengaluru', tMinus(240)]
  );
  const adminId = db.lastId();

  // 2. Citizens
  const citizenPass = hashPassword('Citizen@123');
  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Priya Sharma', 'priya@example.com', '+91 98765 43210', citizenPass, 'citizen', '142, 5th Cross, Indiranagar', 'Bengaluru', tMinus(120)]
  );
  const priyaId = db.lastId();

  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Arun Kumar', 'arun@example.com', '+91 98450 12345', citizenPass, 'citizen', '55, 80 Feet Road, Koramangala', 'Bengaluru', tMinus(96)]
  );
  const arunId = db.lastId();

  // 3. Field Collection Workers (Created by Admin)
  const workerPass = hashPassword('Worker@123');
  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Ravi Shankar', 'worker.ravi@smartwms.gov', '+91 98111 22334', workerPass, 'worker', 'Ward 42 Depot, Indiranagar', 'Bengaluru', tMinus(180)]
  );
  const raviUserId = db.lastId();
  db.run(
    `INSERT INTO workers (user_id, employee_code, zone, vehicle, specialization, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [raviUserId, 'WRK-101', 'East Zone - Indiranagar', 'Garbage Compactor #KA-03-WM-101', 'Heavy Waste & Mixed Trash', 'active', tMinus(180)]
  );
  const raviWorkerId = db.lastId();

  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Sunil Gowda', 'worker.sunil@smartwms.gov', '+91 98222 33445', workerPass, 'worker', 'Ward 58 Depot, Koramangala', 'Bengaluru', tMinus(150)]
  );
  const sunilUserId = db.lastId();
  db.run(
    `INSERT INTO workers (user_id, employee_code, zone, vehicle, specialization, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sunilUserId, 'WRK-102', 'South Zone - Koramangala', 'Tipper Auto #KA-05-WM-204', 'Door-to-door & Commercial', 'active', tMinus(150)]
  );
  const sunilWorkerId = db.lastId();

  // 4. Sample Reports / Complaints
  // Report 1: Assigned to Ravi (Active Task)
  db.run(
    `INSERT INTO reports (report_code, user_id, title, description, address, locality, latitude, longitude, reported_at, status, priority, assigned_worker_id, admin_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'WM1001',
      priyaId,
      'Overflowing community bin near market',
      'Large garbage accumulation spilling onto the pedestrian sidewalk. Foul smell and stray animal interference.',
      '12th Main Road, HAL 2nd Stage, Indiranagar',
      'Indiranagar',
      12.9716,
      77.6412,
      tMinus(18),
      'assigned',
      'high',
      raviWorkerId,
      'Assigned to field worker Ravi (WRK-101) for morning collection run.',
      tMinus(18),
    ]
  );
  const rep1Id = db.lastId();
  db.run(
    `INSERT INTO assignments (report_id, worker_id, assigned_by, assigned_at, status, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rep1Id, raviWorkerId, adminId, tMinus(12), 'active', 'Indiranagar primary route assignment. Priority clearance.']
  );
  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rep1Id, 'pending', 'assigned', adminId, 'admin', 'Task assigned to field worker Ravi Shankar (WRK-101)', tMinus(12)]
  );

  // Report 2: In Progress with Ravi
  db.run(
    `INSERT INTO reports (report_code, user_id, title, description, address, locality, latitude, longitude, reported_at, status, priority, assigned_worker_id, admin_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'WM1002',
      priyaId,
      'Construction debris and roadside dump',
      'Piles of construction rubble and plastic sacks dumped near park corner.',
      '100 Feet Road, near Defence Colony, Indiranagar',
      'Indiranagar',
      12.9784,
      77.6408,
      tMinus(28),
      'in_progress',
      'medium',
      raviWorkerId,
      'Worker is currently on site clearing rubble.',
      tMinus(28),
    ]
  );
  const rep2Id = db.lastId();
  db.run(
    `INSERT INTO assignments (report_id, worker_id, assigned_by, assigned_at, status, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rep2Id, raviWorkerId, adminId, tMinus(20), 'active', 'Heavy compactor required.']
  );
  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rep2Id, 'assigned', 'in_progress', raviUserId, 'worker', 'Worker arrived at Indiranagar site; collection in progress.', tMinus(6)]
  );

  // Report 3: Resolved by Sunil
  db.run(
    `INSERT INTO reports (report_code, user_id, title, description, address, locality, latitude, longitude, reported_at, status, priority, assigned_worker_id, resolved_at, admin_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'WM1003',
      arunId,
      'Commercial waste dumping behind restaurant row',
      'Food waste bags piled up behind 5th Block restaurant strip.',
      '80 Feet Road, 5th Block, Koramangala',
      'Koramangala',
      12.9352,
      77.6245,
      tMinus(48),
      'resolved',
      'high',
      sunilWorkerId,
      tMinus(4),
      'Area cleared and sanitized by Sunil Gowda (WRK-102).',
      tMinus(48),
    ]
  );
  const rep3Id = db.lastId();
  db.run(
    `INSERT INTO assignments (report_id, worker_id, assigned_by, assigned_at, status, note, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rep3Id, sunilWorkerId, adminId, tMinus(40), 'completed', 'Sanitized after clearance.', tMinus(4)]
  );
  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rep3Id, 'in_progress', 'resolved', sunilUserId, 'worker', 'Work completed by field worker Sunil Gowda. Area thoroughly cleared.', tMinus(4)]
  );

  // Report 4: Pending (unassigned)
  db.run(
    `INSERT INTO reports (report_code, user_id, title, description, address, locality, latitude, longitude, reported_at, status, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'WM1004',
      arunId,
      'Fallen leaves and plastic trash blocking drain',
      'Stormwater drain entrance choked with garden trimmings and discarded bottles.',
      '1st Main, 7th Block, Koramangala',
      'Koramangala',
      12.9318,
      77.6189,
      tMinus(3),
      'pending',
      'medium',
      tMinus(3),
    ]
  );

  // 5. Initial Work Order Dispatch Emails (Delivered to Worker Emails)
  const { sendWorkerAssignmentEmail } = require('./utils/mailer');

  sendWorkerAssignmentEmail(db, {
    workerEmail: 'worker.ravi@smartwms.gov',
    workerName: 'Ravi Shankar',
    workerCode: 'WRK-101',
    report: {
      report_code: 'WM1001',
      title: 'Overflowing community bin near market',
      description: 'Large garbage accumulation spilling onto the pedestrian sidewalk. Foul smell and stray animal interference.',
      priority: 'high',
      address: '12th Main Road, HAL 2nd Stage, Indiranagar',
      locality: 'Indiranagar',
      latitude: 12.9716,
      longitude: 77.6412,
    },
    citizen: {
      name: 'Priya Sharma',
      phone: '+91 98765 43210',
      address: '142, 5th Cross, Indiranagar',
    },
    adminNote: 'Indiranagar primary route assignment. Priority morning clearance.',
  });

  sendWorkerAssignmentEmail(db, {
    workerEmail: 'worker.ravi@smartwms.gov',
    workerName: 'Ravi Shankar',
    workerCode: 'WRK-101',
    report: {
      report_code: 'WM1002',
      title: 'Construction debris and roadside dump',
      description: 'Piles of construction rubble and plastic sacks dumped near park corner.',
      priority: 'medium',
      address: '100 Feet Road, near Defence Colony, Indiranagar',
      locality: 'Indiranagar',
      latitude: 12.9784,
      longitude: 77.6408,
    },
    citizen: {
      name: 'Priya Sharma',
      phone: '+91 98765 43210',
      address: '142, 5th Cross, Indiranagar',
    },
    adminNote: 'Heavy compactor required.',
  });

  // 6. In-App Notifications for Citizens and Admins
  // Notify Priya about assignment
  db.run(
    `INSERT INTO notifications (user_id, title, message, type, report_code, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      priyaId,
      'Complaint WM1001 Assigned to Worker',
      'Your complaint WM1001 has been assigned to field worker Ravi Shankar (WRK-101, Indiranagar Zone).',
      'info',
      'WM1001',
      '#/reports/WM1001',
      0,
      tMinus(12),
    ]
  );

  // Notify Citizen Arun about resolved complaint
  db.run(
    `INSERT INTO notifications (user_id, title, message, type, report_code, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      arunId,
      'Complaint WM1003 Resolved',
      'Field worker Sunil Gowda has completed the cleanup for WM1003 ("Commercial waste dumping behind restaurant row").',
      'success',
      'WM1003',
      '#/reports/WM1003',
      1,
      tMinus(4),
    ]
  );

  // Notify Admin about new pending complaint
  db.run(
    `INSERT INTO notifications (user_id, title, message, type, report_code, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adminId,
      'New Waste Complaint: WM1004',
      'Citizen Arun Kumar reported "Fallen leaves and plastic trash blocking drain" at Koramangala.',
      'info',
      'WM1004',
      '#/admin/reports',
      0,
      tMinus(3),
    ]
  );

  db.flush();
  console.log('[seed] Seeding finished successfully.');
}

module.exports = { seed };
