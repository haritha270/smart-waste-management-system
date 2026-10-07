'use strict';

/**
 * MongoDB Backend Connection & Collection Manager
 * 
 * Supports local MongoDB (e.g. mongodb://127.0.0.1:27017/waste_management)
 * and MongoDB Atlas cloud clusters (mongodb+srv://...).
 * 
 * Manages collections, indexes, initial seeding, and synchronization
 * for the Smart Waste Management System.
 */

const { MongoClient } = require('mongodb');

let client = null;
let mongoDb = null;
let isConnected = false;
let connectionError = null;

const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/waste_management_system';

/**
 * Initialize MongoDB connection and indexes.
 */
async function connectMongo(uri = DEFAULT_URI) {
  try {
    const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/waste_management_system';
    console.log(`[mongodb] Attempting connection to: ${mongoUri.replace(/:([^:@]{1,})@/, ':****@')}`);

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    
    // Extract database name from URI or use default
    const dbName = client.options?.dbName || 'waste_management_system';
    mongoDb = client.db(dbName);
    isConnected = true;
    connectionError = null;

    console.log(`🍃 [mongodb] Connected successfully to database: "${dbName}"`);

    // Ensure collections and indexes
    await setupIndexes();

    return { ok: true, db: mongoDb, client };
  } catch (err) {
    isConnected = false;
    connectionError = err.message;
    console.warn(`⚠️ [mongodb] Could not connect to MongoDB (${err.message}). Application is using high-performance SQLite engine with auto-reconnect.`);
    return { ok: false, error: err.message };
  }
}

/**
 * Configure MongoDB collections and indexes
 */
async function setupIndexes() {
  if (!mongoDb) return;

  try {
    // Users collection
    await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('users').createIndex({ role: 1 });

    // Workers collection
    await mongoDb.collection('workers').createIndex({ user_id: 1 }, { unique: true });
    await mongoDb.collection('workers').createIndex({ employee_code: 1 }, { unique: true });
    await mongoDb.collection('workers').createIndex({ status: 1 });

    // Reports collection
    await mongoDb.collection('reports').createIndex({ report_code: 1 }, { unique: true });
    await mongoDb.collection('reports').createIndex({ status: 1 });
    await mongoDb.collection('reports').createIndex({ user_id: 1 });
    await mongoDb.collection('reports').createIndex({ assigned_worker_id: 1 });
    await mongoDb.collection('reports').createIndex({ priority: 1 });

    // Assignments collection
    await mongoDb.collection('assignments').createIndex({ report_id: 1 });
    await mongoDb.collection('assignments').createIndex({ worker_id: 1 });
    await mongoDb.collection('assignments').createIndex({ status: 1 });

    // Notifications collection
    await mongoDb.collection('notifications').createIndex({ user_id: 1, is_read: 1 });
    await mongoDb.collection('notifications').createIndex({ created_at: -1 });

    // Status history collection
    await mongoDb.collection('status_history').createIndex({ report_id: 1 });

    // Sessions collection
    await mongoDb.collection('sessions').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('sessions').createIndex({ expires_at: 1 });

    // Password resets collection
    await mongoDb.collection('password_resets').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('password_resets').createIndex({ otp_code: 1 });

    // Emails collection
    await mongoDb.collection('emails').createIndex({ recipient: 1 });
    await mongoDb.collection('emails').createIndex({ report_code: 1 });
    await mongoDb.collection('emails').createIndex({ action_token: 1 });
    await mongoDb.collection('emails').createIndex({ status: 1 });

    console.log('🍃 [mongodb] Collection indexes initialized successfully.');
  } catch (err) {
    console.warn('[mongodb] Error creating indexes:', err.message);
  }
}

/**
 * Sync all records from SQLite database into MongoDB collections.
 */
async function syncFromSqlite(sqliteDb) {
  if (!isConnected || !mongoDb || !sqliteDb) return { synced: false };

  try {
    const tables = [
      'users',
      'workers',
      'reports',
      'assignments',
      'notifications',
      'status_history',
      'sessions',
      'password_resets',
      'emails',
    ];

    const stats = {};

    for (const table of tables) {
      const rows = sqliteDb.all(`SELECT * FROM ${table}`);
      if (rows && rows.length > 0) {
        const col = mongoDb.collection(table);
        for (const row of rows) {
          const filter = row.id ? { id: row.id } : (row.token ? { token: row.token } : { _id: row._id });
          await col.updateOne(filter, { $set: row }, { upsert: true });
        }
        stats[table] = rows.length;
      } else {
        stats[table] = 0;
      }
    }

    console.log('🍃 [mongodb] Synchronized SQLite records to MongoDB collections:', JSON.stringify(stats));
    return { synced: true, stats };
  } catch (err) {
    console.error('[mongodb] Error syncing from SQLite:', err.message);
    return { synced: false, error: err.message };
  }
}

/**
 * Mirror single write operation from SQLite into MongoDB collection
 */
async function mirrorWrite(table, action, data, filter = null) {
  if (!isConnected || !mongoDb) return;
  try {
    const col = mongoDb.collection(table);
    if (action === 'insert') {
      await col.insertOne({ ...data, synced_at: new Date().toISOString() });
    } else if (action === 'upsert' && filter) {
      await col.updateOne(filter, { $set: { ...data, synced_at: new Date().toISOString() } }, { upsert: true });
    } else if (action === 'update' && filter) {
      await col.updateMany(filter, { $set: { ...data, updated_at: new Date().toISOString() } });
    } else if (action === 'delete' && filter) {
      await col.deleteMany(filter);
    }
  } catch (err) {
    // Non-blocking sync error
    console.warn(`[mongodb] Mirror write warning on ${table}:`, err.message);
  }
}

/**
 * Returns database health and connection status
 */
async function getMongoStatus() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/waste_management_system';
  const maskedUri = uri.replace(/:([^:@]{1,})@/, ':****@');

  if (!isConnected || !mongoDb) {
    return {
      connected: false,
      configured: Boolean(process.env.MONGODB_URI),
      uri: maskedUri,
      database: null,
      error: connectionError || 'MongoDB server is not reachable on ' + maskedUri,
      collections: null,
    };
  }

  try {
    const adminDb = mongoDb.admin();
    const pingStart = Date.now();
    await adminDb.ping();
    const pingMs = Date.now() - pingStart;

    const collections = await mongoDb.listCollections().toArray();
    const colStats = {};
    for (const c of collections) {
      const count = await mongoDb.collection(c.name).countDocuments();
      colStats[c.name] = count;
    }

    return {
      connected: true,
      configured: true,
      uri: maskedUri,
      database: mongoDb.databaseName,
      pingMs,
      collections: colStats,
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      uri: maskedUri,
      database: mongoDb ? mongoDb.databaseName : null,
      error: err.message,
      collections: null,
    };
  }
}

/**
 * Close MongoDB client connection.
 */
async function closeMongo() {
  if (client) {
    await client.close();
    isConnected = false;
    mongoDb = null;
    client = null;
  }
}

module.exports = {
  connectMongo,
  setupIndexes,
  syncFromSqlite,
  mirrorWrite,
  getMongoStatus,
  closeMongo,
  get db() {
    return mongoDb;
  },
  get isConnected() {
    return isConnected;
  },
};
