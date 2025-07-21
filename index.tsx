
import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
type Student = {
    id: number;
    studentId: string;
    firstName: string;
    lastName: string;
    nickname: string;
    classLevel: string;
    classRoom: string;
    status: 'active' | 'inactive' | 'graduated';
    faceRegistered: boolean;
    profileImage?: string;
    email?: string;
    phone?: string;
    parentPhone?: string;
    address?: string;
    faceDescriptor?: Float32Array; // For face recognition simulation
};

type AttendanceRecord = {
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    status: 'Present' | 'Late' | 'Absent' | 'Early Leave';
};

type RecentActivity = {
    student: Student;
    time: string;
    status: string;
};

type Page = 'dashboard' | 'manage_students' | 'attendance_checkin' | 'attendance_checkout' | 'reports' | 'settings' | 'face_registration';


// --- DATA PERSISTENCE & MOCK API ---

const LOCAL_STORAGE_KEYS = {
    STUDENTS: 'student_attendance_app_students',
    ATTENDANCE: 'student_attendance_app_attendance',
    SETTINGS: 'student_attendance_app_settings',
};

// Helper to save data to localStorage
const saveData = (key: string, data: any) => {
    try {
        let serializableData = data;
        if (key === LOCAL_STORAGE_KEYS.STUDENTS) {
            serializableData = data.map((student: Student) => {
                const { faceDescriptor, ...rest } = student;
                if (faceDescriptor) {
                    return { ...rest, faceDescriptor: Array.from(faceDescriptor) };
                }
                return rest;
            });
        }
        localStorage.setItem(key, JSON.stringify(serializableData));
    } catch (error) {
        console.error(`Error saving ${key} to localStorage`, error);
    }
};

// Helper to load data from localStorage
const loadData = (key: string) => {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const parsedData = JSON.parse(item);

        if (key === LOCAL_STORAGE_KEYS.STUDENTS) {
            return parsedData.map((student: any) => {
                if (student.faceDescriptor) {
                    return { ...student, faceDescriptor: new Float32Array(student.faceDescriptor) };
                }
                return student;
            });
        }
        return parsedData;
    } catch (error) {
        console.error(`Error loading ${key} from localStorage`, error);
        localStorage.removeItem(key); // Clear corrupted data
        return null;
    }
};

// Initial default data
const initialStudents: Student[] = [
    { id: 1, studentId: 'S001', firstName: 'สมชาย', lastName: 'ใจดี', nickname: 'ชาย', classLevel: 'ม.1', classRoom: '1', status: 'active', faceRegistered: true, profileImage: `https://i.pravatar.cc/150?u=1`, faceDescriptor: new Float32Array(128).fill(0.1) },
    { id: 2, studentId: 'S002', firstName: 'สมหญิง', lastName: 'รักเรียน', nickname: 'หญิง', classLevel: 'ม.1', classRoom: '1', status: 'active', faceRegistered: true, profileImage: `https://i.pravatar.cc/150?u=2`, faceDescriptor: new Float32Array(128).fill(0.2) },
    { id: 3, studentId: 'S003', firstName: 'มานะ', lastName: 'พากเพียร', nickname: 'นะ', classLevel: 'ม.1', classRoom: '2', status: 'active', faceRegistered: false },
    { id: 4, studentId: 'S004', firstName: 'ปิติ', lastName: 'ยินดี', nickname: 'ติ', classLevel: 'ม.2', classRoom: '1', status: 'active', faceRegistered: true, profileImage: `https://i.pravatar.cc/150?u=4`, faceDescriptor: new Float32Array(128).fill(0.3) },
    { id: 5, studentId: 'S005', firstName: 'ชูใจ', lastName: 'กล้าหาญ', nickname: 'ใจ', classLevel: 'ม.2', classRoom: '1', status: 'inactive', faceRegistered: false },
    { id: 6, studentId: 'S006', firstName: 'วีระ', lastName: 'อดทน', nickname: 'ระ', classLevel: 'ม.3', classRoom: '3', status: 'active', faceRegistered: true, profileImage: `https://i.pravatar.cc/150?u=6`, faceDescriptor: new Float32Array(128).fill(0.4) },
];

const initialAttendance: (AttendanceRecord & { student_id: number })[] = [
    { student_id: 1, date: new Date(Date.now() - 86400000).toISOString().split('T')[0], checkIn: '08:05', checkOut: '16:05', status: 'Present' },
    { student_id: 2, date: new Date().toISOString().split('T')[0], checkIn: '08:40', checkOut: null, status: 'Late' },
    { student_id: 4, date: new Date().toISOString().split('T')[0], checkIn: '07:55', checkOut: null, status: 'Present' },
    { student_id: 1, date: new Date().toISOString().split('T')[0], checkIn: '08:15', checkOut: null, status: 'Present' },
];

const initialSettings = {
    schoolName: 'โรงเรียนของเรา (ตัวอย่าง)',
    checkInTime: '08:00',
    lateTime: '08:30',
    checkOutTime: '16:00',
    confidenceThreshold: 80,
    dataRetentionDays: 90,
};

// Initialize data from localStorage or use initial data
let mockStudents: Student[] = loadData(LOCAL_STORAGE_KEYS.STUDENTS) || initialStudents;
let mockAttendance: (AttendanceRecord & { student_id: number })[] = loadData(LOCAL_STORAGE_KEYS.ATTENDANCE) || initialAttendance;
let mockSettings = loadData(LOCAL_STORAGE_KEYS.SETTINGS) || initialSettings;

// Save initial data if it wasn't in localStorage
if (!localStorage.getItem(LOCAL_STORAGE_KEYS.STUDENTS)) {
    saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
}
if (!localStorage.getItem(LOCAL_STORAGE_KEYS.ATTENDANCE)) {
    saveData(LOCAL_STORAGE_KEYS.ATTENDANCE, mockAttendance);
}
if (!localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS)) {
    saveData(LOCAL_STORAGE_KEYS.SETTINGS, mockSettings);
}

let nextStudentId = mockStudents.length > 0 ? Math.max(...mockStudents.map(s => s.id)) + 1 : 1;

// API Simulation Helper
const apiCall = async (callback: () => any, delay = 300) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            try {
                const result = callback();
                if (result && result.error) {
                    resolve({ success: false, message: result.error });
                } else {
                    resolve({ success: true, data: result });
                }
            } catch (e: any) {
                 resolve({ success: false, message: e.message });
            }
        }, delay);
    });
};


