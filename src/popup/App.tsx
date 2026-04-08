import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Github, Languages, Loader2, Music, Pause, Play, Trash2, Users, X } from 'lucide-react';
import { FacebookTokens } from '../lib/tokens';
import { processNoteInput } from '../lib/noteProcessor';
import { createTranslator, resolveInitialLanguage, type LanguageCode } from './i18n';

const MAX_DESCRIPTION_LENGTH = 600;
const POPUP_STATE_KEY = 'popupComposerStateV2';
const POPUP_LANGUAGE_KEY = 'popupLanguageV1';
const MUSIC_PAGE_SIZE = 12;
const GITHUB_URL = 'https://github.com/Daoductrung/FB-Notes-Extended-A11Y';
const FIXED_MUSIC_TRIM_WINDOW_MS = 30000;
// Both sliders change the same clip-start state. The coarse slider moves faster,
// while the fine slider stays on the same value for precise one-second control.
const COARSE_TRIM_START_SLIDER_STEP_SECONDS = 5;
const FINE_TRIM_START_SLIDER_STEP_SECONDS = 1;

const DURATION_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1h', value: 60 * 60 },
  { label: '6h', value: 6 * 60 * 60 },
  { label: '24h', value: 24 * 60 * 60 },
  { label: '3d', value: 3 * 24 * 60 * 60 },
];

const MAX_CUSTOM_DURATION_MINUTES = 8 * 24 * 60;

type AudienceSetting = 'DEFAULT' | 'FRIENDS' | 'PUBLIC' | 'CONTACTS' | 'CUSTOM';

type FriendItem = {
  id: string;
  name: string;
  imageUri?: string;
};

type MusicItem = {
  id: string;
  songId?: string;
  audioClusterId?: string;
  title: string;
  artist: string;
  imageUri?: string;
  durationMs?: number;
  progressiveDownloadUrl?: string;
};

type PersistedState = {
  audienceSetting: AudienceSetting;
  durationSeconds: number;
  customDurationMinutes: string;
  selectedFriendIds: string[];
  selectedFriends: FriendItem[];
  selectedMusic: MusicItem | null;
};

type CurrentNoteStatus = {
  richStatusId?: string | null;
  avatarUri?: string;
  description?: string | null;
  noteType?: string | null;
  visibility?: string | null;
  expirationTime?: number | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  customAudienceNames?: string[];
  customAudienceSize?: number | null;
  defaultAudienceSetting?: string | null;
};

const AUDIENCE_OPTIONS: Array<{ key: string; value: AudienceSetting }> = [
  { key: 'audience.friends', value: 'FRIENDS' },
  { key: 'audience.public', value: 'PUBLIC' },
  { key: 'audience.contacts', value: 'CONTACTS' },
  { key: 'audience.custom', value: 'CUSTOM' },
];

const formatDuration = (durationMs?: number): string => {
  if (durationMs === undefined || durationMs === null) return '--:--';
  if (durationMs < 0) return '0:00';
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatDurationFromSeconds = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatDurationForScreenReader = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes <= 0) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
};

const getMusicTrimMaxStartMs = (item: MusicItem | null, trimWindowMs: number): number => {
  return Math.max(0, (item?.durationMs || 0) - trimWindowMs);
};

const formatSliderTimeValue = (seconds: number): string => {
  return formatDurationForScreenReader(seconds);
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
};

