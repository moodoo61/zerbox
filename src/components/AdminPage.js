import React, { useState, useEffect } from 'react';
import ServiceManager from './ServiceManager';

function formatUptime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return 'N/A';
    }
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    return `${d}d ${h}h ${m}m ${s}s`;
}

export default function AdminPage() {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [auth, setAuth] = useState(null);

    useEffect(() => {
        const username = prompt("Enter username:", "admin");
        const password = prompt("Enter password:", "password");

        if (!username || !password) {
            setError('Authentication required to view this page.');
            return;
        }

        const encodedAuth = btoa(username + ":" + password);
        setAuth(encodedAuth);

        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + encodedAuth);

        fetch('/api/stats', { headers })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check username and password.');
                }
                throw new Error('An error occurred while fetching system stats.');
            })
            .then(data => setStats(data))
            .catch(err => setError(err.message));
    }, []);

    const renderStats = () => {
        if (error) {
            return <p className="text-red-500 font-bold">{error}</p>;
        }
        if (!stats) {
            return <p>جارٍ تحميل الإحصائيات...</p>;
        }
        return (
            <ul className="space-y-3 text-gray-700">
                <li className="flex justify-between"><span>استخدام المعالج (CPU):</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{stats.cpu_usage.toFixed(1)}%</span></li>
                <li className="flex justify-between"><span>استخدام الذاكرة (RAM):</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{stats.memory_usage.toFixed(1)}%</span></li>
                <li className="flex justify-between"><span>استخدام القرص (Disk):</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{stats.disk_usage.toFixed(1)}%</span></li>
                <li className="flex justify-between"><span>مدة التشغيل (Uptime):</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{formatUptime(stats.uptime_seconds)}</span></li>
            </ul>
        );
    };

    return (
        <div className="p-8">
            <a href="/" className="text-blue-500 hover:underline mb-6 block">&larr; العودة إلى الصفحة الرئيسية</a>
            <h1 className="text-3xl font-bold mb-6">لوحة التحكم</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold mb-4">إحصائيات النظام</h2>
                    <div id="stats-container">
                        {renderStats()}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
                    <h2 className="text-2xl font-bold mb-4">إدارة الخدمات</h2>
                    <div id="services-management-container">
                        {auth ? <ServiceManager auth={auth} /> : <p className="text-gray-500">الرجاء المصادقة أولاً.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
} 