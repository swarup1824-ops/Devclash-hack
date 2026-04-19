/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  addDoc,
  collection,
  getDoc,
  getDocFromServer,
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { 
  Send, 
  User, 
  Code, 
  Briefcase, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  Lightbulb,
  XCircle,
  Loader2,
  ChevronRight,
  MessageSquare,
  Sparkles,
  BarChart3,
  RefreshCcw,
  UserCheck,
  ShieldAlert,
  Lock,
  Bot,
  Mic,
  Square,
  Clock,
  History,
  Target,
  Zap,
  Activity,
  AudioLines,
  LayoutDashboard,
  Video,
  PlayCircle,
  Settings,
  Brain,
  Mail,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  ChevronDown,
  ChevronUp,
  Globe,
  Phone,
  LogOut,
  ShieldCheck,
  Moon,
  Sun,
  Monitor,
  Key,
  ShieldQuestion,
  Info,
  ArrowLeft,
  FileText,
  Upload,
  Trash2,
  PieChart as LucidePieChart
} from 'lucide-react';

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();

async function testConnection() {
  const testId = 'connection-diagnostic';
  try {
    // Attempting a read to verify connectivity
    await getDocFromServer(doc(db, 'users', auth.currentUser?.uid || 'anonymous'));
  } catch (error: any) {
    if(error.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Types & Interfaces
type Role = 'Frontend' | 'Backend' | 'HR' | 'Product Manager' | 'Fullstack' | 'Data Analyst' | 'Mobile Developer';
type ExperienceLevel = 'Student' | 'Beginner' | 'Intermediate' | 'Expert';
type CompanyType = 'Service' | 'Product' | 'Startup' | 'Fintech' | 'SaaS';
type AppView = 'login' | 'signup' | 'home' | 'analysis' | 'mock-test' | 'live-interview' | 'live-peer' | 'profile';

interface MomentFeedback {
  timestamp: string;
  transcript: string;
  issue: string;
  impact: 'High' | 'Medium' | 'Low';
  suggestion: string;
  logicSweep: string;
  hiringImpact: string;
  improvementProtocol: string;
}

interface AnalysisResult {
  score: number;
  rejectionReasons: string[];
  mistakes: string[];
  weaknesses: {
    pattern: string;
    impact: number;
    description: string;
  }[];
  speechMetrics: {
    fillerWords: number;
    pacing: 'Fast' | 'Normal' | 'Slow';
    fillerWordsList: string[];
    articulation: number;
  };
  momentSpecificFeedback: MomentFeedback[];
  improvedAnswer: string;
  improvementPlan: {
    goal: string;
    actions: string[];
  }[];
  metrics: {
    confidence: number;
    clarity: number;
    technicalDepth: number;
    relevance: number;
    logic: number;
    approach: number;
    hiringPotential: number;
  };
  chartData: { name: string; value: number }[];
  hiringPotentialIndex: { name: string; value: number }[];
  topicDistribution: { name: string; value: number }[];
  hiringPerspective: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  feedback?: {
    score: number;
    improvement: string;
  };
}

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

const handleFirestoreError = (error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null) => {
  if (error && (error.code === 'permission-denied' || (error.message && error.message.includes('insufficient permissions')))) {
     const authInfo = auth.currentUser ? {
        userId: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        emailVerified: auth.currentUser.emailVerified,
        isAnonymous: auth.currentUser.isAnonymous,
        providerInfo: auth.currentUser.providerData.map(p => ({ providerId: p.providerId, displayName: p.displayName || '', email: p.email || '' }))
     } : {
        userId: 'anonymous',
        email: '',
        emailVerified: false,
        isAnonymous: true,
        providerInfo: []
     };

     const info: FirestoreErrorInfo = {
        error: error.message || 'Permission Denied',
        operationType,
        path,
        authInfo
     };
     throw new Error(JSON.stringify(info));
  }
  throw error;
};

// Constants
const ROLES: Role[] = ['Frontend', 'Backend', 'HR', 'Product Manager', 'Fullstack', 'Data Analyst', 'Mobile Developer'];
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Student', 'Beginner', 'Intermediate', 'Expert'];

const paperDatabase: Record<Role, Record<CompanyType, { id: string; title: string; questions: string[] }[]>> = {
  'Frontend': {
    'Service': [{ id: 'fe-s-1', title: 'Web Fundamentals (Service)', questions: ['What are the different types of semantic tags in HTML5?', 'Explain the CSS Box Model.', 'Difference between var, let, and const in JS?'] }],
    'Product': [{ id: 'fe-p-1', title: 'React Architecture (Product)', questions: ['How does React reconciliation work?', 'Explain the Fiber architecture.', 'Deep dive: How would you optimize a large-scale data table?'] }],
    'Startup': [{ id: 'fe-st-1', title: 'Rapid Deployment (Startup)', questions: ['How do you handle state management in a fast-paced environment?', 'What is your strategy for optimizing Next.js Core Web Vitals?', 'Explain CSS-in-JS vs Utility-First CSS tradeoffs.'] }],
    'Fintech': [{ id: 'fe-f-1', title: 'Secure UI (Fintech)', questions: ['How do you protect a React app from XSS and CSRF?', 'Explain how to handle high-precision currency input/display.', 'Strategies for real-time stock chart rendering performance.'] }],
    'SaaS': [{ id: 'fe-sa-1', title: 'Multi-Tenant UI (SaaS)', questions: ['How do you implement white-labeling in a frontend app?', 'Explain micro-frontend architecture in a SaaS context.', 'Optimizing complex dashboard layouts for multi-tenant users.'] }]
  },
  'Backend': {
    'Service': [{ id: 'be-s-1', title: 'Java/SQL Core (Service)', questions: ['Explain ACID properties in DBMS.', 'Difference between abstract class and interface.', 'How do you handle exceptions in a standard REST API?'] }],
    'Product': [{ id: 'be-p-1', title: 'Distributed Systems (Product)', questions: ['Explain the CAP theorem and its implications.', 'How would you design a distributed rate-limiter?', 'Strategies for handling eventual consistency in microservices.'] }],
    'Startup': [{ id: 'be-st-1', title: 'Scale & Agility (Startup)', questions: ['When to choose RabbitMQ vs Kafka?', 'How do you structure microservices for rapid iteration?', 'Explain your approach to database migration in a CD/CD pipeline.'] }],
    'Fintech': [{ id: 'be-f-1', title: 'Transactional Integrity (Fintech)', questions: ['How do you ensure idempotency in payment processing?', 'Explain the Saga pattern for distributed transactions.', 'Handling PCI-DSS compliance in backend architecture.'] }],
    'SaaS': [{ id: 'be-sa-1', title: 'Tenant Isolation (SaaS)', questions: ['Explain the difference between silo, bridge, and pool models in multi-tenancy.', 'Implementing dynamic resource scaling for SaaS tenants.', 'Audit logging strategies for enterprise-grade SaaS.'] }]
  },
  'HR': {
    'Service': [{ id: 'hr-s-1', title: 'Culture Fit (Service)', questions: ['Why do you want to work for a service-based organization?', 'How do you handle client communications?', 'Describe a time you followed a strict process.'] }],
    'Product': [{ id: 'hr-p-1', title: 'Visionary Mindset (Product)', questions: ['How do you prioritize user value over features?', 'Tell me about a time you challenged a product decision.', 'What is your long-term vision for this product?'] }],
    'Startup': [{ id: 'hr-st-1', title: 'The Hustle (Startup)', questions: ['How do you handle extreme ambiguity?', 'Describe a time you wore multiple hats to ship a project.', 'What is your appetite for risk?'] }],
    'Fintech': [{ id: 'hr-f-1', title: 'Reliability (Fintech)', questions: ['Describe a time you handled a critical system failure.', 'How do you balance speed with security/accuracy?', 'How do you approach heavy regulation in workflows?'] }],
    'SaaS': [{ id: 'hr-sa-1', title: 'Retention Focus (SaaS)', questions: ['How do you keep users engaged in a subscription model?', 'Explain how you would handle an enterprise customer escalation.', 'Thoughts on the "Product-Led Growth" strategy.'] }]
  },
  'Product Manager': {
    'Service': [{ id: 'pm-s-1', title: 'Project Specs (Service)', questions: ['How do you gather requirements from non-technical clients?', 'Managing timeline vs scope in fixed-bid projects.', 'What is your change request process?'] }],
    'Product': [{ id: 'pm-p-1', title: 'Market Fit (Product)', questions: ['How do you measure PMF (Product-Market Fit)?', 'Describe your data-driven prioritization framework (RICE vs Kano).', 'How do you handle technical debt vs new features?'] }],
    'Startup': [{ id: 'pm-st-1', title: 'Iteration Velocity (Startup)', questions: ['Explain your MVP strategy for a new social app.', 'How do you use user feedback for weekly pivots?', 'Designing features for virality.'] }],
    'Fintech': [{ id: 'pm-f-1', title: 'Trust & Flow (Fintech)', questions: ['How do you design for friction-less yet secure KYC?', 'Metrics that matter for a digital wallet.', 'Handling regulatory friction in user onboarding.'] }],
    'SaaS': [{ id: 'pm-sa-1', title: 'Churn & Expansion (SaaS)', questions: ['How do you reduce monthly churn?', 'Explain the strategy for upselling to enterprise tiers.', 'Feature gating strategies for different SaaS plans.'] }]
  },
  'Fullstack': {
    'Service': [{ id: 'fs-s-1', title: 'Full Stack Delivery (Service)', questions: ['How do you connect a React frontend with a Java/Spring backend?', 'Explain basic CRUD operations with simple auth.', 'Deploying apps to a traditional VPS.'] }],
    'Product': [{ id: 'fs-p-1', title: 'System Orchestration (Product)', questions: ['Explain server-side rendering (SSR) vs static site generation (SSG).', 'How do you handle auth across micro-frontends and micro-services?', 'Implementing real-time sync with WebSockets and Redis.'] }],
    'Startup': [{ id: 'fs-st-1', title: 'Agile Fullstack (Startup)', questions: ['Building a T3 stack app (Next, tRPC, Tailwind, Prisma).', 'Strategies for rapid database schema evolution.', 'Full-stack testing in a CI/CD environment.'] }],
    'Fintech': [{ id: 'fs-f-1', title: 'Financial Resilience (Fintech)', questions: ['Implementing transaction-safe atomic operations on the frontend.', 'Handling banking API integrations (Plaid/Stripe).', 'Ensuring end-to-end encryption in full-stack flows.'] }],
    'SaaS': [{ id: 'fs-sa-1', title: 'SaaS Platform (SaaS)', questions: ['Designing a multi-tenant database for high scalability.', 'Implementing feature flags across the entire stack.', 'Building a self-service usage-based billing platform.'] }]
  },
  'Data Analyst': {
    'Service': [{ id: 'da-s-1', title: 'SQL Fundamentals (Service)', questions: ['Explain JOIN types in SQL.', 'What is normalization?', 'How to handle NULL values?'] }],
    'Product': [{ id: 'da-p-1', title: 'Statistical Modeling (Product)', questions: ['Explain p-value and its significance.', 'How do you handle outliers?', 'Difference between correlation and causation.'] }],
    'Startup': [{ id: 'da-st-1', title: 'Rapid Insights (Startup)', questions: ['How to build a dashboard from scratch in 24h?', 'Which metrics matter for a social app?', 'Explaining data trends to non-technical stakeholders.'] }],
    'Fintech': [{ id: 'da-f-1', title: 'Risk Analytics (Fintech)', questions: ['How to detect anomalous transactions?', 'Explain fraud detection models.', 'Predicting market volatility with historical data.'] }],
    'SaaS': [{ id: 'da-sa-1', title: 'Churn Prediction (SaaS)', questions: ['Variables for predicting subscription churn.', 'Cohort analysis fundamentals.', 'Calculating LTV accurately.'] }]
  },
  'Mobile Developer': {
    'Service': [{ id: 'mb-s-1', title: 'App Lifecycle (Service)', questions: ['Difference between Activity and Fragment (Android) or View/ViewController (iOS)?', 'How to handle deep links?', 'Basic UI layout best practices.'] }],
    'Product': [{ id: 'mb-p-1', title: 'Mobile Performance (Product)', questions: ['Optimizing list scrolling performance.', 'Memory management in mobile apps.', 'Strategies for offline-first architecture.'] }],
    'Startup': [{ id: 'mb-st-1', title: 'Agile Mobile (Startup)', questions: ['When to use Flutter vs React Native vs Native?', 'Handling rapid feature flags on mobile.', 'Mobile CI/CD pipeline automation.'] }],
    'Fintech': [{ id: 'mb-f-1', title: 'Mobile Security (Fintech)', questions: ['Implementing biometric auth securely.', 'Secure storage on mobile devices (KeyStore/Keychain).', 'Preventing man-in-the-middle attacks on mobile.'] }],
    'SaaS': [{ id: 'mb-sa-1', title: 'Adaptive UI (SaaS)', questions: ['Handling multi-tenant themes on mobile.', 'Optimizing dashboard complexity for small screens.', 'Mobile push notification strategies for high retention.'] }]
  }
};

// Main Component
export default function App() {
  const [view, setView] = useState<AppView>('login');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<Role>('Frontend');
  const [experience, setExperience] = useState<ExperienceLevel>('Beginner');

  // Common State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- AUTH STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [showPassword, setShowPassword] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('laboratory-theme');
      return (saved as 'dark' | 'light' | 'system') || 'dark';
    }
    return 'dark';
  });

  // --- ANALYSIS VIEW STATE ---
  const [analysisText, setAnalysisText] = useState('');
  const [debriefResult, setDebriefResult] = useState<AnalysisResult | null>(null);
  const [mockResult, setMockResult] = useState<AnalysisResult | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'debrief' | 'mock'>('debrief');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null); // Legacy, will replace with mediaBlob
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string>('');
  const [mediaName, setMediaName] = useState<string>('');
  
  // Segmentation State
  const [isSplitting, setIsSplitting] = useState(false);
  const [processedChunks, setProcessedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [progressTarget, setProgressTarget] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'upload' | 'analysis'>('idle');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // --- LIVE INTERVIEW STATE ---
  const [liveChat, setLiveChat] = useState<ChatMessage[]>([]);
  const [liveInput, setLiveInput] = useState('');
  const [isFetchingQuestion, setIsFetchingQuestion] = useState(false);
  const liveChatEndRef = useRef<HTMLDivElement>(null);

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  // --- VIEW SPECIFIC STATE (Hoisted to fix Rules of Hooks) ---
  const [expandedMoment, setExpandedMoment] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<CompanyType>('Product');
  const [activePaper, setActivePaper] = useState<{ id: string; title: string; questions: string[] } | null>(null);
  const [mockAnswers, setMockAnswers] = useState<Record<string, string>>({});

  // --- PLAGIARISM PROTECTION ---
  const [violationCount, setViolationCount] = useState(0);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionTimer, setSuspensionTimer] = useState(0);
  const [violationType, setViolationType] = useState<string | null>(null);

  // --- THEME ENGINE ---
  useEffect(() => {
    const root = window.document.documentElement;
    localStorage.setItem('laboratory-theme', themeMode);
    
    if (themeMode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.toggle('dark', systemTheme === 'dark');
    } else {
      root.classList.toggle('dark', themeMode === 'dark');
    }
  }, [themeMode]);

  // --- SMOOTH PROGRESS ENGINE ---
  useEffect(() => {
    if (analysisPhase === 'idle') {
      setSmoothProgress(0);
      setProgressTarget(0);
      return;
    }

    let rafId: number;
    const animate = () => {
      setSmoothProgress(prev => {
        if (prev < progressTarget) {
          const diff = progressTarget - prev;
          // Faster movement for larger gaps, steady climb for smaller ones
          const step = Math.max(0.1, diff * 0.1); 
          return Math.min(prev + step, progressTarget);
        }
        return prev;
      });
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [progressTarget, analysisPhase]);

  // --- FIREBASE AUTH OBSERVER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDocFromServer(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setFullName(data.fullName || '');
            setRole(data.role as Role || 'Frontend');
            setExperience(data.experience as ExperienceLevel || 'Beginner');
            setPhone(data.phone || '+91 ');
          }
        } catch (err) {
          console.error("Error fetching user doc:", err);
          try { handleFirestoreError(err, 'get', `users/${currentUser.uid}`); } catch (e) { console.error("Enriched Error:", e); }
        }
        if (view === 'login' || view === 'signup') {
          setView('home');
        }
      } else {
        if (view !== 'login' && view !== 'signup') {
          setView('login');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDocFromServer(userRef);
      
      if (!userSnap.exists()) {
        try {
          await setDoc(userRef, {
            uid: user.uid,
            fullName: user.displayName || '',
            email: user.email || '',
            role: 'Frontend',
            experience: 'Beginner',
            phone: '+91 ',
            createdAt: serverTimestamp()
          });
        } catch (err) {
           handleFirestoreError(err, 'create', `users/${user.uid}`);
        }
      }
      setView('home');
    } catch (err) {
      console.error("Google Auth Error:", err);
      setError("Strategic Sync Failed: Could not initialize Google Identity.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('login');
      setEmail('');
      setPassword('');
      setPhone('+91 ');
      setFullName('');
    } catch (err) {
      console.error("Logout Error:", err);
    }
  };

  // --- PLAGIARISM PROTECTION & REFRESH PREVENTION ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnalyzing) {
        e.preventDefault();
        e.returnValue = 'Analysis is in progress. Refreshing will lose your progress.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnalyzing]);

  useEffect(() => {
    if (isSuspended && suspensionTimer > 0) {
      const timer = setInterval(() => {
        setSuspensionTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (isSuspended && suspensionTimer === 0) {
      setIsSuspended(false);
      setViolationCount(0);
    }
  }, [isSuspended, suspensionTimer]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (view === 'live-interview' || view === 'mock-test')) {
        handleViolation('Unauthorized Tab Migration Detected');
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [view, isSuspended]);

  const handleViolation = (reason: string) => {
    if (isSuspended) return;
    setViolationCount(prev => {
      const next = prev + 1;
      if (next >= 4) {
        setIsSuspended(true);
        setSuspensionTimer(30);
        setViolationType(null); 
        return next;
      }
      setViolationType(reason);
      return next;
    });
  };

  const handlePasteViolation = (e: React.ClipboardEvent) => {
    if (view === 'live-interview' || view === 'mock-test') {
      e.preventDefault();
      handleViolation('Plagiarism/Paste Protocol Violation');
    }
  };

  // --- CONSTANTS MOVED TO TOP ---

  // Helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // --- RECORDING LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setMediaBlob(blob);
        setMediaMimeType('audio/webm');
        setMediaName('Recorded Session.webm');
        setAudioBlob(blob); // Maintain compatibility for now
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch {
      setError('Acoustic hardware access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Allow larger files now as we are chunking on server
      if (file.size > 500 * 1024 * 1024) {
        setError('File size too massive. Limit is 500MB.');
        return;
      }
      setMediaBlob(file);
      setMediaMimeType(file.type);
      setMediaName(file.name);
      setAudioBlob(file.type.startsWith('audio') ? file : null);
    }
  };

  const splitMedia = async (file: Blob): Promise<{ jobId: string, segments: { id: number, url: string, filename: string }[] }> => {
    setIsSplitting(true);
    setAnalysisPhase('upload');
    setAnalysisStatus('Segmenting media for high-fidelity mapping...');
    
    // Parallel Chunked upload logic
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const jobId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const CONCURRENCY_LIMIT = 3;

    try {
      const uploadChunk = async (i: number) => {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('jobId', jobId);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());

        const resp = await fetch('/api/upload-chunk', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error(`Chunk ${i} upload failed: ${resp.status}`);
        
        setProcessedChunks(prev => {
          const next = prev + 1;
          // Upload is 0-40% of the total process
          setProgressTarget((next / totalChunks) * 40);
          return next;
        });
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setAnalysisStatus(`Uploading Media: Neural Data Stream at ${progress}%...`);
      };

      setTotalChunks(totalChunks);
      setProcessedChunks(0);
      setProgressTarget(0);
      
      const chunks = Array.from({ length: totalChunks }, (_, i) => i);
      for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
        const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(uploadChunk));
      }

      setAnalysisStatus('Assembling Mapping Matrix...');
      const finalizeResp = await fetch('/api/finalize-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, totalChunks, originalName: mediaName })
      });

      const contentType = finalizeResp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`Server Finalization Error (${finalizeResp.status})`);
      }

      const result = await finalizeResp.json();
      if (!finalizeResp.ok) throw new Error(result.error || 'Segmentation Error');
      
      return result;
    } catch (err: any) {
      console.error('Split Request Error:', err);
      throw err;
    } finally {
      setIsSplitting(false);
    }
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // --- CORE ANALYSIS ENGINE ---
  const analyzeInterview = async () => {
    if (!analysisText.trim() && !mediaBlob) {
      setError('Provide text, audio, or video data for mapping.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setAnalysisStatus('Initializing Laboratory Audit...');

    try {
      let parsed: AnalysisResult;

      if (mediaBlob) {
        const splitData = await splitMedia(mediaBlob);
        
        const { segments } = splitData;
        setAnalysisPhase('analysis');
        setTotalChunks(segments.length);
        setProcessedChunks(0);
        setProgressTarget(40); // Start analysis phase at 40%
        const chunkAnalyses: any[] = [];

        // --- PARALLEL PROCESSING ENGINE ---
        const CONCURRENCY_LIMIT = 4; 
        
        const analyzeSegment = async (segment: any) => {
          let attempt = 0;
          let success = false;
          let segmentResult: any = null;

          while (attempt < 5 && !success) {
            try {
              setAnalysisStatus(`Neural Scan: Concurrent Processing Active...`);
              
              const blobResp = await fetch(segment.url);
              const blob = await blobResp.blob();
              const base64 = await blobToBase64(blob);

              const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview", 
                contents: [
                  {
                    role: "user",
                    parts: [
                      { 
                        inlineData: { 
                          data: base64, 
                          mimeType: mediaMimeType || "audio/webm" 
                        } 
                      },
                      { text: `Analyze this interview segment (${segment.id + 1}/${segments.length}). Role: ${role}, Level: ${experience}. Return detailed feedback in JSON.` }
                    ]
                  }
                ],
                config: { responseMimeType: "application/json" }
              });

              if (response.text) {
                try {
                  segmentResult = JSON.parse(response.text);
                } catch {
                  const match = response.text.match(/\{[\s\S]*\}/);
                  if (match) segmentResult = JSON.parse(match[0]);
                }
                if (segmentResult) {
                  chunkAnalyses.push(segmentResult);
                  success = true;
                  setProcessedChunks(prev => {
                    const next = prev + 1;
                    // Analysis is 40-100% of the total process
                    setProgressTarget(40 + (next / segments.length) * 60);
                    return next;
                  });
                }
              }
            } catch (err: any) {
              const isRateLimited = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
              if (isRateLimited && attempt < 4) {
                const waitTime = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                await delay(waitTime);
                attempt++;
              } else {
                throw err;
              }
            }
          }
          if (!success) {
            throw new Error(`Critical quota failure at segment ${segment.id + 1}.`);
          }
        };

        // Correct way to handle pool with limit
        const activeTasks: Promise<void>[] = [];
        for (const segment of segments) {
          const task = analyzeSegment(segment).then(() => {
            activeTasks.splice(activeTasks.indexOf(task), 1);
          });
          activeTasks.push(task);
          if (activeTasks.length >= CONCURRENCY_LIMIT) {
            await Promise.race(activeTasks);
          }
        }
        await Promise.all(activeTasks);

        setProgressTarget(98);
        setAnalysisStatus('Synthesizing Master Laboratory Report...');
        
        let synthesisSuccess = false;
        let synthesisAttempt = 0;
        
        while (synthesisAttempt < 3 && !synthesisSuccess) {
          try {
            const synthesisPrompt = `
              Synthesize these interview segment analyses into a single Master Report.
              Role: ${role}, Experience: ${experience}
              Analyses: ${JSON.stringify(chunkAnalyses)}
              
              Return a valid JSON object matching the standard structure:
              {
                "score": <number 1-5>,
                "rejectionReasons": [<string>, ...],
                "mistakes": [<string>, ...],
                "weaknesses": [{"pattern": <string>, "impact": <number 1 - 100>, "description": <string>}],
                "speechMetrics": { "fillerWords": <number>, "pacing": <string>, "fillerWordsList": [], "articulation": <number> },
                "momentSpecificFeedback": [{"timestamp": <string>, "transcript": <string>, "issue": <string>, "impact": <string>, "logicSweep": <string>, "hiringImpact": <string>, "improvementProtocol": <string>}],
                "improvedAnswer": <string>,
                "improvementPlan": [{"goal": <string>, "actions": [<string>, ...]}],
                "metrics": { "confidence": <number>, "clarity": <number>, "technicalDepth": <number>, "relevance": <number>, "logic": <number>, "approach": <number>, "hiringPotential": <number> },
                "chartData": [{"name": <string>, "value": <number>}],
                "hiringPotentialIndex": [{"name": <string>, "value": <number>}],
                "topicDistribution": [{"name": <string>, "value": <number>}],
                "hiringPerspective": <string>
              }
            `;

            const synthResponse = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: synthesisPrompt,
              config: { responseMimeType: "application/json" }
            });

            parsed = JSON.parse(synthResponse.text || '{}');
            synthesisSuccess = true;
          } catch (err: any) {
            if (err.message?.includes('429')) {
              await delay(10000);
              synthesisAttempt++;
            } else {
              throw err;
            }
          }
        }
      } else {
        const textPrompt = `Analyze this interview transcript as a Hiring Manager. Role: ${role}, Level: ${experience}. Content: ${analysisText}. Return JSON.`;
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: textPrompt,
          config: { responseMimeType: "application/json" }
        });
        parsed = JSON.parse(response.text || '{}');
      }

      // Normalization and Validation
      if (typeof parsed.score !== 'number') parsed.score = 3;
      if (!Array.isArray(parsed.rejectionReasons)) parsed.rejectionReasons = [];
      if (!Array.isArray(parsed.mistakes)) parsed.mistakes = [];
      if (!Array.isArray(parsed.weaknesses)) parsed.weaknesses = [];
      if (!parsed.speechMetrics) parsed.speechMetrics = { fillerWords: 0, pacing: 'Normal', fillerWordsList: [], articulation: 70 };
      if (!Array.isArray(parsed.momentSpecificFeedback)) parsed.momentSpecificFeedback = [];
      if (typeof parsed.improvedAnswer !== 'string') parsed.improvedAnswer = '';
      if (!Array.isArray(parsed.improvementPlan)) parsed.improvementPlan = [];
      if (!parsed.metrics) parsed.metrics = { confidence: 50, clarity: 50, technicalDepth: 50, relevance: 50, logic: 50, approach: 50, hiringPotential: 50 };
      if (!Array.isArray(parsed.chartData)) parsed.chartData = [];
      if (!Array.isArray(parsed.hiringPotentialIndex)) parsed.hiringPotentialIndex = [];
      if (!Array.isArray(parsed.topicDistribution)) parsed.topicDistribution = [];
      if (typeof parsed.hiringPerspective !== 'string') parsed.hiringPerspective = '';

      setProgressTarget(100);
      await delay(800);

      if (analysisSource === 'mock') {
        setMockResult(parsed);
      } else {
        setDebriefResult(parsed);
      }

      // --- PERSIST TO FIREBASE ---
      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'interviews'), {
            userId: auth.currentUser.uid,
            role,
            experience,
            source: analysisSource,
            score: parsed.score,
            analysis: parsed,
            createdAt: serverTimestamp()
          });
        } catch (dbErr) {
          console.error("Failed to save result to matrix repository:", dbErr);
          try { handleFirestoreError(dbErr, 'create', 'interviews'); } catch (e) { console.error("Enriched Error:", e); }
        }
      }

    } catch (err: any) {
      console.error('Analysis Error:', err);
      setError(`Analysis failed: ${err.message || 'Unknown error occurred. Please try again.'}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
      setAnalysisStatus('');
      setSmoothProgress(0);
      setProgressTarget(0);
    }
  };

  // --- LIVE INTERVIEW LOGIC ---
  const startLiveInterview = async () => {
    setView('live-interview');
    setLiveChat([{ role: 'system', content: `Initializing Live AI Interviewer for ${role} position...` }]);
    setIsFetchingQuestion(true);
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: `You are an Interviewer for a ${role} position at experience level ${experience}. Start the interview. Ask one introductory question only. Do not include any JSON or formatting, just the question.` }]
          }
        ]
      });
      setLiveChat(prev => [...prev, { role: 'assistant', content: resp.text || "Tell me about yourself." }]);
    } catch (err) {
      console.error('Live interview start error:', err);
      setError('Voice link failed.');
      setLiveChat(prev => [...prev, { role: 'assistant', content: "Tell me about yourself and your experience." }]);
    } finally {
      setIsFetchingQuestion(false);
    }
  };

  const handleLiveResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveInput.trim() || isFetchingQuestion) return;

    const answer = liveInput.trim();
    setLiveChat(prev => [...prev, { role: 'user', content: answer }]);
    setLiveInput('');
    setIsFetchingQuestion(true);

    try {
      const context = liveChat
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
        .join('\n');

      const promptForLive = `You are an elite technical interviewer for a ${role} role (${experience} level).

Current Conversation:
${context}

Candidate's latest answer: "${answer}"

Your task:
1. Evaluate the answer critically but constructively
2. Give a score from 1-10
3. Provide a brief improvement tip
4. Ask the next relevant interview question

Return ONLY a valid JSON object like this:
{
  "feedback": {
    "score": <number 1-10>,
    "improvement": "<brief actionable feedback>"
  },
  "nextQuestion": "<your next interview question>"
}

No markdown, no code blocks, just the JSON.`;

      const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: promptForLive }]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      if (resp.text) {
        let parsed;
        try {
          parsed = JSON.parse(resp.text);
        } catch {
          const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Parse failed');
          }
        }

        if (parsed && parsed.nextQuestion) {
          setLiveChat(prev => [...prev, { 
            role: 'assistant', 
            content: parsed.nextQuestion,
            feedback: parsed.feedback
          }]);
        } else {
          throw new Error('Invalid response structure');
        }
      }
    } catch (err) {
      console.error('Live response error:', err);
      setLiveChat(prev => [...prev, { role: 'assistant', content: "Interesting answer. Let's continue — can you walk me through a challenging technical problem you've solved recently?" }]);
    } finally {
      setIsFetchingQuestion(false);
    }
  };

  // Scroll live chat to bottom
  useEffect(() => {
    if (liveChatEndRef.current) {
      liveChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveChat]);

  // --- AUTH VIEWS ---
  const LoginView = () => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-lab-card backdrop-blur-xl border border-lab-border rounded-[48px] p-12 space-y-10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Brain className="w-40 h-40" />
        </div>
        
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4 mb-4">
             <div className="w-12 h-12 bg-blue-950 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(23,37,84,0.3)]">
                <Brain className="w-6 h-6 text-white" />
             </div>
             <span className="text-3xl font-brand italic tracking-tight text-lab-text">WhyNotHired</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-lab-text tracking-tight uppercase">Welcome Back</h2>
          <p className="text-lab-muted text-sm font-medium">Continue improving your interviews.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-xs font-medium">{error}</p>
          </div>
        )}

        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setError(null); setView('home'); }}>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com" 
                className="w-full bg-lab-bg rounded-[24px] py-5 pl-14 pr-6 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800">Password</label>
              <button 
                type="button"
                className="text-[10px] font-black uppercase tracking-widest text-lab-muted hover:text-blue-800 transition-colors"
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-lab-bg rounded-[24px] py-5 pl-14 pr-14 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-[#3F3F46] hover:text-[#71717A]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-blue-950 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-blue-900 transition-all shadow-lg flex items-center justify-center gap-3"
          >
            <LogIn className="w-4 h-4" /> Login to Laboratory
          </button>
        </form>

        <div className="space-y-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
            <div className="relative flex justify-center text-[8px] font-black uppercase tracking-widest"><span className="bg-lab-card px-4 text-[#3F3F46]">Or diagnostic link</span></div>
          </div>

          <button 
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-5 bg-lab-card border border-lab-border text-lab-text rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center justify-center gap-3"
          >
             <Globe className="w-4 h-4" /> Continue with Google
          </button>
        </div>

        <p className="text-center text-[10px] font-black uppercase tracking-widest text-[#71717A]">
          New Candidate? <button onClick={() => setView('signup')} className="text-blue-800 hover:underline underline-offset-4">Create Account</button>
        </p>
      </motion.div>
    </div>
  );

  const SignUpView = () => (
    <div className="min-h-screen flex items-center justify-center p-6 py-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-lab-card backdrop-blur-xl border border-lab-border rounded-[48px] p-12 space-y-10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <UserPlus className="w-40 h-40" />
        </div>

        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4 mb-4">
             <div className="w-12 h-12 bg-blue-950 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(23,37,84,0.3)]">
                <Brain className="w-6 h-6 text-white" />
             </div>
             <span className="text-3xl font-brand italic tracking-tight text-lab-text">WhyNotHired</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-lab-text tracking-tight uppercase">New Candidate Registration</h2>
          <p className="text-lab-muted text-sm font-medium">Join the elite interview laboratory.</p>
        </div>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-8" onSubmit={(e) => { e.preventDefault(); setView('home'); }}>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Full Name</label>
              <div className="relative">
                <User className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe" 
                  className="w-full bg-lab-bg rounded-[24px] py-5 pl-14 pr-6 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com" 
                  className="w-full bg-lab-bg rounded-[24px] py-5 pl-14 pr-6 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Desired Role</label>
              <div className="relative">
                <Briefcase className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full appearance-none bg-lab-bg backdrop-blur-xl rounded-[24px] py-5 pl-14 pr-12 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3F3F46] pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Experience Level</label>
              <div className="relative">
                <Target className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <select 
                  value={experience}
                  onChange={(e) => setExperience(e.target.value as ExperienceLevel)}
                  className="w-full appearance-none bg-lab-bg backdrop-blur-xl rounded-[24px] py-5 pl-14 pr-12 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                >
                  {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3F3F46] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000" 
                  className="w-full bg-lab-bg backdrop-blur-xl rounded-[24px] py-5 pl-14 pr-6 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Security Key</label>
              <div className="relative">
                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters" 
                  className="w-full bg-lab-bg backdrop-blur-xl rounded-[24px] py-5 pl-14 pr-14 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-800 px-4">Confirm Key</label>
              <div className="relative">
                <CheckCircle2 className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3F3F46]" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat Security Key" 
                  className="w-full bg-lab-bg backdrop-blur-xl rounded-[24px] py-5 pl-14 pr-14 text-sm text-lab-text border border-lab-border focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-6 mt-4">
            <button 
              type="submit"
              className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-indigo-500 transition-all flex items-center justify-center gap-3"
            >
              <UserPlus className="w-5 h-5" /> Initialize Profile
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
            <div className="relative flex justify-center text-[8px] font-black uppercase tracking-widest"><span className="bg-lab-card px-4 text-[#3F3F46]">Or diagnostic sync</span></div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-5 bg-lab-card border border-lab-border text-lab-text rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center justify-center gap-3"
            >
               <Globe className="w-4 h-4" /> Sign up with Google
            </button>

            <p className="text-center text-[10px] font-black uppercase tracking-widest text-[#71717A]">
              Already calibrated? <button onClick={() => setView('login')} className="text-blue-800 hover:underline underline-offset-4">Return to Login</button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );

  const ProfileView = () => (
    <div className="max-w-4xl mx-auto space-y-12 py-10">
      <div className="flex items-center justify-between">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-900 bg-blue-950/10 px-6 py-3 rounded-full hover:bg-blue-900/20 transition-all">
<ArrowLeft className="w-4 h-4" /> Exit Matrix
</button>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 px-6 py-3 rounded-full hover:bg-red-500/20 transition-all"
        >
          <LogOut className="w-4 h-4" /> Disconnect Profile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-8">
           <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-10 border border-lab-border text-center space-y-6">
              <div className="w-24 h-24 bg-blue-950 rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
                 <User className="w-12 h-12 text-white" />
              </div>
              <div className="space-y-1">
                 <h2 className="text-xl font-display font-extrabold text-lab-text uppercase tracking-tighter">{fullName || 'Candidate 07'}</h2>
                 <p className="text-blue-800 text-[8px] font-black uppercase tracking-widest">Neural Link Verified</p>
              </div>
              <div className="pt-6 border-t border-lab-border space-y-4">
                 <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-lab-muted">
                    <span>Rank</span>
                    <span className="text-lab-text">{experience}</span>
                 </div>
                 <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-lab-muted">
                    <span>Entity</span>
                    <span className="text-lab-text">{role}</span>
                 </div>
              </div>
           </div>

           <div className="bg-lab-card backdrop-blur-xl rounded-[32px] p-8 border border-lab-border space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#3F3F46] dark:text-[#3F3F46]">Security Overview</h3>
              <div className="space-y-4">
                 <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-lab-text font-medium">Two-Factor Active</span>
                 </div>
                 <div className="flex items-center gap-3">
                    <History className="w-4 h-4 text-blue-900" />
                    <span className="text-xs text-lab-text font-medium">Last Audit: Today</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="md:col-span-2 space-y-8">
           <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border space-y-10">
              <div className="space-y-2">
                 <h2 className="text-3xl font-display font-extrabold text-lab-text uppercase tracking-tighter">Calibration & Settings</h2>
                 <p className="text-lab-muted text-[10px] font-black uppercase tracking-[0.4em]">Precision Mode Adjustments</p>
              </div>

              <div className="space-y-10">
                 <section className="space-y-6">
                    <div className="flex items-center gap-3">
                       <Monitor className="w-4 h-4 text-blue-900" />
                       <h4 className="text-[10px] font-display font-bold uppercase tracking-widest text-blue-700">Interface Mode</h4>
                    </div>
                    <div className="flex bg-lab-bg p-2 rounded-2xl border border-lab-border gap-2">
                       {(['dark', 'light', 'system'] as const).map(mode => (
                          <button 
                            key={mode}
                            onClick={() => setThemeMode(mode)}
                            className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${themeMode === mode ? 'bg-blue-950 text-white shadow-lg' : 'text-lab-muted hover:bg-white/5'}`}
                          >
                             {mode === 'dark' ? <Moon className="w-3 h-3" /> : mode === 'light' ? <Sun className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                             {mode}
                          </button>
                       ))}
                    </div>
                 </section>

                 <section className="space-y-6">
                    <div className="flex items-center gap-3">
                       <Key className="w-4 h-4 text-blue-900" />
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-700">Credentials Security</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <button className="bg-white/5 px-8 py-5 rounded-[24px] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all text-left">
                          Change Security Key
                       </button>
                       <button className="bg-white/5 px-8 py-5 rounded-[24px] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all text-left">
                          Update Recovery Email
                       </button>
                    </div>
                 </section>

                 <section className="space-y-6 pt-10 border-t border-white/5">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#3F3F46]">Candidate Library</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="p-6 bg-lab-bg backdrop-blur-xl rounded-[24px] border border-lab-border flex items-center gap-4 group cursor-pointer hover:border-indigo-500/50 transition-all">
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-[#71717A] group-hover:bg-indigo-500 group-hover:text-white transition-all"><Info className="w-4 h-4" /></div>
                          <div>
                             <p className="text-lab-text font-black uppercase tracking-widest text-[10px]">Privacy Protocols</p>
                             <p className="text-[#3F3F46] text-[8px] font-medium">Neural data encryption policy</p>
                          </div>
                       </div>
                       <div className="p-6 bg-lab-bg backdrop-blur-xl rounded-[24px] border border-lab-border flex items-center gap-4 group cursor-pointer hover:border-indigo-500/50 transition-all">
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-[#71717A] group-hover:bg-indigo-500 group-hover:text-white transition-all"><ShieldQuestion className="w-4 h-4" /></div>
                          <div>
                             <p className="text-lab-text font-black uppercase tracking-widest text-[10px]">Help Reservoir</p>
                             <p className="text-[#3F3F46] text-[8px] font-medium">Lab diagnostic documentation</p>
                          </div>
                       </div>
                    </div>
                 </section>
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  // --- RENDER HELPERS (Moved outside App to avoid re-creation on every render) ---
  const HomeView = () => (
    <div className="space-y-12 py-12">
      <header className="text-center space-y-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
           <h1 className="text-5xl md:text-8xl font-display font-extrabold text-lab-text tracking-tighter uppercase leading-none">
             Interview<br /><span className="text-blue-900">Laboratory</span>
           </h1>
           <p className="text-lab-text text-xl font-medium mt-6 max-w-2xl mx-auto">
             Post-debrief mapping, live AI questioning, and structured mock papers. The science of securing the offer.
           </p>
        </motion.div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { id: 'analysis', title: 'Post-Interview Debrief', desc: 'Acoustic mapping & rejection reverse engineering.', icon: <Activity />, color: 'bg-blue-950', action: () => { setAnalysisSource('debrief'); setView('analysis'); setAnalysisText(''); } },
          { id: 'live-interview', title: 'Live AI Interview', desc: 'Real-time questioning with adaptive feedback.', icon: <Bot />, color: 'bg-emerald-600', action: startLiveInterview },
          { id: 'mock-test', title: 'Paper Mock Tests', desc: 'Timed role-based test papers for written practice.', icon: <FileText />, color: 'bg-orange-600' },
          { id: 'live-peer', title: 'Peer-to-Peer Session', desc: 'Connect with other candidates for live roleplay.', icon: <User />, color: 'bg-blue-900', status: 'Experimental' }
        ].map((item) => (
          <motion.button 
            key={item.id}
            whileHover={{ y: -8, scale: 1.02 }}
            onClick={() => item.action ? item.action() : setView(item.id as AppView)}
            className="group relative bg-lab-card backdrop-blur-2xl rounded-[48px] p-10 border border-lab-border text-left overflow-hidden shadow-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all"
          >
            <div className={`w-16 h-16 ${item.color} rounded-[24px] flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform`}>
              {React.cloneElement(item.icon as React.ReactElement, { className: 'w-8 h-8 text-white' })}
            </div>
            <h3 className="text-2xl font-display font-extrabold text-lab-text tracking-tight uppercase mb-4">{item.title}</h3>
            <p className="text-lab-muted font-medium leading-relaxed">{item.desc}</p>
            {item.status && <span className="absolute top-8 right-8 text-[8px] font-black uppercase tracking-[0.3em] bg-white/10 px-3 py-1 rounded-full text-white/50">{item.status}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  );

  const AnalysisView = () => {
    const COLORS = ['#1E3A8A', '#10b981', '#f59e0b', '#ef4444', '#38bdf8'];
    const activeResult = analysisSource === 'mock' ? mockResult : debriefResult;
    
    const radarData = activeResult ? [
      { subject: 'Confidence', A: activeResult.metrics.confidence },
      { subject: 'Clarity', A: activeResult.metrics.clarity },
      { subject: 'Tech Depth', A: activeResult.metrics.technicalDepth },
      { subject: 'Relevance', A: activeResult.metrics.relevance },
      { subject: 'Logic', A: activeResult.metrics.logic },
      { subject: 'Approach', A: activeResult.metrics.approach },
    ] : [];

    return (
    <div className="space-y-12">
       {(isAnalyzing || isSplitting) && (
         <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-950/10 border-blue-900/20 rounded-[32px] p-8 flex flex-col gap-6 shadow-2xl">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-900 rounded-2xl flex items-center justify-center animate-pulse">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lab-text font-display font-bold uppercase tracking-tighter text-xl">{isSplitting ? 'Neural Data Link Active' : 'Laboratory Analysis Active'}</h3>
                  <p className="text-blue-700/60 font-mono text-[10px] tracking-widest">{analysisStatus}</p>
                </div>
             </div>
             {totalChunks > 0 && (
               <div className="text-right">
                 <p className="text-lab-text font-display font-bold text-2xl tracking-tighter">{Math.round(smoothProgress)}%</p>
                 <p className="text-blue-700/60 font-mono text-[8px] uppercase tracking-[0.3em]">{isSplitting ? 'Transfer Progress' : 'Analysis Progress'}</p>
               </div>
             )}
           </div>
           
           <div className="h-2 bg-blue-900/10 rounded-full overflow-hidden border border-white/5">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${smoothProgress}%` }}
               className="h-full bg-blue-900 shadow-[0_0_20px_rgba(30,58,138,0.5)]"
             />
           </div>
         </motion.div>
       )}

       <div className="flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-800 bg-blue-950/10 px-6 py-3 rounded-full hover:bg-blue-900/20 transition-all">
<ArrowLeft className="w-4 h-4" /> Back to Laboratory
</button>
       </div>

       {error && (
         <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
           <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
           <p className="text-red-400 text-xs font-medium">{error}</p>
           <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-400">
             <XCircle className="w-4 h-4" />
           </button>
         </div>
       )}
       
       <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 items-start">
          {analysisSource === 'debrief' && !activeResult && (
            <div className="xl:col-span-12 space-y-8">
              <h2 className="text-4xl font-display font-extrabold text-lab-text uppercase tracking-tighter">Diagnostic Matrix</h2>
              <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-10 border border-lab-border space-y-10 shadow-2xl">
                <textarea 
                  value={analysisText} 
                  onChange={(e) => setAnalysisText(e.target.value)}
                  placeholder="Paste interview transcript or answers here. Be as detailed as possible for the best analysis..."
                  className="w-full h-[300px] bg-lab-bg rounded-[32px] p-10 text-base focus:outline-none border border-lab-border transition-all focus:border-indigo-500/50 leading-relaxed font-medium text-lab-text placeholder-[#3F3F46] resize-none"
                />
                
                <input 
                  type="file" 
                  ref={mediaInputRef} 
                  onChange={handleFileUpload} 
                  accept="audio/*,video/*" 
                  className="hidden" 
                />

                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={isRecording ? stopRecording : startRecording} 
                    className={`flex-1 min-w-[150px] py-5 rounded-[24px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 transition-all ${isRecording ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-lab-card text-lab-text border border-lab-border hover:bg-white/10'}`}
                  >
                    <Mic className="w-4 h-4"/> {isRecording ? 'Stop Mapping' : 'Capture Acoustic'}
                  </button>
                  <button 
                    onClick={() => mediaInputRef.current?.click()} 
                    className="flex-1 min-w-[150px] py-5 bg-lab-card text-lab-text rounded-[24px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-white/10 border border-lab-border transition-all"
                  >
                    <Upload className="w-4 h-4"/> Upload Media
                  </button>
                  <button 
                    onClick={analyzeInterview} 
                    disabled={isAnalyzing || (!analysisText.trim() && !mediaBlob)} 
                    className="w-full py-5 bg-blue-950 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-blue-900 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> 
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" /> 
                        Run Audit
                      </>
                    )}
                  </button>
                </div>

                {mediaBlob && !isRecording && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-[24px] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        {mediaMimeType.startsWith('video') ? <Video className="w-5 h-5 text-emerald-500" /> : <AudioLines className="w-5 h-5 text-emerald-500" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Media Loaded</p>
                        <p className="text-xs text-emerald-100 font-medium truncate max-w-[200px]">{mediaName}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setMediaBlob(null); setMediaName(''); setAudioBlob(null); }}
                      className="p-3 hover:bg-emerald-500/20 rounded-xl text-emerald-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </div>
              
              {isRecording && (
                  <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-[32px] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Live Spectrum Locked</span>
                    </div>
                    <span className="text-2xl font-mono font-black text-red-500">{formatTime(recordingTime)}</span>
                  </div>
              )}
            </div>
          )}

          {activeResult && (
             <div className="xl:col-span-12 w-full space-y-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row gap-12 items-start">
                   <div className="flex-1 space-y-8">
                      <h2 className="text-4xl font-display font-extrabold text-lab-text uppercase tracking-tighter">Diagnostic Matrix</h2>
                      <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border space-y-8 shadow-2xl">
                         <div className="flex items-center justify-between border-b border-white/5 pb-8">
                            <div>
                               <h3 className="text-lab-text font-display font-extrabold uppercase tracking-tighter text-2xl">Interviewer:</h3>
                               <p className="text-blue-800 font-bold mt-2">"Tell me about yourself."</p>
                            </div>
                         </div>
                         <div className="space-y-4">
                            <div className="flex items-center gap-2">
                               <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Candidate (Answer):</span>
                            </div>
                            <p className="text-lab-text/80 leading-relaxed font-medium">
                               {activeResult.improvedAnswer || analysisText || "Mapping transcript data..."}
                            </p>
                         </div>
                      </div>
                   </div>

                   <div className="w-full md:w-[450px] space-y-8">
                      <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border text-center relative overflow-hidden flex flex-col items-center justify-center space-y-6">
                         <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-800 block">Overall Sync</span>
                         <div className="text-9xl font-display font-extrabold text-lab-text leading-none tracking-tighter">{activeResult.score}<span className="text-xl opacity-20 italic">/5</span></div>
                         
                         <div className="w-full h-[250px] mt-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="#ffffff10" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717A', fontSize: 10, fontWeight: 'bold' }} />
                                <Radar name="Candidate" dataKey="A" stroke="#1E3A8A" fill="#1E3A8A" fillOpacity={0.6} />
                              </RadarChart>
                            </ResponsiveContainer>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                   {[
                      { label: 'Logic', value: activeResult.metrics.logic, icon: <Zap className="w-4 h-4" /> },
                      { label: 'Approach', value: activeResult.metrics.approach, icon: <TrendingUp className="w-4 h-4" /> },
                      { label: 'Potential', value: activeResult.metrics.hiringPotential, icon: <Target className="w-4 h-4" /> },
                      { label: 'Clarity', value: activeResult.metrics.clarity, icon: <CheckCircle2 className="w-4 h-4" /> }
                   ].map(metric => (
                      <div key={metric.label} className="bg-lab-card backdrop-blur-2xl border border-lab-border rounded-[32px] p-8 space-y-4 shadow-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2 text-blue-800">
                              {metric.icon}
                              <span className="text-[10px] font-display font-bold uppercase tracking-widest">{metric.label}</span>
                           </div>
                           <span className="text-lg font-display font-bold text-lab-text">{metric.value}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                           <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${metric.value}%` }}
                              className="h-full bg-blue-900"
                           />
                        </div>
                      </div>
                   ))}
                </div>

                {/* Sub Charts Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border space-y-8">
                      <div className="flex items-center justify-between">
                         <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-800">Hiring Potential Index</h3>
                         <BarChart3 className="w-4 h-4 text-blue-900" />
                      </div>
                      <div className="h-[250px]">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activeResult.hiringPotentialIndex}>
                               <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} vertical={false} />
                               <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                               <Tooltip 
                                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: '12px' }}
                                  itemStyle={{ color: 'var(--text-main)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                               />
                               <Bar dataKey="value" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </div>

                   <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border space-y-8">
                      <div className="flex items-center justify-between">
                         <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-800">Topic Distribution</h3>
                         <LucidePieChart className="w-4 h-4 text-blue-900" />
                      </div>
                      <div className="h-[250px]">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                               <Pie
                                  data={activeResult.topicDistribution}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                               >
                                  {activeResult.topicDistribution.map((entry, index) => (
                                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                  ))}
                               </Pie>
                               <Tooltip 
                                  contentStyle={{ backgroundColor: '#0A0A0B', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                  itemStyle={{ color: '#fff', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                               />
                            </PieChart>
                         </ResponsiveContainer>
                      </div>
                   </div>
                </div>

                {/* Hiring Verdict */}
                <div className="bg-blue-950/5 border-blue-900/20 rounded-[48px] p-12 space-y-6">
                   <div className="flex items-center gap-3 text-blue-800">
<ShieldAlert className="w-5 h-5" />
<h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Hiring Verdict</h3>
</div>
                   <p className="text-lg text-blue-50/90 leading-relaxed font-medium">
                      {activeResult.hiringPerspective}
                   </p>
                </div>

                {/* Surgical Improvement Audit */}
                <div className="space-y-8">
                   <div className="text-center space-y-2">
                       <h2 className="text-4xl font-display font-extrabold text-lab-text uppercase tracking-tighter">Surgical Improvement Audit</h2>
                       <p className="text-blue-800 font-black uppercase tracking-[0.3em]">Moment-by-Moment Cognitive Analysis</p>
                   </div>

                   <div className="space-y-4">
                      {activeResult.momentSpecificFeedback.map((moment, idx) => (
                         <div key={idx} className="bg-lab-card backdrop-blur-xl border border-lab-border rounded-[32px] overflow-hidden transition-all hover:border-blue-900/30">
                            <button 
                               onClick={() => setExpandedMoment(expandedMoment === idx ? null : idx)}
                               className="w-full flex items-center justify-between p-8 text-left"
                            >
                               <div className="flex items-center gap-8">
                                  <div className="flex flex-col">
                                     <span className="text-blue-900 font-mono text-[10px] font-bold">{moment.timestamp}</span>
                                     <span className="text-[#3F3F46] text-[8px] font-bold uppercase tracking-widest mt-1">Audit Mark</span>
                                  </div>
                                  <p className="text-lab-text/80 text-sm font-medium truncate max-w-md italic font-mono">
                                     "{moment.transcript.slice(0, 100)}..."
                                  </p>
                               </div>
                               <div className="flex items-center gap-6">
                                  <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full ${
                                     moment.impact === 'High' ? 'bg-red-500/10 text-red-500' :
                                     moment.impact === 'Medium' ? 'bg-orange-500/10 text-orange-500' :
                                     'bg-blue-900/10 text-blue-900'
                                  }`}>
                                     {moment.impact} Risk
                                  </span>
                                  {expandedMoment === idx ? <ChevronUp className="w-4 h-4 text-[#3F3F46]" /> : <ChevronDown className="w-4 h-4 text-[#3F3F46]" />}
                               </div>
                            </button>

                            <AnimatePresence>
                               {expandedMoment === idx && (
                                  <motion.div 
                                     initial={{ height: 0, opacity: 0 }}
                                     animate={{ height: 'auto', opacity: 1 }}
                                     exit={{ height: 0, opacity: 0 }}
                                     className="border-t border-lab-border bg-lab-bg/50 backdrop-blur-xl"
                                  >
                                     <div className="p-12 space-y-12">
                                        <p className="text-lab-text text-lg leading-relaxed font-medium italic">"{moment.transcript}"</p>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                           <div className="space-y-4">
                                              <div className="flex items-center gap-2 text-blue-800">
                                                 <Activity className="w-4 h-4" />
                                                 <span className="text-[10px] font-black uppercase tracking-widest">Logic Sweep</span>
                                              </div>
                                              <p className="text-[#A1A1AA] text-sm leading-relaxed">{moment.logicSweep}</p>
                                           </div>
                                           <div className="space-y-4">
                                              <div className="flex items-center gap-2 text-emerald-400">
                                                 <TrendingUp className="w-4 h-4" />
                                                 <span className="text-[10px] font-black uppercase tracking-widest">Hiring Impact</span>
                                              </div>
                                              <p className="text-[#A1A1AA] text-sm leading-relaxed">{moment.hiringImpact}</p>
                                           </div>
                                        </div>

                                        <div className="bg-blue-950/10 border border-blue-900/20 rounded-[24px] p-8 space-y-4">
                                            <div className="flex items-center gap-2 text-blue-800">
                                              <Lightbulb className="w-4 h-4" />
                                              <span className="text-[10px] font-black uppercase tracking-widest">Improvement Protocol</span>
                                           </div>
                                           <p className="text-blue-50/90 text-sm leading-relaxed font-medium">
                                              {moment.improvementProtocol}
                                           </p>
                                        </div>
                                     </div>
                                  </motion.div>
                               )}
                            </AnimatePresence>
                         </div>
                      ))}
                   </div>
                </div>

                {/* Detailed Analysis Grids (Legacy Support) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="bg-lab-card backdrop-blur-xl border border-lab-border p-10 rounded-[48px] space-y-8">
                      <div className="flex items-center gap-3">
                         <XCircle className="w-5 h-5 text-red-500" />
                         <h3 className="text-xl font-black text-lab-text uppercase tracking-tighter">Strategic Mistakes</h3>
                      </div>
                      <ul className="space-y-4">
                         {activeResult.mistakes.map((m, i) => (
                            <li key={i} className="flex gap-4 group">
                               <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 group-hover:scale-150 transition-transform" />
                               <span className="text-lab-muted text-sm font-medium">{m}</span>
                            </li>
                         ))}
                      </ul>
                   </div>

                   <div className="bg-lab-card backdrop-blur-xl border border-lab-border p-10 rounded-[48px] space-y-8">
                      <div className="flex items-center gap-3">
                         <TrendingUp className="w-5 h-5 text-blue-800" />
                         <h3 className="text-xl font-black text-lab-text uppercase tracking-tighter">Improvement Plan</h3>
                      </div>
                      <div className="space-y-6">
                         {activeResult.improvementPlan.map((plan, i) => (
                            <div key={i} className="space-y-2">
                               <p className="text-xs font-black uppercase tracking-widest text-blue-800">{plan.goal}</p>
                               <div className="space-y-2">
                                  {plan.actions.map((a, j) => (
                                     <div key={j} className="flex items-center gap-3 text-white/80 text-xs font-medium">
                                        <ChevronRight className="w-3 h-3 text-blue-900" />
                                        {a}
                                     </div>
                                  ))}
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          )}
       </div>
    </div>
    );
  };

  const LiveInterviewView = () => (
    <div className="max-w-4xl mx-auto space-y-8">
       <div className="flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-800 bg-blue-950/10 px-6 py-3 rounded-full hover:bg-blue-900/20 transition-all">
             <ArrowLeft className="w-4 h-4" /> Terminate Link
          </button>
          <div className="flex items-center gap-3 bg-red-500/10 px-6 py-3 rounded-full border border-red-500/20">
             <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Live Cognitive Link</span>
          </div>
       </div>

      <div className="bg-lab-card backdrop-blur-xl rounded-[48px] border border-lab-border overflow-hidden flex flex-col h-[700px] shadow-2xl">
          <div className="p-8 bg-white/5 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-950 rounded-2xl flex items-center justify-center animate-pulse"><Bot className="w-6 h-6 text-white" /></div>
                <div>
                   <h3 className="text-white font-black uppercase tracking-widest text-xs">WNH-7 Reality Check Bot</h3>
                   <p className="text-blue-800 text-[8px] font-black uppercase tracking-[0.2em] mt-1">Brutal Truth Protocol Active</p>
                </div>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-12">
             {liveChat.map((msg, i) => (
               <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-4`}>
                  {msg.feedback && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[24px] max-w-[80%] space-y-2">
                       <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 mb-2">
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Post-Answer Analysis</span>
                          <span className="text-sm font-black text-emerald-400">{msg.feedback.score}/10</span>
                       </div>
                       <p className="text-xs text-emerald-100/70 font-medium leading-relaxed">{msg.feedback.improvement}</p>
                    </motion.div>
                  )}
                  <div className={`p-8 rounded-[32px] max-w-[85%] text-sm font-semibold leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-950 text-white rounded-tr-none' : msg.role === 'system' ? 'bg-lab-bg text-lab-muted text-[10px] uppercase font-black tracking-widest text-center self-center' : 'bg-lab-card backdrop-blur-xl text-lab-text rounded-tl-none border border-lab-border shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
               </div>
             ))}
             {isFetchingQuestion && (
                <div className="flex justify-start">
                   <div className="bg-white/5 p-6 rounded-full flex gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-900 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-blue-900 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-blue-900 rounded-full animate-bounce" />
                   </div>
                </div>
             )}
             <div ref={liveChatEndRef} />
          </div>

          <form onSubmit={handleLiveResponse} className="p-6 bg-white/[0.02] m-6 rounded-[32px] flex gap-4 border border-white/5 shadow-inner">
             <input 
                autoFocus 
                value={liveInput} 
                onChange={e => setLiveInput(e.target.value)} 
                onPaste={handlePasteViolation}
                placeholder="Type your answer clearly..." 
                className="flex-1 bg-transparent border-none text-white focus:ring-0 text-xs font-semibold placeholder-[#3F3F46] focus:outline-none" 
             />
             <button 
               type="submit"
               disabled={!liveInput.trim() || isFetchingQuestion}
               className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center hover:bg-blue-900 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
                <Send className="w-4 h-4" />
             </button>
          </form>
       </div>
    </div>
  );

  const MockTestView = () => {
    const currentRolePapers = paperDatabase[role] || {};
    const currentPapers = currentRolePapers[selectedType] || [];

    const handleMockSubmit = async () => {
      if (!activePaper) return;
      const combined = activePaper.questions.map((q, i) => `Q: ${q}\nA: ${mockAnswers[i] || "No answer provided"}`).join('\n\n');
      setAnalysisText(combined);
      setAnalysisSource('mock');
      setView('analysis');
      // Use setTimeout to ensure state is updated before calling analyzeInterview
      setTimeout(() => {
        analyzeInterview();
      }, 200);
    };

    if (activePaper) {
      return (
        <div className="space-y-8 max-w-4xl mx-auto">
          <button onClick={() => setActivePaper(null)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#71717A] bg-white/5 px-6 py-3 rounded-full hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" /> Change Paper
          </button>
          <div className="bg-lab-card backdrop-blur-xl rounded-[48px] p-12 border border-lab-border space-y-12">
             <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-800">Practice Paper</span>
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#3F3F46] bg-white/5 px-3 py-1 rounded-lg">{selectedType} Matrix</span>
                </div>
                <h2 className="text-4xl font-display font-extrabold text-lab-text uppercase tracking-tighter">{activePaper.title}</h2>
             </div>
             <div className="space-y-10">
                {activePaper.questions.map((q, i) => (
                  <div key={i} className="space-y-4">
                     <p className="text-lab-text font-bold text-lg"><span className="text-blue-900 mr-2 opacity-50">0{i+1}</span> {q}</p>
                     <textarea 
                        value={mockAnswers[i] || ''}
                        onChange={(e) => setMockAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                        onPaste={handlePasteViolation}
                        className="w-full bg-lab-bg backdrop-blur-xl rounded-[32px] p-8 text-sm focus:outline-none border border-lab-border h-32 text-lab-text placeholder-[#3F3F46] resize-none focus:border-indigo-500/50 transition-all"
                        placeholder="Type your response..."
                     />
                  </div>
                ))}
             </div>
             <button 
               onClick={handleMockSubmit} 
               className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-indigo-500 transition-all flex items-center justify-center gap-3"
             >
               <Sparkles className="w-5 h-5" /> Submit for Laboratory Analysis
             </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <button onClick={() => setView('home')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-800 bg-blue-950/10 px-6 py-3 rounded-full hover:bg-blue-900/20 transition-all self-start">
            <ArrowLeft className="w-4 h-4" /> Back to Laboratory
          </button>

          <div className="flex bg-lab-card backdrop-blur-xl p-1.5 rounded-2xl border border-lab-border overflow-x-auto whitespace-nowrap">
             {(['Service', 'Product', 'Startup', 'Fintech', 'SaaS'] as CompanyType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedType === type ? 'bg-blue-950 text-white shadow-lg' : 'text-[#71717A] hover:bg-white/5'}`}
                >
                  {type}
                </button>
             ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentPapers.length > 0 ? currentPapers.map((paper) => (
            <motion.button 
              key={paper.id}
              whileHover={{ y: -8 }}
              onClick={() => { setActivePaper(paper); setMockAnswers({}); }}
              className="bg-lab-card backdrop-blur-xl border border-lab-border p-10 rounded-[48px] text-left space-y-6 group transition-all hover:bg-lab-bg relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:scale-125 transition-transform"><Zap className="w-24 h-24" /></div>
              <div className="w-12 h-12 bg-indigo-500/5 rounded-2xl flex items-center justify-center group-hover:bg-blue-950 transition-colors"><FileText className="w-6 h-6 text-blue-900 group-hover:text-white" /></div>
              <h3 className="text-xl font-display font-extrabold text-lab-text tracking-tighter leading-tight uppercase relative z-10">{paper.title}</h3>
              <p className="text-lab-muted text-[10px] font-black uppercase tracking-widest relative z-10">{paper.questions.length} Questions Matrix</p>
            </motion.button>
          )) : (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[48px]">
               <p className="text-[#3F3F46] font-black uppercase tracking-widest">No papers calibrated for this configuration.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const isAuthView = view === 'login' || view === 'signup';

  return (
    <div className="min-h-screen bg-lab-bg text-lab-text font-sans selection:bg-blue-950/30 overflow-x-hidden transition-colors duration-300">
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_top_right,var(--accent-glow)_0%,_transparent_50%)] opacity-100 transition-opacity duration-300" />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_bottom_left,var(--bg-card)_0%,_transparent_40%)] opacity-50 transition-opacity duration-300" />
      
      {!isAuthView && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <nav className="flex items-center justify-between mb-16 border-b border-white/5 pb-8">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('home')}>
              <div className="w-12 h-12 bg-blue-950 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(23,37,84,0.3)]"><Brain className="w-6 h-6 text-white" /></div>
              <div>
                  <span className="text-2xl font-brand italic tracking-tight text-lab-text block">WhyNotHired</span>
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-900/80">Your AI Interview</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setView('profile')}
                className="w-10 h-10 bg-blue-950/10 border-blue-900/20 rounded-full flex items-center justify-center text-blue-800 hover:bg-blue-950 hover:text-white transition-all group"
              >
                  <User className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
              {view !== 'home' && view !== 'profile' && (
                <div className="relative">
                  <button 
                    onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
                    className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl hover:bg-white/10 transition-all border border-white/5 active:scale-95"
                  >
                      <div className="w-6 h-6 rounded-lg bg-blue-900/20 flex items-center justify-center text-[10px] font-bold text-blue-800">{role[0]}</div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#71717A]">{role}</span>
                      <RefreshCcw className={`w-3 h-3 text-[#3F3F46] transition-transform duration-500 ${isRoleMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isRoleMenuOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-4 w-56 bg-lab-card border border-lab-border rounded-3xl p-4 shadow-2xl z-[100] backdrop-blur-xl"
                      >
                          <div className="text-[8px] font-black uppercase tracking-widest text-[#3F3F46] mb-4 px-3">Select Simulation Context</div>
                          <div className="space-y-1">
                            {ROLES.map((r) => (
                              <button
                                key={r}
                                onClick={() => {
                                  setRole(r);
                                  setIsRoleMenuOpen(false);
                                }}
                                className={`w-full text-left px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between group ${role === r ? 'bg-blue-950 text-white' : 'text-[#71717A] hover:bg-white/5 hover:text-white'}`}
                              >
                                {r}
                                {role === r && <CheckCircle2 className="w-3 h-3" />}
                              </button>
                            ))}
                          </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-[#A1A1AA]">
                  <Settings className="w-3 h-3" /> Labs
              </div>
            </div>
          </nav>
        </div>
      )}

      <div className={isAuthView ? "" : "max-w-7xl mx-auto px-6"}>
        <AnimatePresence mode="wait">
          <motion.div 
            key={view} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }} 
            transition={{ duration: 0.3 }}
          >
            {view === 'login' && LoginView()}
            {view === 'signup' && SignUpView()}
            {view === 'home' && HomeView()}
            {view === 'analysis' && AnalysisView()}
            {view === 'live-interview' && LiveInterviewView()}
            {view === 'mock-test' && MockTestView()}
            {view === 'profile' && ProfileView()}
            {view === 'live-peer' && (
              <div className="h-96 flex items-center justify-center text-center p-20 border-2 border-dashed border-white/5 rounded-[48px]">
                 <div className="space-y-4">
                  <Video className="w-12 h-12 text-blue-900/30 mx-auto" />
                  <h3 className="text-xl font-black uppercase tracking-tighter">Peer Link Matrix</h3>
                  <p className="text-[#3F3F46] font-medium max-w-sm">Real-time candidate matchmaking requires server-side sync. Initializing p2p protocols...</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {!isAuthView && (
        <footer className="max-w-7xl mx-auto px-6 py-20 border-t border-white/5 mt-20 text-center">
          <div className="flex items-center justify-center gap-12 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3F3F46]">
              <span>Neural Filtering</span>
              <div className="w-1 h-1 bg-white/10 rounded-full" />
              <span>Acoustic Mapping</span>
              <div className="w-1 h-1 bg-white/10 rounded-full" />
              <span>Cognitive Profiling</span>
          </div>
        </footer>
      )}

      {/* PLAGIARISM OVERLAYS */}
      <AnimatePresence>
        {violationType && !isSuspended && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-red-950/40"
          >
            <div className="bg-lab-card backdrop-blur-xl border border-red-500/30 p-12 rounded-[64px] max-w-lg w-full text-center space-y-8 shadow-[0_0_100px_rgba(239,68,68,0.2)]">
               <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                  <ShieldAlert className="w-10 h-10 text-red-500 animate-pulse" />
               </div>
               <div className="space-y-4">
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Warning {violationCount}/3</h2>
                  <p className="text-red-400 font-black uppercase tracking-widest text-[10px]">{violationType}</p>
                  <p className="text-sm text-[#A1A1AA] leading-relaxed">
                    Unauthentic behavior detected. WhyNotHired strictly monitors tab migration, external copying, and LLM plagiarism. Next violation will result in <strong>SYSTEM LOCKDOWN</strong>.
                  </p>
               </div>
               <button 
                onClick={() => setViolationType(null)} 
                className="w-full py-5 bg-red-500 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-red-400 transition-all shadow-lg"
               >
                  I Acknowledge Violation
               </button>
            </div>
          </motion.div>
        )}

        {isSuspended && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black backdrop-blur-3xl"
          >
            <div className="text-center space-y-12">
               <div className="flex justify-center">
                  <div className="relative">
                    <div className="w-32 h-32 border-4 border-red-500/20 rounded-full flex items-center justify-center">
                      <Lock className="w-16 h-16 text-red-500" />
                    </div>
                    <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin" />
                  </div>
               </div>
               <div className="space-y-4">
                  <h2 className="text-6xl font-black text-white uppercase tracking-tighter">System Suspended</h2>
                  <p className="text-red-500 font-black uppercase tracking-[0.4em] text-sm italic">Authenticity Breach: Level 1 Lockdown</p>
               </div>
               <div className="text-9xl font-black text-white font-mono">{suspensionTimer}</div>
               <p className="text-[#71717A] text-xs max-w-xs mx-auto">
                 The Diagnostic Matrix is currently inaccessible due to repeated policy violations. Access will restore once neural integrity is verified.
               </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}