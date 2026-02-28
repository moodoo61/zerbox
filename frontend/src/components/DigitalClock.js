import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';

const DigitalClock = () => {
    const [time, setTime] = useState(new Date());
    const theme = useTheme();

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const timeString = formatTime(time);
    const dateString = formatDate(time);

    return (
        <Paper sx={{
            p: 2,
            textAlign: 'center',
            background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
            color: 'white',
            borderRadius: 2,
            boxShadow: `0 4px 20px rgba(0,0,0,0.2)`,
            position: 'relative',
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
        }}>
            {/* تأثير الخلفية */}
            <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                pointerEvents: 'none'
            }} />
            
            {/* الساعة الرقمية */}
            <Box sx={{ position: 'relative', zIndex: 1 }}>
                <Typography 
                    variant="h4" 
                    sx={{ 
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        fontSize: { xs: '1.3rem', sm: '1.8rem' },
                        letterSpacing: '0.05em',
                        textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                        mb: 0.25,
                        background: 'linear-gradient(45deg, #ffffff, #f0f0f0)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                    }}
                >
                    {timeString}
                </Typography>
                
                {/* التاريخ */}
                <Typography 
                    variant="body2" 
                    sx={{ 
                        fontWeight: 'medium',
                        opacity: 0.9,
                        fontSize: { xs: '0.65rem', sm: '0.8rem' },
                        textShadow: '0 1px 5px rgba(0,0,0,0.2)',
                        mb: 0.5
                    }}
                >
                    {dateString}
                </Typography>
                
                {/* معلومات مضغوطة */}
                <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 2
                }}>
                    <Typography variant="body2" sx={{ 
                        opacity: 0.8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5
                    }}>
                        GMT+3
                    </Typography>
                    
                    <Box sx={{ 
                        width: 1, 
                        height: 15, 
                        bgcolor: 'rgba(255,255,255,0.3)' 
                    }} />
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: '#4CAF50',
                            boxShadow: '0 0 8px #4CAF50',
                            '@keyframes pulse': {
                                '0%, 100%': {
                                    opacity: 1,
                                    transform: 'scale(1)',
                                },
                                '50%': {
                                    opacity: 0.7,
                                    transform: 'scale(1.1)',
                                },
                            },
                            animation: 'pulse 2s infinite'
                        }} />
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            متصل
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </Paper>
    );
};

export default DigitalClock; 