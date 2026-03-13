import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IconButton, Button, CircularProgress, Fade } from '@mui/material';
import {
    LiveTv as LiveTvIcon,
    Refresh as RefreshIcon,
    Home as HomeIcon,
    Error as ErrorIcon,
    Visibility as VisibilityIcon,
    Tv as TvIcon,
    SportsSoccer as SportsSoccerIcon,
} from '@mui/icons-material';
import VideoPlayer from './VideoPlayer';
import MatchesTable from './MatchesTable';
import useMistStreamStatus from '../hooks/useMistStreamStatus';
import './ViewerPage.css';

/* ── Gradient palette for channels without logos ── */
const CHANNEL_GRADIENTS = [
    ['#1e3a8a', '#3b82f6'],
    ['#4c1d95', '#8b5cf6'],
    ['#064e3b', '#10b981'],
    ['#7c2d12', '#f97316'],
    ['#831843', '#ec4899'],
    ['#1e3a5f', '#2563eb'],
    ['#3b0764', '#a855f7'],
    ['#0f172a', '#6366f1'],
];

function getChannelGradient(id, name) {
    const seed = id ?? (name ? name.charCodeAt(0) : 0);
    const pair = CHANNEL_GRADIENTS[seed % CHANNEL_GRADIENTS.length];
    return `linear-gradient(145deg, ${pair[0]}, ${pair[1]})`;
}

function getChannelInitial(name) {
    if (!name) return '•';
    return name.trim().charAt(0).toUpperCase();
}

/* ═══════════════════════════════════════════════════════
   ViewerPage
   ═══════════════════════════════════════════════════════ */
