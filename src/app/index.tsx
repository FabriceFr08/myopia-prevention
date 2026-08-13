import { LightSensor } from "expo-sensors";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  Camera,
  Face,
  FaceDetectionOptions,
} from "react-native-vision-camera-face-detector";
import database, {
  createSession,
  endSession,
  initDatabase,
  insertReading,
} from "../database/database";
import { useSessionTimer } from "../hooks/use-session-timer";

const faceDetectionOptions: FaceDetectionOptions = {
  performanceMode: "fast",
  landmarkMode: "all",
};

const AVERAGE_INTERPUPILLARY_DISTANCE_MM = 63;
const DEFAULT_FOCAL_LENGTH_PX = 500;

function getPixelDistance(
  leftEye: { x: number; y: number },
  rightEye: { x: number; y: number },
): number {
  return Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2),
  );
}

function calculateDistanceCm(
  pixelDistance: number,
  focalLengthPx: number,
): number {
  if (pixelDistance === 0) return 0;
  const distanceMm =
    (AVERAGE_INTERPUPILLARY_DISTANCE_MM * focalLengthPx) / pixelDistance;
  return distanceMm / 10;
}

function debugPrintReadings() {
  const rows = database.getAllSync(
    "SELECT * FROM readings ORDER BY id DESC LIMIT 10;",
  );
  console.log("Dernières lectures:", JSON.stringify(rows, null, 2));
}

export default function Index() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("front");
  const [faceCount, setFaceCount] = useState(0);
  const [distanceCm, setDistanceCm] = useState<number | null>(null);

  const [focalLengthPx, setFocalLengthPx] = useState(DEFAULT_FOCAL_LENGTH_PX);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationInputCm, setCalibrationInputCm] = useState("30");
  const currentPixelDistance = useRef<number>(0);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const sessionStartTime = useRef<number>(0);
  const lastReadingTime = useRef<number>(0);

  const [luminosityLux, setLuminosityLux] = useState<number | null>(null);
  const currentLuminosity = useRef<number | null>(null);

  const [hasFaceNow, setHasFaceNow] = useState(false);
  const {
    elapsedSeconds,
    secondsUntilPause,
    pausesSuggested,
    pausesConfirmed,
    showPausePrompt,
    confirmPause,
    dismissPause,
  } = useSessionTimer(hasFaceNow);

  useEffect(() => {
    let subscription: any = null;

    LightSensor.isAvailableAsync().then((available) => {
      if (available) {
        LightSensor.setUpdateInterval(1000); // une lecture par seconde
        subscription = LightSensor.addListener((data) => {
          setLuminosityLux(data.illuminance);
          currentLuminosity.current = data.illuminance;
        });
      } else {
        console.log("Capteur de luminosité non disponible sur cet appareil");
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    initDatabase();
    const startedAt = new Date().toISOString();
    sessionStartTime.current = Date.now();
    const id = createSession(startedAt);
    setSessionId(id);

    return () => {
      if (id) {
        const durationSeconds = Math.round(
          (Date.now() - sessionStartTime.current) / 1000,
        );
        endSession(id, new Date().toISOString(), durationSeconds);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  function handleFacesDetection(faces: Face[]) {
    setFaceCount(faces.length);
    setHasFaceNow(faces.length > 0);

    const now = Date.now();
    const hasFace = faces.length > 0;
    let currentDistance: number | null = null;

    if (hasFace) {
      const face = faces[0];
      const landmarks = face?.landmarks;
      if (landmarks?.LEFT_EYE && landmarks?.RIGHT_EYE) {
        const pixelDistance = getPixelDistance(
          landmarks.LEFT_EYE,
          landmarks.RIGHT_EYE,
        );
        currentPixelDistance.current = pixelDistance;
        currentDistance = Math.round(
          calculateDistanceCm(pixelDistance, focalLengthPx),
        );
        setDistanceCm(currentDistance);
      }
    } else {
      setDistanceCm(null);
    }

    // Throttling : une écriture toutes les 2.5 secondes maximum
    if (sessionId && now - lastReadingTime.current > 2500) {
      lastReadingTime.current = now;
      insertReading(
        sessionId,
        new Date().toISOString(),
        currentDistance,
        currentLuminosity.current,
        hasFace,
      );
    }
  }

  function handleCalibrate() {
    const knownDistanceCm = parseFloat(calibrationInputCm);
    if (!knownDistanceCm || currentPixelDistance.current === 0) return;

    const newFocalLength =
      (currentPixelDistance.current * knownDistanceCm) /
      (AVERAGE_INTERPUPILLARY_DISTANCE_MM / 10);
    setFocalLengthPx(newFocalLength);
    setIsCalibrating(false);
  }

  if (!hasPermission || device == null) {
    return (
      <View style={styles.center}>
        <Text>Chargement de la caméra...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        faceDetectionCallback={handleFacesDetection}
        faceDetectionOptions={faceDetectionOptions}
      />
      <View style={styles.overlay}>
        <Text style={styles.debugText}>Visages détectés : {faceCount}</Text>
        <Text style={styles.debugText}>
          Distance : {distanceCm !== null ? `${distanceCm} cm` : "—"}
        </Text>
        <Text style={styles.debugText}>
          Luminosité :{" "}
          {luminosityLux !== null ? `${Math.round(luminosityLux)} lux` : "—"}
        </Text>

        <Text style={styles.debugText}>
          Prochaine pause dans : {Math.floor(secondsUntilPause / 60)}:
          {(secondsUntilPause % 60).toString().padStart(2, "0")}
        </Text>

        {showPausePrompt && (
          <View style={styles.pausePanel}>
            <Text style={styles.pauseTitle}>Pause visuelle</Text>
            <Text style={styles.pauseText}>
              Regarde au loin pendant 20 secondes, puis confirme.
            </Text>
            <Pressable style={styles.button} onPress={confirmPause}>
              <Text style={styles.buttonText}>J'ai fait ma pause</Text>
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={dismissPause}>
              <Text style={styles.buttonSecondaryText}>Ignorer</Text>
            </Pressable>
          </View>
        )}
      </View>

      {isCalibrating ? (
        <View style={styles.calibrationPanel}>
          <Text style={styles.calibrationLabel}>
            Place-toi à une distance connue (mesurée avec une règle), entre-la
            ci-dessous, puis valide :
          </Text>
          <TextInput
            style={styles.input}
            value={calibrationInputCm}
            onChangeText={setCalibrationInputCm}
            keyboardType="numeric"
            placeholder="Distance en cm"
          />
          <Pressable style={styles.button} onPress={handleCalibrate}>
            <Text style={styles.buttonText}>Valider la calibration</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.calibrateButton}
          onPress={() => setIsCalibrating(true)}
        >
          <Text style={styles.buttonText}>Calibrer</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: { position: "absolute", top: 40, left: 16 },
  debugText: {
    color: "white",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  calibrateButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "#1D9E75",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  calibrationPanel: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.85)",
    padding: 16,
    borderRadius: 12,
  },
  calibrationLabel: { color: "white", fontSize: 14, marginBottom: 12 },
  input: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#1D9E75",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600" },

  pausePanel: {
    position: "absolute",
    top: "40%",
    left: 24,
    right: 24,
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  pauseTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  pauseText: {
    color: "white",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  buttonSecondary: { paddingVertical: 8 },
  buttonSecondaryText: { color: "#94A3B8", fontSize: 13 },
});
