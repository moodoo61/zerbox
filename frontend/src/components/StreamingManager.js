import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert,
    Card, CardContent, Divider, Chip, List, ListItem, ListItemText,
    Paper, Tabs, Tab, FormControl, Select, MenuItem,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, IconButton,
    Radio, RadioGroup,
    useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
    Save as SaveIcon,
    Refresh as RefreshIcon,
    FactCheck as FactCheckIcon,
    Delete as DeleteIcon,
    Restore as RestoreIcon,
    PersonOff as PersonOffIcon,
    Visibility as VisibilityIcon,
    BarChart as BarChartIcon,
    HelpOutline as HelpOutlineIcon,
    Settings as SettingsIcon,
    Close as CloseIcon,
    Tune as TuneIcon,
} from '@mui/icons-material';
import ViewerPageManager from './ViewerPageManager';

function _getPerms(userInfo) {
    if (!userInfo || userInfo.role === 'owner') return null;
    try { return typeof userInfo.permissions === 'string' ? JSON.parse(userInfo.permissions) : userInfo.permissions || {}; }
    catch { return {}; }
}
function _subVisible(perms, key) { if (!perms) return true; const p = perms[key]; return !p || p.visible !== false; }

/** القيم value يجب أن تبقى أبعادًا — الخادم يبني رابط المصدر بـ video=1280x720 إلخ */
const VIDEO_QUALITY_OPTIONS = [
    { value: '1280x720', shortLabel: '720P', hint: 'جودة عالية' },
    { value: '854x480', shortLabel: '480P', hint: 'متوسطة' },
    { value: '512x288', shortLabel: '288P', hint: 'منخفضة' },
];
const DEFAULT_VIDEO_QUALITY = '854x480';

function videoQualityShortLabel(value) {
    const opt = VIDEO_QUALITY_OPTIONS.find((o) => o.value === value);
    return opt ? opt.shortLabel : VIDEO_QUALITY_OPTIONS[1].shortLabel;
}

function normalizeVideoQualityFromApi(q) {
    if (q === 1 || q === '1') return '1280x720';
    if (q === 2 || q === '2') return '854x480';
    if (q === 3 || q === '3') return '512x288';
    if (VIDEO_QUALITY_OPTIONS.some((o) => o.value === q)) return q;
    return DEFAULT_VIDEO_QUALITY;
}

