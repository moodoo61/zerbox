import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Typography, CircularProgress, IconButton, Slider, useMediaQuery, Fade, Tooltip } from '@mui/material';
import {
    PlayArrow as PlayIcon,
    Pause as PauseIcon,
    Error as ErrorIcon,
    VolumeUp as VolumeUpIcon,
    VolumeOff as VolumeOffIcon,
    VolumeDown as VolumeDownIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    FiberManualRecord as LiveDotIcon,
    Refresh as RefreshIcon,
    PictureInPictureAlt as PipIcon,
    ScreenRotation as ScreenRotationIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

const VideoPlayer = ({
    channel,
    isActivating = false,
    streamStatus = 'unknown',
    autoPlay = false,
    showControls = true,
    onError,
    viewerCount = 0,
    showViewerCount = true,
    settings = {},
    userInitiated = false
}) => {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const controlsTimerRef = useRef(null);
    const hlsRef = useRef(null);
    const flvRef = useRef(null);
    const bufferBarRef = useRef(null);
    const rafRef = useRef(null);
    const retryTimerRef = useRef(null);
    const retryCountRef = useRef(0);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(80);
    const [showControlsOverlay, setShowControlsOverlay] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isLandscape, setIsLandscape] = useState(false);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const shouldAutoPlay = userInitiated || autoPlay;

    const stableRefs = useRef({ settings, onError, shouldAutoPlay });
    useEffect(() => { stableRefs.current = { settings, onError, shouldAutoPlay }; });

    // ==================== بناء رابط التشغيل ====================
    const buildPlaybackUrl = useCallback((streamData, channelName) => {
        const host = window.location.hostname;
        const format = stableRefs.current.settings.streaming_format || 'hls';

        if (streamData?.source?.length > 0) {
            if (format === 'flv') {
                const src = streamData.source.find(s => s.type?.includes('flv') || s.type?.includes('video/x-flv'));
                if (src) return src.url;
            } else if (format === 'mp4') {
                const src = streamData.source.find(s => s.type?.includes('mp4') || s.type?.includes('html5'));
                if (src) return src.url;
            } else {
                const hlsTs = streamData.source.find(s =>
                    s.hrn === 'HLS (TS)' ||
                    (s.type?.includes('application/vnd.apple.mpegurl') && s.hrn !== 'HLS (CMAF)')
                );
                if (hlsTs) return hlsTs.url;
                const anyHls = streamData.source.find(s =>
                    s.type?.includes('application/vnd.apple.mpegurl') && s.hrn !== 'HLS (CMAF)'
                );
                if (anyHls) return anyHls.url;
            }
        }

        if (!channelName) return null;

        if (format === 'flv') return `http://${host}:8080/${channelName}.flv`;
        if (format === 'mp4') return `http://${host}:8080/${channelName}.mp4`;
        return `http://${host}:8080/hls/${channelName}/index.m3u8`;
    }, []);

    // ==================== جلب معلومات البث ====================
    const fetchStreamInfo = useCallback(async (channelName) => {
        const host = window.location.hostname;
        const res = await fetch(`http://${host}:8080/json_${channelName}.js`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error && data.error !== 'Stream is offline') throw new Error(data.error);
        return data;
    }, []);

    // ==================== محاولة التشغيل ====================
    const attemptPlay = useCallback(async (video) => {
        try {
            await video.play();
        } catch {
            try {
                video.muted = true;
                setIsMuted(true);
                await video.play();
            } catch { /* المتصفح يمنع التشغيل التلقائي */ }
        }
    }, []);

    // ==================== تنظيف المشغلات ====================
    const cleanup = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (flvRef.current) {
            try {
                flvRef.current.pause();
                flvRef.current.unload();
                flvRef.current.detachMediaElement();
                flvRef.current.destroy();
            } catch { /* تجاهل */ }
            flvRef.current = null;
        }
    }, []);

    // ==================== تحديث شريط البافر بـ rAF ====================
    const updateBufferBar = useCallback(() => {
        const video = videoRef.current;
        const bar = bufferBarRef.current;
        if (!video || !bar) { rafRef.current = requestAnimationFrame(updateBufferBar); return; }

        const bt = video.buffered;
        let bufferAhead = 0;
        for (let i = 0; i < bt.length; i++) {
            if (bt.start(i) <= video.currentTime && bt.end(i) > video.currentTime) {
                bufferAhead = bt.end(i) - video.currentTime;
                break;
            }
        }
        const maxDisplay = 30;
        const pct = Math.min(100, (bufferAhead / maxDisplay) * 100);
        bar.style.width = `${pct}%`;
        rafRef.current = requestAnimationFrame(updateBufferBar);
    }, []);

    // ==================== إنشاء مشغل HLS ====================
    const createHlsPlayer = useCallback((url, video) => {
        const s = stableRefs.current.settings;
        const bufSize = s.buffer_size || 30;
        const maxBuf = s.max_buffer_length || 60;
        const backBuf = s.live_back_buffer_length || 30;

        const hls = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: backBuf,
            maxBufferLength: maxBuf,
            maxMaxBufferLength: maxBuf * 2,
            maxBufferSize: bufSize * 1024 * 1024,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            liveDurationInfinity: true,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 4,
            levelLoadingTimeOut: 15000,
            levelLoadingMaxRetry: 4,
            fragLoadingTimeOut: 25000,
            fragLoadingMaxRetry: 6,
            startFragPrefetch: true,
            testBandwidth: false,
            nudgeMaxRetry: 10,
            nudgeOffset: 0.2,
        });

        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, async () => {
            setIsLoading(false);
            retryCountRef.current = 0;
            if (stableRefs.current.shouldAutoPlay) await attemptPlay(video);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                console.warn('HLS: خطأ وسائط قاتل، محاولة الاسترداد...');
                hls.recoverMediaError();
                return;
            }

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                if (retryCountRef.current < 5) {
                    retryCountRef.current++;
                    const delay = Math.min(2000 * retryCountRef.current, 10000);
                    console.warn(`HLS: خطأ شبكة، إعادة المحاولة بعد ${delay}ms...`);
                    retryTimerRef.current = setTimeout(() => {
                        hls.startLoad();
                    }, delay);
                    return;
                }
                setError('خطأ في الشبكة - تعذر الوصول للبث');
            } else {
                setError('خطأ في تشغيل البث');
            }
            setIsLoading(false);
        });

        hls.loadSource(url);
        hls.attachMedia(video);
    }, [attemptPlay]);

    // ==================== إنشاء مشغل FLV ====================
    const createFlvPlayer = useCallback((url, video) => {
        const s = stableRefs.current.settings;
        const backBuf = s.live_back_buffer_length || 30;

        const player = mpegts.createPlayer({
            type: 'flv',
            url: url,
            isLive: true,
            hasAudio: true,
            hasVideo: true,
        }, {
            enableStashBuffer: true,
            stashInitialSize: 128 * 1024,
            enableWorker: true,
            lazyLoad: true,
            lazyLoadMaxDuration: 180,
            lazyLoadRecoverDuration: 30,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: backBuf,
            autoCleanupMinBackwardDuration: backBuf / 2,
            fixAudioTimestampGap: true,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 5,
            liveBufferLatencyMinRemain: 1,
        });

        flvRef.current = player;
        player.attachMediaElement(video);
        player.load();

        player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            console.warn('FLV خطأ:', errorType, errorDetail);

            if (errorType === mpegts.ErrorTypes.NETWORK_ERROR) {
                if (retryCountRef.current < 5) {
                    retryCountRef.current++;
                    const delay = Math.min(2000 * retryCountRef.current, 10000);
                    retryTimerRef.current = setTimeout(() => {
                        try {
                            player.unload();
                            player.load();
                            player.play();
                        } catch { /* تجاهل */ }
                    }, delay);
                    return;
                }
                setError('خطأ في الشبكة - تعذر الوصول للبث');
            } else if (errorType === mpegts.ErrorTypes.MEDIA_ERROR) {
                setError('خطأ في الوسائط');
            } else {
                setError('خطأ في تشغيل البث');
            }
            setIsLoading(false);
        });

        player.on(mpegts.Events.STATISTICS_INFO, () => {
            retryCountRef.current = 0;
        });
    }, []);

    // ==================== تحميل القناة ====================
    const loadChannel = useCallback(async () => {
        if (!channel) return;

        setIsLoading(true);
        setError(null);
        setIsPlaying(false);
        retryCountRef.current = 0;

        const video = videoRef.current;
        if (!video) return;

        cleanup();
        video.pause();
        video.removeAttribute('src');
        video.load();

        try {
            const streamKey = channel.stream_key || channel.name;
            let streamData = null;
            try {
                streamData = await fetchStreamInfo(streamKey);
            } catch {
                console.warn('لا يمكن جلب معلومات البث، استخدام الرابط المباشر');
            }

            const url = buildPlaybackUrl(streamData, streamKey);
            if (!url) {
                throw new Error('لم يتم العثور على مسار صالح للتشغيل');
            }

            const isHlsUrl = url.includes('.m3u8') || url.includes('/hls/');
            const isFlvUrl = url.includes('.flv');

            if (isFlvUrl && mpegts.isSupported()) {
                createFlvPlayer(url, video);
                setIsLoading(false);
                if (stableRefs.current.shouldAutoPlay) await attemptPlay(video);

            } else if (isHlsUrl && Hls.isSupported()) {
                createHlsPlayer(url, video);

            } else if (isHlsUrl && video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                setIsLoading(false);
                if (stableRefs.current.shouldAutoPlay) await attemptPlay(video);

            } else {
                video.src = url;
                setIsLoading(false);
                if (stableRefs.current.shouldAutoPlay) await attemptPlay(video);
            }

            rafRef.current = requestAnimationFrame(updateBufferBar);

        } catch (err) {
            console.error('خطأ في تحميل القناة:', err);
            setError(`فشل في تحميل القناة: ${err.message}`);
            setIsLoading(false);
            if (stableRefs.current.onError) stableRefs.current.onError(err);
        }
    }, [channel, cleanup, fetchStreamInfo, buildPlaybackUrl, createHlsPlayer, createFlvPlayer, attemptPlay, updateBufferBar]);

    // ==================== تأثيرات دورة الحياة ====================
    // تشغيل القناة فقط عندما تكون مفعّلة (لا نرسل طلب التشغيل أثناء التفعيل)
    useEffect(() => {
        if (!channel || isActivating) return;
        loadChannel();
        return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channel?.stream_key, channel?.name, isActivating]);

    useEffect(() => {
        const handleUnload = () => cleanup();
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('pagehide', handleUnload);
        };
    }, [cleanup]);

    // ==================== إخفاء/إظهار أزرار التحكم ====================
    const resetControlsTimer = useCallback(() => {
        setShowControlsOverlay(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        if (isPlaying && !isHovering) {
            controlsTimerRef.current = setTimeout(() => setShowControlsOverlay(false), 3500);
        }
    }, [isPlaying, isHovering]);

    useEffect(() => {
        resetControlsTimer();
        return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
    }, [isPlaying, resetControlsTimer]);

    // ==================== التحكم ====================
    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
        resetControlsTimer();
    }, [resetControlsTimer]);

    const toggleMute = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setIsMuted(v.muted);
        resetControlsTimer();
    }, [resetControlsTimer]);

    const handleVolumeChange = useCallback((_, val) => {
        const v = videoRef.current;
        if (!v) return;
        v.volume = val / 100;
        setVolume(val);
        if (val === 0) { v.muted = true; setIsMuted(true); }
        else if (v.muted) { v.muted = false; setIsMuted(false); }
        resetControlsTimer();
    }, [resetControlsTimer]);

    const toggleFullscreen = useCallback(async () => {
        const c = containerRef.current;
        if (!c) return;
        try {
            if (!document.fullscreenElement) { await c.requestFullscreen(); setIsFullscreen(true); }
            else { await document.exitFullscreen(); setIsFullscreen(false); setIsLandscape(false); }
        } catch { /* تجاهل */ }
        resetControlsTimer();
    }, [resetControlsTimer]);

    const togglePiP = useCallback(async () => {
        const v = videoRef.current;
        if (!v) return;
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else if (document.pictureInPictureEnabled) await v.requestPictureInPicture();
        } catch { /* تجاهل */ }
    }, []);

    const toggleRotation = useCallback(async () => {
        try {
            const scr = window.screen;
            if (scr.orientation?.lock) {
                if (scr.orientation.type.includes('portrait')) {
                    await scr.orientation.lock('landscape'); setIsLandscape(true);
                } else {
                    await scr.orientation.lock('portrait'); setIsLandscape(false);
                }
            }
        } catch { /* تجاهل */ }
        resetControlsTimer();
    }, [resetControlsTimer]);

    useEffect(() => {
        const h = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', h);
        return () => document.removeEventListener('fullscreenchange', h);
    }, []);

    useEffect(() => {
        if (!isFullscreen && isLandscape) {
            try { window.screen.orientation?.unlock(); } catch { /* تجاهل */ }
            setIsLandscape(false);
        }
    }, [isFullscreen, isLandscape]);

    const VolumeIcon = useMemo(() =>
        isMuted || volume === 0 ? VolumeOffIcon : volume < 50 ? VolumeDownIcon : VolumeUpIcon
    , [isMuted, volume]);

    // ==================== الواجهة ====================

    if (!channel) {
        return (
            <Box sx={{
                width: '100%', height: isMobile ? '50vh' : '70vh',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(ellipse at 50% 40%, #0c1628 0%, #070b14 100%)',
                color: 'rgba(255,255,255,0.5)', borderRadius: 4,
                border: '1px solid rgba(66,165,245,0.12)'
            }}>
                <Box sx={{
                    width: 80, height: 80, borderRadius: '22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.12)', mb: 2.5
                }}>
                    <PlayIcon sx={{ fontSize: 38, color: 'rgba(59,130,246,0.4)', ml: '2px' }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)', mb: 0.5 }}>
                    اختر قناة للمشاهدة
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.25)' }}>
                    اضغط على أي قناة من القائمة لبدء البث
                </Typography>
            </Box>
        );
    }

    if (isActivating) {
        return (
            <Box sx={{
                width: '100%', height: isMobile ? '50vh' : '70vh',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(ellipse at 50% 40%, #0c1628 0%, #070b14 100%)',
                color: 'rgba(255,255,255,0.5)', borderRadius: 4,
                border: '1px solid rgba(66,165,245,0.12)'
            }}>
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.5 }}>
                    <CircularProgress
                        size={80}
                        thickness={2.5}
                        sx={{ color: '#10b981' }}
                    />
                    <Box sx={{
                        position: 'absolute',
                        width: 56, height: 56, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)'
                    }}>
                        <LiveDotIcon sx={{ fontSize: 28, color: '#10b981' }} />
                    </Box>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)', mb: 0.5 }}>
                    تم الآن تفعيل القناة
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 1 }}>
                    جاري التفعيل...
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                    {channel.name}
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            ref={containerRef}
            onMouseEnter={() => { setIsHovering(true); setShowControlsOverlay(true); }}
            onMouseLeave={() => { setIsHovering(false); if (isPlaying) resetControlsTimer(); }}
            onMouseMove={resetControlsTimer}
            onTouchStart={resetControlsTimer}
            onClick={(e) => {
                if (e.target === videoRef.current || e.target.closest('.video-click-area')) togglePlay();
            }}
            onDoubleClick={(e) => {
                if (e.target === videoRef.current || e.target.closest('.video-click-area')) toggleFullscreen();
            }}
            sx={{
                position: 'relative', width: '100%', bgcolor: '#000',
                borderRadius: isFullscreen ? 0 : 4,
                overflow: 'hidden', direction: 'rtl',
                cursor: showControlsOverlay ? 'default' : 'none',
                userSelect: 'none'
            }}
        >
            {/* ===== الفيديو ===== */}
            <Box className="video-click-area" sx={{ position: 'relative' }}>
                <video
                    ref={videoRef}
                    style={{
                        width: '100%',
                        height: isFullscreen ? '100vh' : (isMobile ? '50vh' : '70vh'),
                        backgroundColor: '#000',
                        objectFit: 'contain',
                        display: 'block'
                    }}
                    controls={false}
                    onLoadStart={() => { setIsLoading(true); setError(null); }}
                    onCanPlay={() => { setIsLoading(false); setError(null); }}
                    onWaiting={() => setIsLoading(true)}
                    onPlaying={() => { setIsLoading(false); setIsPlaying(true); }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => {
                        if (!hlsRef.current && !flvRef.current) {
                            setError('فشل في تحميل الفيديو - تحقق من وجود البث');
                            setIsLoading(false);
                        }
                    }}
                    onVolumeChange={() => {
                        const v = videoRef.current;
                        if (v) { setIsMuted(v.muted); setVolume(Math.round(v.volume * 100)); }
                    }}
                    playsInline
                    muted={isMuted}
                />
            </Box>

            {/* ===== التحميل ===== */}
            <Fade in={isLoading}>
                <Box sx={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 10
                }}>
                    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                        <CircularProgress size={isMobile ? 56 : 72} thickness={2.5} sx={{ color: '#3b82f6' }} />
                        <Box sx={{ position: 'absolute', width: isMobile ? 34 : 44, height: isMobile ? 34 : 44, borderRadius: '12px', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PlayIcon sx={{ fontSize: isMobile ? 18 : 22, color: '#3b82f6' }} />
                        </Box>
                    </Box>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, mb: 0.5 }}>جاري تشغيل  القناة...</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{channel?.name}</Typography>
                </Box>
            </Fade>

            {/* ===== الخطأ ===== */}
            <Fade in={!!error}>
                <Box sx={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)', zIndex: 10
                }}>
                    <Box sx={{ width: 68, height: 68, borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', mb: 2.5 }}>
                        <ErrorIcon sx={{ fontSize: 32, color: '#ef4444' }} />
                    </Box>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, mb: 1, textAlign: 'center', px: 3 }}>{error}</Typography>
                    <Box
                        onClick={(e) => { e.stopPropagation(); loadChannel(); }}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 1, mt: 2, px: 3, py: 1,
                            borderRadius: '12px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                            color: '#60a5fa', cursor: 'pointer', transition: 'all 0.2s',
                            '&:hover': { background: 'rgba(59,130,246,0.2)' }
                        }}
                    >
                        <RefreshIcon sx={{ fontSize: 16 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>إعادة المحاولة</Typography>
                    </Box>
                </Box>
            </Fade>

            {/* ===== زر التشغيل المركزي ===== */}
            <Fade in={!isPlaying && !isLoading && !error}>
                <Box className="video-click-area" sx={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.25)', zIndex: 5, cursor: 'pointer'
                }}>
                    <Box sx={{
                        width: { xs: 62, sm: 78 }, height: { xs: 62, sm: 78 },
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                        '&:hover': { background: 'rgba(255,255,255,0.18)', transform: 'scale(1.08)' }
                    }}>
                        <PlayIcon sx={{ fontSize: { xs: 30, sm: 38 }, color: '#fff', ml: '2px' }} />
                    </Box>
                </Box>
            </Fade>

            {/* ===== شريط البافر (يظهر دائماً) ===== */}
            {showControls && (
                <Box sx={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, zIndex: 22,
                    px: { xs: 0.5, sm: 1 }, display: 'flex', alignItems: 'center',
                    bgcolor: 'rgba(0,0,0,0.4)'
                }}>
                    <Box sx={{ width: '100%', height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', overflow: 'hidden', position: 'relative' }}>
                        <Box
                            ref={bufferBarRef}
                            sx={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: '0%',
                                bgcolor: 'rgba(59,130,246,0.7)',
                                borderRadius: 2,
                                transition: 'none',
                            }}
                        />
                    </Box>
                </Box>
            )}

            {/* ===== شريط التحكم ===== */}
            {showControls && (
                <Fade in={showControlsOverlay || !isPlaying}>
                    <Box
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                            position: 'absolute', bottom: 5, left: 0, right: 0, zIndex: 20,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
                            pt: { xs: 4, sm: 6 }, pb: { xs: 1.2, sm: 1.5 }, px: { xs: 1.2, sm: 2 }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'ltr' }}>
                            {/* يسار: تشغيل + صوت + اسم القناة */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.3, sm: 0.5 } }}>
                                <CtrlBtn onClick={togglePlay} tooltip={isPlaying ? 'إيقاف' : 'تشغيل'}>
                                    {isPlaying ? <PauseIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : <PlayIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />}
                                </CtrlBtn>

                                {settings.enable_volume_control !== false && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', '&:hover .vol-s': { width: { xs: 55, sm: 75 }, opacity: 1, mx: 0.5 } }}>
                                        <CtrlBtn onClick={toggleMute} size="small">
                                            <VolumeIcon sx={{ fontSize: { xs: 17, sm: 20 } }} />
                                        </CtrlBtn>
                                        <Slider
                                            className="vol-s"
                                            value={isMuted ? 0 : volume} onChange={handleVolumeChange}
                                            min={0} max={100} size="small"
                                            sx={{
                                                width: 0, opacity: 0, transition: 'all 0.3s', color: '#3b82f6',
                                                '& .MuiSlider-thumb': { width: 10, height: 10, bgcolor: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.4)' },
                                                '& .MuiSlider-track': { border: 'none' },
                                                '& .MuiSlider-rail': { bgcolor: 'rgba(255,255,255,0.15)' }
                                            }}
                                        />
                                    </Box>
                                )}

                                <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1, ml: 0.5 }}>
                                    <Box sx={{ width: '1px', height: 14, bgcolor: 'rgba(255,255,255,0.15)' }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500, fontSize: '0.78rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {channel?.name}
                                    </Typography>
                                </Box>
                            </Box>

                            {/* وسط: شارة LIVE */}
                            <Box sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                px: { xs: 1, sm: 1.5 }, py: { xs: 0.3, sm: 0.4 },
                                borderRadius: '8px',
                                bgcolor: isPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`,
                                transition: 'all 0.3s'
                            }}>
                                <LiveDotIcon sx={{
                                    fontSize: 8, color: isPlaying ? '#ef4444' : 'rgba(255,255,255,0.3)',
                                    animation: isPlaying ? 'lp 1.5s ease-in-out infinite' : 'none',
                                    '@keyframes lp': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } }
                                }} />
                                <Typography variant="caption" sx={{
                                    color: isPlaying ? '#ef4444' : 'rgba(255,255,255,0.3)',
                                    fontWeight: 800, fontSize: '0.6rem', letterSpacing: '0.08em'
                                }}>LIVE</Typography>
                            </Box>

                            {/* يمين: PiP + تدوير + ملء الشاشة */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.3, sm: 0.5 } }}>
                                {isMobile && isFullscreen && (
                                    <CtrlBtn onClick={toggleRotation} tooltip={isLandscape ? 'عمودي' : 'أفقي'} size="small">
                                        <ScreenRotationIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
                                    </CtrlBtn>
                                )}
                                {document.pictureInPictureEnabled && (
                                    <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
                                        <CtrlBtn onClick={togglePiP} tooltip="صورة في صورة" size="small">
                                            <PipIcon sx={{ fontSize: { xs: 16, sm: 19 } }} />
                                        </CtrlBtn>
                                    </Box>
                                )}
                                {settings.enable_fullscreen !== false && (
                                    <CtrlBtn onClick={toggleFullscreen} tooltip={isFullscreen ? 'خروج' : 'ملء الشاشة'}>
                                        {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : <FullscreenIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />}
                                    </CtrlBtn>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </Fade>
            )}
        </Box>
    );
};

const CtrlBtn = ({ onClick, children, tooltip, size = 'normal', sx: sxOverride }) => {
    const s = size === 'small'
        ? { width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 } }
        : { width: { xs: 36, sm: 42 }, height: { xs: 36, sm: 42 } };

    const btn = (
        <IconButton
            onClick={onClick}
            sx={{
                color: 'rgba(255,255,255,0.85)', ...s, borderRadius: '10px',
                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', transform: 'scale(1.08)' },
                '&:active': { transform: 'scale(0.95)' },
                ...sxOverride
            }}
        >
            {children}
        </IconButton>
    );
    return tooltip ? <Tooltip title={tooltip} placement="top" arrow>{btn}</Tooltip> : btn;
};

export default VideoPlayer;
