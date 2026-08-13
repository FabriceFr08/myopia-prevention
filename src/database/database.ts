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

export function computeDailySummary(date: string) {
  // date au format 'YYYY-MM-DD'
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const sessionsRows = db.getAllSync(
    `SELECT * FROM sessions WHERE started_at >= ? AND started_at <= ?;`,
    [startOfDay, endOfDay],
  ) as any[];

  const readingsRows = db.getAllSync(
    `SELECT r.* FROM readings r
     JOIN sessions s ON r.session_id = s.id
     WHERE s.started_at >= ? AND s.started_at <= ?;`,
    [startOfDay, endOfDay],
  ) as any[];

  const totalScreenTime = sessionsRows.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0,
  );

  const distances = readingsRows
    .filter((r) => r.distance_cm != null)
    .map((r) => r.distance_cm);
  const avgDistance = distances.length
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : null;
  const pctBelow25 = distances.length
    ? (distances.filter((d) => d < 25).length / distances.length) * 100
    : null;

  const luminosities = readingsRows
    .filter((r) => r.luminosity_lux != null)
    .map((r) => r.luminosity_lux);
  const avgLuminosity = luminosities.length
    ? luminosities.reduce((a, b) => a + b, 0) / luminosities.length
    : null;
  const pctLowLight = luminosities.length
    ? (luminosities.filter((l) => l < 100).length / luminosities.length) * 100
    : null;
  const pctNaturalLight = luminosities.length
    ? (luminosities.filter((l) => l > 1000).length / luminosities.length) * 100
    : null;

  const nocturnalCount = sessionsRows.filter((s) => s.is_nocturnal).length;
  const longestSession = sessionsRows.reduce(
    (max, s) => Math.max(max, s.duration_seconds || 0),
    0,
  );

  const totalSuggested = sessionsRows.reduce(
    (sum, s) => sum + (s.pauses_suggested || 0),
    0,
  );
  const totalConfirmed = sessionsRows.reduce(
    (sum, s) => sum + (s.pauses_confirmed || 0),
    0,
  );
  const pauseAdherence =
    totalSuggested > 0 ? (totalConfirmed / totalSuggested) * 100 : null;

  db.runSync(
    `INSERT OR REPLACE INTO daily_summary
     (date, total_screen_time_seconds, avg_distance_cm, pct_time_below_25cm, avg_luminosity_lux,
      pct_time_low_light, pct_time_natural_light_estimated, nocturnal_sessions_count,
      longest_continuous_session_seconds, pause_adherence_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      date,
      totalScreenTime,
      avgDistance,
      pctBelow25,
      avgLuminosity,
      pctLowLight,
      pctNaturalLight,
      nocturnalCount,
      longestSession,
      pauseAdherence,
    ],
  );
}

export function getDailySummaries(daysBack: number) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  return db.getAllSync(
    `SELECT * FROM daily_summary WHERE date >= ? ORDER BY date DESC;`,
    [sinceStr],
  ) as any[];
}

export function getReportAggregates(daysBack: number) {
  const summaries = getDailySummaries(daysBack);
  if (summaries.length === 0) return null;

  const avg = (key: string) => {
    const vals = summaries
      .map((s: any) => s[key])
      .filter((v: any) => v != null);
    return vals.length
      ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
      : null;
  };

  return {
    avgDistanceCm: avg("avg_distance_cm"),
    avgPctBelow25: avg("pct_time_below_25cm"),
    totalScreenTimeHours:
      summaries.reduce(
        (sum: number, s: any) => sum + (s.total_screen_time_seconds || 0),
        0,
      ) / 3600,
    totalNocturnalSessions: summaries.reduce(
      (sum: number, s: any) => sum + (s.nocturnal_sessions_count || 0),
      0,
    ),
    avgPauseAdherence: avg("pause_adherence_rate"),
    dailySummaries: summaries,
  };
}

export default db;