const ViewerPage = () => {
    const [pageData, setPageData]               = useState(null);
    const [loading, setLoading]                 = useState(true);
    const [error, setError]                     = useState(null);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [activatingStreamKey, setActivatingStreamKey] = useState(null);
    const [userInitiated, setUserInitiated]     = useState(false);
    const [matchesOpen, setMatchesOpen]         = useState(false);

    const { channelStats, wsConnected, refetch } = useMistStreamStatus();

    /* ── Fetch page data ── */
    const fetchPageData = useCallback(async () => {
        try {
            setLoading(true); setError(null);
            const response = await fetch('/api/viewer-page/data');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.status === 'enabled') {
                setPageData(data);
            } else if (data.status === 'disabled') {
                setPageData(null);
                setError('صفحة المشاهدة غير متاحة حالياً');
            } else {
                throw new Error(data.message || 'فشل في جلب البيانات');
            }
        } catch {
            setError('فشل في تحميل بيانات الصفحة');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPageData(); }, [fetchPageData]);

    /* ── عند الضغط على قناة غير مفعّلة: طلب تشغيل القناة ثم انتظار WebSocket يبلّغ أنها active ── */
    useEffect(() => {
        if (!activatingStreamKey) return;
        const host = window.location.hostname;
        const format = pageData?.settings?.streaming_format || 'hls';
        let playbackUrl;
        if (format === 'flv') playbackUrl = `http://${host}:8080/${activatingStreamKey}.flv`;
        else if (format === 'mp4') playbackUrl = `http://${host}:8080/${activatingStreamKey}.mp4`;
        else playbackUrl = `http://${host}:8080/hls/${activatingStreamKey}/index.m3u8`;
        fetch(playbackUrl).catch(() => {});
        if (!wsConnected) {
            const i = setInterval(refetch, 2000);
            return () => clearInterval(i);
        }
    }, [activatingStreamKey, pageData?.settings?.streaming_format, wsConnected, refetch]);

    useEffect(() => {
        if (!activatingStreamKey) return;
        if (channelStats[activatingStreamKey]?.status === 'active') setActivatingStreamKey(null);
    }, [activatingStreamKey, channelStats]);

    /* ── Derived data ── */
    const filteredChannels = useMemo(() => {
        if (!pageData?.channels) return [];
        return pageData.channels;
    }, [pageData]);

    /* ── Handlers ── */
    const handleChannelSelect = (channel) => {
        setSelectedChannel(channel);
        setUserInitiated(true);
        const sk = channel.stream_key || channel.name;
        const isActive = channelStats[sk]?.status === 'active';
        if (isActive) setActivatingStreamKey(null);
        else setActivatingStreamKey(sk);
    };
    const handleRefresh = () => { fetchPageData(); refetch(); };

    /* ================================================================
       STATE: Loading
    ================================================================ */
    if (loading) {
        return (
            <div className="vp-state">
                <div style={{ textAlign: 'center' }}>
                    <div className="vp-state__icon--loading">
                        <CircularProgress size={68} thickness={2} sx={{ color: 'var(--vp-primary)' }} />
                        <span className="inner-icon">
                            <LiveTvIcon sx={{ fontSize: 26, color: 'var(--vp-primary-light)' }} />
                        </span>
                    </div>
                    <h2 className="vp-state__title">جاري تحميل البث المباشر</h2>
                    <p className="vp-state__subtitle vp-state__subtitle--loading">يرجى الانتظار قليلاً</p>
                </div>
            </div>
        );
    }

    /* ================================================================
       STATE: Error
    ================================================================ */
    if (error) {
        return (
            <div className="vp-state">
                <Fade in>
                    <div className="vp-state__card vp-state__card--error">
                        <div className="vp-state__icon vp-state__icon--error">
                            <ErrorIcon sx={{ fontSize: 32, color: 'var(--vp-danger)' }} />
                        </div>
                        <h2 className="vp-state__title">خطأ في تحميل الصفحة</h2>
                        <p className="vp-state__subtitle">{error}</p>
                        <Button
                            variant="contained"
                            startIcon={<RefreshIcon />}
                            onClick={handleRefresh}
                            className="vp-state__btn vp-state__btn--primary"
                        >
                            إعادة المحاولة
                        </Button>
                    </div>
                </Fade>
            </div>
        );
    }

    /* ================================================================
       STATE: Disabled
    ================================================================ */
    if (!pageData || !pageData.settings.is_enabled) {
        return (
            <div className="vp-state">
                <Fade in>
                    <div className="vp-state__card vp-state__card--disabled">
                        <div className="vp-state__icon vp-state__icon--disabled">
                            <TvIcon sx={{ fontSize: 32, color: 'var(--vp-text-dim)' }} />
                        </div>
                        <h2 className="vp-state__title">صفحة المشاهدة غير متاحة</h2>
                        <p className="vp-state__subtitle">يرجى المحاولة لاحقاً</p>
                        <Button
                            variant="outlined"
                            startIcon={<HomeIcon />}
                            onClick={() => window.location.href = '/'}
                            className="vp-state__btn vp-state__btn--outline"
                        >
                            العودة للرئيسية
                        </Button>
                    </div>
                </Fade>
            </div>
        );
    }

    const { settings, channels } = pageData;

    /* ================================================================
       MAIN RENDER
    ================================================================ */
    return (
        <div className="vp">

            {/* ══════════ Header ══════════ */}
            <header className="vp-header">
                <div className="vp-header__inner">
                    <div className="vp-header__brand">
                        <div className="vp-header__logo">
                            {settings.page_logo_url ? (
                                <img
                                    src={settings.page_logo_url}
                                    alt={settings.page_title || 'Logo'}
                                    className="vp-header__logo-img"
                                />
                            ) : (
                                <LiveTvIcon sx={{ fontSize: 20, color: '#fff' }} />
                            )}
                        </div>
                        <div>
                            <div className="vp-header__title">{settings.page_title || 'البث المباشر'}</div>
                            <div className="vp-header__desc">{settings.page_description || 'شاهد القنوات المباشرة'}</div>
                        </div>
                    </div>

                    <div className="vp-header__actions">
                        {settings.show_matches_table && (
                            <button
                                type="button"
                                className="vp-header__btn vp-header__btn--label"
                                onClick={() => setMatchesOpen(true)}
                                title="جدول المباريات"
                            >
                                <span className="vp-header__btn-icon vp-header__btn-icon--matches" aria-hidden="true">
                                    <SportsSoccerIcon sx={{ fontSize: 18 }} />
                                </span>
                                <span className="vp-header__btn-label">جدول المباريات</span>
                            </button>
                        )}
                        <IconButton
                            className="vp-header__btn vp-header__btn--rotate"
                            onClick={handleRefresh}
                            title="تحديث"
                        >
                            <RefreshIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <IconButton
                            className="vp-header__btn"
                            onClick={() => window.location.href = '/'}
                            title="الرئيسية"
                        >
                            <HomeIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </div>
                </div>
            </header>

            {/* ══════════ Main Content ══════════ */}
            <main className="vp-content">
                <div className={`vp-layout ${settings.show_channel_list ? 'vp-layout--with-sidebar' : ''}`}>

                    {/* ══ Player Column ══ */}
                    <div>
                        <div className="vp-player">
                            <VideoPlayer
                                channel={selectedChannel}
                                isActivating={
                                    !!selectedChannel &&
                                    activatingStreamKey === (selectedChannel.stream_key || selectedChannel.name)
                                }
                                streamStatus={
                                    selectedChannel
                                        ? (channelStats[selectedChannel.stream_key]?.status
                                           ?? channelStats[selectedChannel.name]?.status
                                           ?? 'inactive')
                                        : 'unknown'
                                }
                                autoPlay={settings.auto_play}
                                showControls={settings.show_controls}
                                onError={(err) => console.error('خطأ فيديو:', err)}
                                viewerCount={
                                    selectedChannel
                                        ? (channelStats[selectedChannel.stream_key]?.connections
                                           ?? channelStats[selectedChannel.name]?.connections
                                           ?? 0)
                                        : 0
                                }
                                showViewerCount={settings.show_viewer_count}
                                settings={settings}
                                userInitiated={userInitiated}
                            />
                        </div>
                    </div>

                    {/* ══ Sidebar ══ */}
                    {settings.show_channel_list && (
                        <aside className="vp-sidebar">
                            {/* Sidebar header */}
                            <div className="vp-sidebar__header">
                                <div className="vp-sidebar__header-top">
                                    <div className="vp-sidebar__header-left">
                                        <div className="vp-sidebar__header-icon">
                                            <LiveTvIcon sx={{ fontSize: 15, color: 'var(--vp-primary-light)' }} />
                                        </div>
                                        <span className="vp-sidebar__title">القنوات</span>
                                    </div>
                                    <span className="vp-sidebar__count">{filteredChannels.length}</span>
                                </div>
                            </div>

                            {/* Channel list */}
                            <div className="vp-sidebar__list">
                                {filteredChannels.length === 0 ? (
                                    <div className="vp-sidebar__empty">لا توجد قنوات مطابقة</div>
                                ) : (
                                    filteredChannels.map((channel, index) => {
                                        const isSelected = selectedChannel?.id === channel.id;
                                        const sk = channel.stream_key || channel.name;
                                        const viewers = channelStats[sk]?.connections ?? 0;
                                        const isActive = channelStats[sk]?.status === 'active';

                                        return (
                                            <div
                                                key={channel.id}
                                                className={`vp-channel ${isSelected ? 'vp-channel--selected' : ''}`}
                                                onClick={() => handleChannelSelect(channel)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={e => e.key === 'Enter' && handleChannelSelect(channel)}
                                            >
                                            <img
                                                src="/chicon2.png"
                                                alt={channel.name}
                                                className="vp-channel__avatar"
                                            />

                                                <div className="vp-channel__info">
                                                    <div className="vp-channel__name">
                                                        {channel.name || `قناة ${index + 1}`}
                                                    </div>
                                                    <div className="vp-channel__meta">
                                                        {settings.show_viewer_count && viewers > 0 && (
                                                            <div className="vp-channel__viewers">
                                                                <VisibilityIcon sx={{ fontSize: 10 }} />
                                                                <span>{viewers}</span>
                                                            </div>
                                                        )}
                                                        {channel.category && (
                                                            <span className={`vp-channel__cat-badge ${isActive ? 'vp-channel__cat-badge--active' : ''}`}>
                                                                {channel.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <div className="vp-eq">
                                                        <span className="vp-eq__bar" />
                                                        <span className="vp-eq__bar" />
                                                        <span className="vp-eq__bar" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </aside>
                    )}
                </div>
            </main>

            {/* Matches table */}
            {settings.show_matches_table && (
                <MatchesTable
                    open={matchesOpen}
                    onClose={() => setMatchesOpen(false)}
                    channels={channels}
                    onChannelSelect={(ch) => { handleChannelSelect(ch); setMatchesOpen(false); }}
                />
            )}

            {/* ══════════ Footer — نفس ألوان الهيدر ══════════ */}
            <footer className="vp-footer">
                <div className="vp-footer__inner">
                    <span className="vp-footer__copy">© ZeroLAG {new Date().getFullYear()}</span>
                </div>
            </footer>

            {settings.custom_css && <style>{settings.custom_css}</style>}
        </div>
    );
};

export default ViewerPage;