const StreamingManager = ({ auth, userInfo }) => {
    const theme = useTheme();
    const showToolbarButtonIcons = useMediaQuery(theme.breakpoints.up('sm'));
    const [streamingTab, setStreamingTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [isActivated, setIsActivated] = useState(false);
    const [channels, setChannels] = useState([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [mistServerStatus, setMistServerStatus] = useState(null);
    const [testingConnection, setTestingConnection] = useState(false);
    const [channelStats, setChannelStats] = useState({});
    const [loadingStats, setLoadingStats] = useState(false);
    const [channelActions, setChannelActions] = useState({});
    const [mistServerAvailable, setMistServerAvailable] = useState(null); // null=checking, true/false
    const [mistServerMessage, setMistServerMessage] = useState(null);
    const [defaultQuality, setDefaultQuality] = useState(DEFAULT_VIDEO_QUALITY);
    const [bulkQualityDialogOpen, setBulkQualityDialogOpen] = useState(false);
    const [bulkQualityDraft, setBulkQualityDraft] = useState(DEFAULT_VIDEO_QUALITY);
    const [pendingQuality, setPendingQuality] = useState({}); // streamKey -> quality (عند اختيار جودة مختلفة تظهر زر التطبيق)
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [advancedChannel, setAdvancedChannel] = useState(null); // {name, stream_key}
    const [advancedLoading, setAdvancedLoading] = useState(false);
    const [advancedSaving, setAdvancedSaving] = useState(false);
    const [advancedSettings, setAdvancedSettings] = useState({
        dvr: 100000, pagetimeout: 80, maxkeepaway: 50000,
        inputtimeout: 120, always_on: false, raw: false,
    });

    const TOAST_AUTO_HIDE_MS = 6000;
    useEffect(() => {
        if (!error && !successMessage) return;
        const t = setTimeout(() => {
            setError(null);
            setSuccessMessage(null);
        }, TOAST_AUTO_HIDE_MS);
        return () => clearTimeout(t);
    }, [error, successMessage]);

    useEffect(() => {
        if (!mistServerStatus) return;
        const t = setTimeout(() => setMistServerStatus(null), 5000);
        return () => clearTimeout(t);
    }, [mistServerStatus]);

    useEffect(() => {
        if (!mistServerMessage) return;
        const t = setTimeout(() => setMistServerMessage(null), 10000);
        return () => clearTimeout(t);
    }, [mistServerMessage]);

    // دوال مساعدة لتحديد حالة القناة
    const getChannelStatus = (stats) => {
        // أولاً: استخدام status الفعلي من MistServer
        if (stats.stream_stats && stats.stream_stats.status) {
            const mistStatus = stats.stream_stats.status.toLowerCase();
            
            // ترجمة حالات MistServer الفعلية
            if (mistStatus === 'online') {
                return 'متصل';
            } else if (mistStatus.includes('active') || mistStatus.includes('streaming')) {
                return 'نشط';
            } else if (mistStatus.includes('ready') || mistStatus.includes('standby')) {
                return 'جاهز';
            } else if (mistStatus.includes('connecting') || mistStatus.includes('loading')) {
                return 'يتصل';
            } else if (mistStatus.includes('error') || mistStatus.includes('failed')) {
                return 'خطأ';
            } else if (mistStatus.includes('offline') || mistStatus.includes('stopped')) {
                return 'متوقف';
            } else {
                // عرض الحالة كما هي من MistServer
                return stats.stream_stats.status;
            }
        }
        
        // ثانياً: فحص إذا كان هناك مدخلات ومخرجات (احتياطي)
        if (stats.stream_stats && stats.stream_stats.inputs > 0 && stats.stream_stats.outputs > 0) {
            return 'نشط';
        }
        
        // ثالثاً: فحص إذا كان هناك مدخلات فقط (القناة تُبث ولكن بدون مخرجات)
        if (stats.stream_stats && stats.stream_stats.inputs > 0) {
            return 'يُبث';
        }
        
        // رابعاً: فحص إذا كان هناك مخرجات فقط
        if (stats.stream_stats && stats.stream_stats.outputs > 0) {
            return 'متاح للعرض';
        }
        
        // خامساً: فحص إذا كان هناك اتصال حديث
        if (stats.timestamp && stats.timestamp > 0) {
            const now = Math.floor(Date.now() / 1000);
            const timeDiff = now - stats.timestamp;
            if (timeDiff < 60) { // أقل من دقيقة
                return 'متصل حديثاً';
            }
        }
        
        // عند عدم وجود stream_stats من MistServer نعتبر القناة غير متصلة (لا نعرض "غير معروف" مع أرقام مشاهدين)
        if (!stats.stream_stats || Object.keys(stats.stream_stats || {}).length === 0) {
            return 'غير متصل';
        }
        
        return 'غير معروف';
    };

    const getChannelStatusColor = (stats) => {
        const status = getChannelStatus(stats);
        switch (status) {
            case 'نشط':
                return 'success';
            case 'متصل':
            case 'يُبث':
                return 'success';
            case 'جاهز':
            case 'متاح للعرض':
                return 'info';
            case 'يتصل':
            case 'متصل حديثاً':
                return 'primary';
            case 'خطأ':
                return 'error';
            case 'متوقف':
            case 'غير متصل':
                return 'warning';
            default:
                return 'default';
        }
    };

    // فحص حالة التفعيل عند تحميل المكون
    useEffect(() => {
        checkActivationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // تهيئة الإحصائيات عند تحميل القنوات
    useEffect(() => {
        if (isActivated && channels.length > 0) {
            // تهيئة الإحصائيات الفارغة لجميع القنوات
            const initialStats = {};
            channels.forEach(channel => {
                const channelName = channel.name || `قناة ${channels.indexOf(channel) + 1}`;
                if (!channelStats[channelName]) {
                    initialStats[channelName] = {
                        total_viewers: 0,
                        viewers: [],
                        timestamp: 0
                    };
                }
            });
            if (Object.keys(initialStats).length > 0) {
                setChannelStats(prev => ({ ...prev, ...initialStats }));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channels, isActivated]);

    // تحديث تلقائي للإحصائيات عند التحميل وكل 30 ثانية
    useEffect(() => {
        if (isActivated && channels.length > 0 && mistServerAvailable) {
            fetchAllChannelsStats();
            
            const interval = setInterval(() => {
                fetchAllChannelsStats();
            }, 30000);

            return () => clearInterval(interval);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActivated, channels.length, mistServerAvailable]);

    const checkActivationStatus = async () => {
        // فحص سيرفر المشاهدة أولاً
        try {
            const mistResponse = await fetch('/api/streaming/check-mistserver', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (mistResponse.ok) {
                const mistData = await mistResponse.json();
                const isAvailable = mistData.status === 'success';
                setMistServerAvailable(isAvailable);
                setMistServerMessage(mistData.message);
                if (!isAvailable) {
                    return;
                }
            } else {
                setMistServerAvailable(false);
                setMistServerMessage('سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني');
                return;
            }
        } catch (err) {
            setMistServerAvailable(false);
            setMistServerMessage('سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني');
            return;
        }

        // فحص حالة التفعيل
        try {
            const response = await fetch('/api/streaming/status', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                const data = await response.json();
                setIsActivated(data.is_active);
                if (data.is_active) {
                    fetchChannels();
                }
            }
        } catch (err) {
            console.error('Error checking activation status:', err);
        }
    };

    const fetchChannels = async () => {
        setLoadingChannels(true);
        try {
            const response = await fetch('/api/streaming/channels', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                const raw = await response.json();
                const data = Array.isArray(raw) ? raw : [];
                setChannels(data.map((ch) => ({
                    ...ch,
                    video_quality: normalizeVideoQualityFromApi(ch.video_quality),
                })));
            }
        } catch (err) {
            console.error('Error fetching channels:', err);
            setError('فشل في جلب القنوات');
        } finally {
            setLoadingChannels(false);
        }
    };

    const handleSubscriptionSubmit = async () => {
        setLoading(true);
        setError(null);
        setSuccessMessage(null);

        // فحص سيرفر المشاهدة أولاً
        try {
            const mistResponse = await fetch('/api/streaming/check-mistserver', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (mistResponse.ok) {
                const mistData = await mistResponse.json();
                if (mistData.status !== 'success') {
                    setError(mistData.message);
                    setMistServerAvailable(false);
                    setMistServerMessage(mistData.message);
                    setLoading(false);
                    return;
                }
                setMistServerAvailable(true);
            }
        } catch (err) {
            setError('سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني');
            setMistServerAvailable(false);
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/streaming/activate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'فشل في تفعيل الخدمة');
            }

            const data = await response.json();
            setSuccessMessage('تم تفعيل الخدمة بنجاح!');
            setIsActivated(data.is_active);
            setError(null);
            
            if (data.is_active) {
                fetchChannels();
                setTimeout(() => {
                    fetchAllChannelsStats();
                }, 3000);
            }

        } catch (err) {
            setError(`فشل في تفعيل الخدمة: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const refreshChannels = async () => {
        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        
        try {
            const response = await fetch('/api/streaming/refresh-channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                // تحديث القنوات والإحصائيات
                fetchChannels();
                setTimeout(() => {
                    fetchAllChannelsStats();
                }, 2000);
            } else {
                setError(data.message || 'فشل في تحديث القنوات');
            }
        } catch (err) {
            setError(`فشل في تحديث القنوات: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const testMistServerConnection = async () => {
        setTestingConnection(true);
        setMistServerStatus(null);
        
        try {
            const response = await fetch('/api/streaming/test-mistserver', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            setMistServerStatus(data);
            const isAvailable = data.status === 'success';
            setMistServerAvailable(isAvailable);
            setMistServerMessage(data.message);

            if (isAvailable && isActivated && channels.length === 0) {
                fetchChannels();
            }
            
        } catch (err) {
            setMistServerStatus({
                status: 'error',
                message: 'سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني'
            });
            setMistServerAvailable(false);
            setMistServerMessage('سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني');
        } finally {
            setTestingConnection(false);
        }
    };

    const deleteChannel = async (channelName) => {
        if (!window.confirm(`هل أنت متأكد من حذف القناة "${channelName}"؟`)) {
            return;
        }

        setChannelActions(prev => ({ ...prev, [channelName]: 'deleting' }));
        
        try {
            const response = await fetch(`/api/streaming/channels/${channelName}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                fetchChannels(); // Refresh channel list
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError(`فشل في حذف القناة: ${err.message}`);
        } finally {
            setChannelActions(prev => ({ ...prev, [channelName]: null }));
        }
    };

    const reconnectChannel = async (channelName) => {
        setChannelActions(prev => ({ ...prev, [channelName]: 'reconnecting' }));
        
        try {
            const response = await fetch(`/api/streaming/channels/${channelName}/reconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                // تحديث الإحصائيات بعد إعادة الاتصال
                setTimeout(() => {
                    fetchAllChannelsStats();
                }, 2000); // انتظر 2 ثانية لإعطاء وقت للقناة للاتصال
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError(`فشل في إعادة الاتصال: ${err.message}`);
        } finally {
            setChannelActions(prev => ({ ...prev, [channelName]: null }));
        }
    };

    const kickAllViewers = async (channelName) => {
        if (!window.confirm(`هل أنت متأكد من إخراج جميع المشاهدين من القناة "${channelName}"؟`)) {
            return;
        }

        setChannelActions(prev => ({ ...prev, [channelName]: 'kicking' }));
        
        try {
            const response = await fetch(`/api/streaming/channels/${channelName}/kick-viewers`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                fetchChannelStats(channelName); // Refresh stats
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError(`فشل في إخراج المشاهدين: ${err.message}`);
        } finally {
            setChannelActions(prev => ({ ...prev, [channelName]: null }));
        }
    };

    const setChannelQuality = async (channelName, quality) => {
        const key = channelName;
        setChannelActions(prev => ({ ...prev, [key]: 'settingQuality' }));
        try {
            const response = await fetch(`/api/streaming/channels/${encodeURIComponent(channelName)}/quality`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ quality: String(quality) })
            });
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                setPendingQuality(prev => { const next = { ...prev }; delete next[key]; return next; });
                const vq = normalizeVideoQualityFromApi(quality);
                setChannels(prev => prev.map(ch => {
                    const name = ch.name || ch.stream_key;
                    if (name === channelName || ch.stream_key === channelName) {
                        return { ...ch, video_quality: vq };
                    }
                    return ch;
                }));
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError(`فشل في ضبط الجودة: ${err.message}`);
        } finally {
            setChannelActions(prev => ({ ...prev, [key]: null }));
        }
    };

    const setAllChannelsQuality = async (qualityOverride) => {
        const q = normalizeVideoQualityFromApi(qualityOverride != null ? qualityOverride : defaultQuality);
        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const response = await fetch('/api/streaming/channels/set-all-quality', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ quality: q })
            });
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                setDefaultQuality(q);
                setChannels(prev => prev.map(ch => ({ ...ch, video_quality: q })));
                return true;
            }
            setError(data.message || 'فشل في ضبط الجودة');
            return false;
        } catch (err) {
            setError(`فشل في ضبط جودة القنوات: ${err.message}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const openBulkQualityDialog = () => {
        setBulkQualityDraft(normalizeVideoQualityFromApi(defaultQuality));
        setBulkQualityDialogOpen(true);
    };

    const confirmBulkQuality = async () => {
        const ok = await setAllChannelsQuality(bulkQualityDraft);
        if (ok) setBulkQualityDialogOpen(false);
    };

    const openAdvancedSettings = async (channel) => {
        const key = channel.stream_key || channel.name;
        setAdvancedChannel(channel);
        setAdvancedOpen(true);
        setAdvancedLoading(true);
        try {
            const response = await fetch(`/api/streaming/channels/${encodeURIComponent(key)}/advanced`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            const data = await response.json();
            if (data.status === 'success') {
                setAdvancedSettings(data.settings);
            } else {
                setAdvancedSettings({
                    dvr: 100000, pagetimeout: 80, maxkeepaway: 50000,
                    inputtimeout: 180, always_on: false, raw: false,
                });
            }
        } catch {
            setAdvancedSettings({
                dvr: 100000, pagetimeout: 80, maxkeepaway: 50000,
                inputtimeout: 180, always_on: false, raw: false,
            });
        } finally {
            setAdvancedLoading(false);
        }
    };

    const saveAdvancedSettings = async () => {
        if (!advancedChannel) return;
        const key = advancedChannel.stream_key || advancedChannel.name;
        setAdvancedSaving(true);
        try {
            const response = await fetch(`/api/streaming/channels/${encodeURIComponent(key)}/advanced`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(advancedSettings)
            });
            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(data.message);
                setAdvancedOpen(false);
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError(`فشل في حفظ الإعدادات: ${err.message}`);
        } finally {
            setAdvancedSaving(false);
        }
    };

    const fetchChannelStats = async (channelName) => {
        try {
            const response = await fetch(`/api/streaming/channels/${channelName}/stats`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setChannelStats(prev => ({ 
                    ...prev, 
                    [channelName]: {
                        total_viewers: data.total_viewers,
                        viewers: data.viewers,
                        stream_stats: data.stream_stats,
                        timestamp: data.timestamp
                    }
                }));
            } else {
                console.error(`فشل في جلب إحصائيات القناة ${channelName}:`, data.message);
            }
        } catch (err) {
            console.error(`فشل في جلب إحصائيات القناة ${channelName}:`, err);
        }
    };

    const fetchAllChannelsStats = async () => {
        setLoadingStats(true);
        
        try {
            const response = await fetch(`/api/streaming/all-stats`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                setChannelStats(data.streams_stats || {});
            } else {
                // عرض الخطأ في console فقط لتجنب الظهور المتكرر في الواجهة
                console.warn('فشل في جلب الإحصائيات:', data.message);
            }
        } catch (err) {
            // عرض الخطأ في console فقط لتجنب الظهور المتكرر في الواجهة
            console.warn('فشل في جلب إحصائيات القنوات:', err);
        } finally {
            setLoadingStats(false);
        }
    };

    return (
        <>
            <Paper sx={{ width: '100%' }}>
                {(() => {
                    const perms = _getPerms(userInfo);
                    const allTabs = [
                        { key: 'البث المباشر > إدارة القنوات', label: 'إدارة القنوات', id: 'channels' },
                        { key: 'البث المباشر > صفحة المشاهدة', label: 'صفحة المشاهدة', id: 'viewer' },
                    ];
                    const visibleTabs = allTabs.filter(t => _subVisible(perms, t.key));
                    const activeTabId = visibleTabs[streamingTab]?.id || visibleTabs[0]?.id;
                    return (<>
                <Tabs
                    value={Math.min(streamingTab, visibleTabs.length - 1)}
                    onChange={(e, newValue) => setStreamingTab(newValue)}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    {visibleTabs.map(t => <Tab key={t.id} label={t.label} />)}
                </Tabs>

                {activeTabId === 'channels' && (
                    <Box sx={{ p: { xs: '15px', md: 3 } }}>
            {(error || successMessage) && (
                <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {error && (
                        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
                    )}
                    {successMessage && (
                        <Alert severity="success" onClose={() => setSuccessMessage(null)}>{successMessage}</Alert>
                    )}
                </Box>
            )}
            {mistServerAvailable === false && mistServerMessage && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMistServerMessage(null)}>
                    {mistServerMessage}
                </Alert>
            )}
            {mistServerStatus && (
                <Alert
                    severity={mistServerStatus.status === 'success' ? 'success' : 'error'}
                    sx={{ mb: 2 }}
                    onClose={() => setMistServerStatus(null)}
                >
                    {mistServerStatus.message}
                </Alert>
            )}

            <Card sx={{ mb: 3 }}>
                <CardContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                            <Typography variant="h6" sx={{ width: '100%' }}>
                                القنوات المتاحة ({channels.length})
                            </Typography>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: { xs: 1, sm: 1.5 },
                                    width: '100%',
                                    alignItems: { xs: 'stretch', sm: 'stretch' },
                                    justifyContent: { xs: 'stretch', sm: 'flex-start' },
                                }}
                            >
                                <Button
                                    variant="contained"
                                    size="small"
                                    color={isActivated ? 'success' : 'primary'}
                                    onClick={handleSubscriptionSubmit}
                                    disabled={loading}
                                    startIcon={
                                        loading
                                            ? <CircularProgress size={16} color="inherit" />
                                            : showToolbarButtonIcons
                                              ? <SaveIcon />
                                              : undefined
                                    }
                                    sx={{
                                        gap: 1.5,
                                        '& .MuiButton-startIcon': { margin: '0 !important' },
                                        flex: {
                                            xs: '1 1 130px',
                                            sm: '1 1 160px',
                                            md: '1 1 0',
                                        },
                                        minWidth: { xs: '130px', sm: '160px', md: '140px' },
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {loading ? 'جاري التفعيل...' : 'تفعيل الخدمة'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={testMistServerConnection}
                                    disabled={testingConnection}
                                    startIcon={
                                        testingConnection
                                            ? <CircularProgress size={16} color="inherit" />
                                            : showToolbarButtonIcons
                                              ? <FactCheckIcon />
                                              : undefined
                                    }
                                    sx={{
                                        gap: 1.5,
                                        '& .MuiButton-startIcon': { margin: '0 !important' },
                                        flex: {
                                            xs: '1 1 130px',
                                            sm: '1 1 160px',
                                            md: '1 1 0',
                                        },
                                        minWidth: { xs: '130px', sm: '160px', md: '140px' },
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    فحص سيرفر المشاهدة
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={refreshChannels}
                                    disabled={loading}
                                    startIcon={
                                        loading
                                            ? <CircularProgress size={16} color="inherit" />
                                            : showToolbarButtonIcons
                                              ? <RefreshIcon />
                                              : undefined
                                    }
                                    sx={{
                                        gap: 1.5,
                                        '& .MuiButton-startIcon': { margin: '0 !important' },
                                        flex: {
                                            xs: '1 1 130px',
                                            sm: '1 1 160px',
                                            md: '1 1 0',
                                        },
                                        minWidth: { xs: '130px', sm: '160px', md: '140px' },
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    تحديث القنوات
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={fetchAllChannelsStats}
                                    disabled={loadingStats}
                                    startIcon={
                                        loadingStats
                                            ? <CircularProgress size={16} color="inherit" />
                                            : showToolbarButtonIcons
                                              ? <BarChartIcon />
                                              : undefined
                                    }
                                    sx={{
                                        gap: 1.5,
                                        '& .MuiButton-startIcon': { margin: '0 !important' },
                                        flex: {
                                            xs: '1 1 130px',
                                            sm: '1 1 160px',
                                            md: '1 1 0',
                                        },
                                        minWidth: { xs: '130px', sm: '160px', md: '140px' },
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    تحديث الإحصائيات
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={openBulkQualityDialog}
                                    disabled={loading || channels.length === 0}
                                    startIcon={showToolbarButtonIcons ? <TuneIcon /> : undefined}
                                    sx={{
                                        gap: 1.5,
                                        '& .MuiButton-startIcon': { margin: '0 !important' },
                                        flex: {
                                            xs: '1 1 130px',
                                            sm: '1 1 160px',
                                            md: '1 1 0',
                                        },
                                        minWidth: { xs: '130px', sm: '160px', md: '140px' },
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    الجودة ({videoQualityShortLabel(defaultQuality)})
                                </Button>
                            </Box>
                        </Box>

                        <Divider sx={{ mb: 2 }} />

                        {isActivated && mistServerAvailable ? (
                        loadingChannels ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: '15px', md: 3 } }}>
                                <CircularProgress />
                            </Box>
                        ) : channels.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: { xs: '15px', md: 3 } }}>
                                لا توجد قنوات متاحة حالياً
                            </Typography>
                        ) : (
                            <List>
                                {channels.map((channel, index) => {
                                    const channelName = channel.name || `قناة ${index + 1}`;
                                    // استخدام stream_key للبحث في الإحصائيات (ch11, ch12, etc.)
                                    const streamKey = channel.stream_key || channelName;
                                    const stats = channelStats[streamKey] || { total_viewers: 0, viewers: [], timestamp: 0 };
                                    /* إعادة الاتصال/الجودة تستخدم stream_key؛ الحذف قد يستخدم اسم العرض */
                                    const actionState = channelActions[streamKey] ?? channelActions[channelName];
                                    
                                    return (
                                        <Box key={index}>
                                            <ListItem
                                                sx={{
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    borderRadius: 2,
                                                    mb: 2,
                                                    bgcolor: 'background.paper',
                                                    '&:hover': {
                                                        bgcolor: 'action.hover',
                                                    },
                                                }}
                                            >
                                                <Box sx={{ width: '100%' }}>
                                                    {/* رأس القناة */}
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                                            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                                                {channelName}
                                                            </Typography>
                                                        </Box>
                                                        
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                            <Chip
                                                                icon={<VisibilityIcon />}
                                                                label={`${stats.total_viewers || 0} مشاهد`}
                                                                color={stats.total_viewers > 0 ? 'success' : 'default'}
                                                                variant="outlined"
                                                                size="small"
                                                            />
                                                            <Chip
                                                                label={getChannelStatus(stats)}
                                                                color={getChannelStatusColor(stats)}
                                                                size="small"
                                                            />
                                                        </Box>
                                                    </Box>

                                                    {/* أزرار الإجراءات ثم الجودة بعد «إعدادات متقدمة» */}
                                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="warning"
                                                            onClick={() => reconnectChannel(streamKey)}
                                                            disabled={!!actionState}
                                                            startIcon={
                                                                actionState === 'reconnecting' ?
                                                                <CircularProgress size={16} /> :
                                                                <RestoreIcon />
                                                            }
                                                            sx={{
                                                                gap: 1.5,
                                                                '& .MuiButton-startIcon': { margin: '0 !important' },
                                                                flex: 1,
                                                                minWidth: '130px',
                                                            }}
                                                        >
                                                            إعادة اتصال
                                                        </Button>

                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="info"
                                                            onClick={() => kickAllViewers(streamKey)}
                                                            disabled={!!actionState || !(stats.total_viewers > 0)}
                                                            startIcon={
                                                                actionState === 'kicking' ?
                                                                <CircularProgress size={16} /> :
                                                                <PersonOffIcon />
                                                            }
                                                            sx={{
                                                                gap: 1.5,
                                                                '& .MuiButton-startIcon': { margin: '0 !important' },
                                                                flex: 1,
                                                                minWidth: '130px',
                                                            }}
                                                        >
                                                            طرد الكل ({stats.total_viewers || 0})
                                                        </Button>

                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="error"
                                                            onClick={() => deleteChannel(channelName)}
                                                            disabled={!!actionState}
                                                            startIcon={
                                                                actionState === 'deleting' ?
                                                                <CircularProgress size={16} /> :
                                                                <DeleteIcon />
                                                            }
                                                            sx={{
                                                                gap: 1.5,
                                                                '& .MuiButton-startIcon': { margin: '0 !important' },
                                                                flex: 1,
                                                                minWidth: '130px',
                                                            }}
                                                        >
                                                            حذف القناة
                                                        </Button>

                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                            onClick={() => openAdvancedSettings(channel)}
                                                            disabled={!!actionState}
                                                            startIcon={<SettingsIcon />}
                                                            sx={{
                                                                gap: 1.5,
                                                                '& .MuiButton-startIcon': { margin: '0 !important' },
                                                                flex: 1,
                                                                minWidth: '130px',
                                                            }}
                                                        >
                                                            إعدادات متقدمة
                                                        </Button>

                                                        <FormControl
                                                            size="small"
                                                            variant="outlined"
                                                            sx={(theme) => ({
                                                                flex: '1 1 130px',
                                                                minWidth: '130px',
                                                                m: 0,
                                                                verticalAlign: 'middle',
                                                                '& .MuiOutlinedInput-root': {
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.8125rem',
                                                                    fontWeight: 500,
                                                                    height: 30.75,
                                                                    minHeight: 30.75,
                                                                    boxSizing: 'border-box',
                                                                },
                                                                '& .MuiOutlinedInput-notchedOutline': {
                                                                    borderWidth: 1,
                                                                    borderRadius: '4px',
                                                                },
                                                                /* RTL: النص يبدأ من اليمين؛ المثلث عند طرف السطر (اليسار بصريًا) */
                                                                '& .MuiSelect-select': {
                                                                    py: 0,
                                                                    paddingInlineStart: theme.spacing(1),
                                                                    paddingInlineEnd: theme.spacing(3.5),
                                                                    height: '100%',
                                                                    minHeight: '0 !important',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    lineHeight: 1.43,
                                                                    boxSizing: 'border-box',
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                },
                                                                '& .MuiSelect-icon': {
                                                                    fontSize: '1.125rem',
                                                                    top: '50%',
                                                                    transform: 'translateY(-50%)',
                                                                    ...(theme.direction === 'rtl'
                                                                        ? { left: 6, right: 'auto' }
                                                                        : { right: 6, left: 'auto' }),
                                                                },
                                                            })}
                                                        >
                                                            <Select
                                                                value={pendingQuality[streamKey] ?? normalizeVideoQualityFromApi(channel.video_quality)}
                                                                onChange={(e) => {
                                                                    const q = String(e.target.value);
                                                                    const current = normalizeVideoQualityFromApi(channel.video_quality);
                                                                    setPendingQuality((prev) => {
                                                                        if (q === current) {
                                                                            const next = { ...prev };
                                                                            delete next[streamKey];
                                                                            return next;
                                                                        }
                                                                        return { ...prev, [streamKey]: q };
                                                                    });
                                                                }}
                                                                disabled={actionState === 'settingQuality'}
                                                                size="small"
                                                                displayEmpty
                                                                renderValue={(v) => (
                                                                    <Typography
                                                                        component="span"
                                                                        dir="rtl"
                                                                        sx={{
                                                                            fontSize: '0.8125rem',
                                                                            lineHeight: 1.43,
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap',
                                                                            width: '100%',
                                                                            textAlign: 'right',
                                                                        }}
                                                                    >
                                                                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                                            الجودة
                                                                        </Box>
                                                                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, mx: 0.25 }}>:</Box>
                                                                        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                                            {videoQualityShortLabel(v)}
                                                                        </Box>
                                                                    </Typography>
                                                                )}
                                                                MenuProps={{ PaperProps: { sx: { minWidth: 260 } } }}
                                                            >
                                                                {VIDEO_QUALITY_OPTIONS.map((opt) => (
                                                                    <MenuItem key={opt.value} value={opt.value} dense>
                                                                        <ListItemText
                                                                            primary={opt.shortLabel}
                                                                            secondary={opt.hint}
                                                                            primaryTypographyProps={{ fontWeight: 700, fontSize: '0.875rem' }}
                                                                            secondaryTypographyProps={{ variant: 'caption' }}
                                                                        />
                                                                    </MenuItem>
                                                                ))}
                                                            </Select>
                                                        </FormControl>
                                                        {pendingQuality[streamKey] != null && pendingQuality[streamKey] !== normalizeVideoQualityFromApi(channel.video_quality) && (
                                                            <Button
                                                                size="small"
                                                                variant="contained"
                                                                color="primary"
                                                                onClick={() => setChannelQuality(streamKey, pendingQuality[streamKey])}
                                                                disabled={actionState === 'settingQuality'}
                                                                startIcon={actionState === 'settingQuality' ? <CircularProgress size={16} /> : null}
                                                                sx={{
                                                                    gap: 1.5,
                                                                    '& .MuiButton-startIcon': { margin: '0 !important' },
                                                                    flex: '0 1 auto',
                                                                    minWidth: '130px',
                                                                }}
                                                            >
                                                                {actionState === 'settingQuality' ? 'جاري التطبيق...' : 'تطبيق الجودة'}
                                                            </Button>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </ListItem>
                                        </Box>
                                    );
                                })}
                            </List>
                        )
                        ) : !isActivated ? (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                                فعّل الخدمة من زر «تفعيل الخدمة» أعلاه لعرض القنوات.
                            </Typography>
                        ) : mistServerAvailable === null ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 3 }}>
                                <CircularProgress size={32} />
                                <Typography variant="body2" color="text.secondary">
                                    جاري التحقق من سيرفر المشاهدة…
                                </Typography>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                                سيرفر المشاهدة غير جاهز. استخدم «فحص سيرفر المشاهدة» في الشريط أعلاه.
                            </Typography>
                        )}
                    </CardContent>
                </Card>

            {/* قسم التعليمات */}
            <Card sx={{ mt: 3 }} variant="outlined">
                <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <HelpOutlineIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
                        <Typography variant="h6" color="text.secondary" fontWeight={600}>
                            تعليمات
                        </Typography>
                    </Box>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, pr: 0, listStyle: 'none' }}>
                        <Box component="li" sx={{ mb: 2 }}>
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>تفعيل الخدمة:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">من شريط أدوات «القنوات المتاحة» — يمزامن مع مزود الخدمة ويطلب تفعيل البث. يصبح الزر أخضراً عندما تكون الخدمة مفعّلة.</Typography>
                        </Box>
                        <Box component="li" sx={{ mb: 2 }}>
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>فحص سيرفر المشاهدة:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يتحقق من جاهزية سيرفر الوسائط المحلي وقدرته على استقبال القنوات.</Typography>
                        </Box>
                        <Box component="li" sx={{ mb: 2 }}>
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>ضبط الجودة:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يمكنك اختيار مستوى الجودة المناسب لك وفق إمكانية الانترنت التي لديك لتضمن حصولك على بث ثابت ومستقر وبالجودة الملائمة. يمكنك تغيير الجودة لجميع القنوات أو لقناة واحدة، بعدها قم بالضغط على زر تحديث القنوات.</Typography>
                        </Box>
                        <Box component="li" sx={{ mb: 2 }}>
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>تحديث القنوات:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يقوم بتحديث الروابط السابقة وربطكم بأحدث مسارات القناة.</Typography>
                        </Box>
                        <Box component="li">
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>الإحصائيات:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يقوم بالتحقق من حالة القناة محلياً وعدد المشاهدين.</Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
                    </Box>
                )}

                {activeTabId === 'viewer' && (
                    <Box sx={{ p: { xs: '15px', md: 3 } }}>
                        <ViewerPageManager auth={auth} />
                    </Box>
                )}
                </>); })()}
            </Paper>

            {/* جودة جميع القنوات — اختيار ثم موافق */}
            <Dialog
                open={bulkQualityDialogOpen}
                onClose={() => !loading && setBulkQualityDialogOpen(false)}
                maxWidth="xs"
                fullWidth
                dir="rtl"
            >
                <DialogTitle>جودة البث لجميع القنوات</DialogTitle>
                <DialogContent dividers>
                    <RadioGroup
                        value={bulkQualityDraft}
                        onChange={(e) => setBulkQualityDraft(String(e.target.value))}
                    >
                        {VIDEO_QUALITY_OPTIONS.map((opt) => (
                            <FormControlLabel
                                key={opt.value}
                                value={opt.value}
                                control={<Radio size="small" />}
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Typography component="span" sx={{ fontWeight: 700 }}>{opt.shortLabel}</Typography>
                                        <Typography component="span" variant="body2" color="text.secondary">{opt.hint}</Typography>
                                    </Box>
                                }
                            />
                        ))}
                    </RadioGroup>
                </DialogContent>
                <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
                    <Button variant="outlined" size="small" onClick={() => setBulkQualityDialogOpen(false)} disabled={loading}>
                        إلغاء
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={confirmBulkQuality}
                        disabled={loading || channels.length === 0}
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
                        sx={{
                            gap: 1.5,
                            '& .MuiButton-startIcon': { margin: '0 !important' },
                        }}
                    >
                        موافق
                    </Button>
                </DialogActions>
            </Dialog>

            {/* موديال الإعدادات المتقدمة */}
            <Dialog
                open={advancedOpen}
                onClose={() => !advancedSaving && setAdvancedOpen(false)}
                maxWidth="sm"
                fullWidth
                dir="rtl"
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon color="primary" />
                        <Typography variant="h6">إعدادات متقدمة — {advancedChannel?.name}</Typography>
                    </Box>
                    <IconButton onClick={() => !advancedSaving && setAdvancedOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ py: 1.5 }}>
                    {advancedLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: '15px', md: 3 } }}><CircularProgress /></Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch checked={advancedSettings.always_on} onChange={e => setAdvancedSettings(s => ({ ...s, always_on: e.target.checked }))} color="primary" size="small" />}
                                    label="تشغيل دائم"
                                    sx={{ flex: 1 }}
                                />
                                <FormControlLabel
                                    control={<Switch checked={advancedSettings.raw} onChange={e => setAdvancedSettings(s => ({ ...s, raw: e.target.checked }))} color="primary" size="small" />}
                                    label="تمرير مباشر"
                                    sx={{ flex: 1 }}
                                />
                            </Box>
                            <Divider />
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                <TextField label="مدة التأخير" type="number" value={advancedSettings.dvr} onChange={e => setAdvancedSettings(s => ({ ...s, dvr: Number(e.target.value) }))} size="small" />
                                <TextField label="مؤقت الانتظار" type="number" value={advancedSettings.pagetimeout} onChange={e => setAdvancedSettings(s => ({ ...s, pagetimeout: Number(e.target.value) }))} size="small" />
                                <TextField label="المدة القصوى للتأخير" type="number" value={advancedSettings.maxkeepaway} onChange={e => setAdvancedSettings(s => ({ ...s, maxkeepaway: Number(e.target.value) }))} size="small" />
                                <TextField label="مدة انتظار البيانات" type="number" value={advancedSettings.inputtimeout} onChange={e => setAdvancedSettings(s => ({ ...s, inputtimeout: Number(e.target.value) }))} size="small" />
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setAdvancedOpen(false)} disabled={advancedSaving}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={saveAdvancedSettings}
                        disabled={advancedSaving || advancedLoading}
                        startIcon={advancedSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                        sx={{
                            gap: 1.5,
                            '& .MuiButton-startIcon': { margin: '0 !important' },
                        }}
                    >
                        {advancedSaving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default StreamingManager;