"use client";
import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
    FilesetResolver,
    PoseLandmarker,
    FaceLandmarker,
    DrawingUtils,
} from "@mediapipe/tasks-vision";

const CameraView: React.FC = () => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<string>("Initializing MediaPipe...");

    // Toggle for debug visualization
    const [showDebugOverlay, setShowDebugOverlay] = useState<boolean>(true);
    const showDebugOverlayRef = useRef(true);

    // Max People Config
    const [maxPeople, setMaxPeople] = useState<number>(3);
    const maxPeopleRef = useRef<number>(3);

    useEffect(() => {
        showDebugOverlayRef.current = showDebugOverlay;
    }, [showDebugOverlay]);

    useEffect(() => {
        maxPeopleRef.current = maxPeople;
    }, [maxPeople]);

    // Offscreen canvas for face detection zooming - shared instance
    const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // --- ID Tracking System ---
    interface TrackedPerson {
        id: number;
        landmarks: any[]; // Pose landmarks
        lastSeen: number; // Timestamp
        missingFrames: number;
        // Logic State
        squatState: 'UP' | 'DOWN';
        squatCount: number;
        smileScore: number;
        isSmiling: boolean;
        currentKneeAngle: number;
        faceRoi?: { x: number, y: number, width: number, height: number }; // For debug drawing
        faceLandmarks?: any[]; // For debug drawing
    }

    const trackedPersonsRef = useRef<Map<number, TrackedPerson>>(new Map());

    // Config
    const MAX_MISSING_FRAMES = 10; // ~0.3 seconds @ 30fps
    const MATCH_THRESHOLD = 0.2; // Normalized distance (0-1)

    // Toggle handler
    const toggleDebug = () => {
        setShowDebugOverlay(prev => !prev);
    };

    useEffect(() => {
        // Initialize offscreen canvas
        if (!faceCanvasRef.current) {
            faceCanvasRef.current = document.createElement('canvas');
            faceCanvasRef.current.width = 256;
            faceCanvasRef.current.height = 256;
        }

        // Suppress specific MediaPipe INFO logs
        const originalConsoleError = console.error;
        console.error = (...args: any[]) => {
            if (typeof args[0] === 'string' && args[0].includes('Created TensorFlow Lite XNNPACK delegate for CPU')) {
                return;
            }
            originalConsoleError.apply(console, args);
        };

        let poseLandmarker: PoseLandmarker | undefined;
        let faceLandmarker: FaceLandmarker | undefined;
        let animationFrameId: number;

        const initMediaPipe = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                const createLandmarker = async (type: 'pose' | 'face', delegate: 'GPU' | 'CPU') => {
                    if (type === 'pose') {
                        return await PoseLandmarker.createFromOptions(vision, {
                            baseOptions: {
                                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
                                delegate: delegate,
                            },
                            runningMode: "VIDEO",
                            numPoses: 5, // Always detect max, logic handles the limit
                        });
                    } else {
                        // 2. FaceLandmarker (IMAGE mode for crops)
                        return await FaceLandmarker.createFromOptions(vision, {
                            baseOptions: {
                                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                                delegate: delegate,
                            },
                            outputFaceBlendshapes: true,
                            runningMode: "IMAGE",
                            numFaces: 1, // We detect 1 face per crop
                        });
                    }
                };

                try {
                    console.log("Attempting to initialize MediaPipe with GPU...");
                    poseLandmarker = await createLandmarker('pose', 'GPU') as PoseLandmarker;
                    faceLandmarker = await createLandmarker('face', 'GPU') as FaceLandmarker;
                    console.log("MediaPipe initialized with GPU.");
                } catch (gpuError) {
                    console.warn("GPU failed, fallback to CPU", gpuError);
                    poseLandmarker = await createLandmarker('pose', 'CPU') as PoseLandmarker;
                    faceLandmarker = await createLandmarker('face', 'CPU') as FaceLandmarker;
                    console.log("MediaPipe initialized with CPU fallback.");
                }

                setStatus("");
                detect();

            } catch (error) {
                console.error("Error initializing MediaPipe:", error);
                setStatus("Failed to load MediaPipe models.");
            }
        };

        const detect = () => {
            if (
                webcamRef.current &&
                webcamRef.current.video &&
                webcamRef.current.video.readyState === 4 &&
                poseLandmarker &&
                faceLandmarker &&
                canvasRef.current &&
                faceCanvasRef.current
            ) {
                const video = webcamRef.current.video;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext("2d");
                const faceCanvas = faceCanvasRef.current;
                const faceCtx = faceCanvas.getContext("2d");

                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                if (ctx && faceCtx) {
                    try {
                        const startTimeMs = performance.now();

                        // 1. Detect Poses (All)
                        const poseResult = poseLandmarker.detectForVideo(video, startTimeMs);

                        // --- TRACKING LOGIC START ---
                        const detectedPoses = poseResult.landmarks || [];
                        const currentTracked = trackedPersonsRef.current;
                        const newTracked = new Map<number, TrackedPerson>();

                        // Track used IDs for this frame to handle recycling correctly
                        const usedIds = new Set<number>();

                        // Helper: Calculate centroid
                        const getCentroid = (landmarks: any[]) => {
                            const leftHip = landmarks[23];
                            const rightHip = landmarks[24];
                            return {
                                x: (leftHip.x + rightHip.x) / 2,
                                y: (leftHip.y + rightHip.y) / 2
                            };
                        };

                        const detectedItems = detectedPoses.map(landmarks => ({
                            landmarks,
                            centroid: getCentroid(landmarks),
                            matched: false
                        }));

                        // Match existing persons to new detections (Greedy)
                        const activeIds = Array.from(currentTracked.keys());

                        for (const id of activeIds) {
                            const person = currentTracked.get(id)!;

                            // Recycle ID check
                            if (person.missingFrames >= MAX_MISSING_FRAMES) {
                                continue; // Drop person, freeing ID
                            }

                            const prevCentroid = getCentroid(person.landmarks);

                            let bestMatchIndex = -1;
                            let minDist = Infinity;

                            for (let i = 0; i < detectedItems.length; i++) {
                                if (detectedItems[i].matched) continue;

                                const dist = Math.sqrt(
                                    Math.pow(detectedItems[i].centroid.x - prevCentroid.x, 2) +
                                    Math.pow(detectedItems[i].centroid.y - prevCentroid.y, 2)
                                );

                                if (dist < MATCH_THRESHOLD && dist < minDist) {
                                    minDist = dist;
                                    bestMatchIndex = i;
                                }
                            }

                            if (bestMatchIndex !== -1) {
                                const matched = detectedItems[bestMatchIndex];
                                matched.matched = true;
                                newTracked.set(id, {
                                    ...person,
                                    landmarks: matched.landmarks,
                                    lastSeen: startTimeMs,
                                    missingFrames: 0,
                                });
                                usedIds.add(id);
                            } else {
                                newTracked.set(id, {
                                    ...person,
                                    missingFrames: person.missingFrames + 1
                                });
                                usedIds.add(id);
                            }
                        }

                        // Register new persons (Recycle IDs)
                        for (const item of detectedItems) {
                            if (!item.matched) {
                                // Find lowest available ID
                                let assignedId = -1;
                                for (let testId = 1; testId <= maxPeopleRef.current; testId++) {
                                    if (!usedIds.has(testId)) {
                                        assignedId = testId;
                                        break;
                                    }
                                }

                                if (assignedId !== -1) {
                                    newTracked.set(assignedId, {
                                        id: assignedId,
                                        landmarks: item.landmarks,
                                        lastSeen: startTimeMs,
                                        missingFrames: 0,
                                        squatState: 'UP',
                                        squatCount: 0,
                                        smileScore: 0,
                                        isSmiling: false,
                                        currentKneeAngle: 180,
                                    });
                                    usedIds.add(assignedId);
                                }
                            }
                        }

                        trackedPersonsRef.current = newTracked;
                        // --- TRACKING LOGIC END ---


                        // --- PROCESSING LOOP PER PERSON ---
                        for (const person of newTracked.values()) {
                            if (person.missingFrames > 0) continue;

                            const landmarks = person.landmarks;

                            // A. Smart Cropping & Face Detection
                            let faceRoi = { x: 0, y: 0, width: 0, height: 0 };
                            let smileScore = 0;
                            let isSmiling = false;

                            const faceLandmarksIdx = landmarks.slice(0, 11);
                            const xs = faceLandmarksIdx.map((l: any) => l.x);
                            const ys = faceLandmarksIdx.map((l: any) => l.y);
                            const minX = Math.min(...xs) * video.videoWidth;
                            const maxX = Math.max(...xs) * video.videoWidth;
                            const minY = Math.min(...ys) * video.videoHeight;
                            const maxY = Math.max(...ys) * video.videoHeight;

                            const width = maxX - minX;
                            const height = maxY - minY;
                            const padX = width * 0.8;
                            const padY = height * 1.0;

                            const cx = minX + width / 2;
                            const cy = minY + height / 2;

                            const cropSize = Math.max(width + padX, height + padY);

                            let cropX = cx - cropSize / 2;
                            let cropY = cy - cropSize / 2;

                            cropX = Math.max(0, cropX);
                            cropY = Math.max(0, cropY);
                            if (cropX + cropSize > video.videoWidth) cropX = video.videoWidth - cropSize;
                            if (cropY + cropSize > video.videoHeight) cropY = video.videoHeight - cropSize;

                            faceRoi = { x: cropX, y: cropY, width: cropSize, height: cropSize };
                            person.faceRoi = faceRoi;

                            faceCanvas.width = 256;
                            faceCanvas.height = 256;

                            faceCtx.drawImage(
                                video,
                                faceRoi.x, faceRoi.y, faceRoi.width, faceRoi.height,
                                0, 0, faceCanvas.width, faceCanvas.height
                            );

                            const faceResult = faceLandmarker.detect(faceCanvas);

                            if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
                                const categories = faceResult.faceBlendshapes[0].categories;
                                const smileLeft = categories.find(c => c.categoryName === "mouthSmileLeft")?.score || 0;
                                const smileRight = categories.find(c => c.categoryName === "mouthSmileRight")?.score || 0;
                                smileScore = (smileLeft + smileRight) / 2;
                                if (smileScore > 0.45) isSmiling = true;
                            }
                            person.smileScore = smileScore;
                            person.isSmiling = isSmiling;

                            if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                                person.faceLandmarks = faceResult.faceLandmarks[0].map((point: any) => ({
                                    x: (cropX + point.x * cropSize) / video.videoWidth,
                                    y: (cropY + point.y * cropSize) / video.videoHeight,
                                    z: point.z,
                                    visibility: point.visibility
                                }));
                            } else {
                                person.faceLandmarks = undefined;
                            }

                            // B. Squat Logic
                            const calculateAngle = (a: any, b: any, c: any) => {
                                if (!a || !b || !c) return 180;
                                const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
                                let angle = Math.abs(radians * 180.0 / Math.PI);
                                if (angle > 180.0) angle = 360 - angle;
                                return angle;
                            };
                            const leftHip = landmarks[23];
                            const leftKnee = landmarks[25];
                            const leftAnkle = landmarks[27];
                            const rightHip = landmarks[24];
                            const rightKnee = landmarks[26];
                            const rightAnkle = landmarks[28];
                            let angleL = calculateAngle(leftHip, leftKnee, leftAnkle);
                            let angleR = calculateAngle(rightHip, rightKnee, rightAnkle);
                            const currentKneeAngle = Math.min(angleL, angleR);
                            person.currentKneeAngle = currentKneeAngle;

                            if (person.squatState === 'UP') {
                                if (currentKneeAngle < 100) person.squatState = 'DOWN';
                            } else if (person.squatState === 'DOWN') {
                                if (currentKneeAngle > 160) {
                                    person.squatState = 'UP';
                                    if (isSmiling) {
                                        person.squatCount += 1;
                                    }
                                }
                            }
                        }


                        // --- DRAWING ---
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        // 1. Mirrored Drawing (Skeleton, Mesh)
                        ctx.save();
                        ctx.scale(-1, 1);
                        ctx.translate(-canvas.width, 0);

                        const drawingUtils = new DrawingUtils(ctx);

                        // Only draw graphical elements if Debug is ON
                        if (showDebugOverlayRef.current) {
                            for (const person of trackedPersonsRef.current.values()) {
                                if (person.missingFrames > 10) continue;
                                const landmarks = person.landmarks;

                                // Skeleton
                                drawingUtils.drawLandmarks(landmarks, {
                                    radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
                                    color: "red",
                                    lineWidth: 2
                                });
                                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
                                    color: "white",
                                    lineWidth: 2
                                });

                                // ROI
                                if (person.faceRoi) {
                                    ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
                                    ctx.lineWidth = 2;
                                    ctx.strokeRect(person.faceRoi.x, person.faceRoi.y, person.faceRoi.width, person.faceRoi.height);
                                }

                                // Face Mesh
                                if (person.faceLandmarks) {
                                    drawingUtils.drawConnectors(person.faceLandmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                                        color: "#C0C0C070",
                                        lineWidth: 1
                                    });
                                }
                            }
                        }
                        ctx.restore();


                        // 2. Text/Info Overlay (Non-mirrored)
                        for (const person of trackedPersonsRef.current.values()) {
                            if (person.missingFrames > 10) continue;

                            // Calculate Forehead Position
                            const nose = person.landmarks[0];
                            // Video is mirrored on screen: pixel x = width - (normX * width)
                            const screenX = canvas.width - (nose.x * canvas.width);
                            const screenY = (nose.y * canvas.height) - 150; // Use user's preferred offset

                            const isDebug = showDebugOverlayRef.current;

                            // Dimensions & Content depending on mode
                            const boxW = isDebug ? 180 : 120;
                            const boxH = isDebug ? 140 : 80;

                            // Background Color Logic
                            // Pink if smiling, semi-transparent black otherwise
                            const bgColor = person.isSmiling
                                ? "rgba(255, 105, 180, 0.7)"
                                : "rgba(0, 0, 0, 0.6)";

                            // Draw Box
                            ctx.fillStyle = bgColor;
                            ctx.fillRect(screenX - boxW / 2, screenY - boxH / 2, boxW, boxH);

                            // Draw Text
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";

                            if (isDebug) {
                                // --- DEBUG MODE (Full Info) ---
                                let currentY = screenY - boxH / 2 + 20;

                                // ID
                                ctx.fillStyle = "#00FFFF";
                                ctx.font = "bold 16px Arial";
                                ctx.fillText(`ID: ${person.id}`, screenX, currentY);
                                currentY += 25;

                                // Squats
                                ctx.fillStyle = "white";
                                ctx.font = "18px Arial";
                                ctx.fillText(`Squats: ${person.squatCount}`, screenX, currentY);
                                currentY += 25;

                                // Smile Score
                                ctx.fillText(`Smile: ${(person.smileScore * 100).toFixed(0)}%`, screenX, currentY);
                                currentY += 25;

                                // Knee Angle
                                ctx.fillText(`Angle: ${person.currentKneeAngle.toFixed(0)}°`, screenX, currentY);
                                currentY += 25;

                                // Status State
                                if (person.isSmiling) {
                                    ctx.fillStyle = "#FFFFFF";
                                    ctx.fillText("😊 SMILING", screenX, currentY);
                                } else if (person.squatState === 'DOWN') {
                                    ctx.fillStyle = "#FFFF00";
                                    ctx.fillText("⬇️ DOWN", screenX, currentY);
                                }

                            } else {
                                // --- SIMPLE MODE (Clean UI) ---
                                // Focus: Squat Count
                                ctx.fillStyle = "white";
                                ctx.font = "bold 40px Arial";
                                ctx.fillText(`${person.squatCount}`, screenX, screenY - 10);

                                // Smile Status / Feedback
                                ctx.font = "20px Arial";
                                if (person.isSmiling) {
                                    ctx.fillText("😊 Good!", screenX, screenY + 25);
                                } else if (person.squatState === 'DOWN') {
                                    ctx.fillStyle = "#FFFF00";
                                    ctx.fillText("Wait...", screenX, screenY + 25);
                                } else if (person.missingFrames > 0) {
                                    ctx.fillStyle = "red";
                                    ctx.fillText("Searching...", screenX, screenY + 25);
                                } else {
                                    // Idle
                                    ctx.fillStyle = "#AAAAAA";
                                    ctx.font = "16px Arial";
                                    ctx.fillText("Squat & Smile", screenX, screenY + 25);
                                }
                            }
                        }

                        // Debug Status Text (Always visible top left, but style changes)
                        ctx.textAlign = "left";
                        ctx.textBaseline = "alphabetic";
                        ctx.fillStyle = "white";
                        ctx.font = "16px Arial";

                        const visibleCount = Array.from(newTracked.values()).filter(p => p.missingFrames === 0).length;
                        const lostCount = newTracked.size - visibleCount;

                        ctx.fillText(`Visible: ${visibleCount} (Wait: ${lostCount}) / Max: ${maxPeopleRef.current}`, 20, 30);

                        ctx.fillStyle = showDebugOverlayRef.current ? "#00FFFF" : "#AAAAAA";
                        ctx.fillText(showDebugOverlayRef.current ? "Debug: ON" : "Debug: OFF", 20, 50);

                    } catch (error) {
                        console.error("Detection Loop Error:", error);
                    }
                }
            }
            animationFrameId = requestAnimationFrame(detect);
        };

        initMediaPipe();

        return () => {
            console.error = originalConsoleError;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (poseLandmarker) poseLandmarker.close();
            if (faceLandmarker) faceLandmarker.close();
        };
    }, []);

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#000",
            }}
        >
            {status && (
                <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)", color: "white", zIndex: 20
                }}>
                    {status}
                </div>
            )}

            {/* Top Right Controls */}
            <div style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                zIndex: 30,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                alignItems: "flex-end"
            }}>
                <button
                    onClick={toggleDebug}
                    style={{
                        padding: "10px 20px",
                        backgroundColor: "rgba(0, 0, 0, 0.6)",
                        color: "white",
                        border: "1px solid white",
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontSize: "16px",
                    }}
                >
                    {showDebugOverlay ? "Debug View: ON" : "Debug View: OFF"}
                </button>

                <div style={{
                    padding: "10px",
                    backgroundColor: "rgba(0, 0, 0, 0.6)",
                    borderRadius: "5px",
                    border: "1px solid white",
                    color: "white",
                    display: "flex",
                    alignItems: "center"
                }}>
                    <label style={{ marginRight: "10px", fontSize: "16px" }}>Max People:</label>
                    <select
                        value={maxPeople}
                        onChange={(e) => setMaxPeople(Number(e.target.value))}
                        style={{ color: "black", padding: "5px", cursor: "pointer", fontSize: "16px", borderRadius: "3px" }}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                    </select>
                </div>
            </div>

            <Webcam
                ref={webcamRef}
                audio={false}
                width={1280}
                height={720}
                style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    objectFit: "cover", transform: "scaleX(-1)",
                }}
                videoConstraints={{
                    facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    objectFit: "cover", pointerEvents: "none"
                }}
            />
        </div>
    );
};

export default CameraView;
