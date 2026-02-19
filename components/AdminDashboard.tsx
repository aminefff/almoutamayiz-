
import React, { useState, useEffect, useRef } from 'react';
import { Question, AdminMessage, LessonContent, User, LessonBlock, Exam, Notification, CurriculumStatus, PhilosophyStructuredContent, PhilosophyTextAnalysisContent, MathLessonStructuredContent, AnalyticsLog } from '../types';
import { 
  Trash2, Loader2, Save, Sparkles, Inbox, 
  Database, Gamepad2, CheckCircle, LogOut, Home, FileText, Plus, Edit, 
  ChevronUp, ChevronDown, Filter, ImageIcon, Send, Bell, FileCheck, Layers, Eye, X, Palette, Type, Search, Link as LinkIcon, ExternalLink, User as UserIcon, Menu, PlayCircle, Video, Music, Volume2, Calendar, ClipboardList,
  Clock, Upload, AlertTriangle, Youtube, CheckCircle2, MessageSquare, Star, PlusCircle, Check, Maximize, BookOpen, Terminal, Code, Info, ShieldCheck, HelpCircle, Cpu, FileCode, Workflow, Boxes, Settings, Activity,
  Smartphone, Map as MapIcon, GraduationCap, Users, BrainCircuit, PenTool, History, Zap, Award, Scroll, Calculator, Globe, Server, Database as DbIcon, Lock, Mail, ArrowUp, ArrowDown, RefreshCw, HelpCircle as HelpIcon, ShieldAlert, ListOrdered, Map, MessageCircle, Maximize2,
  BarChart3, TrendingUp, Users2, Clock3, UserMinus, UserCheck, Search as SearchIcon, Key
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
    LESSON_FORMAT_PROMPT, MATH_FORMAT_PROMPT, ALL_SUBJECTS_LIST, SUBJECT_SECTIONS_MAP, PHILOSOPHY_ARTICLE_PROMPT, PHILOSOPHY_TEXT_ANALYSIS_PROMPT
} from '../constants';
import { initGemini } from '../lib/gemini';
import PhilosophyLessonEditor from './PhilosophyLessonEditor';
import PhilosophyTextAnalysisEditor from './PhilosophyTextAnalysisEditor';
import GenericLessonEditor from './GenericLessonEditor';
import MathLessonEditor from './MathLessonEditor';

const TECHNICAL_QUESTIONS = [
  { q: "ما هي البنية الهيكلية الأساسية للتطبيق؟", a: "التطبيق يعتمد على نظام Single Page Application (SPA) باستخدام React 19، مع إدارة الحالة عبر الـ Hooks ونظام Enumerated States للتحكم في مسار اللعبة." },
  { q: "كيف يتم التعامل مع التوجيه (Routing)؟", a: "لا نستخدم React Router تقليدي. التوجيه يعتمد على الحالة (Conditional Rendering) لضمان تجربة سلسة تشبه التطبيقات الأصلية (Native Apps)." },
  { q: "ما هي التقنية المستخدمة في التصميم؟", a: "Tailwind CSS مع تكوين مخصص (Custom Config) لدعم الوضع الليلي، والخط العربي Cairo، وتأثيرات الزجاج (Glassmorphism)." },
  { q: "كيف يتم تخزين البيانات؟", a: "نستخدم Supabase كقاعدة بيانات سحابية (Backend-as-a-Service) لإدارة المستخدمين، المحتوى، والنتائج في الوقت الفعلي." },
  { q: "كيف يعمل الذكاء الاصطناعي في التطبيق؟", a: "نستخدم Google Gemini API (موديلات Flash و Pro) لمعالجة النصوص، توليد الأسئلة، وتصحيح المقالات." },
  { q: "كيف يتم تأمين التطبيق؟", a: "باستخدام Supabase Row Level Security (RLS) لضمان أن كل مستخدم يصل فقط لبياناته، مع حماية المدخلات من الجانب الأمامي." },
  { q: "ما هي استراتيجية الأيقونات؟", a: "مكتبة Lucide-React لأنها خفيفة (Tree-shakable) ومتناسقة بصرياً." },
  { q: "كيف يتم التعامل مع الصوت؟", a: "نستخدم Web Audio API لإنشاء مؤثرات صوتية ديناميكية (Oscillators) دون الحاجة لتحميل ملفات صوتية ثقيلة، مما يسرع الأداء." },
  { q: "كيف يعمل نظام الإشعارات؟", a: "يعتمد على Supabase Realtime Channels للاستماع للتغييرات في جدول 'notifications' وعرضها فورياً." },
  { q: "ما هو دور Vite في المشروع؟", a: "هو أداة البناء (Build Tool) التي توفر بيئة تطوير سريعة جداً (HMR) وتحزيم فعال للإنتاج." }
];

type AdminTab = 'lessons' | 'add_lesson' | 'exams' | 'inbox' | 'notifications' | 'curriculum' | 'platform_guide' | 'statistics';

