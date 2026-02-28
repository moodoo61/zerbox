import React from 'react';
import {
    Container, Box, Skeleton, Typography, IconButton
} from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import WebIcon from '@mui/icons-material/Web';
import GamepadIcon from '@mui/icons-material/Gamepad';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PhotoIcon from '@mui/icons-material/Photo';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import SchoolIcon from '@mui/icons-material/School';
import WorkIcon from '@mui/icons-material/Work';
import { hexToRgba } from '../../styles/animations';

const HeroSection = ({ 
    settings, 
    loading
}) => {
    // أيقونات التطبيقات الثابتة
    const allAppIcons = [
        { icon: AppsIcon, label: 'التطبيقات', color: '#2196f3' },
        { icon: WebIcon, label: 'المواقع', color: '#4caf50' },
        { icon: GamepadIcon, label: 'الألعاب', color: '#ff9800' },
        { icon: MusicNoteIcon, label: 'الموسيقى', color: '#e91e63' },
        { icon: PhotoIcon, label: 'الصور', color: '#9c27b0' },
        { icon: VideoLibraryIcon, label: 'الفيديو', color: '#f44336' },
        { icon: SchoolIcon, label: 'التعليم', color: '#3f51b5' },
        { icon: WorkIcon, label: 'العمل', color: '#795548' }
    ];

    // تصفية الأزرار المخفية من الإعدادات
    let hiddenButtons = [];
    try {
        hiddenButtons = JSON.parse(settings?.hidden_app_buttons || '[]');
    } catch { hiddenButtons = []; }
    const appIcons = allAppIcons.filter(app => !hiddenButtons.includes(app.label));
    const allAppsHidden = hiddenButtons.length >= allAppIcons.length;
    const showMarquee = settings?.marquee_enabled && settings?.marquee_text;
    const heroStyles = {
        height: '100vh',
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        color: settings?.welcome_font_color || '#fff',
        marginX: { xs: -1, sm: -2, md: 0 }, // تعويض padding الصفحة الرئيسية
        ...(settings?.header_background_type === 'image' && {
            backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${settings.header_background_image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: { xs: 'scroll', md: 'fixed' }, // scroll على الهواتف
        }),
        ...(settings?.header_background_type === 'color' && {
            background: `linear-gradient(135deg, ${hexToRgba(settings.header_color, settings.header_color_opacity || 0.8)}, ${hexToRgba(settings.header_color, Math.max(0.1, (settings.header_color_opacity || 0.8) - 0.3))})`,
        }),
        '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.1) 100%)',
            pointerEvents: 'none',
            animation: 'shimmer 4s ease-in-out infinite',
        }
    };

    if (loading) {
        return (
            <Box sx={{ 
                py: 8, 
                backgroundColor: 'primary.main', 
                minHeight: { xs: '40vh', md: '50vh' }, 
                display: 'flex', 
                alignItems: 'center' 
            }}>
                <Container maxWidth="lg" sx={{ textAlign: 'center' }}>
                    <Skeleton 
                        variant="rectangular" 
                        width="80%" 
                        height={200} 
                        sx={{ 
                            margin: '0 auto', 
                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                            borderRadius: 2
                        }} 
                    />
                </Container>
            </Box>
        );
    }

    return (
        <Box sx={heroStyles}>
            <Container maxWidth="lg" sx={{ textAlign: 'center', zIndex: 1, position: 'relative' }}>
                {settings && (
                    <Box sx={{ 
                        animation: 'fadeInScale 1s ease-out',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        {settings.logo_url && (
                            <Box
                                component="img"
                                src={settings.logo_url}
                                alt="Logo"
                                sx={{ 
                                    maxHeight: { xs: 60, sm: 80, md: 120, lg: 150 },
                                    maxWidth: '90%',
                                    width: 'auto',
                                    height: 'auto',
                                    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))',
                                    animation: 'float 3s ease-in-out infinite',
                                    transition: 'transform 0.3s ease',
                                    '&:hover': {
                                        transform: 'scale(1.05)'
                                    }
                                }}
                            />
                        )}
                    </Box>
                )}

                {/* App Icons Section أو النص المتحرك */}
                <Box sx={{
                    position: 'absolute',
                    bottom: 80,
                    left: 0,
                    right: 0,
                    zIndex: 2
                }}>
                    <Container maxWidth="lg">
                        {/* النص المتحرك - يظهر عند إخفاء جميع التطبيقات وتفعيل الماركي */}
                        {allAppsHidden && showMarquee ? (
                            <Box sx={{
                                py: 2,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                '@keyframes marqueeScroll': {
                                    '0%': { transform: 'translateX(-100%)' },
                                    '100%': { transform: 'translateX(100%)' }
                                }
                            }}>
                                <Box sx={{
                                    width: '100%',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                    px: { xs: 1, md: 4 }
                                }}>
                                    <Typography sx={{
                                        display: 'inline-block',
                                        color: settings?.welcome_font_color || '#fff',
                                        fontSize: { 
                                            xs: `${Math.max(14, (settings?.marquee_font_size || 18) * 0.8)}px`, 
                                            sm: `${settings?.marquee_font_size || 18}px`,
                                            md: `${settings?.marquee_font_size || 18}px`
                                        },
                                        fontWeight: 600,
                                        textShadow: '1px 2px 8px rgba(0,0,0,0.4)',
                                        letterSpacing: '0.02em',
                                        animation: 'marqueeScroll 15s linear infinite',
                                        willChange: 'transform'
                                    }}>
                                        {settings.marquee_text}
                                    </Typography>
                                </Box>
                            </Box>
                        ) : !allAppsHidden && appIcons.length > 0 ? (
                            <>
                                {/* Desktop Layout - تصفيف أفقي */}
                                <Box sx={{
                                    display: { xs: 'none', md: 'block' },
                                    overflowX: 'auto',
                                    py: 2,
                                    '&::-webkit-scrollbar': {
                                        height: 6,
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        borderRadius: 3
                                    },
                                    '&::-webkit-scrollbar-thumb': {
                                        backgroundColor: 'rgba(255,255,255,0.3)',
                                        borderRadius: 3,
                                        '&:hover': {
                                            backgroundColor: 'rgba(255,255,255,0.5)'
                                        }
                                    }
                                }}>
                                    <Box sx={{
                                        display: 'flex',
                                        gap: 3,
                                        justifyContent: 'center',
                                        px: 2
                                    }}>
                                        {appIcons.map((app, index) => {
                                            const IconComponent = app.icon;
                                            return (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        minWidth: 70,
                                                        animation: `slideInUp 0.6s ease-out ${index * 0.1}s both`
                                                    }}
                                                >
                                                    <IconButton
                                                        sx={{
                                                            width: 56,
                                                            height: 56,
                                                            backgroundColor: 'rgba(255,255,255,0.15)',
                                                            backdropFilter: 'blur(10px)',
                                                            border: '2px solid rgba(255,255,255,0.2)',
                                                            mb: 1,
                                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            '&:hover': {
                                                                backgroundColor: 'rgba(255,255,255,0.25)',
                                                                transform: 'translateY(-4px) scale(1.1)',
                                                                boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
                                                                borderColor: 'rgba(255,255,255,0.4)'
                                                            }
                                                        }}
                                                    >
                                                        <IconComponent 
                                                            sx={{ 
                                                                fontSize: 28,
                                                                color: app.color,
                                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                                                            }} 
                                                        />
                                                    </IconButton>
                                                    <Typography 
                                                        variant="caption" 
                                                        sx={{
                                                            color: 'inherit',
                                                            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 'medium',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        {app.label}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>

                                {/* Mobile Layout - تصفيف في صفين */}
                                <Box sx={{
                                    display: { xs: 'block', md: 'none' },
                                    py: 2
                                }}>
                                    <Box sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                        gridTemplateRows: 'repeat(2, 1fr)',
                                        gap: 1.5,
                                        justifyItems: 'center',
                                        alignItems: 'center',
                                        px: 1,
                                        maxWidth: 320,
                                        mx: 'auto'
                                    }}>
                                        {appIcons.map((app, index) => {
                                            const IconComponent = app.icon;
                                            return (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        animation: `slideInUp 0.6s ease-out ${index * 0.1}s both`
                                                    }}
                                                >
                                                    <IconButton
                                                        sx={{
                                                            width: 48,
                                                            height: 48,
                                                            backgroundColor: 'rgba(255,255,255,0.15)',
                                                            backdropFilter: 'blur(10px)',
                                                            border: '2px solid rgba(255,255,255,0.2)',
                                                            mb: 0.5,
                                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            '&:hover': {
                                                                backgroundColor: 'rgba(255,255,255,0.25)',
                                                                transform: 'translateY(-2px) scale(1.05)',
                                                                boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                                                                borderColor: 'rgba(255,255,255,0.4)'
                                                            }
                                                        }}
                                                    >
                                                        <IconComponent 
                                                            sx={{ 
                                                                fontSize: 24,
                                                                color: app.color,
                                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                                                            }} 
                                                        />
                                                    </IconButton>
                                                    <Typography 
                                                        variant="caption" 
                                                        sx={{
                                                            color: 'inherit',
                                                            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 'medium',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        {app.label}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            </>
                        ) : null}
                    </Container>
                </Box>
                

            </Container>
        </Box>
    );
};

export default HeroSection;