const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  const container = document.getElementById('root');
  if (container) {
    container.innerHTML = `<div class="alert alert-danger m-5">API_KEY environment variable not set. The application cannot start.</div>`;
  }
  throw new Error("API_KEY not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- TOAST NOTIFICATIONS ---
type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};
const ToastContext = React.createContext<{ addToast: (message: string, type: ToastMessage['type']) => void; }>({ addToast: () => {} });

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const addToast = (message: string, type: ToastMessage['type']) => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  const iconMap = {
      success: 'check-circle-fill',
      error: 'x-circle-fill',
      info: 'info-circle-fill'
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 1090 }}>
        {toasts.map(toast => (
          <div key={toast.id} className={`toast show align-items-center text-white bg-${toast.type === 'error' ? 'danger' : toast.type} border-0`} role="alert" aria-live="assertive" aria-atomic="true">
            <div className="d-flex">
              <div className="toast-body">
                <i className={`bi bi-${iconMap[toast.type]} me-2`}></i>
                {toast.message}
              </div>
              <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => removeToast(toast.id)} aria-label="Close"></button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};


// --- UTILITY COMPONENTS ---
const LoadingSpinner: React.FC<{ text?: string }> = ({ text }) => (
    <div className="loading-spinner-container">
        <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
        </div>
        {text && <span className="ms-2">{text}</span>}
    </div>
);

const ErrorDisplay: React.FC<{ message: string, onRetry?: () => void }> = ({ message, onRetry }) => (
    <div className="text-center p-4 my-4 bg-light border border-danger rounded shadow-sm">
        <i className="bi bi-exclamation-triangle-fill text-danger display-4"></i>
        <h4 className="mt-3">เกิดข้อผิดพลาดในการโหลดข้อมูล</h4>
        <p className="text-muted">{message}</p>
        {onRetry && (
            <button className="btn btn-primary mt-2" onClick={onRetry}>
                <i className="bi bi-arrow-clockwise me-2"></i>ลองอีกครั้ง
            </button>
        )}
    </div>
);


// --- AUTH COMPONENTS ---
const LoginScreen: React.FC<{ 
    onLoginSuccess: (username: string) => void;
    navigateTo: (page: 'attendance_checkin' | 'attendance_checkout') => void; 
}> = ({ onLoginSuccess, navigateTo }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (username.toLowerCase() === 'admin') {
            onLoginSuccess(username);
        } else {
            setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
    };

    return (
        <div className="login-screen">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-8 col-lg-6 col-xl-5">
                        <div className="text-center mb-4">
                            <div className="school-header-card">
                                <img src="https://v5.getbootstrap.com/docs/5.0/assets/img/favicons/favicon.ico" alt="School Logo" className="logo-image mb-3" />
                                <h1 className="school-name-display">{mockSettings.schoolName}</h1>
                                <p>ระบบลงเวลาเรียนด้วยการสแกนใบหน้า</p>
                            </div>
                        </div>
                        <div className="card shadow-lg border-0 login-card">
                            <div className="card-body p-4 p-md-5">
                                <div className="text-center mb-4">
                                    <h4 className="fw-bold text-primary mb-2">เข้าสู่ระบบผู้ดูแล</h4>
                                    <p className="text-muted">สำหรับผู้ดูแลระบบ (user: admin)</p>
                                </div>
                                {error && <div className="alert alert-danger">{error}</div>}
                                <form onSubmit={handleSubmit}>
                                    <div className="mb-3">
                                        <label htmlFor="username" className="form-label fw-bold"><i className="bi bi-person me-1"></i>ชื่อผู้ใช้</label>
                                        <input type="text" className="form-control form-control-lg" id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" required autoFocus />
                                    </div>
                                    <div className="mb-3">
                                        <label htmlFor="password" className="form-label fw-bold"><i className="bi bi-lock me-1"></i>รหัสผ่าน</label>
                                        <div className="input-group">
                                            <input type={isPasswordVisible ? 'text' : 'password'} className="form-control form-control-lg" id="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" required />
                                            <button className="btn btn-outline-secondary" type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} title="Show/Hide Password">
                                                <i className={`bi ${isPasswordVisible ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="d-grid mb-3 mt-4">
                                        <button type="submit" className="btn btn-primary btn-lg fw-bold"><i className="bi bi-box-arrow-in-right me-2"></i>เข้าสู่ระบบ</button>
                                    </div>
                                </form>
                                 <div className="d-flex align-items-center my-4">
                                    <hr className="flex-grow-1" />
                                    <span className="mx-3 text-muted fw-bold">หรือ</span>
                                    <hr className="flex-grow-1" />
                                </div>

                                <div className="d-grid gap-3">
                                    <button 
                                        type="button" 
                                        className="btn btn-success btn-lg fw-bold d-flex align-items-center justify-content-center"
                                        onClick={() => navigateTo('attendance_checkin')}
                                    >
                                        <i className="bi bi-camera me-2"></i>สแกนเข้าเรียน
                                    </button>
                                    <button 
                                        type="button" 
                                        className="btn btn-warning btn-lg fw-bold d-flex align-items-center justify-content-center text-dark"
                                        onClick={() => navigateTo('attendance_checkout')}
                                    >
                                        <i className="bi bi-camera me-2"></i>สแกนออกเรียน
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MODALS ---
const AttendanceModal: React.FC<{ student: Student | null; show: boolean; handleClose: () => void }> = ({ student, show, handleClose }) => {
    const [summary, setSummary] = useState('');
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [error, setError] = useState('');
    const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);


    useEffect(() => {
        const fetchAttendance = async () => {
            if (!student) return;
            setIsLoadingData(true);
            setError('');

            const getAttendance = () => {
                const records = mockAttendance.filter(a => a.student_id === student.id).map(({ student_id, ...rest }) => rest);
                return { attendance: records };
            };
            const response: any = await apiCall(getAttendance);
            
            if (response.success) {
                setAttendanceData(response.data.attendance);
            } else {
                setError(response.message || 'Failed to fetch attendance data.');
                setAttendanceData([]);
            }
            setIsLoadingData(false);
        };

        if (show && student) {
            fetchAttendance();
        } else {
            // Reset on close
            setSummary('');
            setError('');
            setAttendanceData([]);
        }
    }, [show, student]);

    const generateSummary = async () => {
        if (!student || attendanceData.length === 0) return;
        setIsLoadingSummary(true);
        setError('');
        setSummary('');

        const prompt = `Please provide a brief summary of the following student's attendance record.
            Student Name: ${student.firstName} ${student.lastName}
            Class: ${student.classLevel}/${student.classRoom}
            Attendance Data:
            ${attendanceData.map(record => `- ${record.date}: ${record.status} (Check-in: ${record.checkIn || 'N/A'}, Check-out: ${record.checkOut || 'N/A'})`).join('\n')}
            Summary should be concise, in Thai, and highlight any patterns like frequent tardiness or perfect attendance.`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setSummary(response.text);
        } catch (err) {
            console.error(err);
            setError('เกิดข้อผิดพลาดในการสร้างสรุปผล');
        } finally {
            setIsLoadingSummary(false);
        }
    };

    return (
        <div className={`modal fade ${show ? 'show d-block' : ''}`} tabIndex={-1} style={{ backgroundColor: show ? 'rgba(0,0,0,0.5)' : 'transparent' }} role="dialog" aria-modal={show} aria-hidden={!show}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title"><i className="bi bi-clock-history me-2"></i>ประวัติการลงเวลา: {student?.firstName} {student?.lastName}</h5>
                        <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
                    </div>
                    <div className="modal-body">
                        <h6>ประวัติล่าสุด</h6>
                         {isLoadingData ? <LoadingSpinner text="กำลังโหลดข้อมูล..." /> : error ? <div className="alert alert-danger">{error}</div> : (
                            <div className="table-responsive">
                                <table className="table table-sm table-striped">
                                    <thead><tr><th>วันที่</th><th>เวลามาเรียน</th><th>เวลาออกเรียน</th><th>สถานะ</th></tr></thead>
                                    <tbody>
                                        {attendanceData.length > 0 ? attendanceData.map(record => (
                                            <tr key={record.date}>
                                                <td>{record.date}</td><td>{record.checkIn || '-'}</td><td>{record.checkOut || '-'}</td>
                                                <td><span className={`badge bg-${record.status === 'Present' ? 'success' : record.status === 'Late' ? 'warning' : 'danger'}`}>{record.status}</span></td>
                                            </tr>
                                        )) : <tr><td colSpan={4} className="text-center">ไม่มีข้อมูล</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <hr/>
                        <h6><i className="bi bi-stars text-primary me-2"></i>สรุปด้วย AI</h6>
                        <button className="btn btn-sm btn-outline-primary" onClick={generateSummary} disabled={isLoadingSummary || attendanceData.length === 0}>
                            {isLoadingSummary ? <LoadingSpinner text="กำลังสร้าง..." /> : <><i className="bi bi-magic me-1"></i>สร้างสรุป</>}
                        </button>
                        {summary && <div className="card bg-light mt-3"><div className="card-body" style={{ whiteSpace: 'pre-wrap' }}>{summary}</div></div>}
                    </div>
                    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={handleClose}>ปิด</button></div>
                </div>
            </div>
        </div>
    );
};

// --- PAGE COMPONENTS ---

const DashboardSkeleton: React.FC = () => {
    return (
        <main className="main-content">
            {/* Header Skeleton */}
            <div className="school-header-section mb-4">
                <div className="card border-0 shadow-lg skeleton-placeholder" style={{ height: '158px' }}>
                </div>
            </div>

            {/* Welcome Message Skeleton */}
            <div className="row mb-4">
                <div className="col-12">
                    <div className="card border-0 shadow-sm skeleton-placeholder" style={{ height: '80px' }}>
                    </div>
                </div>
            </div>

            {/* Stat Cards Skeleton */}
            <div className="row mb-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="col-md-6 col-xl-3 mb-4">
                        <div className="card border-0 shadow-sm h-100 stat-card skeleton-placeholder" style={{ minHeight: '178px' }}>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts & Actions Skeleton */}
            <div className="row mb-4">
                <div className="col-lg-8 mb-4">
                    <div className="card border-0 shadow-sm h-100 skeleton-placeholder" style={{ minHeight: '250px' }}>
                    </div>
                </div>
                <div className="col-lg-4 mb-4">
                    <div className="card border-0 shadow-sm h-100 skeleton-placeholder" style={{ minHeight: '250px' }}>
                    </div>
                </div>
            </div>
            
            {/* Class Stats Skeleton */}
            <div className="row mb-4">
                <div className="col-12">
                    <div className="card border-0 shadow-sm skeleton-placeholder" style={{ minHeight: '180px' }}>
                    </div>
                </div>
            </div>
        </main>
    );
};


const Dashboard: React.FC<{ user: { name: string }, navigateTo: (page: Page) => void }> = ({ user, navigateTo }) => {
    const [time, setTime] = useState(new Date());
    const [stats, setStats] = useState({ totalStudents: 0, registeredFaces: 0, presentToday: 0, lateToday: 0, presentPercent: 0, absentToday: 0 });
    const [classStats, setClassStats] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
    
        const getStats = () => {
            const today = new Date().toISOString().split('T')[0];
            const presentTodayRecords = mockAttendance.filter(a => a.date === today && a.checkIn);
            const presentTodayIds = new Set(presentTodayRecords.map(a => a.student_id));
            const activeStudents = mockStudents.filter(s => s.status === 'active');
    
            const stats = {
                totalStudents: mockStudents.length,
                registeredFaces: mockStudents.filter(s => s.faceRegistered).length,
                presentToday: presentTodayIds.size,
                lateToday: presentTodayRecords.filter(a => a.status === 'Late').length,
                absentToday: activeStudents.filter(s => !presentTodayIds.has(s.id)).length,
                presentPercent: activeStudents.length > 0 ? Math.round((presentTodayIds.size / activeStudents.length) * 100) : 0,
            };
    
            const classLevels = [...new Set(mockStudents.map(s => s.classLevel))].sort();
            const classStats = classLevels.map(level => {
                const total = mockStudents.filter(s => s.classLevel === level && s.status === 'active').length;
                const presentStudentsInClass = new Set(
                    presentTodayRecords
                        .map(a => mockStudents.find(s => s.id === a.student_id))
                        .filter(s => s && s.classLevel === level)
                        .map(s => s!.id)
                );
                const late = presentTodayRecords.filter(a => {
                    const student = mockStudents.find(s => s.id === a.student_id);
                    return student && student.classLevel === level && a.status === 'Late';
                }).length;
                const present = presentStudentsInClass.size;
                return {
                    name: level,
                    total,
                    present,
                    late,
                    percent: total > 0 ? Math.round((present / total) * 100) : 0,
                };
            });
    
            return { stats, classStats };
        };
    
        const response: any = await apiCall(getStats);
    
        if (response.success) {
            setStats(response.data.stats);
            setClassStats(response.data.classStats);
        } else {
            setError(response.message || "ไม่สามารถโหลดข้อมูลแดชบอร์ดได้");
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        fetchDashboardData();
        
        return () => {
            clearInterval(timerId);
        };
    }, [fetchDashboardData, retryCount]);
    
    const handleRetry = () => {
        setRetryCount(c => c + 1);
    };

    const thaiDate = new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }).format(time);
    const thaiDay = new Intl.DateTimeFormat('th-TH', { weekday: 'long' }).format(time);

    if (isLoading) {
        return <DashboardSkeleton />;
    }
    if (error) {
        return <main className="main-content"><ErrorDisplay message={error} onRetry={handleRetry} /></main>;
    }

    return (
      <main className="main-content">
        <div className="school-header-section mb-4">
            <div className="card border-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>
                <div className="card-body text-white p-4">
                    <div className="row align-items-center">
                        <div className="col-md-8">
                            <div className="d-flex align-items-center">
                                <div className="school-logo me-4">
                                    <img src="https://v5.getbootstrap.com/docs/5.0/assets/img/favicons/favicon.ico" alt="โลโก้โรงเรียน" className="rounded-circle bg-white p-2" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                                </div>
                                <div>
                                    <h2 className="mb-1 fw-bold">{mockSettings.schoolName}</h2>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-4 text-md-end mt-3 mt-md-0">
                            <div className="current-time-display">
                                <div className="h4 mb-1">{time.toLocaleTimeString('th-TH')}</div>
                                <div className="opacity-75">{thaiDate}</div>
                                <div className="small opacity-75">{thaiDay}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="row mb-4">
            <div className="col-12">
                <div className="card border-0 shadow-sm"><div className="card-body bg-light">
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <h4 className="mb-1 text-primary"><i className="bi bi-person-circle me-2"></i>ยินดีต้อนรับ, {user.name}</h4>
                            <p className="mb-0 text-muted">สถานะ: <span className="badge bg-primary">ผู้ดูแลระบบ</span></p>
                        </div>
                    </div>
                </div></div>
            </div>
        </div>

        <div className="row mb-4">
            <div className="col-md-6 col-xl-3 mb-4"><div className="card border-0 shadow-sm h-100 card-hover stat-card"><div className="card-body text-center"><div className="stats-icon bg-primary mx-auto mb-3"><i className="bi bi-people"></i></div><h3 className="fw-bold text-primary mb-1">{stats.totalStudents}</h3><p className="text-muted mb-0">นักเรียนทั้งหมด</p></div></div></div>
            <div className="col-md-6 col-xl-3 mb-4"><div className="card border-0 shadow-sm h-100 card-hover stat-card"><div className="card-body text-center"><div className="stats-icon bg-success mx-auto mb-3"><i className="bi bi-person-check"></i></div><h3 className="fw-bold text-success mb-1">{stats.registeredFaces}</h3><p className="text-muted mb-0">ลงทะเบียนใบหน้าแล้ว</p></div></div></div>
            <div className="col-md-6 col-xl-3 mb-4"><div className="card border-0 shadow-sm h-100 card-hover stat-card"><div className="card-body text-center"><div className="stats-icon bg-info mx-auto mb-3"><i className="bi bi-calendar-check"></i></div><h3 className="fw-bold text-info mb-1">{stats.presentToday}</h3><p className="text-muted mb-0">เข้าเรียนวันนี้</p></div></div></div>
            <div className="col-md-6 col-xl-3 mb-4"><div className="card border-0 shadow-sm h-100 card-hover stat-card"><div className="card-body text-center"><div className="stats-icon bg-warning mx-auto mb-3"><i className="bi bi-clock"></i></div><h3 className="fw-bold text-warning mb-1">{stats.lateToday}</h3><p className="text-muted mb-0">มาสายวันนี้</p></div></div></div>
        </div>

        <div className="row mb-4">
            <div className="col-lg-8 mb-4">
                <div className="card border-0 shadow-sm h-100"><div className="card-header bg-light"><h5 className="mb-0"><i className="bi bi-pie-chart me-2 text-primary"></i>ภาพรวมการเข้าเรียนวันนี้</h5></div>
                    <div className="card-body"><div className="row text-center">
                        <div className="col-md-4 mb-3"><div className="p-3 border-end"><div className="display-6 text-success">{stats.presentPercent}%</div><div className="text-muted">เปอร์เซ็นต์เข้าเรียน</div><div className="progress mt-2" style={{height: '8px'}}><div className="progress-bar bg-success" style={{width: `${stats.presentPercent}%`}}></div></div></div></div>
                        <div className="col-md-4 mb-3"><div className="p-3 border-end"><div className="display-6 text-warning">{stats.lateToday}</div><div className="text-muted">มาสาย</div><div className="text-small text-muted">จาก {stats.presentToday} คน</div></div></div>
                        <div className="col-md-4 mb-3"><div className="p-3"><div className="display-6 text-danger">{stats.absentToday}</div><div className="text-muted">ขาดเรียน</div><div className="text-small text-muted">ไม่ได้ลงเวลา</div></div></div>
                    </div></div>
                </div>
            </div>
            <div className="col-lg-4 mb-4">
                <div className="card border-0 shadow-sm h-100"><div className="card-header bg-light"><h5 className="mb-0"><i className="bi bi-lightning me-2 text-primary"></i>การดำเนินการ</h5></div>
                    <div className="card-body"><div className="d-grid gap-2">
                        <button className="btn btn-primary" onClick={() => navigateTo('manage_students')}><i className="bi bi-people me-2"></i>จัดการนักเรียน</button>
                        <button className="btn btn-success" onClick={() => navigateTo('reports')}><i className="bi bi-graph-up me-2"></i>ดูรายงาน</button>
                        <button className="btn btn-info text-white" onClick={() => navigateTo('settings')}><i className="bi bi-gear me-2"></i>ตั้งค่าระบบ</button>
                    </div></div>
                </div>
            </div>
        </div>

        <div className="row mb-4">
            <div className="col-12">
                <div className="card border-0 shadow-sm"><div className="card-header bg-light"><h5 className="mb-0"><i className="bi bi-diagram-3 me-2 text-primary"></i>สถิติการเข้าเรียนแยกตามชั้น</h5></div>
                    <div className="card-body"><div className="row">
                        {classStats.map(c => (
                            <div key={c.name} className="col-md-4 col-lg-2 mb-3">
                                <div className="text-center p-3 border rounded">
                                    <h4 className="text-primary mb-1">{c.name}</h4><div className="small text-muted mb-2">มาเรียน</div>
                                    <div className="h5 text-success">{c.present}/{c.total}</div>
                                    <div className="small text-warning">มาสาย {c.late} คน</div>
                                    <div className="progress mt-2" style={{height: '4px'}}><div className="progress-bar bg-success" style={{width: `${c.percent}%`}}></div></div>
                                </div>
                            </div>
                        ))}
                    </div></div>
                </div>
            </div>
        </div>
      </main>
    );
};

const AttendancePage: React.FC<{ mode: 'checkin' | 'checkout', onBack?: () => void }> = ({ mode, onBack }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const faceOverlayRef = useRef<HTMLDivElement>(null);
    const isProcessingRef = useRef(false);
    const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
    const recognitionCooldownRef = useRef<{ [key: string]: number }>({});
    const lastTimeRef = useRef(Date.now());
    const detectionCountRef = useRef(0);
    const faceMatcherRef = useRef<any>(null);


    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState({ message: 'กำลังเริ่มระบบ...', type: 'detecting' });
    const [stats, setStats] = useState({ totalFaces: 0, countToday: 0, secondaryCount: 0, accuracy: 0 });
    const [fps, setFps] = useState(0);
    const [facesProcessed, setFacesProcessed] = useState(0);
    const [currentConfidence, setCurrentConfidence] = useState(0);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [matchConfidence, setMatchConfidence] = useState(0);
    const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
    
    const faceapi = (window as any).faceapi;

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        let detectionInterval: NodeJS.Timeout | null = null;
        
        const startSystem = async () => {
            if (!faceapi) {
                setStatus({ message: 'FaceAPI library not loaded.', type: 'error' });
                return;
            }

            let stream;
            try {
                // Start camera first for better UX
                setStatus({ message: 'กำลังเริ่มกล้อง...', type: 'detecting' });
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                if (videoRef.current) videoRef.current.srcObject = stream;
                
                // Then load models and data
                setStatus({ message: 'กำลังโหลดโมเดล AI...', type: 'detecting' });
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                ]);

                setStatus({ message: 'กำลังโหลดข้อมูลใบหน้า...', type: 'detecting' });
                
                const response: any = await apiCall(() => {
                     const studentsWithFaces = mockStudents.filter(s => s.faceRegistered && s.faceDescriptor);
                     return { students: studentsWithFaces };
                });


                if (!response.success) throw new Error(response.message || "Could not load face data.");
                
                const studentsWithFaces: Student[] = response.data.students;

                if (studentsWithFaces.length > 0) {
                    const labeledDescriptors = studentsWithFaces.map(s => {
                        return new faceapi.LabeledFaceDescriptors(
                           `${s.id}`, 
                           [s.faceDescriptor!]
                        );
                    });
                    faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
                }
                setStats(s => ({ ...s, totalFaces: studentsWithFaces.length }));
                
                setStatus({ message: `ระบบพร้อมรับการ${mode === 'checkin' ? 'เข้าเรียน' : 'ออกเรียน'}...`, type: 'ready' });
                startDetectionLoop();

            } catch (err) {
                console.error(err);
                let errorMessage = 'เกิดข้อผิดพลาดในการเริ่มระบบ';
                if (err instanceof Error) {
                    if (err.name === 'NotAllowedError') {
                        errorMessage = 'กรุณาอนุญาตให้แอปใช้กล้อง';
                    } else if (err.name === 'NotFoundError') {
                        errorMessage = 'ไม่พบกล้องในอุปกรณ์นี้';
                    }
                }
                setStatus({ message: errorMessage, type: 'error' });
            }
        };

        const startDetectionLoop = () => {
            detectionInterval = setInterval(async () => {
                if (!faceapi || !videoRef.current || videoRef.current.paused || videoRef.current.ended || isProcessingRef.current || !faceMatcherRef.current) return;

                const video = videoRef.current;
                const overlay = faceOverlayRef.current;
                if (!overlay) return;

                const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
                setFacesProcessed(p => p + 1);

                const displaySize = { width: video.clientWidth, height: video.clientHeight };
                faceapi.matchDimensions(overlay, displaySize);
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                
                while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

                if (resizedDetections.length > 0) {
                    for (const detection of resizedDetections) {
                        const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
                        const box = detection.detection.box;

                        const drawBox = document.createElement('div');
                        drawBox.className = 'face-recognition-box';
                        drawBox.style.left = `${box.x}px`;
                        drawBox.style.top = `${box.y}px`;
                        drawBox.style.width = `${box.width}px`;
                        drawBox.style.height = `${box.height}px`;

                        if (bestMatch.label !== 'unknown') {
                            const studentId = parseInt(bestMatch.label, 10);
                            const student = mockStudents.find(s => s.id === studentId) || null;

                            if (student) {
                                const label = document.createElement('div');
                                label.className = 'face-label';
                                label.innerText = `${student.firstName} ${student.lastName}`;
                                drawBox.appendChild(label);
                                overlay.appendChild(drawBox);

                                const confidence = Math.round((1 - bestMatch.distance) * 100);
                                setCurrentConfidence(confidence);
                                
                                const now = Date.now();
                                const cooldownKey = student.id.toString();
                                if (!recognitionCooldownRef.current[cooldownKey] || now - recognitionCooldownRef.current[cooldownKey] > 8000) {
                                   recognitionCooldownRef.current[cooldownKey] = now;
                                   setCurrentStudent(student);
                                   setMatchConfidence(confidence);
                                   setStatus({ message: `พบใบหน้า: ${student.firstName}`, type: 'recognized' });
                                   startFastAttendance(student);
                                }
                            }
                        } else {
                           overlay.appendChild(drawBox);
                           setCurrentConfidence(0);
                           if (!isProcessingRef.current) {
                               setStatus({ message: `รอการสแกนใบหน้า...`, type: 'ready' });
                               setCurrentStudent(null);
                           }
                        }
                    }
                } else {
                    if (!isProcessingRef.current) {
                        setStatus({ message: `รอการสแกนใบหน้า...`, type: 'ready' });
                        setCurrentStudent(null);
                        setCurrentConfidence(0);
                    }
                }
                
                detectionCountRef.current++;
                const now = Date.now();
                if (now - lastTimeRef.current >= 1000) {
                    setFps(detectionCountRef.current);
                    detectionCountRef.current = 0;
                    lastTimeRef.current = now;
                }

            }, 200);
        };


        startSystem();
        
        return () => {
            if (detectionInterval) clearInterval(detectionInterval);
            clearInterval(timerId);
            if(videoRef.current && videoRef.current.srcObject){
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
        };
    }, [mode, faceapi]);

    const startFastAttendance = (student: Student) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        countdownTimerRef.current = setTimeout(() => {
            executeAttendance(student);
        }, 500);
    };
    
    const executeAttendance = async (student: Student) => {
        setStatus({ message: 'กำลังบันทึกข้อมูล...', type: 'processing' });
        
        const recordAttendance = () => {
            const today = new Date().toISOString().split('T')[0];
            const timeNow = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    
            const existingRecordIndex = mockAttendance.findIndex(a => a.student_id === student.id && a.date === today);
    
            let status: AttendanceRecord['status'] = 'Present';
            if(mode === 'checkin' && timeNow > mockSettings.lateTime) {
                status = 'Late';
            }
            if(mode === 'checkout' && timeNow < mockSettings.checkOutTime) {
                status = 'Early Leave';
            }

            if (mode === 'checkin') {
                if (existingRecordIndex !== -1) {
                    return { error: `คุณได้ลงเวลาเข้าเรียนไปแล้ววันนี้ เวลา ${mockAttendance[existingRecordIndex].checkIn}` };
                }
                const newRecord = { student_id: student.id, date: today, checkIn: timeNow, checkOut: null, status };
                mockAttendance.unshift(newRecord);
                saveData(LOCAL_STORAGE_KEYS.ATTENDANCE, mockAttendance);
                return { time: timeNow, status: status };
            } else { // checkout
                if (existingRecordIndex !== -1) {
                    mockAttendance[existingRecordIndex].checkOut = timeNow;
                    if (mockAttendance[existingRecordIndex].status !== 'Late') { // Don't override Late status
                       mockAttendance[existingRecordIndex].status = status;
                    }
                    saveData(LOCAL_STORAGE_KEYS.ATTENDANCE, mockAttendance);
                    return { time: timeNow, status: status };
                } else {
                    return { error: "ไม่พบข้อมูลลงเวลาเข้าเรียนวันนี้" };
                }
            }
        };

        const result: any = await apiCall(recordAttendance);
        
        if (result.success) {
            const newActivity: RecentActivity = {
                student: student,
                time: result.data.time,
                status: result.data.status
            };
            setRecentActivities(prev => [newActivity, ...prev.slice(0, 7)]);
            setStats(s => ({...s, countToday: s.countToday + 1}));
            setStatus({ message: 'บันทึกสำเร็จ! รอครั้งถัดไป...', type: 'success' });
        } else {
            setStatus({ message: result.message || 'บันทึกไม่สำเร็จ', type: 'error' });
        }

        setTimeout(() => {
            isProcessingRef.current = false;
            setCurrentStudent(null);
            setStatus({ message: `ระบบพร้อมรับการ${mode === 'checkin' ? 'เข้าเรียน' : 'ออกเรียน'}...`, type: 'ready' });
        }, 2000);
    };
    
    const theme = mode === 'checkin' ? 'theme-checkin' : 'theme-checkout';
    const pageTitle = mode === 'checkin' ? 'ระบบลงเวลาเข้าเรียน' : 'ระบบลงเวลาออกเรียน';
    const modeIcon = mode === 'checkin' ? 'bi-sunrise' : 'bi-sunset';
    const modeText = mode === 'checkin' ? 'ลงเวลาเข้าเรียน' : 'ลงเวลาออกเรียน';
    const mainIcon = mode === 'checkin' ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right';
    const statText = mode === 'checkin' ? 'เข้าเรียนวันนี้' : 'ออกเรียนวันนี้';
    const secondaryStatText = mode === 'checkin' ? 'มาสายวันนี้' : 'ออกก่อนเวลา';

    return (
        <div className={`attendance-page-container ${theme}`}>
            {onBack && (
                <button onClick={onBack} className="btn btn-light position-absolute top-0 start-0 m-3 shadow-sm fw-bold" style={{ zIndex: 10 }}>
                    <i className="bi bi-arrow-left-circle me-2"></i> กลับหน้าหลัก
                </button>
            )}
            <div className="main-container-attendance">
                 <div className="header-section">
                    <div className="mode-indicator"><i className={`bi ${modeIcon} me-2`}></i>{modeText}</div>
                    <h1><i className={`bi ${mainIcon} me-2`}></i>{pageTitle}</h1>
                    <p className="mb-2">สแกนใบหน้า → {modeText}อัตโนมัติ</p>
                    <div className="time-display">{currentTime.toLocaleTimeString('th-TH')}</div>
                    <div className="mt-2">{new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(currentTime)}</div>
                    <div className="quick-stats">
                        <div className="row text-center">
                            <div className="col-3"><div className="fw-bold">{stats.totalFaces}</div><div className="small">ใบหน้าในระบบ</div></div>
                            <div className="col-3"><div className="fw-bold">{stats.countToday}</div><div className="small">{statText}</div></div>
                            <div className="col-3"><div className="fw-bold">{stats.secondaryCount}</div><div className="small">{secondaryStatText}</div></div>
                            <div className="col-3"><div className="fw-bold">{mockSettings.confidenceThreshold}%</div><div className="small">ความแม่นยำ</div></div>
                        </div>
                    </div>
                </div>

                <div className="camera-section">
                    <video id="video" ref={videoRef} autoPlay muted playsInline></video>
                    <div className="face-overlay" ref={faceOverlayRef}></div>
                    
                    <div id="status-indicator" className={`status-indicator ${status.type}`}>
                         <div className="d-flex align-items-center justify-content-center">
                            {status.type === 'detecting' || status.type === 'processing' ? <div className="spinner-border spinner-border-sm me-2" role="status"></div> : <i className={`bi ${status.type === 'ready' ? 'bi-check-circle' : status.type === 'recognized' ? 'bi-person-check-fill' : status.type === 'error' ? 'bi-x-circle-fill' : 'bi-info-circle'} me-2 fs-5`}></i>}
                            <span>{status.message}</span>
                         </div>
                    </div>
                     <div className="auto-process-info">
                        <h6><i className="bi bi-magic me-2"></i>ระบบลงเวลาอัตโนมัติ</h6>
                        <p className="mb-0"><i className="bi bi-person-check me-1"></i>เมื่อสแกนใบหน้าเจอ → แสดงชื่อ → นับถอยหลัง 0.5 วินาที → ลงเวลาอัตโนมัติ</p>
                    </div>
                    <div className="recognition-stats">
                        <div className="row text-center">
                            <div className="col-4"><div className="fw-bold">{fps}</div><div className="small">FPS</div></div>
                            <div className="col-4"><div className="fw-bold">{facesProcessed}</div><div className="small">สแกนแล้ว</div></div>
                            <div className="col-4"><div className="fw-bold">{currentConfidence}%</div><div className="small">ความแม่นยำ</div></div>
                        </div>
                    </div>
                </div>

                <div className="controls-section">
                     {currentStudent && (
                        <div className="student-info" style={{display: 'block'}}>
                            <div className="student-avatar">{currentStudent.nickname ? currentStudent.nickname.charAt(0) : currentStudent.firstName.charAt(0)}</div>
                            <h4 className="mb-2">{currentStudent.firstName} {currentStudent.lastName}</h4>
                            <div className="text-muted mb-3">
                                <div>รหัส: <span>{currentStudent.studentId}</span> | ชั้น: <span>{currentStudent.classLevel}/{currentStudent.classRoom}</span></div>
                                <div className="mt-1">ความแม่นยำ: <span>{matchConfidence}%</span></div>
                            </div>
                            <div className="mt-3" style={{display: isProcessingRef.current ? 'block' : 'none' }}>
                                <div className={`fw-bold ${mode === 'checkin' ? 'text-success' : 'text-warning'} fast-countdown`}>กำลัง{modeText}...</div>
                                <div className="progress mt-2">
                                    <div className={`progress-bar ${mode === 'checkin' ? 'bg-success' : 'bg-warning'} progress-bar-striped progress-bar-animated`} role="progressbar" style={{ width: '100%' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="recent-activity">
                        <h6><i className="bi bi-clock-history me-2"></i>{mode === 'checkin' ? 'การเข้าเรียนล่าสุด' : 'การออกเรียนล่าสุด'}</h6>
                        <div className="small">
                            {recentActivities.length > 0 ? recentActivities.map((act, index) => {
                                const statusText = act.status === 'Late' ? ' (มาสาย)' : act.status === 'Early Leave' ? ' (ออกก่อนเวลา)' : '';
                                const statusClass = act.status === 'Late' ? 'text-warning' : act.status === 'Early Leave' ? 'text-info' : mode === 'checkin' ? 'text-success' : 'text-warning';
                                return (
                                <div key={index} className="d-flex justify-content-between align-items-center py-1">
                                    <div><i className={`bi ${mainIcon} ${statusClass} me-2`}></i><strong>{act.student.firstName} {act.student.lastName}</strong><span className="text-muted small">{statusText}</span></div>
                                    <div className="text-muted small">{act.time}</div>
                                </div>
                                );
                            }) : <div className="text-muted">ยังไม่มีกิจกรรม</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AttendanceCheckoutPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => <AttendancePage mode="checkout" onBack={onBack} />;
const AttendanceCheckinPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => <AttendancePage mode="checkin" onBack={onBack} />;

const StudentCard: React.FC<{ student: Student; onEdit: (s: Student) => void; onDelete: (s: Student) => void; onViewAttendance: (s: Student) => void; onUploadImage: (s: Student) => void; onRegisterFace: (s: Student) => void; }> = ({ student, onEdit, onDelete, onViewAttendance, onUploadImage, onRegisterFace }) => (
    <div className="col-md-6 col-lg-4 mb-4">
        <div className="card h-100 card-hover">
            <div className="card-body">
                <div className="d-flex align-items-start">
                    <div className="flex-shrink-0 me-3">
                        <div className="position-relative">
                            {student.profileImage ? 
                                <img src={student.profileImage} alt={`${student.firstName}`} className="student-profile-image" /> : 
                                <div className="student-profile-image student-profile-placeholder"><i className="bi bi-person-fill"></i></div>
                            }
                            <button className="btn btn-primary btn-sm profile-upload-btn" title="อัพโหลดรูปโปรไฟล์" onClick={() => onUploadImage(student)}>
                                <i className="bi bi-camera-fill"></i>
                            </button>
                        </div>
                    </div>
                    <div className="flex-grow-1">
                        <h5 className="card-title mb-1">{student.firstName} {student.lastName}</h5>
                        <p className="text-muted small mb-1"><i className="bi bi-person-badge me-1"></i>{student.nickname}</p>
                        <div className="row mb-2">
                            <div className="col-6"><small className="text-muted">รหัส:</small><br /><span className="fw-bold text-primary">{student.studentId}</span></div>
                            <div className="col-6"><small className="text-muted">ชั้น:</small><br /><span className="fw-bold text-success">{student.classLevel}/{student.classRoom}</span></div>
                        </div>
                        <div className="mb-2">
                            <span className={`badge me-1 bg-${student.status === 'active' ? 'success' : 'secondary'}`}>{student.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</span>
                            <span className={`badge ${student.faceRegistered ? 'bg-success' : 'bg-warning text-dark'}`}>{student.faceRegistered ? 'ลงทะเบียนใบหน้า' : 'ยังไม่ลงทะเบียน'}</span>
                        </div>
                        <div className="d-grid gap-1">
                            <button onClick={() => onRegisterFace(student)} className={`btn btn-sm ${student.faceRegistered ? 'btn-outline-success' : 'btn-success'}`}>
                                <i className="bi bi-camera-video me-1"></i>{student.faceRegistered ? 'ลงทะเบียนใหม่' : 'ลงทะเบียนใบหน้า'}
                            </button>
                            <div className="btn-group w-100">
                                <button type="button" className="btn btn-outline-primary btn-sm" title="แก้ไขข้อมูล" onClick={() => onEdit(student)}><i className="bi bi-pencil"></i></button>
                                <button type="button" className="btn btn-outline-info btn-sm" title="ดูประวัติ" onClick={() => onViewAttendance(student)}><i className="bi bi-clock-history"></i></button>
                                <button type="button" className="btn btn-outline-danger btn-sm" title="ลบข้อมูล" onClick={() => onDelete(student)}><i className="bi bi-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);


const ManageStudentsPage: React.FC<{navigateTo: (page: Page, state?: any) => void}> = ({navigateTo}) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const { addToast } = useContext(ToastContext);
    
    const [modalStudent, setModalStudent] = useState<Student | null>(null);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const fetchStudents = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const response: any = await apiCall(() => ({ students: [...mockStudents] }));
        if (response.success) {
            setStudents(response.data.students);
        } else {
            setError(response.message || 'ไม่สามารถโหลดรายชื่อนักเรียนได้');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents, retryCount]);
    
    const handleRetry = () => {
        setRetryCount(c => c + 1);
    };

    const filteredStudents = useMemo(() => students.filter(s => {
        const searchLower = searchQuery.toLowerCase();
        return (s.firstName.toLowerCase().includes(searchLower) || s.lastName.toLowerCase().includes(searchLower) || s.nickname.toLowerCase().includes(searchLower) || s.studentId.toLowerCase().includes(searchLower)) &&
               (filterClass ? s.classLevel === filterClass : true) &&
               (filterStatus ? s.status === filterStatus : true);
    }), [students, searchQuery, filterClass, filterStatus]);

    const stats = useMemo(() => ({
        total: students.length,
        active: students.filter(s => s.status === 'active').length,
        registered: students.filter(s => s.faceRegistered).length,
    }), [students]);

    const handleOpenAddModal = () => { setEditingStudent(null); setShowStudentModal(true); };
    const handleOpenEditModal = (student: Student) => { setEditingStudent(student); setShowStudentModal(true); };
    const handleCloseStudentModal = () => { setEditingStudent(null); setShowStudentModal(false); };
    
    const handleSaveStudent = () => {
        handleCloseStudentModal();
        handleRetry(); // Refetch students
    };

    const handleDeleteStudent = async (student: Student) => {
        if (window.confirm(`ต้องการลบข้อมูลนักเรียน "${student.firstName} ${student.lastName}" หรือไม่?`)) {
            const deleteAction = () => {
                const initialLength = mockStudents.length;
                mockStudents = mockStudents.filter(s => s.id !== student.id);
                if (mockStudents.length === initialLength) {
                    return { error: "Student not found." };
                }
                saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
                return { message: "Success" };
            };
            const result: any = await apiCall(deleteAction);

            if (result.success) {
                addToast('ลบข้อมูลนักเรียนสำเร็จ', 'success');
                handleRetry(); // Refresh list
            } else {
                addToast(`เกิดข้อผิดพลาด: ${result.message}`, 'error');
            }
        }
    };
    const handleViewAttendance = (student: Student) => { setModalStudent(student); setShowAttendanceModal(true); };
    const closeAttendanceModal = () => { setShowAttendanceModal(false); setModalStudent(null); };

    const handleUploadImage = (student: Student) => { setModalStudent(student); setShowUploadModal(true); };
    const closeUploadModal = () => { setShowUploadModal(false); setModalStudent(null); };
    
    const handleRegisterFace = (student: Student) => {
        navigateTo('face_registration', { studentId: student.id });
    };

    return (
        <>
            <main className="main-content" id="main-content">
                <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 className="h2 fw-bold text-primary"><i className="bi bi-people-fill me-2"></i>จัดการนักเรียน</h1>
                    <div className="btn-toolbar mb-2 mb-md-0">
                         <div className="btn-group me-2">
                            <button type="button" className="btn btn-primary" onClick={handleOpenAddModal}>
                                <i className="bi bi-person-plus me-1"></i>เพิ่มนักเรียน
                            </button>
                             <button type="button" className="btn btn-success" onClick={() => navigateTo('face_registration')}>
                                <i className="bi bi-camera me-1"></i>ลงทะเบียนใบหน้า
                            </button>
                        </div>
                    </div>
                </div>

                {isLoading ? <LoadingSpinner text="กำลังโหลดรายชื่อนักเรียน..."/> : error ? <ErrorDisplay message={error} onRetry={handleRetry} /> :
                (<>
                    <div className="row mb-4">
                        <div className="col-md-3 mb-3"><div className="card card-hover"><div className="card-body d-flex align-items-center"><div className="stats-icon bg-primary me-3"><i className="bi bi-people"></i></div><div><h6 className="text-muted mb-1">นักเรียนทั้งหมด</h6><h3 className="mb-0 fw-bold">{stats.total}</h3></div></div></div></div>
                        <div className="col-md-3 mb-3"><div className="card card-hover"><div className="card-body d-flex align-items-center"><div className="stats-icon bg-success me-3"><i className="bi bi-check-circle"></i></div><div><h6 className="text-muted mb-1">นักเรียนที่ใช้งาน</h6><h3 className="mb-0 fw-bold">{stats.active}</h3></div></div></div></div>
                        <div className="col-md-3 mb-3"><div className="card card-hover"><div className="card-body d-flex align-items-center"><div className="stats-icon bg-info me-3"><i className="bi bi-person-check"></i></div><div><h6 className="text-muted mb-1">ลงทะเบียนใบหน้า</h6><h3 className="mb-0 fw-bold">{stats.registered}</h3></div></div></div></div>
                        <div className="col-md-3 mb-3"><div className="card card-hover"><div className="card-body d-flex align-items-center"><div className="stats-icon bg-warning me-3"><i className="bi bi-exclamation-triangle"></i></div><div><h6 className="text-muted mb-1">ยังไม่ลงทะเบียน</h6><h3 className="mb-0 fw-bold">{stats.total - stats.registered}</h3></div></div></div></div>
                    </div>

                    <div className="card mb-4 shadow-sm">
                        <div className="card-body"><form className="row g-3 align-items-end" onSubmit={e => e.preventDefault()}>
                            <div className="col-md-4"><label htmlFor="search-input" className="form-label">ค้นหา</label><input id="search-input" type="text" className="form-control" placeholder="ชื่อ, นามสกุล, รหัส..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
                            <div className="col-md-3"><label htmlFor="class-filter" className="form-label">ชั้นเรียน</label><select id="class-filter" className="form-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}><option value="">ทุกชั้น</option><option value="ม.1">ม.1</option><option value="ม.2">ม.2</option><option value="ม.3">ม.3</option></select></div>
                            <div className="col-md-3"><label htmlFor="status-filter" className="form-label">สถานะ</label><select id="status-filter" className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></div>
                            <div className="col-md-2 d-grid"><button type="reset" className="btn btn-secondary" onClick={() => { setSearchQuery(''); setFilterClass(''); setFilterStatus(''); }}>ล้าง</button></div>
                        </form></div>
                    </div>

                    <div className="row">
                        {filteredStudents.length > 0 ? filteredStudents.map(student => (
                            <StudentCard key={student.id} student={student} onEdit={handleOpenEditModal} onDelete={handleDeleteStudent} onViewAttendance={handleViewAttendance} onUploadImage={handleUploadImage} onRegisterFace={handleRegisterFace}/>
                        )) : <div className="col-12 text-center text-muted mt-5"><h4><i className="bi bi-search me-2"></i>ไม่พบข้อมูลนักเรียน</h4><p>ลองปรับเปลี่ยนคำค้นหาของคุณ</p></div>}
                    </div>
                </>)}
            </main>
            <AttendanceModal student={modalStudent} show={showAttendanceModal} handleClose={closeAttendanceModal} />
            <UploadImageModal student={modalStudent} show={showUploadModal} handleClose={closeUploadModal} onUploadSuccess={handleRetry} />
            <StudentModal student={editingStudent} show={showStudentModal} handleClose={handleCloseStudentModal} onSave={handleSaveStudent} />
        </>
    );
};

const StudentModal: React.FC<{ student: Student | null; show: boolean; handleClose: () => void; onSave: () => void; }> = ({ student, show, handleClose, onSave }) => {
    const { addToast } = useContext(ToastContext);
    const [formData, setFormData] = useState({
        id: '', studentId: '', firstName: '', lastName: '', nickname: '', classLevel: 'ม.1', classRoom: '1',
        status: 'active', email: '', phone: '', parentPhone: '', address: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (show) {
            if (student) {
                setFormData({
                    id: student.id.toString(), studentId: student.studentId, firstName: student.firstName, lastName: student.lastName,
                    nickname: student.nickname || '', classLevel: student.classLevel, classRoom: student.classRoom, status: student.status,
                    email: student.email || '', phone: student.phone || '', parentPhone: student.parentPhone || '', address: student.address || ''
                });
            } else {
                // Reset for new student
                setFormData({
                    id: '', studentId: '', firstName: '', lastName: '', nickname: '', classLevel: 'ม.1', classRoom: '1',
                    status: 'active', email: '', phone: '', parentPhone: '', address: ''
                });
            }
        }
    }, [student, show]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        const saveStudentAction = () => {
            if (student) { // Update
                const index = mockStudents.findIndex(s => s.id === student.id);
                if (index !== -1) {
                    const updatedStudent = { ...mockStudents[index], ...formData, id: student.id, status: formData.status as Student['status'] };
                    mockStudents[index] = updatedStudent;
                } else {
                    return { error: 'Student not found for update.' };
                }
            } else { // Add
                const newStudent: Student = {
                    ...formData,
                    id: nextStudentId++,
                    faceRegistered: false,
                    status: formData.status as Student['status'],
                };
                mockStudents.unshift(newStudent);
            }
            saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
            return { message: "Success" };
        };
    
        const result: any = await apiCall(saveStudentAction);
        
        if (result.success) {
            addToast(student ? 'อัพเดทข้อมูลสำเร็จ' : 'เพิ่มนักเรียนสำเร็จ', 'success');
            onSave();
        } else {
            addToast(`เกิดข้อผิดพลาด: ${result.message}`, 'error');
        }
        setIsSaving(false);
    };
    
    return (
    <div className={`modal fade ${show ? 'show d-block' : ''}`} tabIndex={-1} style={{ backgroundColor: show ? 'rgba(0,0,0,0.5)' : 'transparent' }} role="dialog">
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title"><i className="bi bi-person-lines-fill me-2"></i>{student ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มนักเรียนใหม่'}</h5>
              <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
            </div>
            <div className="modal-body">
                <div className="row g-3">
                    <div className="col-md-6"><label className="form-label">ชื่อจริง</label><input name="firstName" value={formData.firstName} onChange={handleChange} className="form-control" required /></div>
                    <div className="col-md-6"><label className="form-label">นามสกุล</label><input name="lastName" value={formData.lastName} onChange={handleChange} className="form-control" required /></div>
                    <div className="col-md-6"><label className="form-label">ชื่อเล่น</label><input name="nickname" value={formData.nickname} onChange={handleChange} className="form-control" /></div>
                    <div className="col-md-6"><label className="form-label">รหัสนักเรียน</label><input name="studentId" value={formData.studentId} onChange={handleChange} className="form-control" required /></div>
                    <div className="col-md-4"><label className="form-label">ชั้น</label><select name="classLevel" value={formData.classLevel} onChange={handleChange} className="form-select"><option>ม.1</option><option>ม.2</option><option>ม.3</option><option>ม.4</option><option>ม.5</option><option>ม.6</option></select></div>
                    <div className="col-md-4"><label className="form-label">ห้อง</label><input name="classRoom" value={formData.classRoom} onChange={handleChange} className="form-control" required /></div>
                    <div className="col-md-4"><label className="form-label">สถานะ</label><select name="status" value={formData.status} onChange={handleChange} className="form-select"><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option><option value="graduated">จบการศึกษา</option></select></div>
                    <div className="col-md-6"><label className="form-label">อีเมล</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="form-control" /></div>
                    <div className="col-md-6"><label className="form-label">เบอร์โทรศัพท์</label><input name="phone" value={formData.phone} onChange={handleChange} className="form-control" /></div>
                    <div className="col-md-6"><label className="form-label">เบอร์ผู้ปกครอง</label><input name="parentPhone" value={formData.parentPhone} onChange={handleChange} className="form-control" /></div>
                    <div className="col-md-6"><label className="form-label">ที่อยู่</label><textarea name="address" value={formData.address} onChange={handleChange} className="form-control" rows={1}></textarea></div>
                </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isSaving}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? <LoadingSpinner text="กำลังบันทึก..." /> : <><i className="bi bi-save me-1"></i>บันทึกข้อมูล</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    );
};

const UploadImageModal: React.FC<{ student: Student | null; show: boolean; handleClose: () => void; onUploadSuccess: () => void; }> = ({ student, show, handleClose, onUploadSuccess }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
    const [imageInfo, setImageInfo] = useState<{ originalSize: string, compressedSize: string, ratio: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { addToast } = useContext(ToastContext);
    
    useEffect(() => {
        if (!show) {
            setOriginalFile(null);
            setImageDataUrl(null);
            setImageInfo(null);
            const canvas = canvasRef.current;
            if(canvas) {
                const context = canvas.getContext('2d');
                context?.clearRect(0, 0, canvas.width, canvas.height);
                canvas.style.display = 'none';
            }
        }
    }, [show]);

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) {
            addToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
            return;
        }
        setOriginalFile(file);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                let { width, height } = img;
                const MAX_DIM = 400;
                if (width > MAX_DIM || height > MAX_DIM) {
                    if (width > height) {
                        height = (height * MAX_DIM) / width;
                        width = MAX_DIM;
                    } else {
                        width = (width * MAX_DIM) / height;
                        height = MAX_DIM;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.style.display = 'block';

                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setImageDataUrl(dataUrl);

                // Calculate compressed size from base64 string
                const head = 'data:image/jpeg;base64,';
                const imageBytes = atob(dataUrl.substring(head.length));
                const blobSize = imageBytes.length;

                setImageInfo({
                    originalSize: formatFileSize(file.size),
                    compressedSize: formatFileSize(blobSize),
                    ratio: ((1 - blobSize / file.size) * 100).toFixed(1) + '%'
                });
            };
            img.src = e.target.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!imageDataUrl || !student) return;
        setIsUploading(true);

        const uploadAction = () => {
            const index = mockStudents.findIndex(s => s.id === student.id);
            if (index !== -1) {
                mockStudents[index].profileImage = imageDataUrl;
                saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
                return { message: 'Success' };
            } else {
                return { error: 'Student not found.' };
            }
        };

        const result: any = await apiCall(uploadAction, 1000); // Simulate upload time

        if (result.success) {
            addToast(`อัพเดทรูปโปรไฟล์สำเร็จ!`, 'success');
            onUploadSuccess();
            handleClose();
        } else {
            addToast(`เกิดข้อผิดพลาด: ${result.message}`, 'error');
        }
        setIsUploading(false);
    };

    return (
        <div className={`modal fade ${show ? 'show d-block' : ''}`} tabIndex={-1} style={{ backgroundColor: show ? 'rgba(0,0,0,0.5)' : 'transparent' }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title"><i className="bi bi-image me-2"></i>อัพโหลดรูปโปรไฟล์: {student?.firstName}</h5>
                        <button type="button" className="btn-close" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body">
                        <div className="row">
                            <div className="col-md-6">
                                <h6>เลือกรูปภาพ</h6>
                                <input type="file" className="form-control" accept="image/*" onChange={handleImageSelect} />
                                {imageInfo && (
                                <div className="card bg-light mt-3">
                                    <div className="card-body">
                                        <h6 className="card-title">ข้อมูลรูปภาพ</h6>
                                        <div className="small">
                                            <div>ขนาดเดิม: <span>{imageInfo.originalSize}</span></div>
                                            <div>ขนาดใหม่: <span>{imageInfo.compressedSize}</span></div>
                                            <div>บีบอัด: <span>{imageInfo.ratio}</span></div>
                                        </div>
                                    </div>
                                </div>
                                )}
                            </div>
                            <div className="col-md-6">
                                <h6>ตัวอย่าง</h6>
                                <div className="image-preview-container">
                                    <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                                    {!originalFile && <div className="text-center text-muted"><i className="bi bi-image fs-1"></i><p>เลือกรูปภาพเพื่อแสดงตัวอย่าง</p></div>}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isUploading}>ยกเลิก</button>
                        <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={!imageDataUrl || isUploading}>
                            {isUploading ? <LoadingSpinner text="กำลังอัพโหลด..." /> : <><i className="bi bi-upload me-1"></i>อัพโหลด</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ReportsPage: React.FC = () => {
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        classLevel: '',
        status: '',
        searchQuery: '',
    });
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10;
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);

    const [records, setRecords] = useState<(AttendanceRecord & { student: Student })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);

    useEffect(() => {
        const fetchReports = async () => {
            setIsLoading(true);
            setError(null);
            
            const getReports = () => {
                const searchLower = filters.searchQuery.toLowerCase();
                const filteredRecords = mockAttendance
                    .map(record => {
                        const student = mockStudents.find(s => s.id === record.student_id);
                        if (!student) return null;
                        const { student_id, ...attendanceData } = record;
                        return { ...attendanceData, student };
                    })
                    .filter((r): r is AttendanceRecord & { student: Student } => r !== null)
                    .filter(r => {
                        return r.date >= filters.startDate &&
                               r.date <= filters.endDate &&
                               (filters.classLevel === '' || r.student.classLevel === filters.classLevel) &&
                               (filters.status === '' || r.status === filters.status) &&
                               (filters.searchQuery === '' || 
                                `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(searchLower) || 
                                r.student.studentId.toLowerCase().includes(searchLower));
                    });
                return { records: filteredRecords };
            };

            const response: any = await apiCall(getReports, 500);

            if(response.success) {
                setRecords(response.data.records);
            } else {
                setError(response.message || "Failed to fetch reports");
            }
            setIsLoading(false);
        };
        
        fetchReports();

    }, [filters]);
    
    const paginatedRecords = useMemo(() => {
      const startIndex = (currentPage - 1) * recordsPerPage;
      return records.slice(startIndex, startIndex + recordsPerPage);
    }, [records, currentPage, recordsPerPage]);
    
    const totalPages = Math.ceil(records.length / recordsPerPage);

    const summaryStats = useMemo(() => {
        const stats: { [key in AttendanceRecord['status']]: number } & { 'Early Leave': number } = { Present: 0, Late: 0, Absent: 0, "Early Leave": 0 };
        records.forEach(record => {
            if (stats[record.status as keyof typeof stats] !== undefined) {
                 stats[record.status as keyof typeof stats]++;
            }
        });
        return stats;
    }, [records]);

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstanceRef.current) chartInstanceRef.current.destroy();
            const ctx = chartRef.current.getContext('2d');
            if (ctx && (window as any).Chart) {
                chartInstanceRef.current = new (window as any).Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['มาเรียน', 'มาสาย', 'ขาดเรียน', 'ออกก่อนเวลา'],
                        datasets: [{
                            data: [summaryStats.Present, summaryStats.Late, summaryStats.Absent, summaryStats['Early Leave']],
                            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#64748b'],
                            hoverOffset: 4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
            }
        }
        return () => { if (chartInstanceRef.current) chartInstanceRef.current.destroy(); };
    }, [summaryStats]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setCurrentPage(1);
    };

    const handlePrint = () => {
        const tableHtml = document.getElementById('report-table')?.outerHTML;
        if (!tableHtml) return;
        const printWindow = window.open('', '', 'height=800,width=1000');
        printWindow?.document.write('<html><head><title>รายงานการเข้าเรียน</title>');
        printWindow?.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500&display=swap" rel="stylesheet">');
        printWindow?.document.write('<style>body { font-family: "Prompt", sans-serif; padding: 20px; } .badge{ border: 1px solid #ccc; } </style></head><body>');
        printWindow?.document.write(`<h2>รายงานการเข้าเรียน (${filters.startDate} ถึง ${filters.endDate})</h2>`);
        printWindow?.document.write(tableHtml);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        printWindow?.print();
    };

    return (
        <main className="main-content">
            <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                <h1 className="h2 fw-bold text-primary"><i className="bi bi-graph-up-arrow me-2"></i>รายงานการเข้าเรียน</h1>
                <button className="btn btn-outline-primary" onClick={handlePrint} disabled={paginatedRecords.length === 0}><i className="bi bi-printer me-2"></i>พิมพ์รายงาน</button>
            </div>

            <div className="card mb-4">
                <div className="card-header"><h5 className="mb-0"><i className="bi bi-funnel me-2"></i>ตัวกรอง</h5></div>
                <div className="card-body">
                    <div className="row g-3 align-items-end">
                        <div className="col-md-3"><label className="form-label">วันที่เริ่มต้น</label><input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="form-control" /></div>
                        <div className="col-md-3"><label className="form-label">วันที่สิ้นสุด</label><input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="form-control" /></div>
                        <div className="col-md-3"><label className="form-label">ชั้นเรียน</label><select name="classLevel" value={filters.classLevel} onChange={handleFilterChange} className="form-select"><option value="">ทุกชั้น</option><option value="ม.1">ม.1</option><option value="ม.3">ม.3</option></select></div>
                        <div className="col-md-3"><label className="form-label">สถานะ</label><select name="status" value={filters.status} onChange={handleFilterChange} className="form-select"><option value="">ทั้งหมด</option><option value="Present">มาเรียน</option><option value="Late">มาสาย</option><option value="Absent">ขาดเรียน</option></select></div>
                        <div className="col-md-12"><label className="form-label">ค้นหานักเรียน</label><input type="text" name="searchQuery" value={filters.searchQuery} onChange={handleFilterChange} className="form-control" placeholder="ค้นหาจากชื่อ, นามสกุล, หรือรหัสนักเรียน..." /></div>
                    </div>
                </div>
            </div>

            <div className="row mb-4">
                <div className="col-lg-8 mb-4">
                    <div className="card h-100">
                        <div className="card-header"><h5 className="mb-0"><i className="bi bi-table me-2"></i>ข้อมูลการเข้าเรียน</h5></div>
                        <div className="card-body" id="report-table-section">
                             {isLoading ? <LoadingSpinner text="กำลังโหลดรายงาน..." /> : error ? <div className="alert alert-danger">{error}</div> : (
                             <div className="table-responsive">
                                <table className="table table-striped table-hover" id="report-table">
                                    <thead><tr><th>วันที่</th><th>รหัสนักเรียน</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>เวลาเข้า</th><th>เวลาออก</th><th>สถานะ</th></tr></thead>
                                    <tbody>
                                        {paginatedRecords.length > 0 ? paginatedRecords.map((r, i) => (
                                            <tr key={`${r.student.id}-${r.date}-${i}`}>
                                                <td>{r.date}</td><td>{r.student.studentId}</td><td>{r.student.firstName} {r.student.lastName}</td><td>{r.student.classLevel}/{r.student.classRoom}</td>
                                                <td>{r.checkIn || '-'}</td><td>{r.checkOut || '-'}</td><td><span className={`badge bg-${r.status === 'Present' ? 'success' : r.status === 'Late' ? 'warning' : 'danger'}`}>{r.status}</span></td>
                                            </tr>
                                        )) : (<tr><td colSpan={7} className="text-center text-muted py-5">ไม่พบข้อมูลตามตัวกรองที่เลือก</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                            )}
                        </div>
                        {totalPages > 1 && <div className="card-footer d-flex justify-content-between align-items-center">
                           <span>แสดง {paginatedRecords.length} จาก {records.length} รายการ</span>
                           <nav><ul className="pagination mb-0">
                                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(c => c - 1)}>ก่อนหน้า</button></li>
                                <li className="page-item disabled"><span className="page-link">หน้า {currentPage} / {totalPages}</span></li>
                                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}><button className="page-link" onClick={() => setCurrentPage(c => c + 1)}>ถัดไป</button></li>
                           </ul></nav>
                        </div>}
                    </div>
                </div>
                <div className="col-lg-4 mb-4">
                     <div className="card h-100">
                        <div className="card-header"><h5 className="mb-0"><i className="bi bi-bar-chart-line me-2"></i>สรุปภาพรวม</h5></div>
                        <div className="card-body">
                           <ul className="list-group list-group-flush mb-3">
                              <li className="list-group-item d-flex justify-content-between align-items-center">พบข้อมูลทั้งหมด <span className="badge bg-primary rounded-pill">{records.length}</span></li>
                              <li className="list-group-item d-flex justify-content-between align-items-center text-success">มาเรียน <span className="badge bg-success rounded-pill">{summaryStats.Present}</span></li>
                              <li className="list-group-item d-flex justify-content-between align-items-center text-warning">มาสาย <span className="badge bg-warning rounded-pill">{summaryStats.Late}</span></li>
                              <li className="list-group-item d-flex justify-content-between align-items-center text-danger">ขาดเรียน <span className="badge bg-danger rounded-pill">{summaryStats.Absent}</span></li>
                           </ul>
                           <div style={{ position: 'relative', height: '250px' }}><canvas ref={chartRef}></canvas></div>
                        </div>
                     </div>
                </div>
            </div>
        </main>
    );
};

