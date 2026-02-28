import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, Avatar, Chip, Divider,
    IconButton, Fade, Stack
} from '@mui/material';
import {
    SportsSoccer as SportsSoccerIcon,
    Close as CloseIcon,
    Refresh as RefreshIcon,
    AccessTime as TimeIcon,
    EmojiEvents as TrophyIcon,
    Tv as TvIcon,
    PlayArrow as PlayIcon,
    HowToVote as VoteIcon
} from '@mui/icons-material';

// تحويل وقت 12 ساعة إلى دقائق من بداية اليوم
const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return -1;
    try {
        const cleaned = timeStr.trim().toUpperCase();
        const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        if (!match) return -1;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3];
        if (period === 'AM' && hours === 12) hours = 0;
        if (period === 'PM' && hours !== 12) hours += 12;
        return hours * 60 + minutes;
    } catch {
        return -1;
    }
};

// تحويل وقت 24 ساعة "HH:MM" إلى دقائق
const parse24ToMinutes = (timeStr) => {
    if (!timeStr) return -1;
    try {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    } catch {
        return -1;
    }
};

// الحصول على التصويتات من localStorage
const getVotes = () => {
    try {
        const stored = localStorage.getItem('matchVotes');
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
};

// حفظ التصويتات في localStorage
const saveVotes = (votes) => {
    try {
        localStorage.setItem('matchVotes', JSON.stringify(votes));
    } catch { /* ignore */ }
};

const MatchesTable = ({ open, onClose, channels = [], onChannelSelect }) => {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [serverTime24, setServerTime24] = useState('');
    const [votes, setVotes] = useState(getVotes());
    const [animatingVote, setAnimatingVote] = useState(null); // track which team avatar is animating
    const scrollContainerRef = useRef(null);
    const currentMatchRef = useRef(null);

    const fetchMatches = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/matches/today');
            if (!response.ok) throw new Error('فشل في جلب المباريات');
            const data = await response.json();

            if (data.server_time_24) {
                setServerTime24(data.server_time_24);
            }

            if (data.status === 'success' || data.matches) {
                setMatches(data.matches || []);
            } else if (data.status === 'disabled') {
                setMatches([]);
                setError('جدول المباريات غير مفعل');
            } else {
                setError(data.message || 'فشل في جلب المباريات');
            }
        } catch (err) {
            setError('فشل في الاتصال بخادم المباريات');
            console.error('خطأ في جلب المباريات:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchMatches();
            const interval = setInterval(fetchMatches, 3600000);
            return () => clearInterval(interval);
        }
    }, [open, fetchMatches]);

    // التمرير التلقائي إلى المباراة الحالية/القادمة بعد تحميل البيانات
    useEffect(() => {
        if (!loading && matches.length > 0 && serverTime24 && currentMatchRef.current) {
            // تأخير بسيط للسماح للـ DOM بالتحديث
            const timer = setTimeout(() => {
                currentMatchRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [loading, matches, serverTime24]);

    // تحديد حالة المباراة بالنسبة للوقت الحالي
    const getMatchStatus = useCallback((matchTime) => {
        if (!serverTime24 || !matchTime) return 'unknown';
        const nowMins = parse24ToMinutes(serverTime24);
        const matchMins = parseTimeToMinutes(matchTime);
        if (nowMins < 0 || matchMins < 0) return 'unknown';

        const diff = matchMins - nowMins;
        // المباراة تدوم ~105 دقيقة (شوطين + استراحة)
        if (diff > 60) return 'upcoming';      // لم تبدأ بعد
        if (diff > 0) return 'starting_soon';   // ستبدأ خلال ساعة
        if (diff > -105) return 'live';          // جارية الآن
        return 'finished';                       // انتهت
    }, [serverTime24]);

    // إيجاد أقرب مباراة حالية أو قادمة
    const findCurrentMatchIndex = useCallback(() => {
        if (!serverTime24 || matches.length === 0) return -1;
        const nowMins = parse24ToMinutes(serverTime24);
        if (nowMins < 0) return 0;

        let bestIdx = -1;
        let bestDiff = Infinity;

        for (let i = 0; i < matches.length; i++) {
            const mMins = parseTimeToMinutes(matches[i].time);
            if (mMins < 0) continue;
            const diff = mMins - nowMins;
            // نفضل المباريات الجارية ثم القادمة
            if (diff > -105) {
                const absDiff = Math.abs(diff);
                if (absDiff < bestDiff) {
                    bestDiff = absDiff;
                    bestIdx = i;
                }
            }
        }
        // إذا كل المباريات انتهت، أرجع الأخيرة
        return bestIdx >= 0 ? bestIdx : matches.length - 1;
    }, [serverTime24, matches]);

    const currentMatchIndex = findCurrentMatchIndex();

    // مطابقة قناة المباراة مع قنوات البث
    const findMatchingChannel = useCallback((matchChannel) => {
        if (!matchChannel || channels.length === 0) return null;
        const mc = matchChannel.trim();

        // مطابقة مباشرة بالاسم
        let found = channels.find(ch => ch.name === mc);
        if (found) return found;

        // استخراج الرقم من اسم القناة
        const numMatch = mc.match(/(\d+)/);
        if (numMatch) {
            const num = numMatch[1];
            // البحث عن قناة تحتوي على نفس الرقم
            found = channels.find(ch =>
                ch.name?.includes(num) ||
                ch.stream_key?.includes(num) ||
                ch.name?.includes(`قناة ${num}`) ||
                ch.name?.includes(`القناة ${num}`)
            );
            if (found) return found;
            // البحث بناء على ترتيب القنوات
            const idx = parseInt(num, 10) - 1;
            if (idx >= 0 && idx < channels.length) return channels[idx];
        }

        // بحث جزئي
        found = channels.find(ch =>
            ch.name?.includes(mc) || mc.includes(ch.name)
        );
        return found || null;
    }, [channels]);

    // التصويت لفريق
    const handleVote = (matchId, team) => {
        // team: 'home' or 'away'
        const key = `${matchId}_${team}`;
        setAnimatingVote(key);
        setTimeout(() => setAnimatingVote(null), 400);

        setVotes(prev => {
            const updated = { ...prev };
            if (!updated[matchId]) updated[matchId] = { home: 0, away: 0 };
            updated[matchId][team] += 1;
            saveVotes(updated);
            return updated;
        });
    };

    if (!open) return null;

    return (
        <Fade in={open}>
            <Box
                sx={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 1300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    direction: 'rtl',
                    p: { xs: 1, sm: 2 }
                }}
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <Box sx={{
                    width: '100%',
                    maxWidth: { xs: '100%', sm: '600px', md: '700px' },
                    minHeight: { xs: '70vh', sm: '65vh' },
                    maxHeight: { xs: '92vh', sm: '88vh' },
                    bgcolor: '#0a1628',
                    borderRadius: { xs: 3, sm: 4 },
                    overflow: 'hidden',
                    boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header */}
                    <Box sx={{
                        background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #01579b 100%)',
                        p: { xs: 2, sm: 2.5 },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <SportsSoccerIcon sx={{
                                fontSize: { xs: 28, sm: 32 },
                                color: '#4fc3f7',
                                filter: 'drop-shadow(0 0 8px rgba(79,195,247,0.4))'
                            }} />
                            <Box>
                                <Typography variant="h6" sx={{
                                    fontWeight: 'bold', color: 'white',
                                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                                }}>
                                    مباريات اليوم
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                    {matches.length > 0 ? `${matches.length} مباراة` : ''}
                                    {serverTime24 ? ` • ${serverTime24}` : ''}
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton onClick={fetchMatches} disabled={loading}
                                sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                                size="small">
                                <RefreshIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                            <IconButton onClick={onClose}
                                sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                                size="small">
                                <CloseIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* Content */}
                    <Box ref={scrollContainerRef} sx={{
                        flex: 1, overflowY: 'auto',
                        p: { xs: 1.5, sm: 2 },
                        '&::-webkit-scrollbar': { width: '6px' },
                        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '3px' },
                        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }
                    }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                                <CircularProgress sx={{ color: '#4fc3f7' }} />
                            </Box>
                        ) : error ? (
                            <Box sx={{ textAlign: 'center', py: 6 }}>
                                <SportsSoccerIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.2)', mb: 2 }} />
                                <Typography color="rgba(255,255,255,0.5)">{error}</Typography>
                            </Box>
                        ) : matches.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 6 }}>
                                <SportsSoccerIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.2)', mb: 2 }} />
                                <Typography color="rgba(255,255,255,0.5)">لا توجد مباريات اليوم</Typography>
                            </Box>
                        ) : (
                            <Stack spacing={1.5}>
                                {matches.map((match, index) => {
                                    const status = getMatchStatus(match.time);
                                    const isCurrentTarget = index === currentMatchIndex;
                                    const matchingChannel = findMatchingChannel(match.channel);
                                    const matchVotes = votes[match.id] || { home: 0, away: 0 };
                                    const totalVotes = matchVotes.home + matchVotes.away;
                                    const homePercent = totalVotes > 0 ? Math.round((matchVotes.home / totalVotes) * 100) : 50;
                                    const awayPercent = totalVotes > 0 ? 100 - homePercent : 50;

                                    // ألوان الحالة
                                    const statusColors = {
                                        live: { border: 'rgba(244,67,54,0.5)', bg: 'rgba(244,67,54,0.08)', label: 'مباشر', color: '#f44336' },
                                        starting_soon: { border: 'rgba(255,183,77,0.5)', bg: 'rgba(255,183,77,0.08)', label: 'قريباً', color: '#ffb74d' },
                                        upcoming: { border: 'rgba(255,255,255,0.06)', bg: 'rgba(255,255,255,0.04)', label: 'لم تبدأ', color: 'rgba(255,255,255,0.5)' },
                                        finished: { border: 'rgba(255,255,255,0.04)', bg: 'rgba(255,255,255,0.02)', label: 'انتهت', color: 'rgba(255,255,255,0.3)' },
                                        unknown: { border: 'rgba(255,255,255,0.06)', bg: 'rgba(255,255,255,0.04)', label: '', color: 'rgba(255,255,255,0.5)' }
                                    };
                                    const sc = statusColors[status] || statusColors.unknown;

                                    return (
                                        <Box key={match.id || index}
                                            ref={isCurrentTarget ? currentMatchRef : null}
                                        >
                                            <Box
                                                sx={{
                                                    bgcolor: sc.bg,
                                                    borderRadius: 3,
                                                    p: { xs: 1.5, sm: 2 },
                                                    border: `1px solid ${sc.border}`,
                                                    transition: 'all 0.2s ease',
                                                    cursor: matchingChannel ? 'pointer' : 'default',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    '&:hover': {
                                                        bgcolor: matchingChannel ? 'rgba(255,255,255,0.07)' : sc.bg,
                                                        border: `1px solid ${matchingChannel ? 'rgba(79,195,247,0.4)' : sc.border}`,
                                                        transform: matchingChannel ? 'translateY(-1px)' : 'none',
                                                        boxShadow: matchingChannel ? '0 4px 20px rgba(0,0,0,0.3)' : 'none'
                                                    }
                                                }}
                                            >
                                                {/* شريط المباراة المباشرة */}
                                                {status === 'live' && (
                                                    <Box sx={{
                                                        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                                                        background: 'linear-gradient(90deg, #f44336, #ff9800, #f44336)',
                                                        animation: 'liveBar 2s ease-in-out infinite',
                                                        '@keyframes liveBar': {
                                                            '0%, 100%': { opacity: 1 },
                                                            '50%': { opacity: 0.4 }
                                                        }
                                                    }} />
                                                )}

                                                {/* البطولة والوقت والحالة */}
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                                    <Chip icon={<TrophyIcon sx={{ fontSize: '14px !important' }} />}
                                                        label={match.tournament} size="small"
                                                        sx={{ bgcolor: 'rgba(79,195,247,0.12)', color: '#4fc3f7', fontWeight: 'bold',
                                                            fontSize: { xs: '0.7rem', sm: '0.75rem' }, height: { xs: 24, sm: 26 },
                                                            border: '1px solid rgba(79,195,247,0.2)', '& .MuiChip-icon': { color: '#4fc3f7' } }} />
                                                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                        {sc.label && (
                                                            <Chip label={sc.label} size="small"
                                                                sx={{ bgcolor: `${sc.color}20`, color: sc.color, fontWeight: 'bold',
                                                                    fontSize: '0.65rem', height: 22, border: `1px solid ${sc.color}40`,
                                                                    animation: status === 'live' ? 'pulse 1.5s infinite' : 'none',
                                                                    '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } } }} />
                                                        )}
                                                        <Chip icon={<TimeIcon sx={{ fontSize: '14px !important' }} />}
                                                            label={match.time} size="small"
                                                            sx={{ bgcolor: 'rgba(255,183,77,0.12)', color: '#ffb74d', fontWeight: 'bold',
                                                                fontSize: { xs: '0.7rem', sm: '0.75rem' }, height: { xs: 24, sm: 26 },
                                                                border: '1px solid rgba(255,183,77,0.2)', '& .MuiChip-icon': { color: '#ffb74d' } }} />
                                                    </Box>
                                                </Box>

                                                {/* الفرق */}
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: 0.5, sm: 1.5 } }}>
                                                    {/* الفريق المضيف */}
                                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                                        <Box
                                                            onClick={(e) => { e.stopPropagation(); handleVote(match.id, 'home'); }}
                                                            sx={{
                                                                cursor: 'pointer',
                                                                transition: 'transform 0.15s ease',
                                                                transform: animatingVote === `${match.id}_home` ? 'scale(1.25)' : 'scale(1)',
                                                                '&:hover': { transform: 'scale(1.12)' }
                                                            }}
                                                        >
                                                            <Avatar src={match.home_team?.logo_url} alt={match.home_team?.name}
                                                                sx={{
                                                                    width: { xs: 48, sm: 56 }, height: { xs: 48, sm: 56 },
                                                                    bgcolor: 'rgba(255,255,255,0.08)',
                                                                    border: matchVotes.home >= matchVotes.away && totalVotes > 0 ? '2px solid #4fc3f7' : '2px solid rgba(255,255,255,0.1)',
                                                                    boxShadow: animatingVote === `${match.id}_home` ? '0 0 16px rgba(79,195,247,0.5)' : '0 4px 12px rgba(0,0,0,0.3)',
                                                                    '& img': { objectFit: 'contain', p: 0.5 }
                                                                }}>
                                                                <SportsSoccerIcon sx={{ fontSize: 24, color: 'rgba(255,255,255,0.3)' }} />
                                                            </Avatar>
                                                        </Box>
                                                        <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.85rem' }, textAlign: 'center', lineHeight: 1.2 }}>
                                                            {match.home_team?.name || 'غير معروف'}
                                                        </Typography>
                                                    </Box>

                                                    {/* VS */}
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3, px: { xs: 0.5, sm: 1.5 } }}>
                                                        <Typography sx={{ color: '#4fc3f7', fontWeight: 'bold', fontSize: { xs: '0.9rem', sm: '1.1rem' }, textShadow: '0 0 10px rgba(79,195,247,0.3)' }}>
                                                            VS
                                                        </Typography>
                                                        {totalVotes > 0 && (
                                                            <VoteIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }} />
                                                        )}
                                                    </Box>

                                                    {/* الفريق الضيف */}
                                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                                        <Box
                                                            onClick={(e) => { e.stopPropagation(); handleVote(match.id, 'away'); }}
                                                            sx={{
                                                                cursor: 'pointer',
                                                                transition: 'transform 0.15s ease',
                                                                transform: animatingVote === `${match.id}_away` ? 'scale(1.25)' : 'scale(1)',
                                                                '&:hover': { transform: 'scale(1.12)' }
                                                            }}
                                                        >
                                                            <Avatar src={match.away_team?.logo_url} alt={match.away_team?.name}
                                                                sx={{
                                                                    width: { xs: 48, sm: 56 }, height: { xs: 48, sm: 56 },
                                                                    bgcolor: 'rgba(255,255,255,0.08)',
                                                                    border: matchVotes.away > matchVotes.home && totalVotes > 0 ? '2px solid #ff9800' : '2px solid rgba(255,255,255,0.1)',
                                                                    boxShadow: animatingVote === `${match.id}_away` ? '0 0 16px rgba(255,152,0,0.5)' : '0 4px 12px rgba(0,0,0,0.3)',
                                                                    '& img': { objectFit: 'contain', p: 0.5 }
                                                                }}>
                                                                <SportsSoccerIcon sx={{ fontSize: 24, color: 'rgba(255,255,255,0.3)' }} />
                                                            </Avatar>
                                                        </Box>
                                                        <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.85rem' }, textAlign: 'center', lineHeight: 1.2 }}>
                                                            {match.away_team?.name || 'غير معروف'}
                                                        </Typography>
                                                    </Box>
                                                </Box>

                                                {/* شريط التصويت */}
                                                {totalVotes > 0 && (
                                                    <Box sx={{ mt: 1.5 }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                            <Typography sx={{ fontSize: '0.7rem', color: '#4fc3f7', fontWeight: 'bold' }}>
                                                                {homePercent}% ({matchVotes.home})
                                                            </Typography>
                                                            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                                                                توقعات الجمهور
                                                            </Typography>
                                                            <Typography sx={{ fontSize: '0.7rem', color: '#ff9800', fontWeight: 'bold' }}>
                                                                {awayPercent}% ({matchVotes.away})
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.05)' }}>
                                                            <Box sx={{
                                                                width: `${homePercent}%`,
                                                                background: 'linear-gradient(90deg, #1565c0, #4fc3f7)',
                                                                borderRadius: '3px 0 0 3px',
                                                                transition: 'width 0.4s ease'
                                                            }} />
                                                            <Box sx={{
                                                                width: `${awayPercent}%`,
                                                                background: 'linear-gradient(90deg, #ff9800, #e65100)',
                                                                borderRadius: '0 3px 3px 0',
                                                                transition: 'width 0.4s ease'
                                                            }} />
                                                        </Box>
                                                    </Box>
                                                )}

                                                {/* القناة وزر التشغيل */}
                                                {match.channel && (
                                                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 1.5, gap: 1 }}>
                                                        <Chip
                                                            icon={matchingChannel ? <PlayIcon sx={{ fontSize: '14px !important' }} /> : <TvIcon sx={{ fontSize: '14px !important' }} />}
                                                            label={matchingChannel ? `شاهد على ${match.channel}` : match.channel}
                                                            size="small"
                                                            onClick={matchingChannel ? (e) => {
                                                                e.stopPropagation();
                                                                onChannelSelect(matchingChannel);
                                                            } : undefined}
                                                            sx={{
                                                                bgcolor: matchingChannel ? 'rgba(76,175,80,0.15)' : 'rgba(129,199,132,0.12)',
                                                                color: matchingChannel ? '#66bb6a' : '#81c784',
                                                                fontWeight: 'bold',
                                                                fontSize: { xs: '0.7rem', sm: '0.75rem' },
                                                                height: { xs: 26, sm: 28 },
                                                                border: matchingChannel ? '1px solid rgba(76,175,80,0.4)' : '1px solid rgba(129,199,132,0.2)',
                                                                cursor: matchingChannel ? 'pointer' : 'default',
                                                                '& .MuiChip-icon': { color: matchingChannel ? '#66bb6a' : '#81c784' },
                                                                '&:hover': matchingChannel ? { bgcolor: 'rgba(76,175,80,0.25)', transform: 'scale(1.03)' } : {}
                                                            }}
                                                        />
                                                    </Box>
                                                )}
                                            </Box>

                                            {index < matches.length - 1 && (
                                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.04)', mt: 1.5 }} />
                                            )}
                                        </Box>
                                    );
                                })}
                            </Stack>
                        )}
                    </Box>

                    {/* Footer hint */}
                    {!loading && matches.length > 0 && (
                        <Box sx={{
                            p: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', justifyContent: 'center', gap: 2,
                            bgcolor: 'rgba(0,0,0,0.2)'
                        }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem' }}>
                                اضغط على شعار الفريق للتصويت
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)' }}>•</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem' }}>
                                اضغط على القناة لمشاهدة المباراة
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Fade>
    );
};

export default MatchesTable;
