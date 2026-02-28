import React, { useState, useEffect } from 'react';
import { Box, Typography, LinearProgress, Alert, Skeleton } from '@mui/material';

function formatUptime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return 'N/A';
    }
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    
    return `${d}d ${h}h ${m}m`; // Simplified for cleaner UI
}

const StatItem = ({ label, value }) => (
    <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body1">{label}</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>{value}</Typography>
        </Box>
    </Box>
);

const StatProgressItem = ({ label, value }) => (
     <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body1">{label}</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>{`${value.toFixed(1)}%`}</Typography>
        </Box>
        <LinearProgress variant="determinate" value={value} />
    </Box>
);


const SystemStats = ({ auth }) => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!auth) return;

        const fetchStats = async () => {
            try {
                const response = await fetch('/api/stats', { 
                    headers: { 'Authorization': 'Basic ' + auth } 
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch system stats.');
                }
                const data = await response.json();
                setStats(data);
                setError('');
            } catch (err) {
                setError(err.message);
                setStats(null); // Clear stats on error
            }
        };

        fetchStats();
        const intervalId = setInterval(fetchStats, 5000);

        return () => clearInterval(intervalId);
    }, [auth]);

    if (error) {
        return <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>;
    }
    if (!stats) {
        return (
            <Box sx={{ pt: 1 }}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', mt: 1 }}>
            <StatProgressItem label="CPU Usage" value={stats.cpu_usage} />
            <StatProgressItem label="RAM Usage" value={stats.memory_usage} />
            <StatProgressItem label="Disk Usage" value={stats.disk_usage} />
            <StatItem label="Uptime" value={formatUptime(stats.uptime_seconds)} />
        </Box>
    );
};

export default SystemStats; 