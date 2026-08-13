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

export default function Index() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("front");
  const [faceCount, setFaceCount] = useState(0);
  const [distanceCm, setDistanceCm] = useState<number | null>(null);

  const [focalLengthPx, setFocalLengthPx] = useState(DEFAULT_FOCAL_LENGTH_PX);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationInputCm, setCalibrationInputCm] = useState("30");
  const currentPixelDistance = useRef<number>(0);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  function handleFacesDetection(faces: Face[]) {
    setFaceCount(faces.length);

    if (faces.length === 0) {
      setDistanceCm(null);
      return;
    }

    const face = faces[0];
    const landmarks = face?.landmarks;

    if (landmarks?.LEFT_EYE && landmarks?.RIGHT_EYE) {
      const pixelDistance = getPixelDistance(
        landmarks.LEFT_EYE,
        landmarks.RIGHT_EYE,
      );
      currentPixelDistance.current = pixelDistance;
      setDistanceCm(
        Math.round(calculateDistanceCm(pixelDistance, focalLengthPx)),
      );
    } else {
      setDistanceCm(null);
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
});