// OneSignal App ID Fixed
const ONESIGNAL_APP_ID = "bbe2a72f-8064-4f3b-9c42-ce059d0f4fa1";

interface AdminDashboardProps {
    currentUser: User;
    onPlay: () => void;
    onLogout: () => void;
    onUpdateCounts?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onPlay, onLogout, onUpdateCounts }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
      try {
          const saved = sessionStorage.getItem('admin_active_tab') as AdminTab;
          const validTabs: AdminTab[] = ['lessons', 'add_lesson', 'exams', 'inbox', 'notifications', 'curriculum', 'platform_guide', 'statistics'];
          return (saved && validTabs.includes(saved)) ? saved : 'lessons';
      } catch { return 'lessons'; }
  });
  
  const [loading, setLoading] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [guideSubTab, setGuideSubTab] = useState<'admin' | 'technical'>('admin');

  // OneSignal REST API Key Management
  const [osRestKey, setOsRestKey] = useState(localStorage.getItem('os_rest_key') || '');

  const [filterSub, setFilterSub] = useState('arabic');
  const [filterTri, setFilterTri] = useState('t1');
  const [filterType, setFilterType] = useState('lessons');
  const [orderChanged, setOrderChanged] = useState(false);

  const [lessons, setLessons] = useState<LessonContent[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumStatus[]>([]);
  
  // Analytics State
  const [statsData, setStatsData] = useState({
      activeNow: 0,
      active1h: 0,
      active5h: 0,
      active12h: 0,
      activeToday: 0,
      activeWeek: 0,
      topPages: [] as { page: string, count: number }[]
  });
  const [recentLogs, setRecentLogs] = useState<AnalyticsLog[]>([]);
  const [activeUsersList, setActiveUsersList] = useState<any[]>([]);
  const [showActiveList, setShowActiveList] = useState(true);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [logFilterUser, setLogFilterUser] = useState<string>('');
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSub, setLessonSub] = useState('arabic');
  const [lessonTri, setLessonTri] = useState('t1');
  const [lessonType, setLessonType] = useState('lessons');
  const [videoUrl, setVideoUrl] = useState(''); 
  const [blocks, setBlocks] = useState<any[]>([]);
  const [philoData, setPhiloData] = useState<PhilosophyStructuredContent | null>(null);
  const [philoAnalysisData, setPhiloAnalysisData] = useState<PhilosophyTextAnalysisContent | null>(null);
  const [mathData, setMathData] = useState<MathLessonStructuredContent | null>(null);
  const [rawText, setRawText] = useState('');
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [mapPreview, setMapPreview] = useState<string | null>(null);
  
  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [examSubject, setExamSubject] = useState('اللغة العربية');
  const [examYear, setExamYear] = useState(new Date().getFullYear());
  const [examPdfUrl, setExamPdfUrl] = useState('');

  const [inboxSubTab, setInboxSubTab] = useState<'consultations' | 'admin_messages'>('consultations');
  const [replyingMsgId, setReplyingMsgId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newNotif, setNewNotif] = useState({ title: '', content: '', link: '' });
  
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const unrepliedCount = messages.filter(m => !m.is_replied).length;
  
  const checkIsConsultation = (msg: AdminMessage) => {
      try {
          const parsed = JSON.parse(msg.content);
          return !!parsed.subject || parsed.type === 'consultation';
      } catch { return false; }
  };

  const unrepliedConsultations = messages.filter(m => !m.is_replied && checkIsConsultation(m)).length;
  const unrepliedAdminMsgs = messages.filter(m => !m.is_replied && !checkIsConsultation(m)).length;

  useEffect(() => {
    sessionStorage.setItem('admin_active_tab', activeTab);
    setOrderChanged(false);
    fetchData(); 
  }, [activeTab, filterSub, filterTri, filterType]);

  // Real-time Analytics Listener
  useEffect(() => {
      if (activeTab === 'statistics') {
          const channel = supabase.channel('admin_analytics_presence')
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
                  fetchStatistics(true); 
              })
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'analytics_logs' }, () => {
                  fetchStatistics(true);
              })
              .subscribe();
          fetchStatistics();
          return () => { supabase.removeChannel(channel); };
      }
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
        switch(activeTab) {
            case 'lessons':
                const sectionId = `${filterSub}_${filterTri}_${filterType}`;
                const { data: les } = await supabase
                    .from('lessons_content')
                    .select('*')
                    .eq('section_id', sectionId)
                    .order('order_index', { ascending: true });
                if (les) setLessons(les);
                break;
            case 'exams':
                const { data: exm } = await supabase.from('exams').select('*').order('year', { ascending: false });
                if (exm) setExams(exm);
                break;
            case 'inbox':
                const { data: msgs } = await supabase.from('admin_messages').select('*').order('created_at', { ascending: false });
                if (msgs) setMessages(msgs);
                break;
            case 'notifications':
                const { data: ntf } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
                if (ntf) setNotifications(ntf);
                break;
            case 'curriculum':
                const { data: cur } = await supabase.from('curriculum_status').select('*').order('id');
                if (cur) setCurriculum(cur);
                break;
            case 'statistics':
                await fetchStatistics();
                break;
        }
        if (activeTab !== 'inbox') {
             const { data: msgs } = await supabase.from('admin_messages').select('*').eq('is_replied', false);
             if (msgs) setMessages(msgs);
        }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchStatistics = async (silent = false) => {
      try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_analytics_summary');
          if (!rpcError && rpcData) {
              const summary = rpcData as any;
              const { data: recentLogsSimple } = await supabase.from('analytics_logs').select('page').limit(500).order('created_at', { ascending: false });
              const pageCounts: Record<string, number> = {};
              recentLogsSimple?.forEach(l => { pageCounts[l.page] = (pageCounts[l.page] || 0) + 1; });
              const sortedPages = Object.entries(pageCounts).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([page, count]) => ({ page, count }));

              setStatsData({
                  activeNow: summary.active_now || 0,
                  active1h: summary.active_1h || 0,
                  active5h: summary.active_5h || 0,
                  active12h: summary.active_12h || 0,
                  activeToday: summary.active_today || 0,
                  activeWeek: summary.active_week || 0,
                  topPages: sortedPages
              });
          }
          const { data: onlineUsers, error: usersError } = await supabase.rpc('get_online_users');
          if (!usersError && onlineUsers) setActiveUsersList(onlineUsers);

          let logsQuery = supabase.from('analytics_logs').select('*, profiles(name, avatar)').order('created_at', { ascending: false }).limit(100);
          if (logFilterUser) logsQuery = supabase.from('analytics_logs').select('*, profiles(name, avatar)').eq('user_id', logFilterUser).order('created_at', { ascending: false }).limit(100);
          const { data: logsData } = await logsQuery;
          setRecentLogs(logsData as any || []);
      } catch (e) { console.error("Stats error", e); }
  };

  const handleSaveOsKey = (key: string) => {
      setOsRestKey(key);
      localStorage.setItem('os_rest_key', key);
      window.addToast("تم حفظ مفتاح API بنجاح", "success");
  };

  // --- ONE SIGNAL PUSH LOGIC ---
  const sendOneSignalPush = async (title: string, content: string, userId?: string) => {
      if(!osRestKey) {
          window.addToast("تحذير: لم يتم تعيين مفتاح OneSignal API. الإشعار سيظهر داخل التطبيق فقط.", "info");
          return false;
      }
      
      const body: any = {
          app_id: ONESIGNAL_APP_ID,
          headings: { en: title, ar: title },
          contents: { en: content, ar: content },
          url: "https://almoutamayiz.com" // رابط التطبيق عند الضغط
      };

      if (userId) {
          // استهداف مستخدم محدد عبر المعرف الخارجي (UUID)
          body.include_aliases = { external_id: [userId] };
          body.target_channel = "push";
      } else {
          // بث عام للجميع
          body.included_segments = ["All"];
      }

      try {
          const response = await fetch('https://onesignal.com/api/v1/notifications', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Basic ${osRestKey}`
              },
              body: JSON.stringify(body)
          });
          const result = await response.json();
          if (result.errors) {
              console.error("OneSignal Error:", result.errors);
              window.addToast("فشل إرسال Push Notification (راجع المفتاح)", "error");
              return false;
          }
          return true;
      } catch (e) {
          console.error(e);
          return false;
      }
  };

  // ... (Other handlers: handleSelectLog, handleCleanOldLogs, handleMoveLesson, etc. - Kept as is)
  const handleSelectLog = (id: number) => {
      const newSet = new Set(selectedLogIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedLogIds(newSet);
  };
  const handleSelectAllLogs = () => {
      if (selectedLogIds.size === recentLogs.length) setSelectedLogIds(new Set());
      else setSelectedLogIds(new Set(recentLogs.map(l => l.id)));
  };
  const handleDeleteSelectedLogs = async () => {
      if (selectedLogIds.size === 0) return window.addToast("حدد سجلات للحذف أولاً", "info");
      if (!window.confirm(`هل أنت متأكد من حذف ${selectedLogIds.size} سجلات نهائياً؟`)) return;
      setLoading(true);
      try {
          await supabase.from('analytics_logs').delete().in('id', Array.from(selectedLogIds));
          window.addToast("تم حذف السجلات", "success");
          setSelectedLogIds(new Set());
          fetchStatistics();
      } catch (e) { window.addToast("فشل الحذف", "error"); } finally { setLoading(false); }
  };
  const handleCleanOldLogs = async () => {
      if(!confirm("هل أنت متأكد من تنظيف السجلات القديمة (أكثر من 7 أيام)؟")) return;
      setLoading(true);
      try {
          await supabase.rpc('clean_analytics_logs');
          window.addToast("تم تنظيف قاعدة البيانات", "success");
          fetchStatistics();
      } catch (e) { window.addToast("فشل التنظيف", "error"); } finally { setLoading(false); }
  };
  const handleResetLogs = async () => {
      if(!confirm("تحذير: هذا سيحذف جميع السجلات!")) return;
      setLoading(true);
      try {
          await supabase.rpc('reset_analytics_logs');
          window.addToast("تم تصفير السجلات", "success");
          fetchStatistics();
      } catch (e) { window.addToast("فشل التصفير", "error"); } finally { setLoading(false); }
  };
  const handleMoveLesson = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === lessons.length - 1) return;
      const newLessons = [...lessons];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const temp = newLessons[index];
      newLessons[index] = newLessons[targetIndex];
      newLessons[targetIndex] = temp;
      setLessons(newLessons);
      setOrderChanged(true);
  };
  const handleSaveOrder = async () => {
      setIsSavingOrder(true);
      try {
          for (let i = 0; i < lessons.length; i++) {
              await supabase.from('lessons_content').update({ order_index: i }).eq('id', lessons[i].id);
          }
          window.addToast("تم حفظ الترتيب", "success");
          setOrderChanged(false);
          fetchData();
      } catch (err) { window.addToast("فشل الحفظ", "error"); }
      finally { setIsSavingOrder(false); }
  };
  const handleEditLesson = (l: LessonContent) => {
      setEditingId(l.id);
      setLessonTitle(l.title);
      const parsed = JSON.parse(l.content);
      const sParts = l.section_id.split('_');
      setLessonSub(sParts[0]);
      setLessonTri(sParts[1]);
      if (parsed.type === 'philosophy_structured') {
          setLessonType('philosophy_article');
          setPhiloData(parsed);
          setBlocks([]);
          setPhiloAnalysisData(null);
          setMathData(null);
      } else if (parsed.type === 'philosophy_text_analysis') {
          setLessonType('philosophy_text_analysis');
          setPhiloAnalysisData(parsed);
          setPhiloData(null);
          setBlocks([]);
          setMathData(null);
      } else if (parsed.type === 'math_series') {
          setLessonType('lessons'); 
          setMathData(parsed);
          setPhiloData(null);
          setPhiloAnalysisData(null);
          setBlocks([]);
      } else if (parsed.blocks) {
          setLessonType(sParts[2] || 'lessons');
          setBlocks(parsed.blocks);
          setPhiloData(null);
          setPhiloAnalysisData(null);
          setMathData(null);
      } else {
          setLessonType(sParts[2] || 'lessons');
          setMathData(null);
      }
      setVideoUrl(parsed.video_url || '');
      handleTabChange('add_lesson');
  };
  const handleSaveExam = async () => {
      if (!examPdfUrl) return window.addToast("أدخل الرابط", "error");
      setLoading(true);
      try {
          const payload = { subject: examSubject, year: examYear, pdf_url: examPdfUrl };
          if (editingExamId) await supabase.from('exams').update(payload).eq('id', editingExamId);
          else await supabase.from('exams').insert(payload);
          window.addToast("تم حفظ الموضوع", "success");
          setEditingExamId(null); setExamPdfUrl(''); setShowExamForm(false);
          fetchData();
      } catch (e) { console.error(e); }
      setLoading(false);
  };
  const handleAiProcess = async () => {
    if (!rawText.trim()) return;
    setIsProcessingAI(true);
    try {
        const ai = initGemini();
        let prompt = LESSON_FORMAT_PROMPT;
        let effectiveType = lessonType;
        if (lessonSub === 'philosophy') {
            if (lessonType === 'philosophy_text_analysis') {
                prompt = PHILOSOPHY_TEXT_ANALYSIS_PROMPT;
            } else {
                prompt = PHILOSOPHY_ARTICLE_PROMPT;
                effectiveType = 'philosophy_article';
                setLessonType('philosophy_article');
            }
        } else if (lessonSub === 'math') {
            prompt = MATH_FORMAT_PROMPT;
            effectiveType = 'lessons'; 
            setLessonType('lessons');
        } else if (lessonType === 'philosophy_article') {
            prompt = PHILOSOPHY_ARTICLE_PROMPT;
        } else if (lessonType === 'philosophy_text_analysis') {
            prompt = PHILOSOPHY_TEXT_ANALYSIS_PROMPT;
        }
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: [{ parts: [{ text: prompt + "\n\n" + rawText }] }]
        });
        const jsonStr = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
        if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (lessonSub === 'math') {
                setMathData(parsed);
                setPhiloData(null);
                setPhiloAnalysisData(null);
                setBlocks([]);
            } else if (effectiveType === 'philosophy_article' || (lessonSub === 'philosophy' && !effectiveType.includes('analysis'))) {
                setPhiloData({...parsed, video_url: videoUrl});
                setBlocks([]);
                setPhiloAnalysisData(null);
                setMathData(null);
            } else if (effectiveType === 'philosophy_text_analysis') {
                setPhiloAnalysisData({...parsed, video_url: videoUrl});
                setPhiloData(null);
                setBlocks([]);
                setMathData(null);
            } else {
                setBlocks(Array.isArray(parsed) ? parsed : (parsed.blocks || []));
                setPhiloData(null);
                setPhiloAnalysisData(null);
                setMathData(null);
            }
            window.addToast("تم التحليل بنجاح", "success");
        }
    } catch (e) { window.addToast("فشل المعالجة", "error"); }
    finally { setIsProcessingAI(false); }
  };
  const handleSaveLesson = async (structuredData?: any) => {
    if (!lessonTitle) return window.addToast("أدخل العنوان", "error");
    setLoading(true);
    try {
        let finalContent: any = {};
        if (lessonSub === 'math' && lessonType === 'lessons') {
            finalContent = structuredData || mathData;
        }
        else if (lessonType === 'maps') {
            let imageUrl = mapPreview;
            if (mapFile) {
                const fileName = `map_${Date.now()}_${mapFile.name.replace(/\s+/g, '_')}`;
                await supabase.storage.from('lessons_media').upload(fileName, mapFile);
                const { data: publicUrlData } = supabase.storage.from('lessons_media').getPublicUrl(fileName);
                imageUrl = publicUrlData.publicUrl;
            }
            finalContent = { imageUrl, video_url: videoUrl };
        } else if (lessonType === 'philosophy_article' || (lessonSub === 'philosophy' && philoData)) {
            finalContent = { ...(structuredData || philoData), video_url: videoUrl };
        } else if (lessonType === 'philosophy_text_analysis') {
            finalContent = { ...(structuredData || philoAnalysisData), video_url: videoUrl };
        } else {
            finalContent = { blocks: structuredData || blocks, video_url: videoUrl };
        }
        const sectionId = `${lessonSub}_${lessonTri}_${lessonType}`;
        let nextOrder = 0;
        if (!editingId) {
            const { data: existing } = await supabase.from('lessons_content').select('order_index').eq('section_id', sectionId).order('order_index', { ascending: false }).limit(1);
            nextOrder = (existing?.[0]?.order_index ?? -1) + 1;
        }
        const payload: any = { 
            title: lessonTitle, section_id: sectionId, content: JSON.stringify(finalContent), 
            subject: ALL_SUBJECTS_LIST.find(s => s.id === lessonSub)?.name || '',
            user_id: currentUser.id 
        };
        if (!editingId) payload.order_index = nextOrder;
        if (editingId) await supabase.from('lessons_content').update(payload).eq('id', editingId);
        else await supabase.from('lessons_content').insert(payload);
        window.addToast("تم الحفظ", "success");
        setEditingId(null); handleTabChange('lessons'); fetchData();
    } catch (err: any) { window.addToast("خطأ في الحفظ", "error"); } 
    finally { setLoading(false); }
  };
  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // --- UPDATED SEND REPLY FUNCTION ---
  const handleSendReply = async (msg: AdminMessage) => {
      if (!replyText.trim()) return;
      setLoading(true);
      try {
          // 1. Update Database (In-App Notification via Realtime)
          await supabase.from('admin_messages').update({ is_replied: true, response: replyText }).eq('id', msg.id);
          
          let isConsultation = false;
          let subjectTag = "";
          let originalQuestionText = "";
          let hasImage = false;
          try {
              const parsed = JSON.parse(msg.content);
              isConsultation = !!parsed.subject;
              subjectTag = parsed.subject || "";
              originalQuestionText = parsed.text || parsed.content || msg.content;
              hasImage = !!parsed.imagePath;
          } catch(e) {
              originalQuestionText = msg.content;
          }
          const cleanQuestionForUser = originalQuestionText + (hasImage ? " [ + صورة مرفقة]" : "");
          const notificationTitle = isConsultation ? `وصلك رد على سؤالك في ${subjectTag}` : `وصلك رد على رسالتك إلى الإدارة`;
          
          // Insert for In-App Toast
          await supabase.from('notifications').insert({
              user_id: msg.user_id,
              title: notificationTitle,
              content: JSON.stringify({ 
                  type: 'consultation_reply', 
                  question: cleanQuestionForUser, 
                  answer: replyText, 
                  responder: currentUser.name, 
                  subject: subjectTag || "الإدارة" 
              })
          });

          // 2. Send Actual Push Notification via OneSignal
          const pushContent = `الرد: ${replyText.substring(0, 50)}${replyText.length > 50 ? '...' : ''}`;
          await sendOneSignalPush(notificationTitle, pushContent, msg.user_id);

          window.addToast("تم إرسال الرد والإشعار", "success");
          setReplyingMsgId(null); setReplyText('');
          if (onUpdateCounts) onUpdateCounts();
          fetchData();
      } catch (e) { console.error(e); }
      setLoading(false);
  };

  const SidebarItem = ({ id, active, icon, label, onClick, badgeCount }: { id: AdminTab; active: boolean; icon: any; label: string; onClick: () => void; badgeCount?: number }) => (
    <button onClick={onClick} className={`w-full flex items-center justify-between p-3 rounded-xl font-bold transition-all relative ${active ? 'bg-brand text-black shadow-lg shadow-brand/20 scale-[1.02]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
        <div className="flex items-center gap-3 relative">
            <div className="relative">
                {icon}
                {badgeCount !== undefined && badgeCount > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-black/20 shadow-[0_0_8px_rgba(220,38,38,0.5)] animate-pulse">
                        {badgeCount}
                    </div>
                )}
            </div>
            <span className="text-xs">{label}</span>
        </div>
    </button>
  );

  const canShowEditor = philoData || philoAnalysisData || (blocks && blocks.length > 0) || (lessonSub === 'math' && lessonType === 'lessons' && mathData);

  return (
    <div className="flex h-screen bg-black text-white font-cairo overflow-hidden relative">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
      
      <aside className={`fixed lg:relative inset-y-0 right-0 w-64 bg-neutral-900 border-l border-white/5 flex flex-col z-50 transition-transform duration-300 shadow-2xl ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
          <div className="p-6 flex items-center justify-between border-b border-white/5">
              <h1 className="text-2xl font-black text-brand">الإشراف</h1>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-gray-500 hover:text-white"><X size={24} /></button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
              <SidebarItem id="lessons" active={activeTab === 'lessons'} icon={<Database size={18}/>} label="أرشيف الدروس" onClick={() => handleTabChange('lessons')} />
              <SidebarItem id="add_lesson" active={activeTab === 'add_lesson'} icon={<Plus size={18}/>} label="إضافة مادة" onClick={() => { 
                setEditingId(null); setLessonTitle(''); setVideoUrl(''); setPhiloData(null); setPhiloAnalysisData(null); setMathData(null); setBlocks([]); setRawText(''); 
                handleTabChange('add_lesson'); 
              }} />
              <SidebarItem id="exams" active={activeTab === 'exams'} icon={<FileCheck size={18}/>} label="بنك المواضيع" onClick={() => handleTabChange('exams')} />
              <SidebarItem id="inbox" active={activeTab === 'inbox'} icon={<Inbox size={18}/>} label="البريد الوارد" onClick={() => handleTabChange('inbox')} badgeCount={unrepliedCount} />
              <SidebarItem id="notifications" active={activeTab === 'notifications'} icon={<Bell size={18}/>} label="الإشعارات" onClick={() => handleTabChange('notifications')} />
              <SidebarItem id="curriculum" active={activeTab === 'curriculum'} icon={<ClipboardList size={18}/>} label="إدارة المنهج" onClick={() => handleTabChange('curriculum')} />
              <SidebarItem id="statistics" active={activeTab === 'statistics'} icon={<BarChart3 size={18}/>} label="الإحصائيات" onClick={() => handleTabChange('statistics')} />
              <SidebarItem id="platform_guide" active={activeTab === 'platform_guide'} icon={<HelpIcon size={18}/>} label="فهم التطبيق" onClick={() => handleTabChange('platform_guide')} />
              
              <div className="h-px bg-white/5 my-4"></div>
              <button onClick={onPlay} className="w-full flex items-center gap-3 p-3 text-gray-400 hover:text-white"><Home size={18}/> <span className="text-xs">الرئيسية</span></button>
              <button onClick={onLogout} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-500/10 rounded-xl"><LogOut size={18}/> <span className="text-xs">خروج</span></button>
          </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-black shadow-inner border-r border-white/5">
          <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-neutral-900/50 shrink-0">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-brand"><Menu size={24} /></button>
              <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">{activeTab === 'platform_guide' ? 'فهم التطبيق' : activeTab === 'statistics' ? 'الإحصائيات المتقدمة' : activeTab}</h2>
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand font-black text-xs relative">
                    A
                    {unrepliedCount > 0 && <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-black animate-pulse"></div>}
                 </div>
              </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar pb-40 relative bg-black min-h-screen">
              
              {/* --- Statistics Tab --- */}
              {activeTab === 'statistics' && (
                  <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
                      {/* ... (Previous Stats Cards - Kept as is) ... */}
                      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                          <div className={`bg-neutral-900/40 p-4 rounded-[1.5rem] border transition-all relative overflow-hidden group cursor-pointer lg:col-span-1 ${showActiveList ? 'border-green-500/50 bg-green-900/10' : 'border-white/5'}`} onClick={() => setShowActiveList(!showActiveList)}>
                              <div className="absolute top-0 right-0 w-1.5 h-full bg-green-500 animate-pulse"></div>
                              <div className="flex justify-between items-start mb-2"><Activity size={18} className="text-green-500"/><span className="text-green-500 text-[9px] font-black bg-green-500/10 px-2 py-0.5 rounded">مباشر</span></div>
                              <h3 className="text-2xl font-black text-white mb-1">{statsData.activeNow}</h3>
                              <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1">نشط الآن</p>
                          </div>
                          {/* ... Other stats cards ... */}
                      </div>
                      {/* ... (Rest of Stats Content) ... */}
                  </div>
              )}

              {/* --- Lessons, Add Lesson, Exams Tabs (Kept as is) --- */}
              {activeTab === 'lessons' && (
                  <div className="animate-fadeIn space-y-8">
                      {/* ... (Existing Lessons Content) ... */}
                      <div className="bg-neutral-900/60 p-6 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-xl">
                          <div className="space-y-1">
                              <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest mr-2">المادة</label>
                              <select 
                                value={filterSub} 
                                onChange={e => { 
                                    const sub = e.target.value;
                                    setFilterSub(sub); 
                                    const sections = SUBJECT_SECTIONS_MAP[sub] || [];
                                    setFilterType(sections[0]?.id || 'lessons'); 
                                }} 
                                className="w-full bg-black border border-white/10 rounded-xl p-3 text-xs font-bold text-white"
                              >
                                {ALL_SUBJECTS_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                          </div>
                          {/* ... */}
                      </div>
                      {/* ... */}
                  </div>
              )}

              {activeTab === 'add_lesson' && (
                  <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
                      {/* ... (Existing Add Lesson Content) ... */}
                      <div className="bg-neutral-900/60 p-8 rounded-[2.5rem] border border-white/5 space-y-6 shadow-2xl relative overflow-hidden">
                          {/* ... */}
                          {!canShowEditor && (
                             <div className="space-y-4 animate-slideIn">
                                  {/* ... */}
                                  <textarea value={rawText} onChange={e => setRawText(e.target.value)} className="w-full h-48 bg-black border border-white/10 rounded-2xl p-4 text-sm outline-none font-bold text-white" placeholder={lessonSub === 'philosophy' ? "الصق نص المقالة الخام هنا وسيقوم الذكاء الاصطناعي بتقسيمها..." : "الصق النص هنا..."} />
                                  <button onClick={handleAiProcess} disabled={isProcessingAI} className="w-full py-4 bg-fuchsia-600 rounded-xl font-black flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all text-white">{isProcessingAI ? <Loader2 className="animate-spin"/> : <Sparkles size={18}/>}<span>تنسيق ذكي بواسطة AI</span></button>
                              </div>
                          )}
                      </div>
                      {/* ... Editors ... */}
                      {lessonSub === 'math' && lessonType === 'lessons' && mathData && <div className="animate-slideIn"><MathLessonEditor initialData={mathData} onSave={(d) => handleSaveLesson(d)} onCancel={() => setMathData(null)} /></div>}
                      {lessonType === 'philosophy_article' && philoData && <div className="animate-slideIn"><PhilosophyLessonEditor initialData={philoData} lessonId={editingId || 0} onSave={(d) => handleSaveLesson(d)} onCancel={() => setPhiloData(null)} videoUrl={videoUrl} /></div>}
                      {lessonType === 'philosophy_text_analysis' && philoAnalysisData && <div className="animate-slideIn"><PhilosophyTextAnalysisEditor initialData={philoAnalysisData} onSave={(d) => handleSaveLesson(d)} onCancel={() => setPhiloAnalysisData(null)} /></div>}
                      {blocks && blocks.length > 0 && <div className="animate-slideIn"><GenericLessonEditor initialBlocks={blocks} onSave={(d) => handleSaveLesson(d)} onCancel={() => setBlocks([])} /></div>}
                  </div>
              )}

              {/* ... (Exams Tab - Kept as is) ... */}

              {activeTab === 'inbox' && (
                  <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
                      <div className="flex bg-neutral-900/60 p-2 rounded-2xl border border-white/5 mb-8">
                          {/* ... Tab Switchers ... */}
                          <button onClick={() => setInboxSubTab('consultations')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${inboxSubTab === 'consultations' ? 'bg-brand text-black shadow-lg' : 'text-gray-500'}`}>الاستشارات التعليمية {unrepliedConsultations > 0 && <span className="bg-red-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-lg animate-pulse">{unrepliedConsultations}</span>}</button>
                          <button onClick={() => setInboxSubTab('admin_messages')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${inboxSubTab === 'admin_messages' ? 'bg-brand text-black shadow-lg' : 'text-gray-500'}`}>رسائل الإدارة العامة {unrepliedAdminMsgs > 0 && <span className="bg-red-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-lg animate-pulse">{unrepliedAdminMsgs}</span>}</button>
                      </div>
                      <div className="space-y-4">
                          {messages.filter(m => { 
                              const isConsult = checkIsConsultation(m);
                              return inboxSubTab === 'consultations' ? isConsult : !isConsult; 
                          }).map(msg => {
                              // ... Message Rendering ...
                              return (
                                  <div key={msg.id} className={`bg-neutral-900/40 p-6 rounded-[2.5rem] border transition-all ${msg.is_replied ? 'border-white/5 opacity-60' : 'border-brand/20 shadow-xl'}`}>
                                      {/* ... (Header and Content) ... */}
                                      <div className="space-y-4 mb-6">
                                          <p className="text-gray-300 text-sm leading-relaxed font-medium whitespace-pre-wrap">{msg.content}</p>
                                      </div>

                                      {msg.is_replied ? (
                                          <div className="bg-green-600/10 p-4 rounded-xl border border-green-600/20">
                                              <p className="text-green-400 text-xs font-bold leading-relaxed">تم الرد: {msg.response}</p>
                                          </div>
                                      ) : (
                                          <div className="space-y-3">
                                              <textarea 
                                                value={replyingMsgId === msg.id ? replyText : ''} 
                                                onChange={e => { setReplyingMsgId(msg.id); setReplyText(e.target.value); }} 
                                                className="w-full bg-black border border-white/10 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand h-24 text-white" 
                                                placeholder="اكتب ردك هنا..." 
                                              />
                                              <button onClick={() => handleSendReply(msg)} disabled={loading} className="w-full py-3 bg-brand text-black rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95">
                                                  {loading ? <Loader2 className="animate-spin"/> : <Send size={14}/>} <span>إرسال الرد وتنبيه التلميذ (In-App + Push)</span>
                                              </button>
                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {activeTab === 'notifications' && (
                  <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
                      {/* OneSignal API Key Setup */}
                      <div className="bg-neutral-900/60 p-6 rounded-[2rem] border border-white/5 shadow-xl mb-6">
                          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Key size={16} className="text-brand"/> إعدادات مفتاح OneSignal (REST API Key)</h3>
                          <div className="flex gap-2">
                              <input 
                                type="password" 
                                value={osRestKey} 
                                onChange={e => setOsRestKey(e.target.value)} 
                                placeholder="ألصق مفتاح REST API Key هنا لتفعيل البث المباشر..." 
                                className="flex-1 bg-black border border-white/10 rounded-xl p-3 text-xs font-bold outline-none focus:border-brand text-white" 
                              />
                              <button onClick={() => handleSaveOsKey(osRestKey)} className="bg-white/10 hover:bg-white/20 text-white px-4 rounded-xl font-bold text-xs">حفظ</button>
                          </div>
                          {!osRestKey && <p className="text-red-400 text-[9px] mt-2 font-bold">تنبيه: بدون هذا المفتاح، ستظهر الإشعارات داخل التطبيق فقط ولن تصل للهواتف.</p>}
                      </div>

                      <div className="bg-neutral-900/60 p-8 rounded-[2.5rem] border border-white/5 space-y-4 shadow-2xl mb-10">
                          <h3 className="text-brand font-black flex items-center gap-2 mb-4"><Bell size={20}/> إرسال إشعار عام للجميع</h3>
                          <input type="text" value={newNotif.title} onChange={e => setNewNotif({...newNotif, title: e.target.value})} placeholder="عنوان الإشعار..." className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-brand text-white" />
                          <textarea value={newNotif.content} onChange={e => setNewNotif({...newNotif, content: e.target.value})} placeholder="نص الرسالة..." className="w-full h-32 bg-black border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-brand text-white" />
                          <div className="relative">
                            <LinkIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600" size={18}/>
                            <input type="text" value={newNotif.link} onChange={e => setNewNotif({...newNotif, link: e.target.value})} placeholder="رابط اختياري (URL)..." className="w-full bg-black border border-white/10 rounded-xl py-4 pr-12 pl-4 text-xs font-bold outline-none focus:border-brand text-white" />
                          </div>
                          <button onClick={async () => { 
                            if(!newNotif.title || !newNotif.content) return; 
                            setLoading(true); 
                            const payload = { 
                                type: 'general_broadcast', 
                                title: newNotif.title, 
                                content: newNotif.content, 
                                link: newNotif.link || null 
                            };
                            // 1. Insert In-App DB
                            await supabase.from('notifications').insert({ 
                                title: newNotif.title, 
                                content: JSON.stringify(payload) 
                            }); 
                            // 2. Send Push
                            await sendOneSignalPush(newNotif.title, newNotif.content);

                            window.addToast("تم بث الإشعار بنجاح", "success"); 
                            setNewNotif({ title: '', content: '', link: '' }); 
                            fetchData(); 
                            setLoading(false);
                          }} className="w-full py-4 bg-brand text-black rounded-xl font-black shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"><Send size={18}/> {loading ? 'جاري البث...' : 'بث التنبيه (In-App + Push)'}</button>
                      </div>
                      
                      {/* ... Existing Notifications List ... */}
                      <div className="space-y-4">
                          {notifications.map(n => {
                              // ...
                              return (
                                <div key={n.id} className="bg-neutral-900/40 p-5 rounded-3xl border border-white/5 flex justify-between items-center"><div><h4 className="font-bold text-white text-sm">{n.title}</h4><p className="text-[10px] text-gray-500 mt-1 line-clamp-1">{n.content}</p></div><button onClick={async () => { if(confirm('حذف الإشعار؟')) { await supabase.from('notifications').delete().eq('id', n.id); fetchData(); } }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl"><Trash2 size={16}/></button></div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {/* ... (Platform Guide - Kept as is) ... */}
          </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
