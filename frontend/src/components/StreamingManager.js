import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert, 
    Card, CardContent, Divider, Chip, List, ListItem,
    Paper, Tabs, Tab, FormControl, Select, MenuItem
} from '@mui/material';
import { 
    Save as SaveIcon, 
    LiveTv as LiveTvIcon, 
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Refresh as RefreshIcon,
    Delete as DeleteIcon,
    Restore as RestoreIcon,
    PersonOff as PersonOffIcon,
    Visibility as VisibilityIcon,
    BarChart as BarChartIcon,
    HelpOutline as HelpOutlineIcon
} from '@mui/icons-material';
import ViewerPageManager from './ViewerPageManager';

function _getPerms(userInfo) {
    if (!userInfo || userInfo.role === 'owner') return null;
    try { return typeof userInfo.permissions === 'string' ? JSON.parse(userInfo.permissions) : userInfo.permissions || {}; }
    catch { return {}; }
}
function _subVisible(perms, key) { if (!perms) return true; const p = perms[key]; return !p || p.visible !== false; }

const StreamingManager = ({ auth, userInfo }) => {
    const [streamingTab, setStreamingTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
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
    const [defaultQuality, setDefaultQuality] = useState(2); // 1=اعلى، 2=متوسطة، 3=منخفضة
    const [pendingQuality, setPendingQuality] = useState({}); // streamKey -> quality (عند اختيار جودة مختلفة تظهر زر التطبيق)

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
                const data = await response.json();
                setChannels(data);
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
        setSuccess(false);

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
            setSuccess(true);
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
        setSuccess(false);
        
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
                setSuccess(data.message);
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
                setSuccess(data.message);
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
                setSuccess(data.message);
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
                setSuccess(data.message);
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
                body: JSON.stringify({ quality: Number(quality) })
            });
            const data = await response.json();
            if (data.status === 'success') {
                setSuccess(data.message);
                setPendingQuality(prev => { const next = { ...prev }; delete next[key]; return next; });
                setChannels(prev => prev.map(ch => {
                    const name = ch.name || ch.stream_key;
                    if (name === channelName || ch.stream_key === channelName) {
                        return { ...ch, video_quality: Number(quality) };
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

    const setAllChannelsQuality = async () => {
        setLoading(true);
        setError(null);
        setSuccess(false);
        try {
            const response = await fetch('/api/streaming/channels/set-all-quality', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ quality: defaultQuality })
            });
            const data = await response.json();
            if (data.status === 'success') {
                setSuccess(data.message);
                setChannels(prev => prev.map(ch => ({ ...ch, video_quality: defaultQuality })));
            } else {
                setError(data.message || 'فشل في ضبط الجودة');
            }
        } catch (err) {
            setError(`فشل في ضبط جودة القنوات: ${err.message}`);
        } finally {
            setLoading(false);
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
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <LiveTvIcon sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
                <Typography variant="h4" component="h2">
                    إدارة البث المباشر
                </Typography>
            </Box>

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
                    <Box sx={{ p: 3 }}>
            {/* بطاقة التفعيل المبسطة */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">تفعيل خدمة البث المباشر</Typography>
                        <Chip 
                            icon={isActivated ? <CheckCircleIcon /> : <ErrorIcon />}
                            label={isActivated ? 'مفعل' : 'غير مفعل'}
                            color={isActivated ? 'success' : 'default'}
                            size="small"
                        />
                    </Box>

                    {/* حالة سيرفر المشاهدة */}
                    {mistServerAvailable === false && mistServerMessage && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {mistServerMessage}
                        </Alert>
                    )}

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2 }}>تم تفعيل الخدمة بنجاح!</Alert>}
                    
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button
                            variant="contained"
                            onClick={handleSubscriptionSubmit}
                            disabled={loading}
                            startIcon={loading ? <CircularProgress size={16} /> : <SaveIcon />}
                        >
                            {loading ? 'جاري التفعيل...' : 'تفعيل الخدمة'}
                        </Button>

                        <Button
                            variant="outlined"
                            onClick={testMistServerConnection}
                            disabled={testingConnection}
                            startIcon={testingConnection ? <CircularProgress size={16} /> : <RefreshIcon />}
                        >
                            اختبار الاتصال
                        </Button>
                        
                        {mistServerStatus && (
                            <Alert 
                                severity={mistServerStatus.status === 'success' ? 'success' : 'error'}
                                size="small"
                                sx={{ flex: 1 }}
                            >
                                {mistServerStatus.message}
                            </Alert>
                        )}
                    </Box>
                </CardContent>
            </Card>

            {/* القنوات (تظهر بعد التفعيل وعند توفر سيرفر المشاهدة) */}
            {isActivated && mistServerAvailable && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">
                                القنوات المتاحة ({channels.length})
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                                    خيارات الجودة
                                </Typography>
                                <FormControl size="small" sx={{ minWidth: 140 }} variant="outlined">
                                    <Select
                                        value={defaultQuality}
                                        onChange={(e) => setDefaultQuality(Number(e.target.value))}
                                        displayEmpty
                                        size="small"
                                    >
                                        <MenuItem value={1}>اعلى جودة</MenuItem>
                                        <MenuItem value={2}>متوسطة</MenuItem>
                                        <MenuItem value={3}>منخفضة</MenuItem>
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={setAllChannelsQuality}
                                    disabled={loading || channels.length === 0}
                                >
                                    ضبط الكل بهذه الجودة
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={refreshChannels}
                                    disabled={loading}
                                    startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                                >
                                    تحديث القنوات
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={fetchAllChannelsStats}
                                    disabled={loadingStats}
                                    startIcon={loadingStats ? <CircularProgress size={20} /> : <BarChartIcon />}
                                >
                                    تحديث الإحصائيات
                                </Button>
                            </Box>
                        </Box>

                        <Divider sx={{ mb: 2 }} />

                        {loadingChannels ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                <CircularProgress />
                            </Box>
                        ) : channels.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 3 }}>
                                لا توجد قنوات متاحة حالياً
                            </Typography>
                        ) : (
                            <List>
                                {channels.map((channel, index) => {
                                    const channelName = channel.name || `قناة ${index + 1}`;
                                    // استخدام stream_key للبحث في الإحصائيات (ch11, ch12, etc.)
                                    const streamKey = channel.stream_key || channelName;
                                    const stats = channelStats[streamKey] || { total_viewers: 0, viewers: [], timestamp: 0 };
                                    const actionState = channelActions[channelName];
                                    
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
                                                        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                            <LiveTvIcon sx={{ mr: 2, color: 'primary.main', fontSize: 28 }} />
                                                            <Box>
                                                                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                                                    {channelName}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                        
                                                        {/* إحصائيات سريعة + اختيار الجودة */}
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                                                الجودة
                                                            </Typography>
                                                            <FormControl size="small" sx={{ minWidth: 120 }} variant="outlined">
                                                                <Select
                                                                    value={pendingQuality[streamKey] ?? channel.video_quality ?? 2}
                                                                    onChange={(e) => {
                                                                        const q = Number(e.target.value);
                                                                        const current = channel.video_quality ?? 2;
                                                                        if (q === current) {
                                                                            setPendingQuality(prev => { const next = { ...prev }; delete next[streamKey]; return next; });
                                                                        } else {
                                                                            setPendingQuality(prev => ({ ...prev, [streamKey]: q }));
                                                                        }
                                                                    }}
                                                                    disabled={channelActions[channelName] === 'settingQuality'}
                                                                    size="small"
                                                                >
                                                                    <MenuItem value={1}>اعلى</MenuItem>
                                                                    <MenuItem value={2}>متوسطة</MenuItem>
                                                                    <MenuItem value={3}>منخفضة</MenuItem>
                                                                </Select>
                                                            </FormControl>
                                                            {pendingQuality[streamKey] != null && pendingQuality[streamKey] !== (channel.video_quality ?? 2) && (
                                                                <Button
                                                                    size="small"
                                                                    variant="contained"
                                                                    color="primary"
                                                                    onClick={() => setChannelQuality(streamKey, pendingQuality[streamKey])}
                                                                    disabled={channelActions[channelName] === 'settingQuality'}
                                                                    startIcon={channelActions[channelName] === 'settingQuality' ? <CircularProgress size={14} /> : null}
                                                                >
                                                                    {channelActions[channelName] === 'settingQuality' ? 'جاري التطبيق...' : 'تطبيق الجودة'}
                                                                </Button>
                                                            )}
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

                                                    {/* أزرار الإجراءات */}
                                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
                                                            sx={{ flex: 1, minWidth: '130px' }}
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
                                                            sx={{ flex: 1, minWidth: '130px' }}
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
                                                            sx={{ flex: 1, minWidth: '130px' }}
                                                        >
                                                            حذف القناة
                                                        </Button>
                                                    </Box>
                                                </Box>
                                            </ListItem>
                                        </Box>
                                    );
                                })}
                            </List>
                        )}
                    </CardContent>
                </Card>
            )}

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
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>تفعيل الاشتراك:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يقوم بمزامنة وطلب تفعيل البث المباشر من مزود الخدمة لدينا.</Typography>
                        </Box>
                        <Box component="li" sx={{ mb: 2 }}>
                            <Typography component="span" fontWeight={700} color="primary.main" sx={{ display: 'inline-block', minWidth: { xs: '100%', sm: 140 }, mb: { xs: 0.25, sm: 0 } }}>اختبار الاتصال:</Typography>
                            <Typography component="span" variant="body2" color="text.secondary">يقوم بفحص عمل سيرفر الوسائط المحلي وقدرته على استقبال القنوات.</Typography>
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
                    <Box sx={{ p: 3 }}>
                        <ViewerPageManager auth={auth} />
                    </Box>
                )}
                </>); })()}
            </Paper>
        </Box>
    );
};

export default StreamingManager; 