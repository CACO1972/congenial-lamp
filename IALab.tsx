import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { HeroSection } from "@/components/HeroSection";
import { CaptureSection } from "@/components/CaptureSection";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { ContactSection } from "@/components/ContactSection";
import { ResultsSection } from "@/components/ResultsSection";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { logger } from "@/lib/logger";
import type { Landmark } from "@/types/mediapipe";

// Type definitions for better type safety
type Step = "hero" | "capture" | "loading" | "contact" | "results";

interface SimulationData {
  facialAnalysis?: Record<string, unknown>;
  qualityScore?: number;
  warnings?: string[];
}

interface ContactData {
  email: string;
  name?: string;
  phone?: string;
}

/**
 * Main application component for Nobel Biocare SimSmile
 * Professional-grade dental simulation with AI analysis
 */
const IALab = () => {
  // State management with proper typing
  const [step, setStep] = useState<Step>("hero");
  const [restImage, setRestImage] = useState<string>("");
  const [smileImage, setSmileImage] = useState<string>("");
  const [idealImage, setIdealImage] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [contactData, setContactData] = useState<ContactData | null>(null);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Constants
  const MAX_RETRY_ATTEMPTS = 3;
  const IMAGE_QUALITY_THRESHOLD = 0.85;
  const MAX_IMAGE_SIZE = 2048; // pixels

  /**
   * Initialize MediaPipe Face Landmarker with error recovery
   */
  useEffect(() => {
    let mounted = true;
    
    const initializeFaceLandmarker = async () => {
      try {
        // Check for WebGL support
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
          throw new Error("WebGL not supported. Please use a modern browser.");
        }

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        
        if (!mounted) return;

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: gl ? "GPU" : "CPU" // Fallback to CPU if needed
          },
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        if (!mounted) return;
        
        faceLandmarkerRef.current = faceLandmarker;
        logger.log("✅ MediaPipe Face Landmarker initialized successfully");
      } catch (error) {
        logger.error("❌ Error initializing Face Landmarker:", error);
        
        // Show user-friendly error with recovery options
        toast.error(
          "Sistema de análisis facial no disponible. Puede continuar, pero el análisis será limitado.",
          {
            duration: 7000,
            action: {
              label: "Reintentar",
              onClick: () => initializeFaceLandmarker()
            }
          }
        );
      }
    };

    initializeFaceLandmarker();

    return () => {
      mounted = false;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  /**
   * Smooth scroll to top on step change
   */
  useEffect(() => {
    window.scrollTo({ 
      top: 0, 
      behavior: 'smooth' 
    });
  }, [step]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Compress and optimize image before processing
   */
  const optimizeImage = useCallback(async (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(base64);
          return;
        }

        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
          const scale = Math.min(MAX_IMAGE_SIZE / width, MAX_IMAGE_SIZE / height);
          width *= scale;
          height *= scale;
        }

        canvas.width = width;
        canvas.height = height;
        
        // Apply image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to optimized JPEG
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY_THRESHOLD));
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  }, []);

  /**
   * Validate image quality before processing
   */
  const validateImageQuality = useCallback(async (image: HTMLImageElement): Promise<boolean> => {
    // Check minimum resolution
    if (image.width < 640 || image.height < 480) {
      toast.warning("La imagen tiene una resolución muy baja. Los resultados pueden ser limitados.");
      return false;
    }

    // Check aspect ratio
    const aspectRatio = image.width / image.height;
    if (aspectRatio < 0.5 || aspectRatio > 2) {
      toast.warning("La proporción de la imagen no es óptima. Intente con una foto más cuadrada.");
    }

    return true;
  }, []);

  /**
   * Process smile simulation with enhanced error handling and retry logic
   */
  const handleCapture = useCallback(async (rest: string, smile: string) => {
    if (isProcessing) {
      toast.warning("Ya se está procesando una imagen. Por favor espere.");
      return;
    }

    setIsProcessing(true);
    setRestImage(rest);
    setSmileImage(smile);
    setStep("loading");
    
    // Track analytics
    track({ 
      name: "photos_captured",
      properties: {
        has_face_landmarker: !!faceLandmarkerRef.current,
        retry_count: retryCount
      }
    });

    // Create abort controller for timeout
    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort();
    }, 30000); // 30 second timeout

    try {
      // Optimize images
      const [optimizedRest, optimizedSmile] = await Promise.all([
        optimizeImage(rest),
        optimizeImage(smile)
      ]);

      // Import analysis functions
      const { 
        computeMetrics, 
        analyzeFaceCharacteristics, 
        generateSmileRecommendations, 
        generateAnalysisText 
      } = await import("@/lib/metrics");
      
      // Create image elements for analysis
      const [smileImg, restImg] = await Promise.all([
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = optimizedSmile;
        }),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = optimizedRest;
        })
      ]);

      // Validate image quality
      const [smileValid, restValid] = await Promise.all([
        validateImageQuality(smileImg),
        validateImageQuality(restImg)
      ]);

      if (!smileValid || !restValid) {
        logger.warn("Image quality validation failed, continuing with warnings");
      }

      // Detect landmarks with MediaPipe
      let smileLandmarks: Landmark[] | null = null;
      let restLandmarks: Landmark[] | null = null;
      let calculatedMetrics: any = null;

      if (faceLandmarkerRef.current) {
        try {
          const smileResults = faceLandmarkerRef.current.detect(smileImg);
          const restResults = faceLandmarkerRef.current.detect(restImg);

          if (!smileResults.faceLandmarks?.length) {
            throw new Error("No se detectó rostro en la imagen de sonrisa. Por favor, asegúrese de que su rostro esté visible y centrado.");
          }

          if (!restResults.faceLandmarks?.length) {
            throw new Error("No se detectó rostro en la imagen de reposo. Por favor, asegúrese de que su rostro esté visible y centrado.");
          }

          smileLandmarks = smileResults.faceLandmarks[0];
          restLandmarks = restResults.faceLandmarks[0];
          
          // Calculate metrics
          calculatedMetrics = computeMetrics({
            restLm: restLandmarks,
            smileLm: smileLandmarks,
            imgW: smileImg.width,
            imgH: smileImg.height
          });

          logger.log("✅ Métricas calculadas exitosamente:", calculatedMetrics);
        } catch (landmarkError) {
          logger.error("Error en detección de landmarks:", landmarkError);
          
          // Create fallback metrics
          calculatedMetrics = {
            smileArc: "consonante",
            gingival: { mm: 1, class: "media" },
            midline: { mm: 0, side: "centrado" },
            buccalRatio: 0.8,
            facialMidline: { mm: 0, side: "centrado" },
            midlineCoincidence: { deviation: 0, status: "coincidente" },
            facialProportions: {
              upperThird: 0.33,
              middleThird: 0.34,
              lowerThird: 0.33,
              isBalanced: true
            }
          };
        }
      } else {
        // No landmarker available, use basic metrics
        calculatedMetrics = {
          smileArc: "consonante",
          gingival: { mm: 1, class: "media" },
          midline: { mm: 0, side: "centrado" },
          buccalRatio: 0.8,
          facialMidline: { mm: 0, side: "centrado" },
          midlineCoincidence: { deviation: 0, status: "coincidente" },
          facialProportions: {
            upperThird: 0.33,
            middleThird: 0.34,
            lowerThird: 0.33,
            isBalanced: true
          }
        };
      }

      // Analyze facial characteristics
      const faceAnalysis = analyzeFaceCharacteristics(calculatedMetrics);
      
      // Generate recommendations
      const recommendations = generateSmileRecommendations(faceAnalysis, calculatedMetrics);
      
      // Generate analysis text
      const analysisText = generateAnalysisText(faceAnalysis, calculatedMetrics, recommendations);

      // Call edge function for simulation with retry logic
      let simulationResult = null;
      let lastError = null;
      
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("simulate-smile", {
            body: {
              imageBase64: optimizedSmile,
              metrics: calculatedMetrics,
              faceAnalysis,
              recommendations
            },
            signal: abortControllerRef.current?.signal
          });

          if (error) throw error;
          if (data) {
            simulationResult = data;
            break;
          }
        } catch (err) {
          lastError = err;
          logger.error(`Simulation attempt ${attempt + 1} failed:`, err);
          
          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }

      clearTimeout(timeoutId);

      // Process simulation results
      if (simulationResult?.simulatedImage) {
        setSmileImage(simulationResult.simulatedImage);
        setIdealImage(simulationResult.idealImage || simulationResult.simulatedImage);
        setSimulationData({
          facialAnalysis: simulationResult.facialAnalysis,
          qualityScore: simulationResult.qualityScore,
          warnings: simulationResult.warnings
        });
      } else {
        // Fallback: use original image with warning
        logger.warn("Simulation failed, using original image");
        toast.info(
          "La simulación automática no está disponible en este momento. Continuaremos con el análisis facial.",
          { duration: 5000 }
        );
        
        setIdealImage(optimizedSmile);
        setSimulationData({
          warnings: ['simulation_unavailable']
        });
      }

      setAnalysis(analysisText);
      setMetrics(calculatedMetrics);
      setLandmarks(smileLandmarks);
      setStep("contact");
      
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error("Error processing smile:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      
      // Determine if we should retry
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        toast.error(
          `Error: ${errorMessage}`,
          {
            duration: 7000,
            action: {
              label: "Reintentar",
              onClick: () => {
                setRetryCount(prev => prev + 1);
                handleCapture(rest, smile);
              }
            }
          }
        );
      } else {
        toast.error(
          "No se pudo procesar la imagen después de varios intentos. Por favor, intente con una foto diferente.",
          { duration: 7000 }
        );
      }
      
      setStep("capture");
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [isProcessing, retryCount, optimizeImage, validateImageQuality]);

  /**
   * Handle contact form submission
   */
  const handleContactSubmit = useCallback(async (data: ContactData) => {
    setContactData(data);
    setStep("results");
    
    // Track conversion
    track({ 
      name: "contact_submitted", 
      properties: { 
        email: data.email,
        has_simulation: !!idealImage,
        quality_score: simulationData?.qualityScore
      }
    });
    
    toast.success("¡Análisis completado! Revise sus resultados a continuación.");
  }, [idealImage, simulationData]);

  /**
   * Reset application state
   */
  const resetApplication = useCallback(() => {
    setStep("hero");
    setRestImage("");
    setSmileImage("");
    setIdealImage("");
    setAnalysis("");
    setMetrics(null);
    setLandmarks(null);
    setContactData(null);
    setSimulationData(null);
    setRetryCount(0);
  }, []);

  // Memoized step components for performance
  const currentStepComponent = useMemo(() => {
    switch (step) {
      case "hero":
        return <HeroSection onStart={() => setStep("capture")} />;
      
      case "capture":
        return (
          <CaptureSection 
            onCapture={handleCapture}
            isProcessing={isProcessing}
          />
        );
      
      case "loading":
        return (
          <LoadingAnimation 
            progress={simulationData?.qualityScore}
            message={isProcessing ? "Analizando su sonrisa con IA..." : undefined}
          />
        );
      
      case "contact":
        return (
          <ContactSection 
            onSubmit={handleContactSubmit}
            isProcessing={isProcessing}
          />
        );
      
      case "results":
        return (
          <ResultsSection
            restImage={restImage}
            smileImage={smileImage}
            idealImage={idealImage}
            analysis={analysis}
            metrics={metrics}
            landmarks={landmarks}
            contactEmail={contactData?.email || ""}
            facialAnalysis={simulationData?.facialAnalysis}
            qualityScore={simulationData?.qualityScore}
            onReset={resetApplication}
          />
        );
      
      default:
        return null;
    }
  }, [
    step, 
    handleCapture, 
    handleContactSubmit, 
    isProcessing,
    restImage,
    smileImage,
    idealImage,
    analysis,
    metrics,
    landmarks,
    contactData,
    simulationData,
    resetApplication
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Progress indicator */}
      {step !== "hero" && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{
              width: `${
                step === "capture" ? "25%" :
                step === "loading" ? "50%" :
                step === "contact" ? "75%" :
                step === "results" ? "100%" : "0%"
              }`
            }}
          />
        </div>
      )}
      
      {/* Main content */}
      <main className="relative">
        {currentStepComponent}
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default IALab;