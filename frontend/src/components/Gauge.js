import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

const Gauge = ({ value, max = 100, label, unit = '%', color = 'primary' }) => {
    const theme = useTheme();
    
    // تحديد النسبة المئوية
    const percentage = Math.min((value / max) * 100, 100);
    
    // تحديد اللون بناءً على القيمة
    const getColor = () => {
        if (percentage <= 50) return theme.palette.success.main;
        if (percentage <= 75) return theme.palette.warning.main;
        return theme.palette.error.main;
    };
    
    const gaugeColor = getColor();
    
    // حساب زاوية المؤشر (من -90 إلى 90 درجة)
    const angle = -90 + (percentage / 100) * 180;
    
    const size = 140;
    const center = size / 2;
    const radius = 50;
    const strokeWidth = 8;
    
    return (
        <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            p: 1,
            position: 'relative'
        }}>
            <svg width={size} height={size} style={{ overflow: 'visible' }}>
                {/* Background Circle */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={theme.palette.grey[200]}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${Math.PI * radius} ${Math.PI * radius}`}
                    strokeDashoffset={Math.PI * radius / 2}
                    transform={`rotate(-90 ${center} ${center})`}
                />
                
                {/* Progress Circle */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={gaugeColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${Math.PI * radius} ${Math.PI * radius}`}
                    strokeDashoffset={Math.PI * radius - (Math.PI * radius * percentage / 100)}
                    transform={`rotate(-90 ${center} ${center})`}
                    style={{
                        filter: `drop-shadow(0 0 8px ${gaugeColor}40)`,
                        transition: 'stroke-dashoffset 0.5s ease-in-out'
                    }}
                />
                
                {/* المؤشر */}
                <line
                    x1={center}
                    y1={center}
                    x2={center + (radius - 20) * Math.cos(angle * Math.PI / 180)}
                    y2={center + (radius - 20) * Math.sin(angle * Math.PI / 180)}
                    stroke={theme.palette.text.primary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    style={{
                        transition: 'all 0.5s ease-in-out',
                        filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.2))'
                    }}
                />
                
                {/* النقطة المركزية */}
                <circle
                    cx={center}
                    cy={center}
                    r={3}
                    fill={theme.palette.text.primary}
                    style={{
                        filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.2))'
                    }}
                />
                
                {/* تدريج العداد */}
                {[0, 25, 50, 75, 100].map((tick) => {
                    const tickAngle = (tick / 100) * 180 - 90;
                    const x1 = center + (radius - 10) * Math.cos(tickAngle * Math.PI / 180);
                    const y1 = center + (radius - 10) * Math.sin(tickAngle * Math.PI / 180);
                    const x2 = center + (radius - 5) * Math.cos(tickAngle * Math.PI / 180);
                    const y2 = center + (radius - 5) * Math.sin(tickAngle * Math.PI / 180);
                    
                    return (
                        <line
                            key={tick}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={theme.palette.text.secondary}
                            strokeWidth={1.5}
                        />
                    );
                })}
            </svg>
            
            {/* القيمة في المركز */}
            <Box sx={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                mt: 2,
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 1,
                px: 1,
                py: 0.5,
                minWidth: 45
            }}>
                <Typography variant="h6" sx={{ 
                    fontWeight: 'bold', 
                    color: gaugeColor,
                    fontFamily: 'monospace',
                    fontSize: { xs: '1.1rem', sm: '1.3rem' },
                    lineHeight: 1.2
                }}>
                    {value.toFixed(1)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ 
                    fontSize: '0.65rem',
                    fontWeight: 'bold',
                    lineHeight: 1
                }}>
                    {unit}
                </Typography>
            </Box>
            
            {/* التسمية */}
            <Typography variant="body2" sx={{ 
                mt: 0.25, 
                fontWeight: 'bold',
                color: theme.palette.text.primary,
                fontSize: { xs: '0.8rem', sm: '0.9rem' }
            }}>
                {label}
            </Typography>
        </Box>
    );
};

export default Gauge; 