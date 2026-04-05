import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Grid, Card, CardContent,
    CircularProgress, Alert, ToggleButtonGroup, ToggleButton,
    Chip, Divider, IconButton, Tooltip
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    Visibility as VisibilityIcon,
    CalendarMonth as CalendarIcon,
    EmojiEvents as TrophyIcon,
    Refresh as RefreshIcon,
    BarChart as BarChartIcon,
    Timeline as TimelineIcon,
    PieChart as PieChartIcon,
    DeleteSweep as ClearIcon
} from '@mui/icons-material';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend,
    AreaChart, Area
} from 'recharts';

// ألوان متناسقة مع هوية المشروع
const COLORS = [
    '#1976d2', '#42a5f5', '#7e57c2', '#26a69a', '#ef5350',
    '#ff7043', '#66bb6a', '#ffa726', '#8d6e63', '#78909c',
    '#5c6bc0', '#29b6f6', '#ec407a', '#ab47bc', '#26c6da'
];

const ServiceStatsManager = ({ auth }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('month');
    const [chartType, setChartType] = useState('area');
    const [statsData, setStatsData] = useState(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/service-stats/summary?period=${period}`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (!response.ok) throw new Error('فشل في جلب الإحصائيات');
            const data = await response.json();
            setStatsData(data);
        } catch (err) {
            setError(err.message);
            console.error('خطأ في جلب الإحصائيات:', err);
        } finally {
            setLoading(false);
        }
    }, [auth, period]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleClearStats = async () => {
        if (!window.confirm('هل أنت متأكد من مسح جميع الإحصائيات؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
        try {
            const response = await fetch('/api/service-stats/clear', {
                method: 'DELETE',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                fetchStats();
            }
        } catch (err) {
            console.error('خطأ في مسح الإحصائيات:', err);
        }
    };

    const periodLabels = { week: 'أسبوع', month: 'شهر', year: 'سنة' };

    // Pie chart data
    const pieData = statsData?.services?.map((s, i) => ({
        name: s.service_name,
        value: s.total_visits,
        color: COLORS[i % COLORS.length]
    })) || [];

    // أفضل 3 خدمات
    const topServices = statsData?.services?.slice(0, 3) || [];

    // تنسيق التاريخ للرسم البياني
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
        return dateStr;
    };

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <Paper sx={{
                p: 2, bgcolor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(66,165,245,0.3)',
                borderRadius: 2, direction: 'rtl', backdropFilter: 'blur(8px)'
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1, display: 'block' }}>
                    {label}
                </Typography>
                {payload.map((entry, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color }} />
                        <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                            {entry.name}: <strong>{entry.value}</strong>
                        </Typography>
                    </Box>
                ))}
            </Paper>
        );
    };

    // Custom legend
    const CustomLegend = ({ payload }) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, mt: 1, direction: 'rtl' }}>
            {payload?.map((entry, index) => (
                <Chip key={index} size="small"
                    icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.color, ml: 0.5 }} />}
                    label={entry.value}
                    sx={{ fontSize: '0.7rem', height: 24, bgcolor: 'rgba(0,0,0,0.04)' }}
                />
            ))}
        </Box>
    );

    if (loading && !statsData) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ direction: 'rtl' }}>
            {/* Header */}
            <Paper sx={{ p: { xs: '15px', md: 3 }, mb: 3, bgcolor: 'primary.main', color: 'white', borderRadius: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <BarChartIcon sx={{ fontSize: 36 }} />
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                                إحصائيات الخدمات
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.85 }}>
                                تتبع زيارات واستخدام الخدمات
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="تحديث">
                            <IconButton onClick={fetchStats} sx={{ color: 'white' }}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="مسح الإحصائيات">
                            <IconButton onClick={handleClearStats} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#ef5350' } }}>
                                <ClearIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

            {/* Controls */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3, alignItems: 'center', justifyContent: 'space-between' }}>
                <ToggleButtonGroup value={period} exclusive onChange={(e, v) => v && setPeriod(v)} size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2, '& .MuiToggleButton-root': { px: 2.5, fontWeight: 'bold' } }}>
                    <ToggleButton value="week">أسبوع</ToggleButton>
                    <ToggleButton value="month">شهر</ToggleButton>
                    <ToggleButton value="year">سنة</ToggleButton>
                </ToggleButtonGroup>

                <ToggleButtonGroup value={chartType} exclusive onChange={(e, v) => v && setChartType(v)} size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}>
                    <ToggleButton value="area"><Tooltip title="مخطط مساحي"><TimelineIcon fontSize="small" /></Tooltip></ToggleButton>
                    <ToggleButton value="bar"><Tooltip title="مخطط أعمدة"><BarChartIcon fontSize="small" /></Tooltip></ToggleButton>
                    <ToggleButton value="pie"><Tooltip title="مخطط دائري"><PieChartIcon fontSize="small" /></Tooltip></ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {/* إجمالي الزيارات */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: -15, left: -15, width: 70, height: 70, borderRadius: '50%', bgcolor: 'rgba(25,118,210,0.08)' }} />
                        <CardContent sx={{ position: 'relative' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <VisibilityIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                                <Typography variant="body2" color="text.secondary">إجمالي الزيارات</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                {statsData?.total_visits?.toLocaleString() || 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                آخر {periodLabels[period]}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* عدد الخدمات */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: -15, left: -15, width: 70, height: 70, borderRadius: '50%', bgcolor: 'rgba(126,87,194,0.08)' }} />
                        <CardContent sx={{ position: 'relative' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <CalendarIcon sx={{ color: '#7e57c2', fontSize: 22 }} />
                                <Typography variant="body2" color="text.secondary">خدمات نشطة</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#7e57c2' }}>
                                {statsData?.services?.length || 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                لها زيارات في هذه الفترة
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* الأكثر استخداماً */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: -15, left: -15, width: 70, height: 70, borderRadius: '50%', bgcolor: 'rgba(239,83,80,0.08)' }} />
                        <CardContent sx={{ position: 'relative' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <TrophyIcon sx={{ color: '#ef5350', fontSize: 22 }} />
                                <Typography variant="body2" color="text.secondary">الأكثر استخداماً</Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#ef5350' }} noWrap>
                                {topServices[0]?.service_name || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {topServices[0] ? `${topServices[0].total_visits} زيارة` : 'لا توجد بيانات'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* معدل يومي */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: -15, left: -15, width: 70, height: 70, borderRadius: '50%', bgcolor: 'rgba(38,166,154,0.08)' }} />
                        <CardContent sx={{ position: 'relative' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <TrendingUpIcon sx={{ color: '#26a69a', fontSize: 22 }} />
                                <Typography variant="body2" color="text.secondary">المعدل اليومي</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#26a69a' }}>
                                {statsData?.chart_data?.length > 0
                                    ? Math.round(statsData.total_visits / statsData.chart_data.length)
                                    : 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                زيارة / يوم
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Main Chart */}
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TimelineIcon color="primary" />
                    {chartType === 'pie' ? 'توزيع الزيارات حسب الخدمة' : 'الزيارات اليومية'}
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {(!statsData?.chart_data?.length && chartType !== 'pie') || (!pieData?.length && chartType === 'pie') ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <BarChartIcon sx={{ fontSize: 64, color: 'rgba(0,0,0,0.1)', mb: 2 }} />
                        <Typography color="text.secondary">لا توجد بيانات كافية لعرض الرسم البياني</Typography>
                        <Typography variant="caption" color="text.secondary">
                            سيتم تجميع البيانات تلقائياً عند استخدام الخدمات
                        </Typography>
                    </Box>
                ) : chartType === 'pie' ? (
                    <ResponsiveContainer width="100%" height={380}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={130}
                                paddingAngle={3}
                                dataKey="value"
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={index} fill={entry.color} stroke="white" strokeWidth={2} />
                                ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend content={<CustomLegend />} />
                        </PieChart>
                    </ResponsiveContainer>
                ) : chartType === 'bar' ? (
                    <ResponsiveContainer width="100%" height={380}>
                        <BarChart data={statsData.chart_data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend content={<CustomLegend />} />
                            {statsData.service_names?.map((name, i) => (
                                <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]}
                                    radius={[4, 4, 0, 0]} maxBarSize={40} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <ResponsiveContainer width="100%" height={380}>
                        <AreaChart data={statsData.chart_data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <defs>
                                {statsData.service_names?.map((name, i) => (
                                    <linearGradient key={name} id={`gradient_${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.02} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend content={<CustomLegend />} />
                            {statsData.service_names?.map((name, i) => (
                                <Area key={name} type="monotone" dataKey={name}
                                    stroke={COLORS[i % COLORS.length]} strokeWidth={2.5}
                                    fill={`url(#gradient_${i})`} />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </Paper>

            {/* Top Services Ranking */}
            <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrophyIcon color="primary" />
                    ترتيب الخدمات
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {!statsData?.services?.length ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <TrophyIcon sx={{ fontSize: 48, color: 'rgba(0,0,0,0.1)', mb: 1 }} />
                        <Typography color="text.secondary">لا توجد بيانات بعد</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2}>
                        {statsData.services.map((service, index) => {
                            const maxVisits = statsData.services[0]?.total_visits || 1;
                            const percentage = Math.round((service.total_visits / maxVisits) * 100);
                            const medals = ['🥇', '🥈', '🥉'];
                            const medal = index < 3 ? medals[index] : null;

                            return (
                                <Grid item xs={12} key={`${service.service_type}_${service.service_id}`}>
                                    <Box sx={{
                                        display: 'flex', alignItems: 'center', gap: 2,
                                        p: 2, borderRadius: 2,
                                        bgcolor: index === 0 ? 'rgba(25,118,210,0.04)' : 'transparent',
                                        border: index === 0 ? '1px solid rgba(25,118,210,0.15)' : '1px solid rgba(0,0,0,0.04)',
                                        transition: 'all 0.2s',
                                        '&:hover': { bgcolor: 'rgba(25,118,210,0.04)' }
                                    }}>
                                        {/* الترتيب */}
                                        <Box sx={{
                                            width: 40, height: 40, borderRadius: 2,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            bgcolor: medal ? 'rgba(25,118,210,0.08)' : 'rgba(0,0,0,0.04)',
                                            fontWeight: 'bold', fontSize: medal ? '1.3rem' : '0.9rem',
                                            color: 'text.secondary', flexShrink: 0
                                        }}>
                                            {medal || (index + 1)}
                                        </Box>

                                        {/* المعلومات */}
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="body1" sx={{ fontWeight: 'bold' }} noWrap>
                                                    {service.service_name}
                                                </Typography>
                                                <Chip
                                                    label={`${service.total_visits.toLocaleString()} زيارة`}
                                                    size="small"
                                                    sx={{
                                                        fontWeight: 'bold', fontSize: '0.75rem',
                                                        bgcolor: COLORS[index % COLORS.length] + '18',
                                                        color: COLORS[index % COLORS.length],
                                                        border: `1px solid ${COLORS[index % COLORS.length]}30`
                                                    }}
                                                />
                                            </Box>
                                            {/* Progress bar */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{
                                                    flex: 1, height: 8, borderRadius: 4,
                                                    bgcolor: 'rgba(0,0,0,0.04)', overflow: 'hidden'
                                                }}>
                                                    <Box sx={{
                                                        width: `${percentage}%`, height: '100%',
                                                        borderRadius: 4,
                                                        background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, ${COLORS[index % COLORS.length]}aa)`,
                                                        transition: 'width 0.8s ease'
                                                    }} />
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35, textAlign: 'left' }}>
                                                    {percentage}%
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Paper>
        </Box>
    );
};

export default ServiceStatsManager;
