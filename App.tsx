
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import AuthScreen from './components/AuthScreen';
import AdminDashboard from './components/AdminDashboard';
import SelectionScreen from './components/SelectionScreen';
import BottomNav from './components/BottomNav';
import HomeScreen from './components/HomeScreen';
import LessonsScreen from './components/LessonsScreen';
import TeachersScreen from './components/TeachersScreen';
import CommunityScreen from './components/CommunityScreen';
import GameHub from './components/GameHub';
import SettingsModal from './components/SettingsModal';
import NotificationsModal from './components/NotificationsModal';
import CalculatorScreen from './components/CalculatorScreen';
import ReferralScreen from './components/ReferralScreen';
import UserGuide from './components/UserGuide';
import Header from './components/Header'; 
import AnalyticsTracker from './components/AnalyticsTracker'; 
import PrivacyModal from './components/PrivacyModal';
import OfflineScreen from './components/OfflineScreen'; 
import { Bell, Check, X } from 'lucide-react';

import { GameState, Question, User, AppTab, MatchingGameData, Notification as AppNotification } from './types'; 
import { setGameVolume, playNotificationSound, playClickSound } from './utils/audio';
import { supabase } from './lib/supabase';
import { initGA } from './lib/analytics'; 
import { CacheManager } from './lib/cache'; 
import MatchingGameSelectionScreen from './components/MatchingGameSelectionScreen'; 
import MatchingGame from './components/MatchingGame'; 
import { ALL_SUBJECTS_LIST } from './constants';

const ADMIN_EMAILS = ['yayachdz@gmail.com', 'amineghouil@yahoo.com'];

