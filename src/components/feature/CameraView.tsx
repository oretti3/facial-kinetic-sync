"use client";

import React, { useEffect, useRef, useState } from "react";
import {
    FilesetResolver,
    PoseLandmarker,
    FaceLandmarker,
    DrawingUtils,
} from "@mediapipe/tasks-vision";
import Webcam from "react-webcam";

const CameraView: React.FC = () => {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<string>("Initializing MediaPipe...");

    // Squat State Refs
    const squatStateRef = useRef<'UP' | 'DOWN'>('UP');
    const squatCountRef = useRef<number>(0);

    useEffect(() => {
        // Suppress specific MediaPipe INFO logs that are printed as errors
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

                // Helper to create landmarker with fallback
                const createLandmarker = async (type: 'pose' | 'face', delegate: 'GPU' | 'CPU') => {
                    if (type === 'pose') {
                        return await PoseLandmarker.createFromOptions(vision, {
                            baseOptions: {
                                modelAssetPath:
                                    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
                                delegate: delegate,
                            },
                            runningMode: "VIDEO",
                            numPoses: 1,
                        });
                    } else {
                        return await FaceLandmarker.createFromOptions(vision, {
                            baseOptions: {
                                modelAssetPath:
                                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                                delegate: delegate,
                            },
                            outputFaceBlendshapes: true,
                            runningMode: "VIDEO",
                            numFaces: 1,
                        });
                    }
                };

                try {
                    console.log("Attempting to initialize MediaPipe with GPU...");
                    poseLandmarker = await createLandmarker('pose', 'GPU') as PoseLandmarker;
                    faceLandmarker = await createLandmarker('face', 'GPU') as FaceLandmarker;
                    console.log("MediaPipe initialized with GPU.");
                } catch (gpuError) {
                    console.warn("GPU initialization failed, falling back to CPU. Error:", gpuError);
                    poseLandmarker = await createLandmarker('pose', 'CPU') as PoseLandmarker;
                    faceLandmarker = await createLandmarker('face', 'CPU') as FaceLandmarker;
                    console.log("MediaPipe initialized with CPU fallback.");
                }

                setStatus(""); // Clear status on success

                // Start detection loop
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
                canvasRef.current
            ) {
                const video = webcamRef.current.video;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext("2d");

                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                if (ctx) {
                    try {
                        const startTimeMs = performance.now();

                        // Perform Detections
                        const poseResult = poseLandmarker.detectForVideo(video, startTimeMs);
                        const faceResult = faceLandmarker.detectForVideo(video, startTimeMs);

                        // Utils
                        const calculateAngle = (a: any, b: any, c: any) => {
                            if (!a || !b || !c) return 180;
                            const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
                            let angle = Math.abs(radians * 180.0 / Math.PI);
                            if (angle > 180.0) angle = 360 - angle;
                            return angle;
                        };

                        // 1. Smile Logic
                        let smileScore = 0;
                        let isSmiling = false;
                        if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
                            const categories = faceResult.faceBlendshapes[0].categories;
                            const smileLeft = categories.find(c => c.categoryName === "mouthSmileLeft")?.score || 0;
                            const smileRight = categories.find(c => c.categoryName === "mouthSmileRight")?.score || 0;
                            smileScore = (smileLeft + smileRight) / 2;
                            if (smileScore > 0.45) isSmiling = true;
                        }

                        // 2. Squat Logic
                        let currentKneeAngle = 180;
                        if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                            const landmarks = poseResult.landmarks[0];
                            const leftHip = landmarks[23];
                            const leftKnee = landmarks[25];
                            const leftAnkle = landmarks[27];
                            const rightHip = landmarks[24];
                            const rightKnee = landmarks[26];
                            const rightAnkle = landmarks[28];
                            let angleL = calculateAngle(leftHip, leftKnee, leftAnkle);
                            let angleR = calculateAngle(rightHip, rightKnee, rightAnkle);
                            currentKneeAngle = Math.min(angleL, angleR);

                            if (squatStateRef.current === 'UP') {
                                if (currentKneeAngle < 100) squatStateRef.current = 'DOWN';
                            } else if (squatStateRef.current === 'DOWN') {
                                if (currentKneeAngle > 160) {
                                    squatStateRef.current = 'UP';
                                    squatCountRef.current += 1;
                                }
                            }
                        }

                        // Clear and Draw
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        const drawingUtils = new DrawingUtils(ctx);

                        // Draw Pose
                        if (poseResult.landmarks) {
                            for (const landmarks of poseResult.landmarks) {
                                drawingUtils.drawLandmarks(landmarks, {
                                    radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
                                    color: "red",
                                    lineWidth: 2
                                });
                                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
                                    color: "white",
                                    lineWidth: 2
                                });
                            }
                        }

                        // Draw Face
                        if (faceResult.faceLandmarks) {
                            for (const landmarks of faceResult.faceLandmarks) {
                                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                                    color: "#C0C0C070",
                                    lineWidth: 1
                                });
                            }
                        }

                        // UI Overlay
                        ctx.fillStyle = "white";
                        ctx.font = "24px Arial";
                        ctx.fillText(`Smile Score: ${smileScore.toFixed(2)}`, 20, 40);

                        ctx.fillText(`Squat Count: ${squatCountRef.current}`, 20, 80);
                        ctx.fillText(`Knee Angle: ${currentKneeAngle.toFixed(0)}°`, 20, 110);
                        ctx.fillText(`State: ${squatStateRef.current}`, 20, 140);

                        // Effects
                        if (isSmiling) {
                            ctx.fillStyle = "#00FF00";
                            ctx.font = "bold 60px Arial";
                            ctx.fillText("😊 SMILING!", 50, 250);

                            ctx.strokeStyle = "#00FF00";
                            ctx.lineWidth = 10;
                            ctx.strokeRect(0, 0, canvas.width, canvas.height);
                        }

                        if (squatStateRef.current === 'DOWN') {
                            ctx.fillStyle = "#FFFF00"; // Yellow
                            ctx.font = "bold 50px Arial";
                            ctx.fillText("⬇️ DOWN", 50, 320);
                        }
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
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "white",
                    zIndex: 20
                }}>
                    {status}
                </div>
            )}
            <Webcam
                ref={webcamRef}
                audio={false}
                width={1280} // Explicit size to match canvas
                height={720}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Mirror
                }}
                videoConstraints={{
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Mirror to match video
                    pointerEvents: "none"
                }}
            />
        </div>
    );
};

export default CameraView;