const SettingsPage: React.FC = () => {
    const [settings, setSettings] = useState({
        schoolName: '',
        checkInTime: '08:00',
        lateTime: '08:30',
        checkOutTime: '16:00',
        confidenceThreshold: 80,
        dataRetentionDays: 90,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string|null>(null);
    const { addToast } = useContext(ToastContext);


    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            setError(null);
            const response: any = await apiCall(() => ({ settings: { ...mockSettings } }));
            if(response.success) {
                setSettings(response.data.settings);
            } else {
                setError(response.message || "Failed to load settings");
            }
            setIsLoading(false);
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        const response: any = await apiCall(() => {
            mockSettings = { ...settings };
            saveData(LOCAL_STORAGE_KEYS.SETTINGS, mockSettings);
            return { message: "Success" };
        });

        if(response.success) {
            addToast('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
        } else {
             addToast(`เกิดข้อผิดพลาด: ${response.message}`, 'error');
        }
        setIsSaving(false);
    };
    
    const handleClearAttendance = async () => {
        if(window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลการลงเวลาทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
            setIsSaving(true);
            const response: any = await apiCall(() => {
                mockAttendance = [];
                saveData(LOCAL_STORAGE_KEYS.ATTENDANCE, mockAttendance);
                return { message: "Success" };
            });
            if(response.success) {
                addToast('ล้างข้อมูลการลงเวลาทั้งหมดสำเร็จ', 'success');
            } else {
                addToast(`เกิดข้อผิดพลาด: ${response.message}`, 'error');
            }
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: value,
        }));
    };
    
    if (isLoading) return <main className="main-content"><LoadingSpinner text="กำลังโหลดการตั้งค่า..."/></main>
    
    return (
        <main className="main-content">
             <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                <h1 className="h2 fw-bold text-primary"><i className="bi bi-gear-fill me-2"></i>ตั้งค่าระบบ</h1>
            </div>
            
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row">
                <div className="col-lg-8">
                    <div className="card mb-4">
                        <div className="card-header"><h5><i className="bi bi-building me-2"></i>ข้อมูลโรงเรียน</h5></div>
                        <div className="card-body">
                           <div className="mb-3">
                                <label htmlFor="schoolName" className="form-label">ชื่อโรงเรียน</label>
                                <input type="text" id="schoolName" name="schoolName" className="form-control" value={settings.schoolName} onChange={handleInputChange} />
                           </div>
                        </div>
                    </div>

                    <div className="card mb-4">
                         <div className="card-header"><h5><i className="bi bi-clock-fill me-2"></i>ตั้งค่าการลงเวลา</h5></div>
                         <div className="card-body">
                            <div className="row">
                                <div className="col-md-4 mb-3">
                                    <label htmlFor="checkInTime" className="form-label">เวลาเข้าเรียนปกติ</label>
                                    <input type="time" id="checkInTime" name="checkInTime" className="form-control" value={settings.checkInTime} onChange={handleInputChange} />
                                </div>
                                <div className="col-md-4 mb-3">
                                    <label htmlFor="lateTime" className="form-label">เวลาที่เริ่มนับสาย</label>
                                    <input type="time" id="lateTime" name="lateTime" className="form-control" value={settings.lateTime} onChange={handleInputChange} />
                                </div>
                                 <div className="col-md-4 mb-3">
                                    <label htmlFor="checkOutTime" className="form-label">เวลาออกเรียน</label>
                                    <input type="time" id="checkOutTime" name="checkOutTime" className="form-control" value={settings.checkOutTime} onChange={handleInputChange} />
                                </div>
                            </div>
                         </div>
                    </div>

                    <div className="card mb-4">
                         <div className="card-header"><h5><i className="bi bi-camera-fill me-2"></i>ตั้งค่าการสแกนใบหน้า</h5></div>
                         <div className="card-body">
                            <label htmlFor="confidenceThreshold" className="form-label">ระดับความแม่นยำขั้นต่ำ: {settings.confidenceThreshold}%</label>
                            <input type="range" className="form-range" min="50" max="95" step="1" id="confidenceThreshold" name="confidenceThreshold" value={settings.confidenceThreshold} onChange={handleInputChange}/>
                            <div className="form-text">
                                ตั้งค่าระดับความมั่นใจที่ต้องการสำหรับการยืนยันตัวตน (แนะนำ 75% ขึ้นไป)
                            </div>
                         </div>
                    </div>

                     <div className="card mb-4">
                         <div className="card-header"><h5><i className="bi bi-database-fill-gear me-2"></i>การจัดการข้อมูล</h5></div>
                         <div className="card-body">
                            <div className="mb-3">
                                <label htmlFor="dataRetentionDays" className="form-label">ระยะเวลาเก็บข้อมูล (วัน)</label>
                                <input type="number" id="dataRetentionDays" name="dataRetentionDays" className="form-control" value={settings.dataRetentionDays} onChange={handleInputChange}/>
                                <div className="form-text">
                                   กำหนดจำนวนวันที่ต้องการเก็บข้อมูลการลงเวลาย้อนหลัง
                                </div>
                            </div>
                            <button className="btn btn-outline-danger me-2" onClick={handleClearAttendance} disabled={isSaving}><i className="bi bi-eraser me-2"></i>ล้างข้อมูลการลงเวลาทั้งหมด</button>
                            <button className="btn btn-outline-secondary" disabled={isSaving}><i className="bi bi-cloud-download me-2"></i>สำรองข้อมูล</button>
                         </div>
                    </div>

                </div>

                <div className="col-lg-4">
                    <div className="card position-sticky" style={{top: '20px'}}>
                        <div className="card-body text-center">
                            <i className="bi bi-save2 display-4 text-primary mb-3"></i>
                            <h5>พร้อมบันทึก</h5>
                            <p className="text-muted">กดปุ่มด้านล่างเพื่อบันทึกการเปลี่ยนแปลงทั้งหมด</p>
                            <div className="d-grid">
                                <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? <LoadingSpinner text="กำลังบันทึก..."/> : <><i className="bi bi-save me-2"></i>บันทึกการตั้งค่า</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};

const FaceRegistrationPage: React.FC<{ navigateTo: (page: Page) => void, pageState: any }> = ({ navigateTo, pageState }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const faceOverlayRef = useRef<HTMLDivElement>(null);
    const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const faceapi = (window as any).faceapi;
    const { addToast } = useContext(ToastContext);

    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [status, setStatus] = useState({ message: 'กำลังเริ่มกล้องและเตรียมระบบ...', type: 'detecting' });
    const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null);
    const [showCaptureButton, setShowCaptureButton] = useState(false);
    
    const [filters, setFilters] = useState({
        search: '',
        classLevel: '',
        registration: 'not_registered',
    });

    const fetchStudents = async () => {
        setIsLoading(true);
        setError(null);
        const response: any = await apiCall(() => ({ students: [...mockStudents] }));
        if (response.success) {
            const studentList = response.data.students;
            setStudents(studentList);
            // Pre-select student if passed from manage students page
            if (pageState?.studentId) {
                const preSelected = studentList.find((s: Student) => s.id === pageState.studentId);
                if(preSelected && !preSelected.faceRegistered) {
                    setSelectedStudent(preSelected);
                }
            }
        } else {
            setError(response.message || 'Failed to fetch students');
        }
        setIsLoading(false);
    }

    const loadModels = async () => {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
    };
    
    const startFaceDetection = () => {
        detectionIntervalRef.current = setInterval(async () => {
            if (!faceapi || !videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
            const video = videoRef.current;
            const overlay = faceOverlayRef.current;
            if (!overlay) return;

            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
            
            const displaySize = { width: video.clientWidth, height: video.clientHeight };
            faceapi.matchDimensions(overlay, displaySize);
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            overlay.innerHTML = '';

            if (resizedDetections.length === 1) {
                const detection = resizedDetections[0];
                const box = detection.detection.box;

                const drawBox = document.createElement('div');
                drawBox.className = 'face-detection-box';
                drawBox.style.left = `${box.x}px`;
                drawBox.style.top = `${box.y}px`;
                drawBox.style.width = `${box.width}px`;
                drawBox.style.height = `${box.height}px`;
                overlay.appendChild(drawBox);

                const faceSizeRatio = (box.width * box.height) / (video.clientWidth * video.clientHeight);
                if (faceSizeRatio > 0.05 && faceSizeRatio < 0.4) {
                    setStatus({ message: 'พบใบหน้าคุณภาพดี พร้อมลงทะเบียน!', type: 'detected' });
                    setFaceDescriptor(detection.descriptor);
                    setShowCaptureButton(true);
                } else {
                     setFaceDescriptor(null);
                     setShowCaptureButton(false);
                     setStatus({ message: faceSizeRatio <= 0.05 ? 'ใบหน้าเล็กเกินไป' : 'ใบหน้าใหญ่เกินไป', type: 'no-face' });
                }

            } else {
                setFaceDescriptor(null);
                setShowCaptureButton(false);
                setStatus({ message: resizedDetections.length > 1 ? 'พบหลายใบหน้า' : 'ไม่พบใบหน้า', type: 'no-face' });
            }
        }, 300);
    };

    const startCamera = async () => {
        try {
            setStatus({ message: 'กำลังโหลดโมเดล AI...', type: 'detecting' });
            await loadModels();
            setStatus({ message: 'กำลังเริ่มกล้อง...', type: 'detecting' });
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            if (videoRef.current) videoRef.current.srcObject = stream;
            startFaceDetection();
            setStatus({ message: 'กล้องพร้อมใช้งาน', type: 'ready' });
        } catch (err) {
            console.error(err);
            let errorMessage = 'ไม่สามารถเปิดกล้องได้';
             if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                    errorMessage = 'กรุณาอนุญาตให้แอปใช้กล้อง';
                } else if (err.name === 'NotFoundError') {
                    errorMessage = 'ไม่พบกล้องในอุปกรณ์นี้';
                }
            }
            setStatus({ message: errorMessage, type: 'error' });
        }
    };
    
    const stopCamera = () => {
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
        if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        if (faceOverlayRef.current) faceOverlayRef.current.innerHTML = '';
        setStatus({ message: 'โปรดเริ่มกล้องเพื่อลงทะเบียน', type: 'detecting' });
    };
    
    useEffect(() => {
        fetchStudents();
        startCamera();
        return () => { // Cleanup on unmount
            stopCamera();
        };
    }, []);

    const filteredStudents = useMemo(() => {
        return students.filter(student => {
            const matchSearch = !filters.search ||
                `${student.firstName} ${student.lastName}`.toLowerCase().includes(filters.search.toLowerCase()) ||
                student.studentId.toLowerCase().includes(filters.search.toLowerCase());
            const matchClass = !filters.classLevel || student.classLevel === filters.classLevel;
            const matchRegistration = !filters.registration ||
                (filters.registration === 'registered' && student.faceRegistered) ||
                (filters.registration === 'not_registered' && !student.faceRegistered);
            return matchSearch && matchClass && matchRegistration;
        });
    }, [students, filters]);

    const stats = useMemo(() => ({
        total: students.length,
        registered: students.filter(s => s.faceRegistered).length,
    }), [students]);

    const handleSelectStudent = (student: Student) => {
        if (student.faceRegistered) {
            if (!window.confirm("นักเรียนคนนี้ลงทะเบียนใบหน้าแล้ว ต้องการลงทะเบียนใหม่อีกครั้งหรือไม่?")) {
                return;
            }
        }
        setSelectedStudent(student);
    };
    
    const handleCaptureFace = async () => {
        if (!selectedStudent || !faceDescriptor) {
            addToast('โปรดเลือกนักเรียนและรอให้ระบบตรวจจับใบหน้าคุณภาพดี', 'error');
            return;
        }
        
        const registerAction = () => {
            const index = mockStudents.findIndex(s => s.id === selectedStudent.id);
            if(index !== -1) {
                mockStudents[index].faceRegistered = true;
                mockStudents[index].faceDescriptor = faceDescriptor;
                saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
                return { message: "Success" };
            }
            return { error: "Student not found." };
        };

        const result: any = await apiCall(registerAction);

        if (result.success) {
            addToast(`ลงทะเบียนใบหน้าสำหรับ ${selectedStudent.firstName} สำเร็จ!`, 'success');
            setSelectedStudent(null);
            setShowCaptureButton(false);
            setFaceDescriptor(null);
            fetchStudents(); // Refresh student list
        } else {
            addToast(`เกิดข้อผิดพลาด: ${result.message}`, 'error');
        }
    };

    const handleDeleteFace = async (studentId: number) => {
        if (window.confirm('ต้องการลบข้อมูลใบหน้าที่ลงทะเบียนไว้หรือไม่?')) {
            const deleteAction = () => {
                const index = mockStudents.findIndex(s => s.id === studentId);
                if (index !== -1) {
                    mockStudents[index].faceRegistered = false;
                    mockStudents[index].faceDescriptor = undefined;
                    saveData(LOCAL_STORAGE_KEYS.STUDENTS, mockStudents);
                    return { message: "Success" };
                }
                return { error: "Face data not found." };
            };

            const result: any = await apiCall(deleteAction);
            if (result.success) {
                addToast('ลบข้อมูลใบหน้าสำเร็จ', 'success');
                fetchStudents();
            } else {
                addToast(`เกิดข้อผิดพลาด: ${result.message}`, 'error');
            }
        }
    };


    return (
        <main className="main-content">
            <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                 <h1 className="h2 fw-bold text-primary"><i className="bi bi-person-plus-fill me-2"></i>ลงทะเบียนใบหน้านักเรียน</h1>
                 <button className="btn btn-secondary" onClick={() => navigateTo('manage_students')}>
                     <i className="bi bi-arrow-left me-2"></i>กลับไปหน้ารายชื่อ
                 </button>
            </div>
            
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row">
                <div className="col-lg-7">
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <h5 className="mb-0"><i className="bi bi-camera-video me-2"></i>กล้อง</h5>
                        </div>
                        <div className="card-body camera-section-reg">
                             <div className="position-relative">
                                <video id="video" ref={videoRef} autoPlay muted playsInline></video>
                                <div className="face-overlay-reg" ref={faceOverlayRef}></div>
                            </div>
                            <div id="status-indicator" className={`status-indicator ${status.type} mt-3`}>
                                <div className="d-flex align-items-center justify-content-center">
                                    { status.type === 'detecting' && <div className="spinner-border spinner-border-sm me-2"></div>}
                                    <span>{status.message}</span>
                                </div>
                            </div>
                        </div>
                        <div className="card-footer text-center">
                            {showCaptureButton && selectedStudent ? (
                                <button className="btn btn-primary btn-lg" onClick={handleCaptureFace}>
                                    <i className="bi bi-camera me-2"></i>บันทึกใบหน้าสำหรับ {selectedStudent.firstName}
                                </button>
                            ) : (
                                <p className="text-muted mb-0">{!selectedStudent ? 'โปรดเลือกนักเรียนจากรายการด้านขวา' : 'จัดใบหน้าให้อยู่ในกรอบเพื่อเปิดใช้งานปุ่มบันทึก'}</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-lg-5">
                    <div className="card mb-4">
                        <div className="card-header"><h5 className="mb-0"><i className="bi bi-people me-2"></i>เลือกนักเรียน</h5></div>
                        <div className="card-body">
                           <input type="text" className="form-control mb-2" placeholder="ค้นหา..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
                           <select className="form-select mb-3" value={filters.registration} onChange={e => setFilters(f => ({ ...f, registration: e.target.value }))}>
                               <option value="">ทุกสถานะ</option>
                               <option value="not_registered">ยังไม่ลงทะเบียน</option>
                               <option value="registered">ลงทะเบียนแล้ว</option>
                           </select>
                           {isLoading ? <LoadingSpinner text="กำลังโหลด..." /> : (
                           <div className="students-list">
                                {filteredStudents.length > 0 ? filteredStudents.map(student => (
                                    <div key={student.id} 
                                         className={`student-card-reg ${student.faceRegistered ? 'registered' : ''} ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                                         onClick={() => handleSelectStudent(student)}>
                                        <div className={`student-avatar-reg ${student.faceRegistered ? 'registered' : ''}`}>
                                           {student.nickname ? student.nickname.charAt(0) : student.firstName.charAt(0)}
                                        </div>
                                        <div className="flex-grow-1">
                                            <div className="fw-bold">{student.firstName} {student.lastName}</div>
                                            <div className="text-muted small">รหัส: {student.studentId} | ชั้น: {student.classLevel}/{student.classRoom}</div>
                                        </div>
                                        <div>
                                            {student.faceRegistered ? (
                                                <button className="btn btn-sm btn-outline-danger" title="ลบข้อมูลใบหน้า" onClick={(e) => { e.stopPropagation(); handleDeleteFace(student.id); }}>
                                                    <i className="bi bi-trash"></i>
                                                </button>
                                            ) : <span className="badge bg-warning text-dark">รอลงทะเบียน</span>}
                                        </div>
                                    </div>
                                )) : <p className="text-center text-muted">ไม่พบนักเรียน</p>}
                           </div>
                           )}
                        </div>
                         <div className="card-footer">
                            <div className="row text-center small">
                                <div className="col-4">ทั้งหมด: <span className="fw-bold">{stats.total}</span></div>
                                <div className="col-4 text-success">ลงแล้ว: <span className="fw-bold">{stats.registered}</span></div>
                                <div className="col-4 text-warning">ยัง: <span className="fw-bold">{stats.total - stats.registered}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};


// --- LAYOUT COMPONENTS ---
const Header: React.FC<{ onToggleSidebar: () => void; onLogout: () => void; user: { name: string } }> = ({ onToggleSidebar, onLogout, user }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    
    return (
        <header>
            <nav className="navbar navbar-expand navbar-dark" style={{ backgroundColor: 'var(--primary-color)' }}>
                <div className="container-fluid">
                    <button className="btn btn-dark d-lg-none me-2" type="button" onClick={onToggleSidebar} aria-label="Toggle navigation">
                        <i className="bi bi-list"></i>
                    </button>
                    <a className="navbar-brand ms-3" href="#"><i className="bi bi-camera-fill me-2"></i>ระบบลงเวลานักเรียน</a>
                    <div className="navbar-nav ms-auto d-flex flex-row align-items-center">
                        <span className="navbar-text me-3 d-none d-sm-block" aria-live="polite">
                            <i className="bi bi-clock me-1"></i> {time.toLocaleTimeString('th-TH')} น.
                        </span>
                        <div className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                <i className="bi bi-person-circle me-1"></i> {user.name}
                            </a>
                            <ul className="dropdown-menu dropdown-menu-end">
                                <li><a className="dropdown-item text-danger" href="#" onClick={e => { e.preventDefault(); onLogout(); }}><i className="bi bi-box-arrow-right me-2"></i>ออกจากระบบ</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    );
};

const Sidebar: React.FC<{ show: boolean, currentPage: Page, navigateTo: (page: Page) => void }> = ({ show, currentPage, navigateTo }) => {
    const [isAttendanceMenuOpen, setAttendanceMenuOpen] = useState(
        ['attendance_checkin', 'attendance_checkout'].includes(currentPage)
    );

    const navItems = [
        { id: 'dashboard' as Page, icon: 'speedometer2', text: 'หน้าหลัก' },
        { 
            id: 'attendance' as Page, // Not a real page id for navigation
            icon: 'camera', 
            text: 'ลงเวลาเรียน',
            subItems: [
                { id: 'attendance_checkin' as Page, icon: 'box-arrow-in-right', text: 'ลงเวลาเข้าเรียน' },
                { id: 'attendance_checkout' as Page, icon: 'box-arrow-right', text: 'ลงเวลาออกเรียน' },
            ]
        },
        { id: 'manage_students' as Page, icon: 'people', text: 'จัดการนักเรียน' },
        { id: 'reports' as Page, icon: 'graph-up', text: 'รายงาน' },
        { id: 'settings' as Page, icon: 'gear', text: 'ตั้งค่าระบบ' },
    ];

    useEffect(() => {
        if (['attendance_checkin', 'attendance_checkout'].includes(currentPage)) {
            setAttendanceMenuOpen(true);
        }
    }, [currentPage]);

    return (
        <aside id="sidebar" className={`sidebar ${show ? 'show' : ''}`}>
            <nav className="navbar-nav">
                {navItems.map(item => (
                    item.subItems ? (
                        <React.Fragment key={item.id}>
                            <a
                                href="#"
                                className={`nav-link nav-link-toggle ${!isAttendanceMenuOpen ? 'collapsed' : ''} ${item.subItems.some(si => si.id === currentPage) ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setAttendanceMenuOpen(!isAttendanceMenuOpen);
                                }}
                            >
                                <i className={`bi bi-${item.icon} me-2`}></i> {item.text}
                            </a>
                            {isAttendanceMenuOpen && (
                                <div className="submenu">
                                    {item.subItems.map(subItem => (
                                        <a
                                            key={subItem.id}
                                            href="#"
                                            className={`nav-link sub-menu ${currentPage === subItem.id ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                navigateTo(subItem.id);
                                            }}
                                        >
                                            <i className={`bi bi-${subItem.icon} me-2`}></i> {subItem.text}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </React.Fragment>
                    ) : (
                        <a 
                            key={item.id} 
                            className={`nav-link ${currentPage === item.id ? 'active' : ''}`} 
                            href="#" 
                            onClick={(e) => {
                                e.preventDefault();
                                navigateTo(item.id as Page);
                            }}
                            aria-current={currentPage === item.id ? 'page' : undefined}>
                            <i className={`bi bi-${item.icon} me-2`}></i> {item.text}
                        </a>
                    )
                ))}
            </nav>
        </aside>
    );
};

// --- MAIN APP & AUTH WRAPPER ---
const App: React.FC<{ user: { name: string }, onLogout: () => void }> = ({ user, onLogout }) => {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [pageState, setPageState] = useState<any>(null);
    const [sidebarVisible, setSidebarVisible] = useState(false);

    const navigateTo = (page: Page, state: any = null) => {
        setCurrentPage(page);
        setPageState(state);
        if (window.innerWidth < 992) {
            setSidebarVisible(false);
        }
    };

    const toggleSidebar = () => setSidebarVisible(!sidebarVisible);

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard user={user} navigateTo={navigateTo} />;
            case 'manage_students':
                return <ManageStudentsPage navigateTo={navigateTo} />;
            case 'attendance_checkin':
                return <AttendanceCheckinPage onBack={() => navigateTo('dashboard')} />;
            case 'attendance_checkout':
                return <AttendanceCheckoutPage onBack={() => navigateTo('dashboard')} />;
            case 'reports':
                return <ReportsPage />;
            case 'settings':
                return <SettingsPage />;
            case 'face_registration':
                return <FaceRegistrationPage navigateTo={navigateTo} pageState={pageState} />;
            default:
                return <Dashboard user={user} navigateTo={navigateTo} />;
        }
    };

    return (
        <>
            <Header onToggleSidebar={toggleSidebar} onLogout={onLogout} user={user} />
            <div className={`main-layout ${sidebarVisible ? 'sidebar-toggled' : ''}`}>
                <div className="sidebar-overlay d-lg-none" onClick={toggleSidebar}></div>
                <Sidebar show={sidebarVisible} currentPage={currentPage} navigateTo={navigateTo} />
                <div className="content-wrapper">
                    {renderPage()}
                </div>
            </div>
        </>
    );
};

const AuthWrapper = () => {
    const [view, setView] = useState<'login' | 'attendance_checkin' | 'attendance_checkout' | 'app'>('login');
    const [user, setUser] = useState<{ name: string } | null>(null);

    const handleLoginSuccess = (username: string) => {
        setUser({ name: username });
        setView('app');
    };
    
    const handleLogout = () => {
        setUser(null);
        setView('login');
    };

    const navigateToScan = (page: 'attendance_checkin' | 'attendance_checkout') => {
        setView(page);
    };
    
    const navigateToLogin = () => {
        setView('login');
    };

    switch (view) {
        case 'login':
            return <LoginScreen onLoginSuccess={handleLoginSuccess} navigateTo={navigateToScan} />;
        case 'attendance_checkin':
            return <AttendanceCheckinPage onBack={navigateToLogin} />;
        case 'attendance_checkout':
            return <AttendanceCheckoutPage onBack={navigateToLogin} />;
        case 'app':
            if (user) {
                return <App user={user} onLogout={handleLogout} />;
            }
            // Fallback to login if user is not set but view is 'app'
            setView('login');
            return null;
        default:
            return <LoginScreen onLoginSuccess={handleLoginSuccess} navigateTo={navigateToScan} />;
    }
};


const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<React.StrictMode><ToastProvider><AuthWrapper /></ToastProvider></React.StrictMode>);
}
