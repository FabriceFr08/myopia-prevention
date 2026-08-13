import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("myopia_prevention.db");

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      is_nocturnal INTEGER DEFAULT 0,
      pauses_suggested INTEGER DEFAULT 0,
      pauses_confirmed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      distance_cm REAL,
      luminosity_lux REAL,
      head_tilt_angle REAL,
      face_detected INTEGER DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS daily_summary (
      date TEXT PRIMARY KEY,
      total_screen_time_seconds INTEGER,
      avg_distance_cm REAL,
      pct_time_below_25cm REAL,
      avg_luminosity_lux REAL,
      pct_time_low_light REAL,
      pct_time_natural_light_estimated REAL,
      nocturnal_sessions_count INTEGER,
      longest_continuous_session_seconds INTEGER,
      pause_adherence_rate REAL
    );

    CREATE TABLE IF NOT EXISTS alerts_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      alert_type TEXT,
      was_dismissed INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      distance_threshold_cm REAL DEFAULT 25,
      pause_interval_minutes INTEGER DEFAULT 20,
      pause_duration_seconds INTEGER DEFAULT 20,
      nocturnal_threshold_hour INTEGER DEFAULT 22,
      notification_mode TEXT DEFAULT 'adaptive'
    );

    INSERT OR IGNORE INTO user_settings (id) VALUES (1);
  `);
}

export function createSession(startedAt: string): number {
  const result = db.runSync("INSERT INTO sessions (started_at) VALUES (?);", [
    startedAt,
  ]);
  return result.lastInsertRowId;
}

export function endSession(
  sessionId: number,
  endedAt: string,
  durationSeconds: number,
  pausesSuggested: number,
  pausesConfirmed: number,
) {
  db.runSync(
    "UPDATE sessions SET ended_at = ?, duration_seconds = ?, pauses_suggested = ?, pauses_confirmed = ? WHERE id = ?;",
    [endedAt, durationSeconds, pausesSuggested, pausesConfirmed, sessionId],
  );
}

export function insertReading(
  sessionId: number,
  timestamp: string,
  distanceCm: number | null,
  luminosityLux: number | null,
  faceDetected: boolean,
) {
  db.runSync(
    "INSERT INTO readings (session_id, timestamp, distance_cm, luminosity_lux, face_detected) VALUES (?, ?, ?, ?, ?);",
    [sessionId, timestamp, distanceCm, luminosityLux, faceDetected ? 1 : 0],
  );
}

export default db;