const hasDetectedCurrentNote = (status: CurrentNoteStatus | null | undefined): boolean => {
  if (!status) return false;
  if (typeof status.richStatusId === 'string' && status.richStatusId.trim().length > 0) return true;
  if (typeof status.description === 'string' && status.description.trim().length > 0) return true;
  return typeof status.musicTitle === 'string' && status.musicTitle.trim().length > 0;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const App: React.FC = () => {
  const [tokens, setTokens] = useState<FacebookTokens | null>(null);
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [noteText, setNoteText] = useState('');
  const [duration, setDuration] = useState(86400);
  const [customDurationMinutes, setCustomDurationMinutes] = useState('');
  const [audienceSetting, setAudienceSetting] = useState<AudienceSetting>('FRIENDS');

  const [friendQuery, setFriendQuery] = useState('');
  const [friendItems, setFriendItems] = useState<FriendItem[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendNextCursor, setFriendNextCursor] = useState<string | null>(null);
  const [friendHasNextPage, setFriendHasNextPage] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<FriendItem[]>([]);

  const [musicQuery, setMusicQuery] = useState('');
  const [musicItems, setMusicItems] = useState<MusicItem[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [visibleMusicCount, setVisibleMusicCount] = useState(MUSIC_PAGE_SIZE);
  const [selectedMusic, setSelectedMusic] = useState<MusicItem | null>(null);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [musicTrimStartMs, setMusicTrimStartMs] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewProgressMs, setPreviewProgressMs] = useState(0);
  const musicTrimStartMsRef = useRef(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [politeLiveMessage, setPoliteLiveMessage] = useState('');
  const [assertiveLiveMessage, setAssertiveLiveMessage] = useState('');
  const [encodedLength, setEncodedLength] = useState(0);
  const [currentNoteStatus, setCurrentNoteStatus] = useState<CurrentNoteStatus | null>(null);
  const [currentStatusLoading, setCurrentStatusLoading] = useState(false);
  const [currentStatusError, setCurrentStatusError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeModal, setActiveModal] = useState<'audience' | 'duration' | 'music' | null>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(resolveInitialLanguage());
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const musicListRef = useRef<HTMLDivElement | null>(null);
  const friendsListRef = useRef<HTMLDivElement | null>(null);
  const audienceDialogRef = useRef<HTMLDivElement | null>(null);
  const durationDialogRef = useRef<HTMLDivElement | null>(null);
  const musicDialogRef = useRef<HTMLDivElement | null>(null);
  const friendsDialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const currentStatusRequestIdRef = useRef(0);

  const t = useMemo(() => createTranslator(language), [language]);
  const visibleMusicItems = useMemo(() => musicItems.slice(0, visibleMusicCount), [musicItems, visibleMusicCount]);
  const selectedFriendLookup = useMemo(() => new Set(selectedFriendIds), [selectedFriendIds]);
  const selectedMusicDurationMs = selectedMusic?.durationMs || 0;
  const musicTrimWindowMs = FIXED_MUSIC_TRIM_WINDOW_MS;
  const musicTrimMaxStartMs = useMemo(
    () => getMusicTrimMaxStartMs(selectedMusic, musicTrimWindowMs),
    [selectedMusic, musicTrimWindowMs]
  );
  const musicTrimMaxStartSeconds = Math.floor(musicTrimMaxStartMs / 1000);
  const selectedClipStartSeconds = Math.floor(musicTrimStartMs / 1000);

  const stopAudioPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewPlaying(false);
    setPreviewProgressMs(0);
    setPlayingMusicId(null);
  }, []);

  const closeMusicModal = useCallback(() => {
    stopAudioPlayback();
    setActiveModal(null);
  }, [stopAudioPlayback]);

  const openFriendsPicker = useCallback(() => {
    setActiveModal(null);
    setShowFriendsModal(true);
  }, []);

  const closeCurrentDialog = useCallback(() => {
    if (showFriendsModal) {
      setShowFriendsModal(false);
      return;
    }
    if (activeModal === 'music') {
      closeMusicModal();
      return;
    }
    setActiveModal(null);
  }, [activeModal, closeMusicModal, showFriendsModal]);

  useEffect(() => {
    chrome.storage.local.get([POPUP_LANGUAGE_KEY], (res) => {
      const saved = res?.[POPUP_LANGUAGE_KEY] as LanguageCode | undefined;
      if (saved === 'vi' || saved === 'en') {
        setLanguage(saved);
      }
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({ [POPUP_LANGUAGE_KEY]: language });
  }, [language]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-lang-menu]')) return;
      setShowLanguageMenu(false);
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    const activeDialog = showFriendsModal
      ? friendsDialogRef.current
      : activeModal === 'audience'
        ? audienceDialogRef.current
        : activeModal === 'duration'
          ? durationDialogRef.current
          : activeModal === 'music'
            ? musicDialogRef.current
            : null;

    if (!activeDialog) return;

    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const frame = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements(activeDialog);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        activeDialog.focus();
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCurrentDialog();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(activeDialog);
      if (focusables.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    activeDialog.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      activeDialog.removeEventListener('keydown', onKeyDown);
      lastFocusedElementRef.current?.focus();
    };
  }, [activeModal, closeCurrentDialog, showFriendsModal]);

  useEffect(() => {
    chrome.storage.local.get([POPUP_STATE_KEY], (res) => {
      const saved = res?.[POPUP_STATE_KEY] as PersistedState | undefined;
      if (!saved) return;

      if (saved.audienceSetting) setAudienceSetting(saved.audienceSetting);
      if (typeof saved.durationSeconds === 'number' && saved.durationSeconds > 0) setDuration(saved.durationSeconds);
      if (typeof saved.customDurationMinutes === 'string') setCustomDurationMinutes(saved.customDurationMinutes);
      if (Array.isArray(saved.selectedFriendIds)) setSelectedFriendIds(saved.selectedFriendIds);
      if (Array.isArray(saved.selectedFriends)) setSelectedFriends(saved.selectedFriends);
      if (saved.selectedMusic) {
        const hasMusicCluster = Boolean(saved.selectedMusic.songId || saved.selectedMusic.audioClusterId);
        setSelectedMusic(hasMusicCluster ? saved.selectedMusic : null);
      }
    });
  }, []);

  useEffect(() => {
    const state: PersistedState = {
      audienceSetting,
      durationSeconds: duration,
      customDurationMinutes,
      selectedFriendIds,
      selectedFriends,
      selectedMusic,
    };

    chrome.storage.local.set({ [POPUP_STATE_KEY]: state });
  }, [audienceSetting, duration, customDurationMinutes, selectedFriendIds, selectedFriends, selectedMusic]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        setTokenStatus('error');
      } else if (response?.tokens) {
        setTokens(response.tokens);
        setTokenStatus('ready');
      } else {
        setTokenStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    const processed = processNoteInput(noteText);
    setEncodedLength(processed.fullDescription.length);
  }, [noteText]);

  useEffect(() => {
    if (!result) return;

    setShowToast(true);
    const timer = window.setTimeout(() => {
      setShowToast(false);
    }, 3000);

    if (result.type === 'error') {
      setAssertiveLiveMessage(result.message);
    } else {
      setPoliteLiveMessage(result.message);
    }

    return () => window.clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    musicTrimStartMsRef.current = musicTrimStartMs;
  }, [musicTrimStartMs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewPlaying(false);
    setPreviewProgressMs(0);
    setPlayingMusicId(null);
    setMusicTrimStartMs(0);
  }, [selectedMusic?.id]);

  const handleSearchMusic = useCallback((query: string) => {
    if (!tokens || tokenStatus !== 'ready') return;

    setMusicLoading(true);
    chrome.runtime.sendMessage({
      type: 'SEARCH_MUSIC',
      tokens,
      query,
      count: 100,
    }, (response) => {
      setMusicLoading(false);

      if (chrome.runtime.lastError) {
        setResult({ type: 'error', message: chrome.runtime.lastError.message || t('music.search_failed') });
        return;
      }

      if (response?.success) {
        const items = Array.isArray(response.items) ? response.items : [];
        setMusicItems(items);
        setVisibleMusicCount(MUSIC_PAGE_SIZE);
      } else {
        setResult({ type: 'error', message: response?.error || t('music.search_failed') });
      }
    });
  }, [t, tokenStatus, tokens]);

  const handlePlayMusic = useCallback((item: MusicItem) => {
    if (playingMusicId === item.id && audioRef.current) {
      stopAudioPlayback();
      setPoliteLiveMessage(`${item.title} preview paused.`);
      return;
    }

    stopAudioPlayback();

    if (!item.progressiveDownloadUrl) {
      setResult({ type: 'error', message: t('music.error.no_audio_url') });
      return;
    }

    setPlayingMusicId(item.id);

    const audio = new Audio(item.progressiveDownloadUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setPlayingMusicId(null);
    };

    audio.onerror = () => {
      setPlayingMusicId(null);
      setResult({ type: 'error', message: t('music.error.playback') });
    };

    audio.play().catch(() => {
      setPlayingMusicId(null);
      setResult({ type: 'error', message: t('music.error.play_failed') });
    });
  }, [playingMusicId, stopAudioPlayback, t]);

  const handlePreviewPlayToggle = useCallback(() => {
    if (!selectedMusic) return;

    if (!selectedMusic.progressiveDownloadUrl) {
      setResult({ type: 'error', message: t('music.error.no_audio_url') });
      return;
    }

    if (previewPlaying && audioRef.current) {
      stopAudioPlayback();
      setPoliteLiveMessage('Clip preview paused.');
      return;
    }

    stopAudioPlayback();

    const maxStart = getMusicTrimMaxStartMs(selectedMusic, musicTrimWindowMs);
    const startMs = Math.min(Math.max(0, musicTrimStartMsRef.current), maxStart);
    const audio = new Audio(selectedMusic.progressiveDownloadUrl);
    audioRef.current = audio;

    audio.currentTime = Math.max(0, startMs / 1000);
    setPreviewProgressMs(0);
    setPreviewPlaying(true);
    setPoliteLiveMessage(`Clip preview playing from ${formatDurationForScreenReader(Math.floor(startMs / 1000))}.`);

    audio.ontimeupdate = () => {
      const currentStartMs = musicTrimStartMsRef.current;
      const currentMs = audio.currentTime * 1000;
      const playedFromStartMs = Math.max(0, currentMs - currentStartMs);
      setPreviewProgressMs(Math.min(playedFromStartMs, musicTrimWindowMs));

      if (playedFromStartMs >= musicTrimWindowMs) {
        audio.pause();
        setPreviewPlaying(false);
      }
    };

    audio.onended = () => {
      setPreviewPlaying(false);
    };

    audio.onerror = () => {
      setPreviewPlaying(false);
      setResult({ type: 'error', message: t('music.error.playback') });
    };

    audio.play().catch(() => {
      setPreviewPlaying(false);
      setResult({ type: 'error', message: t('music.error.play_failed') });
    });
  }, [musicTrimWindowMs, previewPlaying, selectedMusic, stopAudioPlayback, t]);

  useEffect(() => {
    if (!previewPlaying) return;
    const audio = audioRef.current;
    if (!audio || !selectedMusic) return;

    const maxStart = getMusicTrimMaxStartMs(selectedMusic, musicTrimWindowMs);
    const nextStartMs = Math.min(Math.max(0, musicTrimStartMs), maxStart);
    audio.currentTime = Math.max(0, nextStartMs / 1000);
    setPreviewProgressMs(0);
  }, [musicTrimStartMs, musicTrimWindowMs, previewPlaying, selectedMusic]);

  const handleSearchFriends = useCallback((query: string, cursor: string | null = null) => {
    if (!tokens || tokenStatus !== 'ready') return;

    setFriendLoading(true);
    chrome.runtime.sendMessage({
      type: 'SEARCH_FRIENDS',
      tokens,
      query,
      cursor,
      count: 20,
    }, (response) => {
      setFriendLoading(false);

      if (chrome.runtime.lastError) {
        setResult({ type: 'error', message: chrome.runtime.lastError.message || t('friends.search_failed') });
        return;
      }

      if (response?.success) {
        const incoming = Array.isArray(response.items) ? response.items as FriendItem[] : [];

        setFriendItems((previous) => {
          if (!cursor) return incoming;
          const deduped = new Map(previous.map((item) => [item.id, item]));
          for (const item of incoming) {
            deduped.set(item.id, item);
          }
          return Array.from(deduped.values());
        });

        setFriendNextCursor(typeof response.nextCursor === 'string' ? response.nextCursor : null);
        setFriendHasNextPage(Boolean(response.hasNextPage));

        setSelectedFriends((previous) => {
          if (previous.length === 0) return previous;
          const lookup = new Map(incoming.map((friend) => [friend.id, friend]));
          return previous.map((friend) => lookup.get(friend.id) || friend);
        });
      } else {
        setResult({ type: 'error', message: response?.error || t('friends.search_failed') });
      }
    });
  }, [t, tokenStatus, tokens]);

  useEffect(() => {
    if (audienceSetting === 'CUSTOM' && tokenStatus === 'ready' && tokens && friendItems.length === 0) {
      handleSearchFriends('', null);
    }
  }, [audienceSetting, friendItems.length, handleSearchFriends, tokenStatus, tokens]);

  const toggleFriendSelection = useCallback((friend: FriendItem) => {
    setSelectedFriendIds((previous) => {
      if (previous.includes(friend.id)) {
        return previous.filter((id) => id !== friend.id);
      }
      return [...previous, friend.id];
    });

    setSelectedFriends((previous) => {
      if (previous.some((entry) => entry.id === friend.id)) {
        return previous.filter((entry) => entry.id !== friend.id);
      }
      return [friend, ...previous].slice(0, 30);
    });
  }, []);

  const removeSelectedFriend = useCallback((friendId: string) => {
    setSelectedFriendIds((previous) => previous.filter((id) => id !== friendId));
    setSelectedFriends((previous) => previous.filter((friend) => friend.id !== friendId));
  }, []);

  const applyCustomDuration = useCallback((minutesText: string) => {
    const parsed = Number(minutesText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const clampedMinutes = Math.min(parsed, MAX_CUSTOM_DURATION_MINUTES);
    setDuration(Math.floor(clampedMinutes * 60));
  }, []);

  const clampMusicTrimStart = useCallback((valueMs: number, durationMs?: number) => {
    const safeDuration = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 0;
    const maxStart = Math.max(0, safeDuration - musicTrimWindowMs);
    return Math.min(Math.max(0, valueMs), maxStart);
  }, [musicTrimWindowMs]);

  const setMusicTrimStartFromSeconds = useCallback((seconds: number) => {
    if (!selectedMusic) return;
    const nextMs = clampMusicTrimStart(seconds * 1000, selectedMusic.durationMs);
    setMusicTrimStartMs(nextMs);
  }, [clampMusicTrimStart, selectedMusic]);

  const updateTrimStartFromSliderValue = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setMusicTrimStartFromSeconds(parsed);
  }, [setMusicTrimStartFromSeconds]);

  const handleCoarseTrimStartSliderChange = useCallback((value: string) => {
    updateTrimStartFromSliderValue(value);
  }, [updateTrimStartFromSliderValue]);

  const handleFineTrimStartSliderChange = useCallback((value: string) => {
    updateTrimStartFromSliderValue(value);
  }, [updateTrimStartFromSliderValue]);

  const handleMusicTrimSliderKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      handlePreviewPlayToggle();
    }
  }, [handlePreviewPlayToggle]);

  const handleMusicListScroll = useCallback(() => {
    const element = musicListRef.current;
    if (!element || musicLoading) return;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 40;
    if (nearBottom && visibleMusicCount < musicItems.length) {
      setVisibleMusicCount((previous) => Math.min(previous + MUSIC_PAGE_SIZE, musicItems.length));
    }
  }, [musicItems.length, musicLoading, visibleMusicCount]);

  const handleFriendsListScroll = useCallback(() => {
    const element = friendsListRef.current;
    if (!element || friendLoading || !friendHasNextPage || !friendNextCursor) return;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 40;
    if (nearBottom) {
      handleSearchFriends(friendQuery, friendNextCursor);
    }
  }, [friendHasNextPage, friendLoading, friendNextCursor, friendQuery, handleSearchFriends]);

  const requestCurrentNoteStatus = useCallback(() => {
    return new Promise<{ success: boolean; error?: string; status?: CurrentNoteStatus | null }>((resolve) => {
      if (!tokens) {
        resolve({ success: false, error: t('preview.fetch_failed_unavailable') });
        return;
      }

      chrome.runtime.sendMessage({
        type: 'GET_CURRENT_NOTE_STATUS',
        tokens,
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message || t('preview.fetch_failed'),
          });
          return;
        }

        resolve(response as { success: boolean; error?: string; status?: CurrentNoteStatus | null });
      });
    });
  }, [t, tokens]);

  const refreshCurrentNoteStatus = useCallback(async (
    options?: { attempts?: number; delayMs?: number; preferNonEmpty?: boolean }
  ) => {
    const attempts = Math.max(1, options?.attempts ?? 1);
    const delayMs = Math.max(0, options?.delayMs ?? 0);
    const preferNonEmpty = options?.preferNonEmpty ?? false;
    const requestId = ++currentStatusRequestIdRef.current;

    setCurrentStatusLoading(true);
    setCurrentStatusError(null);

    let lastError = '';
    let latestStatus: CurrentNoteStatus | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await requestCurrentNoteStatus();

      if (requestId !== currentStatusRequestIdRef.current) {
        return;
      }

      if (response?.success) {
        latestStatus = response.status || null;
        const noteFound = hasDetectedCurrentNote(latestStatus);

        if (!preferNonEmpty || noteFound || attempt === attempts - 1) {
          setCurrentNoteStatus(latestStatus);
          setCurrentStatusError(null);
          setCurrentStatusLoading(false);
          return;
        }
      } else {
        lastError = response?.error || t('preview.fetch_failed');

        if (attempt === attempts - 1) {
          setCurrentNoteStatus(null);
          setCurrentStatusError(lastError);
          setCurrentStatusLoading(false);
          setAssertiveLiveMessage(lastError);
          return;
        }
      }

      if (attempt < attempts - 1 && delayMs > 0) {
        await wait(delayMs);
      }
    }

    if (requestId !== currentStatusRequestIdRef.current) {
      return;
    }

    setCurrentNoteStatus(latestStatus);
    setCurrentStatusError(null);
    setCurrentStatusLoading(false);
  }, [requestCurrentNoteStatus, t]);

  useEffect(() => {
    if (tokenStatus !== 'ready' || !tokens) return;

    handleSearchMusic('');
    void refreshCurrentNoteStatus({ attempts: 2, delayMs: 800 });
  }, [handleSearchMusic, refreshCurrentNoteStatus, tokenStatus, tokens]);

  const handleSubmit = useCallback(() => {
    if (!tokens || isSubmitting) return;

    const processed = processNoteInput(noteText);
    const descriptionText = processed.fullDescription.trim();
    const hasSelectedMusic = Boolean(selectedMusic?.id);
    const hasMusicCluster = Boolean(selectedMusic?.songId || selectedMusic?.audioClusterId);

    if (!descriptionText && !hasSelectedMusic) {
      setResult({ type: 'error', message: t('share.error.empty') });
      return;
    }

    if (hasSelectedMusic && !hasMusicCluster) {
      setResult({ type: 'error', message: t('share.error.missing_song') });
      return;
    }

    if (encodedLength > MAX_DESCRIPTION_LENGTH) {
      setResult({ type: 'error', message: t('share.error.exceeds_limit', { max: MAX_DESCRIPTION_LENGTH, count: encodedLength }) });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    chrome.runtime.sendMessage({
      type: 'CREATE_NOTE',
      tokens,
      description: descriptionText || null,
      duration,
      audienceSetting,
      selectedFriendIds,
      selectedMusic,
      musicTrimStartMs: Math.floor(musicTrimStartMs / 1000) * 1000,
    }, (response) => {
      setIsSubmitting(false);

      if (chrome.runtime.lastError) {
        setResult({ type: 'error', message: chrome.runtime.lastError.message || t('share.error.background_unavailable') });
        return;
      }

      if (response?.success) {
        setResult({ type: 'success', message: t('share.success') });
        setNoteText('');
        void refreshCurrentNoteStatus({ attempts: 4, delayMs: 1200, preferNonEmpty: true });
      } else {
        setResult({ type: 'error', message: response?.error || t('share.error.failed') });
      }
    });
  }, [
    audienceSetting,
    duration,
    encodedLength,
    isSubmitting,
    musicTrimStartMs,
    noteText,
    refreshCurrentNoteStatus,
    selectedFriendIds,
    selectedMusic,
    t,
    tokens,
  ]);

  const handleDeleteNote = useCallback(() => {
    if (!tokens || isDeleting) return;
    const richStatusId = (currentNoteStatus?.richStatusId || '').trim();
    if (!richStatusId) return;

    setIsDeleting(true);
    chrome.runtime.sendMessage({
      type: 'DELETE_NOTE',
      tokens,
      richStatusId,
    }, (response) => {
      setIsDeleting(false);

      if (chrome.runtime.lastError) {
        setResult({ type: 'error', message: chrome.runtime.lastError.message || t('preview.delete_failed') });
        return;
      }

      if (response?.success) {
        setPoliteLiveMessage(t('preview.delete_success'));
        void refreshCurrentNoteStatus({ attempts: 2, delayMs: 600 });
      } else {
        setResult({ type: 'error', message: response?.error || t('preview.delete_failed') });
      }
    });
  }, [currentNoteStatus, isDeleting, refreshCurrentNoteStatus, t, tokens]);

  const isPreviewPlaceholder = useMemo(() => {
    return !hasDetectedCurrentNote(currentNoteStatus);
  }, [currentNoteStatus]);

  const canDeleteNote = useMemo(() => {
    const id = (currentNoteStatus?.richStatusId || '').trim();
    return Boolean(id) && !currentStatusError;
  }, [currentNoteStatus, currentStatusError]);

  const shareLabel = useMemo(() => {
    if (isPreviewPlaceholder) return '';

    const visibility = (currentNoteStatus?.visibility || currentNoteStatus?.defaultAudienceSetting || '').toUpperCase();
    if (visibility === 'PUBLIC') return t('status.share.public');
    if (visibility === 'FRIENDS') return t('status.share.friends');
    if (visibility === 'CONTACTS') return t('status.share.contacts');

    if (visibility === 'CUSTOM') {
      const names = Array.isArray(currentNoteStatus?.customAudienceNames) ? currentNoteStatus.customAudienceNames : [];
      if (names.length === 0) return t('status.share.custom.no_names');
      const first = names.slice(0, 2).join(', ');
      const remaining = names.length - 2;
      return remaining > 0
        ? t('status.share.custom.with_names_more', { names: first, remaining })
        : t('status.share.custom.with_names', { names: first });
    }

    return t('status.share.default');
  }, [currentNoteStatus, isPreviewPlaceholder, t]);

  const expiryLabelShort = useMemo(() => {
    if (isPreviewPlaceholder) return '';
    const ts = currentNoteStatus?.expirationTime;
    if (!ts) return '';

    const target = new Date(ts * 1000);
    if (Number.isNaN(target.getTime())) return '';

    const diffMs = Math.max(0, target.getTime() - Date.now());
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const datePart = target.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });

    return t('status.expiry.with_hours', { date: datePart, hours: totalHours });
  }, [currentNoteStatus, isPreviewPlaceholder, language, t]);

  const previewMusicSummary = useMemo(() => {
    if (!currentNoteStatus?.musicTitle) return '';
    if (currentNoteStatus.musicArtist) {
      return t('preview.music_with_artist', {
        title: currentNoteStatus.musicTitle,
        artist: currentNoteStatus.musicArtist,
      });
    }
    return t('preview.music_without_artist', { title: currentNoteStatus.musicTitle });
  }, [currentNoteStatus, t]);

  const previewScreenReaderSummary = useMemo(() => {
    if (currentStatusLoading) return t('preview.loading');
    if (currentStatusError) return t('preview.fetch_failed_with_reason', { reason: currentStatusError });
    if (isPreviewPlaceholder) return t('preview.placeholder');

    const parts = [t('preview.summary_intro')];
    const noteText = (currentNoteStatus?.description || '').trim();

    if (noteText) {
      parts.push(t('preview.note_text_value', { text: noteText }));
    } else if (currentNoteStatus?.musicTitle) {
      parts.push(t('preview.note_text_empty'));
    }

    if (previewMusicSummary) {
      parts.push(previewMusicSummary);
    }

    if (shareLabel) {
      parts.push(t('preview.audience_value', { value: shareLabel }));
    }

    if (expiryLabelShort) {
      parts.push(t('preview.expiry_value', { value: expiryLabelShort }));
    }

    return parts.join(' ');
  }, [currentNoteStatus, currentStatusError, currentStatusLoading, expiryLabelShort, isPreviewPlaceholder, previewMusicSummary, shareLabel, t]);

  const previewVisibleStatus = useMemo(() => {
    if (currentStatusLoading) return t('preview.status_loading');
    if (currentStatusError) return t('preview.status_error');
    if (isPreviewPlaceholder) return t('preview.status_empty');
    return t('preview.status_available');
  }, [currentStatusError, currentStatusLoading, isPreviewPlaceholder, t]);

  const previewVisibleNoteText = useMemo(() => {
    const text = (currentNoteStatus?.description || '').trim();
    return text || t('preview.note_text_empty');
  }, [currentNoteStatus, t]);

  const charPercentage = (encodedLength / MAX_DESCRIPTION_LENGTH) * 100;
  const charStatus = charPercentage < 50 ? 'safe' : charPercentage < 80 ? 'warning' : 'danger';

  return (
    <div className="container">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{politeLiveMessage}</div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">{assertiveLiveMessage}</div>

      <section className="section note-preview-section" aria-labelledby="current-note-title" aria-live="polite" aria-atomic="true" aria-busy={currentStatusLoading}>
        <div className="section-header note-preview-header">
          <div className="note-preview-heading">
            <h2 id="current-note-title" className="section-title note-preview-title">{t('preview.title')}</h2>
            <div className={`status-indicator ${currentStatusLoading ? 'loading' : isPreviewPlaceholder ? 'error' : 'success'}`}>
              {previewVisibleStatus}
            </div>
          </div>
          {canDeleteNote && (
            <button
              className={`preview-delete-btn ${isDeleting ? 'is-loading' : ''}`}
              onClick={handleDeleteNote}
              disabled={currentStatusLoading || isDeleting}
              aria-label={t('preview.delete_button')}
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>{t('preview.delete_button')}</span>
            </button>
          )}
        </div>
        <div className="section-content note-preview-content">
          <p id="current-note-summary" className="sr-only">{previewScreenReaderSummary}</p>

          {currentStatusLoading ? (
            <div className="note-preview-message" role="status">
              {t('preview.loading')}
            </div>
          ) : currentStatusError ? (
            <div className="note-preview-message note-preview-message-error" role="alert">
              <p className="note-preview-message-title">{t('preview.fetch_failed_title')}</p>
              <p className="note-preview-message-body">{currentStatusError}</p>
              <button
                className="note-preview-retry-btn"
                onClick={() => void refreshCurrentNoteStatus({ attempts: 2, delayMs: 800 })}
                type="button"
              >
                {t('preview.retry')}
              </button>
            </div>
          ) : isPreviewPlaceholder ? (
            <div className="note-preview-message" role="status">
              <p className="note-preview-message-title">{t('preview.empty_title')}</p>
              <p className="note-preview-message-body">{t('preview.empty_body')}</p>
            </div>
          ) : (
            <article
              id="current-note-card"
              className="note-preview-card"
              tabIndex={0}
              aria-labelledby="current-note-title"
              aria-describedby="current-note-summary"
            >
              <div className="note-preview-block">
                <div className="note-preview-label">{t('preview.note_text_label')}</div>
                <div className="note-preview-value note-preview-text">{previewVisibleNoteText}</div>
              </div>

              {previewMusicSummary && (
                <div className="note-preview-block">
                  <div className="note-preview-label">{t('preview.music_label')}</div>
                  <div className="note-preview-value note-preview-music">
                    <Music size={13} aria-hidden="true" />
                    <span>{previewMusicSummary}</span>
                  </div>
                </div>
              )}

              <dl className="note-preview-details">
                <div className="note-preview-detail-row">
                  <dt className="note-preview-label">{t('preview.audience_label')}</dt>
                  <dd className="note-preview-value">{shareLabel || t('preview.none')}</dd>
                </div>
                <div className="note-preview-detail-row">
                  <dt className="note-preview-label">{t('preview.expiry_label')}</dt>
                  <dd className="note-preview-value">{expiryLabelShort || t('status.expiry.unknown')}</dd>
                </div>
              </dl>
            </article>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="composer-title">
        <div className="section-header">
          <h2 id="composer-title" className="section-title">{t('composer.title')}</h2>
        </div>
        <div className="section-content">
          <div className="note-composer">
            <div className="composer-scroll">
              <label className="sr-only" htmlFor="note-textarea">{t('composer.input_label')}</label>
              <textarea
                id="note-textarea"
                className="note-textarea"
                placeholder={t('composer.placeholder')}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                disabled={tokenStatus !== 'ready'}
                aria-describedby="note-input-help note-char-count"
                aria-invalid={encodedLength > MAX_DESCRIPTION_LENGTH}
              />
              <div id="note-input-help" className="sr-only">
                {t('composer.input_help', { max: MAX_DESCRIPTION_LENGTH })}
              </div>

              <div className="char-counter">
                <div className="char-bar-container">
                  <div className={`char-bar ${charStatus}`} style={{ width: `${Math.min(charPercentage, 100)}%` }} />
                </div>
                <span id="note-char-count" className="char-text" aria-live="polite">
                  {encodedLength} / {MAX_DESCRIPTION_LENGTH}
                </span>
              </div>

              <div className="char-counter-footer">
                <div className="action-buttons-row" role="group" aria-label={t('composer.actions')}>
                  <div className="action-left" data-lang-menu>
                    <button
                      className="icon-btn"
                      onClick={() => chrome.tabs.create({ url: GITHUB_URL })}
                      disabled={tokenStatus !== 'ready'}
                      aria-label={t('action.open_github')}
                      type="button"
                    >
                      <Github size={14} />
                    </button>

                    <div className="lang-menu-wrapper" data-lang-menu>
                      <button
                        className={`icon-btn ${showLanguageMenu ? 'has-value' : ''}`}
                        onClick={() => setShowLanguageMenu((value) => !value)}
                        aria-label={t('action.language')}
                        aria-expanded={showLanguageMenu}
                        aria-controls="language-options"
                        type="button"
                      >
                        <Languages size={14} />
                        <span className="icon-badge" aria-hidden="true">{language.toUpperCase()}</span>
                      </button>

                      {showLanguageMenu && (
                        <div id="language-options" className="lang-menu" role="group" aria-label={t('action.language')}>
                          <button
                            className={`lang-option ${language === 'vi' ? 'active' : ''}`}
                            onClick={() => {
                              setLanguage('vi');
                              setShowLanguageMenu(false);
                            }}
                            aria-pressed={language === 'vi'}
                            type="button"
                          >
                            {t('lang.vi')}
                          </button>
                          <button
                            className={`lang-option ${language === 'en' ? 'active' : ''}`}
                            onClick={() => {
                              setLanguage('en');
                              setShowLanguageMenu(false);
                            }}
                            aria-pressed={language === 'en'}
                            type="button"
                          >
                            {t('lang.en')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className={`icon-btn ${audienceSetting !== 'DEFAULT' ? 'has-value' : ''}`}
                    onClick={() => setActiveModal('audience')}
                    disabled={tokenStatus !== 'ready'}
                    aria-label={t('action.open_audience')}
                    aria-haspopup="dialog"
                    aria-expanded={activeModal === 'audience'}
                    type="button"
                  >
                    <Users size={14} />
                    {audienceSetting !== 'DEFAULT' && (
                      <span className="icon-badge" aria-hidden="true">
                        {audienceSetting === 'CUSTOM' ? `${selectedFriendIds.length}` : audienceSetting.charAt(0)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`icon-btn ${duration !== 86400 ? 'has-value' : ''}`}
                    onClick={() => setActiveModal('duration')}
                    disabled={tokenStatus !== 'ready'}
                    aria-label={t('action.open_duration')}
                    aria-haspopup="dialog"
                    aria-expanded={activeModal === 'duration'}
                    type="button"
                  >
                    <Clock3 size={14} />
                    {duration !== 86400 && (
                      <span className="icon-badge" aria-hidden="true">{formatDurationFromSeconds(duration)}</span>
                    )}
                  </button>

                  <button
                    className={`icon-btn ${selectedMusic ? 'has-value' : ''}`}
                    onClick={() => setActiveModal('music')}
                    disabled={tokenStatus !== 'ready'}
                    aria-label={t('action.open_music')}
                    aria-haspopup="dialog"
                    aria-expanded={activeModal === 'music'}
                    type="button"
                  >
                    <Music size={14} />
                    {selectedMusic && <span className="icon-badge" aria-hidden="true">♪</span>}
                  </button>

                  <button
                    className={`action-btn ${result?.type === 'success' ? 'success' : ''}`}
                    onClick={handleSubmit}
                    disabled={tokenStatus !== 'ready' || isSubmitting}
                    type="button"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={12} className="spinner" />
                        <span>{t('share.submitting')}</span>
                      </>
                    ) : (
                      <span>{t('share.button')}</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeModal === 'audience' && (
        <div className="modal-overlay" onClick={closeCurrentDialog}>
          <div
            className="modal-content"
            ref={audienceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audience-dialog-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="audience-dialog-title" className="modal-title">{t('audience.title')}</h2>
              <button className="modal-close" onClick={closeCurrentDialog} type="button" aria-label={t('dialog.close')}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="audience-options">
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`audience-option ${audienceSetting === option.value ? 'active' : ''}`}
                    onClick={() => {
                      setAudienceSetting(option.value);
                      if (option.value === 'CUSTOM') {
                        openFriendsPicker();
                      } else {
                        setSelectedFriendIds([]);
                        setSelectedFriends([]);
                        setActiveModal(null);
                      }
                    }}
                    aria-pressed={audienceSetting === option.value}
                    type="button"
                  >
                    {t(option.key)}
                    {option.value === 'CUSTOM' && selectedFriendIds.length > 0 && (
                      <span className="option-badge">{selectedFriendIds.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'duration' && (
        <div className="modal-overlay" onClick={closeCurrentDialog}>
          <div
            className="modal-content modal-small"
            ref={durationDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="duration-dialog-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="duration-dialog-title" className="modal-title">{t('duration.title')}</h2>
              <button className="modal-close" onClick={closeCurrentDialog} type="button" aria-label={t('dialog.close')}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="duration-selector">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`duration-btn ${duration === option.value ? 'active' : ''}`}
                    onClick={() => {
                      setDuration(option.value);
                      setCustomDurationMinutes('');
                    }}
                    aria-pressed={duration === option.value}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="sr-only" htmlFor="custom-duration-input">{t('duration.custom_label')}</label>
              <div className="duration-custom-row">
                <input
                  id="custom-duration-input"
                  className="duration-custom-input"
                  type="number"
                  min="1"
                  max={MAX_CUSTOM_DURATION_MINUTES}
                  step="1"
                  value={customDurationMinutes}
                  onChange={(event) => setCustomDurationMinutes(event.target.value)}
                  placeholder={t('duration.custom_placeholder')}
                />
                <button
                  className="duration-custom-btn"
                  onClick={() => applyCustomDuration(customDurationMinutes)}
                  disabled={!customDurationMinutes}
                  type="button"
                >
                  {t('duration.apply')}
                </button>
              </div>

              <div className="duration-current">{t('duration.current', { duration: formatDurationFromSeconds(duration) })}</div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'music' && (
        <div className="modal-overlay" onClick={closeMusicModal}>
          <div
            className="modal-content"
            ref={musicDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-dialog-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="music-dialog-title" className="modal-title">{t('music.title')}</h2>
              <div className="modal-header-actions">
                {selectedMusic && (
                  <button
                    className="music-save-btn-header"
                    onClick={closeMusicModal}
                    aria-label={t('music.save_selection')}
                    type="button"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button className="modal-close" onClick={closeMusicModal} type="button" aria-label={t('dialog.close')}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="modal-body">
              <label className="sr-only" htmlFor="music-search-input">{t('music.search_label')}</label>

              {selectedMusic && (
                <div className="music-selected">
                  <div className="music-selected-text" id="music-selected-summary">
                    <strong>{selectedMusic.title}</strong>
                    <span>{selectedMusic.artist || t('music.unknown_artist')}</span>
                  </div>
                  <button
                    className="music-clear-btn"
                    onClick={() => setSelectedMusic(null)}
                    aria-label={t('music.clear_selection')}
                    type="button"
                  >
                    {t('music.clear')}
                  </button>
                </div>
              )}

              {selectedMusic ? (
                <div className="music-trim" aria-labelledby="music-trim-title" aria-describedby="music-trim-help music-trim-summary">
                  <div className="music-trim-heading">
                    <h3 id="music-trim-title" className="music-trim-title">{t('music.trim_title')}</h3>
                    <button
                      className="music-preview-play-btn music-preview-play-btn-inline"
                      onClick={handlePreviewPlayToggle}
                      type="button"
                      aria-label={previewPlaying ? t('music.preview_pause') : t('music.preview_play')}
                    >
                      {previewPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </div>

                  <p id="music-trim-help" className="modal-help">{t('music.trim_help_fixed')}</p>
                  <div id="music-trim-summary" className="music-trim-time">
                    <span>{t('music.trim_start_value', { start: formatDuration(musicTrimStartMs), end: formatDuration(musicTrimStartMs + musicTrimWindowMs) })}</span>
                    <span>{t('music.trim_fixed_length', { duration: formatDurationForScreenReader(Math.floor(musicTrimWindowMs / 1000)) })}</span>
                  </div>

                  <div className="slider-group">
                    <label className="slider-label" htmlFor="music-trim-start-main">{t('music.trim_start')}</label>
                    <div className="slider-help-text">{t('music.trim_step_coarse')}</div>
                    <input
                      id="music-trim-start-main"
                      className="slider-input"
                      type="range"
                      min={0}
                      max={musicTrimMaxStartSeconds}
                      step={COARSE_TRIM_START_SLIDER_STEP_SECONDS}
                      value={selectedClipStartSeconds}
                      onChange={(event) => handleCoarseTrimStartSliderChange(event.target.value)}
                      onKeyDown={handleMusicTrimSliderKeyDown}
                      disabled={musicTrimMaxStartSeconds <= 0}
                      aria-keyshortcuts="Space"
                      aria-valuetext={formatSliderTimeValue(selectedClipStartSeconds)}
                    />
                  </div>

                  <div className="slider-group slider-group-fine">
                    <label className="slider-label" htmlFor="music-trim-start-fine">{t('music.trim_start_fine')}</label>
                    <div className="slider-help-text">{t('music.trim_step_fine')}</div>
                    <input
                      id="music-trim-start-fine"
                      className="slider-input"
                      type="range"
                      min={0}
                      max={musicTrimMaxStartSeconds}
                      step={FINE_TRIM_START_SLIDER_STEP_SECONDS}
                      value={selectedClipStartSeconds}
                      onChange={(event) => handleFineTrimStartSliderChange(event.target.value)}
                      onKeyDown={handleMusicTrimSliderKeyDown}
                      disabled={musicTrimMaxStartSeconds <= 0}
                      aria-keyshortcuts="Space"
                      aria-valuetext={formatSliderTimeValue(selectedClipStartSeconds)}
                    />
                  </div>

                  <div className="music-wave" aria-hidden="true">
                    {Array.from({ length: 44 }).map((_, index) => {
                      const seed = ((index + 1) * 1103515245 + 12345) >>> 0;
                      const value = ((seed >> 16) & 0x7fff) / 0x7fff;
                      const height = 6 + value * 20;
                      return (
                        <div
                          key={index}
                          className="music-wave-bar"
                          style={{ height: `${height}px` }}
                        />
                      );
                    })}
                    <div
                      className="music-trim-window"
                      style={{
                        left: `${selectedMusicDurationMs > 0 ? (musicTrimStartMs / selectedMusicDurationMs) * 100 : 0}%`,
                        width: `${selectedMusicDurationMs > 0 ? Math.min(100, Math.max(8, (musicTrimWindowMs / selectedMusicDurationMs) * 100)) : 40}%`,
                      }}
                    >
                      <div
                        className="music-trim-progress"
                        style={{
                          width: `${musicTrimWindowMs > 0 ? (previewProgressMs / musicTrimWindowMs) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="modal-help">{t('music.trim_disabled')}</p>
              )}

              <div className="music-search-row">
                <input
                  id="music-search-input"
                  className="music-search-input"
                  value={musicQuery}
                  onChange={(event) => setMusicQuery(event.target.value)}
                  placeholder={t('music.search_placeholder')}
                  disabled={musicLoading}
                />
                <button
                  className="music-search-btn"
                  onClick={() => handleSearchMusic(musicQuery)}
                  disabled={musicLoading}
                  type="button"
                >
                  {musicLoading ? '...' : t('music.search')}
                </button>
              </div>

              <div
                className="music-list"
                ref={musicListRef}
                onScroll={handleMusicListScroll}
                role="list"
                aria-label={t('music.results_label')}
                aria-busy={musicLoading}
              >
                {visibleMusicItems.map((item) => (
                  <div
                    key={`${item.id}-${item.songId || ''}`}
                    className={`music-item ${selectedMusic?.id === item.id ? 'active' : ''}`}
                    role="listitem"
                  >
                    <button
                      className="music-select-btn"
                      onClick={() => {
                        setSelectedMusic(item);
                        setPoliteLiveMessage(`${item.title} selected.`);
                      }}
                      aria-pressed={selectedMusic?.id === item.id}
                      type="button"
                    >
                      {item.imageUri ? (
                        <img src={item.imageUri} alt={item.title} className="music-cover" loading="lazy" />
                      ) : (
                        <div className="music-cover music-cover-placeholder">♪</div>
                      )}
                      <div className="music-item-text">
                        <span className="music-item-title">{item.title}</span>
                        <span className="music-item-artist">{item.artist || t('music.unknown_artist')}</span>
                      </div>
                      <span className="music-item-duration">{formatDuration(item.durationMs)}</span>
                    </button>
                    <button
                      className="music-play-btn"
                      onClick={() => handlePlayMusic(item)}
                      aria-label={playingMusicId === item.id ? t('music.pause_track', { title: item.title }) : t('music.play_track', { title: item.title })}
                      type="button"
                    >
                      {playingMusicId === item.id ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </div>
                ))}

                {!musicLoading && musicItems.length === 0 && (
                  <div className="music-empty">{t('music.empty')}</div>
                )}
                {musicItems.length > visibleMusicCount && (
                  <div className="music-loading-more">{t('music.load_more')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showFriendsModal && (
        <div className="modal-overlay" onClick={closeCurrentDialog}>
          <div
            className="modal-content"
            ref={friendsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="friends-dialog-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="friends-dialog-title" className="modal-title">{t('friends.title', { count: selectedFriendIds.length })}</h2>
              <button className="modal-close" onClick={closeCurrentDialog} type="button" aria-label={t('dialog.close')}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {selectedFriends.length > 0 && (
                <div className="selected-friends-chips">
                  {selectedFriends.map((friend) => (
                    <button
                      key={friend.id}
                      className="friend-chip"
                      onClick={() => removeSelectedFriend(friend.id)}
                      type="button"
                    >
                      <span>{friend.name}</span>
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              <label className="sr-only" htmlFor="friend-search-input">{t('friends.search_label')}</label>
              <div className="friends-search-row">
                <input
                  id="friend-search-input"
                  className="friends-search-input"
                  value={friendQuery}
                  onChange={(event) => setFriendQuery(event.target.value)}
                  placeholder={t('friends.search_placeholder')}
                  disabled={friendLoading}
                />
                <button
                  className="friends-search-btn"
                  onClick={() => handleSearchFriends(friendQuery, null)}
                  disabled={friendLoading}
                  type="button"
                >
                  {friendLoading ? '...' : t('friends.search')}
                </button>
              </div>

              <div
                className="friends-list"
                ref={friendsListRef}
                onScroll={handleFriendsListScroll}
                role="list"
                aria-label={t('friends.results_label')}
                aria-busy={friendLoading}
              >
                {friendItems.map((friend) => {
                  const active = selectedFriendLookup.has(friend.id);
                  return (
                    <button
                      key={friend.id}
                      className={`friend-item ${active ? 'active' : ''}`}
                      onClick={() => toggleFriendSelection(friend)}
                      aria-pressed={active}
                      type="button"
                    >
                      {friend.imageUri ? (
                        <img className="friend-avatar" src={friend.imageUri} alt={friend.name} loading="lazy" />
                      ) : (
                        <div className="friend-avatar friend-avatar-placeholder">👤</div>
                      )}
                      <span className="friend-name">{friend.name}</span>
                      <span className="friend-check" aria-hidden="true">{active ? '✓' : ''}</span>
                    </button>
                  );
                })}

                {friendLoading && <div className="music-loading-more">{t('friends.loading')}</div>}
                {!friendLoading && friendItems.length === 0 && (
                  <div className="music-empty">{t('friends.empty')}</div>
                )}
              </div>

              {friendHasNextPage && (
                <div className="friends-pagination-hint">{t('music.load_more')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showToast && result && (
        <div className={`toast ${result.type}`} role={result.type === 'error' ? 'alert' : 'status'} aria-live={result.type === 'error' ? 'assertive' : 'polite'}>
          {result.message}
        </div>
      )}
    </div>
  );
};

export default App;