declare global {
  interface Window {
    OneSignalDeferred: any[];
  }
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.AUTH);
  const [currentTab, setCurrentTab] = useState<AppTab>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [finalPrize, setFinalPrize] = useState("0");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const [unrepliedMessagesCount, setUnrepliedMessagesCount] = useState(0);
  const [selectedMatchingGameData, setSelectedMatchingGameData] = useState<MatchingGameData | null>(null);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine); 
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [unreadCommunitySubjects, setUnreadCommunitySubjects] = useState<Set<string>>(new Set());

  // --- PREFETCHER ---
  useEffect(() => {
      if (gameState === GameState.APP && currentUser) {
          const prefetchProgress = async () => {
              const { data } = await supabase.from('user_progress').select('item_id').eq('user_id', currentUser.id).eq('item_type', 'lesson_completion');
              if (data) CacheManager.setAllProgress(data.map(d => d.item_id));
          };
          const prefetchPriorityLessons = async () => {
              if (!CacheManager.getLessons('philosophy_t1_philosophy_article')) {
                  const { data } = await supabase.from('lessons_content').select('*').eq('section_id', 'philosophy_t1_philosophy_article');
                  if (data) CacheManager.setLessons('philosophy_t1_philosophy_article', data);
              }
          };
          const prefetchCommunity = async () => {
              const promises = ALL_SUBJECTS_LIST.map(async (sub) => {
                  if (!CacheManager.getMessages(sub.id)) {
                      const { data } = await supabase.from('community_messages').select('*').eq('subject_id', sub.id).order('created_at', { ascending: true }).limit(30);
                      if (data) {
                          const sorted = data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                          CacheManager.setMessages(sub.id, sorted);
                      }
                  }
              });
              await Promise.all(promises);
          };
          setTimeout(() => {
              prefetchProgress();
              prefetchPriorityLessons();
              prefetchCommunity();
          }, 1000); 
      }
  }, [gameState, currentUser]);

  useEffect(() => {
    initGA();
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'privacy') {
        setIsPrivacyMode(true);
        setLoading(false); 
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => setShowPermissionModal(true), 5000);
    }

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- OneSignal Logic ---
  const handleRequestPermission = () => {
      playClickSound();
      setShowPermissionModal(false);
      if (window.OneSignalDeferred) {
          window.OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.Slidedown.promptPush();
          });
      }
  };

  useEffect(() => {
      if (currentUser && window.OneSignalDeferred) {
          window.OneSignalDeferred.push(function(OneSignal) {
              // ربط المعرف الخارجي لـ OneSignal (UUID الخاص بالمستخدم)
              OneSignal.login(currentUser.id);
              OneSignal.User.addTag("user_name", currentUser.name);
              OneSignal.User.addTag("user_role", currentUser.role);
          });
      }
  }, [currentUser]);

  const fetchUnrepliedCount = useCallback(async () => {
    try {
        const { count, error } = await supabase.from('admin_messages').select('*', { count: 'exact', head: true }).eq('is_replied', false);
        if (!error) setUnrepliedMessagesCount(count || 0);
    } catch (e) { console.error(e); }
  }, []);

  const fetchNotifications = useCallback(async (userId: string) => {
    try {
        const { data, error } = await supabase.from('notifications').select('*').or(`user_id.is.null,user_id.eq.${userId}`).order('created_at', { ascending: false }).limit(20);
        if (data) setNotifications(data);
    } catch (e) { console.error("Error fetching notifications", e); }
  }, []);

  const checkCommunityUnreadStatus = useCallback(async (userId: string) => {
      try {
          const { data: recentMessages, error: msgError } = await supabase.from('community_messages').select('subject_id, created_at').order('created_at', { ascending: false }).limit(50); 
          if (msgError || !recentMessages) return;
          const latestMsgBySubject: Record<string, string> = {};
          recentMessages.forEach(msg => {
              if (!latestMsgBySubject[msg.subject_id]) latestMsgBySubject[msg.subject_id] = msg.created_at;
          });
          const { data: userReads } = await supabase.from('community_reads').select('subject_id, last_read_at').eq('user_id', userId);
          const userReadsMap: Record<string, string> = {};
          if (userReads) userReads.forEach(r => userReadsMap[r.subject_id] = r.last_read_at);
          const newUnreadSet = new Set<string>();
          Object.keys(latestMsgBySubject).forEach(subjectId => {
              const lastReadTime = userReadsMap[subjectId];
              const latestMsgTime = latestMsgBySubject[subjectId];
              if (!lastReadTime || new Date(latestMsgTime) > new Date(lastReadTime)) newUnreadSet.add(subjectId);
          });
          setUnreadCommunitySubjects(newUnreadSet);
      } catch (e) { console.error("Error checking community unread", e); }
  }, []);

  const fetchProfile = useCallback(async (userId: string, email: string, retries = 5) => {
    try {
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!profile && retries > 0) {
        await new Promise(res => setTimeout(res, 1200));
        return fetchProfile(userId, email, retries - 1);
      }
      if (profile) {
        const cleanEmail = email.toLowerCase().trim();
        const isAdmin = ADMIN_EMAILS.includes(cleanEmail);
        setCurrentUser({
          id: profile.id,
          name: profile.name || 'طالب متميز',
          email: cleanEmail,
          role: isAdmin ? 'admin' : (profile.role || 'user'),
          avatar: profile.avatar,
          volume: profile.volume || 80,
          streak: profile.streak || 1,
          totalEarnings: isAdmin ? 9999999 : (profile.total_earnings || 0),
          xp: isAdmin ? 9999999 : (profile.xp || 0),
          last_read_at: profile.last_read_at,
          referral_code: profile.referral_code, 
          referred_by: profile.referred_by,
          referral_count: profile.referral_count || 0
        });
        setGameVolume(profile.volume || 80);
        setGameState(GameState.APP);
        setLoading(false);
        fetchNotifications(userId);
        checkCommunityUnreadStatus(userId);
        if (isAdmin || profile.role?.startsWith('teacher_')) fetchUnrepliedCount();
      } else {
        setLoading(false); setGameState(GameState.AUTH);
      }
    } catch (e) { setLoading(false); setGameState(GameState.AUTH); }
  }, [fetchNotifications, fetchUnrepliedCount, checkCommunityUnreadStatus]);

  useEffect(() => {
    if (!currentUser) return;
    const mainChannel = supabase
      .channel('global_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
          const newNotif = payload.new as AppNotification;
          if (!newNotif.user_id || newNotif.user_id === currentUser.id) {
            setNotifications(prev => [newNotif, ...prev]);
            setHasUnreadNotifs(true);
            playNotificationSound();
            if (window.addToast) window.addToast(newNotif.title, 'info');
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_messages' }, () => {
            if (currentUser.role === 'admin' || currentUser.role.startsWith('teacher_')) fetchUnrepliedCount();
      })
      .subscribe();

    const communityChannel = supabase
      .channel('global_community_listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, (payload: any) => {
          const newMsg = payload.new;
          CacheManager.appendMessage(newMsg.subject_id, newMsg);
          if (newMsg.user_id !== currentUser.id) {
              setUnreadCommunitySubjects(prev => new Set(prev).add(newMsg.subject_id));
          }
      })
      .subscribe();
    return () => { 
        supabase.removeChannel(mainChannel);
        supabase.removeChannel(communityChannel);
    };
  }, [currentUser, fetchUnrepliedCount]);

  useEffect(() => {
    if (isPrivacyMode) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) fetchProfile(session.user.id, session.user.email!);
      else { 
        setCurrentUser(null); setGameState(GameState.AUTH); setLoading(false); 
        setNotifications([]); setUnrepliedMessagesCount(0); setUnreadCommunitySubjects(new Set());
        CacheManager.clear(); 
        if (window.OneSignalDeferred) window.OneSignalDeferred.push(function(OneSignal) { OneSignal.logout(); });
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchProfile, isPrivacyMode]);

  const markSubjectRead = (subjectId: string) => {
      setUnreadCommunitySubjects(prev => {
          const next = new Set(prev);
          next.delete(subjectId);
          return next;
      });
  };

  const activeContent = useMemo(() => {
    if (gameState !== GameState.APP) return null;
    switch (currentTab) {
        case 'home': return <HomeScreen user={currentUser!} onUpdateUser={setCurrentUser} />;
        case 'lessons': return <LessonsScreen user={currentUser!} onUpdateUserScore={() => {}} />;
        case 'teachers': return <TeachersScreen user={currentUser!} />;
        case 'community': return <CommunityScreen user={currentUser!} unreadSubjects={unreadCommunitySubjects} onMarkRead={markSubjectRead} />;
        case 'game': return <GameHub user={currentUser!} onStart={() => setGameState(GameState.SELECTION)} onStartMatchingGame={() => setGameState(GameState.MATCHING_GAME_SELECTION)} />;
        default: return null;
    }
  }, [currentTab, currentUser, gameState, unreadCommunitySubjects]);

  if (!isOnline) return <OfflineScreen onRetry={() => window.location.reload()} />;
  if (isPrivacyMode) return <PrivacyModal isOpen={true} onClose={() => {}} isStandalone={true} />;

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-cairo">
        <div className="relative w-12 h-12 animate-dots-rotate">
            {[...Array(5)].map((_, i) => <div key={i} className="absolute w-2.5 h-2.5 bg-brand rounded-full animate-dot-pulse" style={{ top: '50%', left: '50%', transform: `rotate(${i * 72}deg) translate(20px)`, animationDelay: `${i * 0.2}s` }}></div>)}
        </div>
    </div>
  );

  if (gameState === GameState.AUTH) return <AuthScreen 
        onLogin={async (e, p) => { 
            const { error } = await supabase.auth.signInWithPassword({ email: e.toLowerCase().trim(), password: p }); 
            if (error) throw error; 
        }} 
        onRegister={async (n, e, p, ref) => { 
            const { error } = await supabase.auth.signUp({ email: e.toLowerCase().trim(), password: p, options: { data: { full_name: n, referral_code_input: ref?.trim() || null } } }); 
            if (error) throw error; 
        }} 
    />;
  if (gameState === GameState.ADMIN) return <AdminDashboard currentUser={currentUser!} onPlay={() => setGameState(GameState.APP)} onLogout={() => supabase.auth.signOut()} onUpdateCounts={fetchUnrepliedCount} />;
  
  let content;
  if (gameState === GameState.SELECTION) content = <SelectionScreen questions={[]} onStartGame={(f) => { setFilteredQuestions(f); setGameState(GameState.PLAYING); }} onBack={() => setGameState(GameState.APP)} />;
  else if (gameState === GameState.MATCHING_GAME_SELECTION) content = <MatchingGameSelectionScreen onStartGame={(c) => { setSelectedMatchingGameData(c); setGameState(GameState.MATCHING_GAME); }} onBack={() => setGameState(GameState.APP)} />;
  else if (gameState === GameState.PLAYING) content = <GameScreen questions={filteredQuestions} onGameOver={(p) => { setFinalPrize(p); setGameState(GameState.GAME_OVER); }} onVictory={(p) => { setFinalPrize(p); setGameState(GameState.VICTORY); }} onExit={() => setGameState(GameState.APP)} />;
  else if (gameState === GameState.MATCHING_GAME) content = <MatchingGame user={currentUser!} gameConfig={selectedMatchingGameData} onExit={() => setGameState(GameState.APP)} onUpdateScore={() => {}} />;
  else if (gameState === GameState.VICTORY || gameState === GameState.GAME_OVER) content = <ResultScreen amountWon={finalPrize} isVictory={gameState === GameState.VICTORY} onRestart={() => setGameState(GameState.SELECTION)} />;
  else if (gameState === GameState.CALCULATOR) content = <CalculatorScreen onBack={() => setGameState(GameState.APP)} />;
  else if (gameState === GameState.REFERRALS) content = <ReferralScreen user={currentUser!} onBack={() => setGameState(GameState.APP)} />;
  else if (gameState === GameState.GUIDE) content = <UserGuide onBack={() => setGameState(GameState.APP)} />;
  else {
      content = (
        <>
            <Header user={currentUser!} appLogo="" hasUnreadNotifs={hasUnreadNotifs} unrepliedMessagesCount={unrepliedMessagesCount} onOpenNotifications={() => { setIsNotifOpen(true); setHasUnreadNotifs(false); }} onOpenSettings={() => setIsSettingsOpen(true)} onLogout={() => supabase.auth.signOut()} onNavigate={(s) => setGameState(s)} />
            <main className="flex-1 overflow-y-auto pt-16 pb-20 custom-scrollbar scroll-container overscroll-y-contain optimize-scrolling">
                <div key={currentTab} className="section-entry">{activeContent}</div>
            </main>
            <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} hasUnreadCommunity={unreadCommunitySubjects.size > 0} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={currentUser!} onUpdateUser={setCurrentUser} onResetProgress={() => {}} onLogout={() => supabase.auth.signOut()} />
            <NotificationsModal isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} notifications={notifications} />
        </>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white relative font-cairo overflow-hidden">
      <AnalyticsTracker gameState={gameState} currentTab={currentTab} />
      {content}
      {showPermissionModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn p-6">
              <div className="bg-neutral-900 border border-white/10 rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden gpu-accelerated">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand to-transparent"></div>
                  <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-brand/20">
                      <Bell size={32} className="text-brand animate-pulse" />
                  </div>
                  <h3 className="text-xl font-black text-white mb-3">تفعيل الإشعارات</h3>
                  <p className="text-gray-400 text-xs font-bold leading-relaxed mb-8">
                      هل تسمح <span className="text-brand">لتطبيق المتميز</span> بإرسال تنبيهات حول الدروس الجديدة والردود على أسئلتك؟
                  </p>
                  <div className="flex gap-3">
                      <button onClick={handleRequestPermission} className="flex-1 py-3 bg-brand text-black rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg">
                          <Check size={16} strokeWidth={3} /><span>نعم، أوافق</span>
                      </button>
                      <button onClick={() => setShowPermissionModal(false)} className="flex-1 py-3 bg-white/5 text-gray-400 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all">
                          <X size={16} /><span>لاحقاً</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
