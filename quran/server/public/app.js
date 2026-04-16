// API Base URL
const API_BASE = '/api';

// State
let currentSurah = null;
let currentPage = 1;
let allSurahs = [];
let audioPlayer = null;
let currentAudio = null;
let currentSurahPage = 1;
let versesPerPage = 20;
let currentSurahVerses = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadSurahs();
    loadPrayerTimes();
});

function initializeApp() {
    // Setup navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            switchView(view);
        });
    });

    // Setup search
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.search-btn-small');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }

    // Setup sort
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        sortSurahs(e.target.value);
    });

    // Setup page navigation
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadPage(currentPage);
        }
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (currentPage < 604) {
            currentPage++;
            loadPage(currentPage);
        }
    });

    document.getElementById('pageNumberInput').addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= 604) {
            currentPage = page;
            loadPage(currentPage);
        }
    });

    // Setup audio player
    setupAudioPlayer();
}

function setupEventListeners() {
    // Audio player controls
    document.getElementById('playPauseBtn').addEventListener('click', toggleAudio);
    document.getElementById('stopBtn').addEventListener('click', stopAudio);
    document.getElementById('audioProgress').addEventListener('input', (e) => {
        if (audioPlayer) {
            audioPlayer.currentTime = (e.target.value / 100) * audioPlayer.duration;
        }
    });
}

// API Functions
async function fetchAPI(endpoint) {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}${endpoint}`);
        const data = await response.json();
        showLoading(false);
        return data;
    } catch (error) {
        showLoading(false);
        console.error('Error fetching data:', error);
        showError('حدث خطأ في تحميل البيانات');
        return null;
    }
}

// Load Surahs
async function loadSurahs() {
    const data = await fetchAPI('/surahs');
    if (data && data.success) {
        allSurahs = data.result;
        displaySurahs(allSurahs);
    }
}

function displaySurahs(surahs) {
    const grid = document.getElementById('surahsGrid');
    grid.innerHTML = '';

    surahs.forEach(surah => {
        const card = createSurahCard(surah);
        grid.appendChild(card);
    });
}

function createSurahCard(surah) {
    const card = document.createElement('div');
    card.className = 'surah-card';
    card.innerHTML = `
        <div class="surah-card-header">
            <div class="surah-number">${surah.number}</div>
            <div class="surah-name">${surah.name.ar}</div>
        </div>
        <div class="surah-meta">
            <span>${surah.revelation_place.ar}</span>
            <span>${surah.verses_count} آية</span>
        </div>
    `;
    card.addEventListener('click', () => loadSurah(surah.number));
    return card;
}

function sortSurahs(sortBy) {
    let sorted = [...allSurahs];
    
    switch(sortBy) {
        case 'name':
            sorted.sort((a, b) => a.name.ar.localeCompare(b.name.ar));
            break;
        case 'verses':
            sorted.sort((a, b) => b.verses_count - a.verses_count);
            break;
        default:
            sorted.sort((a, b) => a.number - b.number);
    }
    
    displaySurahs(sorted);
}

// Load Surah Detail
async function loadSurah(surahId) {
    const data = await fetchAPI(`/surah/${surahId}`);
    if (data && data.success) {
        currentSurah = data.result;
        displaySurah(currentSurah);
        loadVerses(surahId);
        loadAudio(surahId);
        switchView('surah');
    }
}

function displaySurah(surah) {
    document.getElementById('surahName').textContent = surah.name.ar;
    document.getElementById('surahRevelation').textContent = surah.revelation_place.ar;
    document.getElementById('surahVersesCount').textContent = `${surah.verses_count} آية`;
    document.getElementById('surahWordsCount').textContent = `${surah.words_count} كلمة`;
    document.getElementById('surahLettersCount').textContent = `${surah.letters_count} حرف`;
    
    // Initialize juz info (will be updated when verses are loaded)
    const juzInfoEl = document.getElementById('surahJuzInfo');
    if (juzInfoEl) {
        juzInfoEl.textContent = '';
    }
}

async function loadVerses(surahId) {
    const data = await fetchAPI(`/verses/${surahId}`);
    if (data && data.success) {
        currentSurahVerses = data.result;
        currentSurahPage = 1;
        
        displayVersesPage();
        updateJuzInfoInHeader();
        updateSurahPagination();
    }
}

function updateJuzInfoInHeader() {
    if (currentSurahVerses && currentSurahVerses.length > 0) {
        // Get verses for current page only
        const startIndex = (currentSurahPage - 1) * versesPerPage;
        const endIndex = Math.min(startIndex + versesPerPage, currentSurahVerses.length);
        const versesToShow = currentSurahVerses.slice(startIndex, endIndex);
        
        // Get juz from first verse in current page
        let currentJuz = null;
        if (versesToShow.length > 0 && versesToShow[0].juz) {
            currentJuz = versesToShow[0].juz;
        }
        
        const juzInfoEl = document.getElementById('surahJuzInfo');
        if (juzInfoEl) {
            if (currentJuz) {
                juzInfoEl.textContent = `الجزء ${currentJuz}`;
            } else {
                juzInfoEl.textContent = '';
            }
        }
    }
}

function displayVersesPage() {
    const container = document.getElementById('versesContainer');
    container.innerHTML = '';

    const startIndex = (currentSurahPage - 1) * versesPerPage;
    const endIndex = Math.min(startIndex + versesPerPage, currentSurahVerses.length);
    const versesToShow = currentSurahVerses.slice(startIndex, endIndex);

    // Create a single paragraph for verses on this page
    const versesParagraph = document.createElement('div');
    versesParagraph.className = 'verses-text';

    // Add Bismillah at the beginning of first page if surah is not Al-Fatihah
    if (currentSurahPage === 1 && currentSurah && currentSurah.number !== 1) {
        const bismillahSpan = document.createElement('span');
        bismillahSpan.className = 'verse-inline bismillah';
        bismillahSpan.innerHTML = '<span class="verse-number-inline">﷽</span>بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ';
        versesParagraph.appendChild(bismillahSpan);
    }

    versesToShow.forEach(verse => {
        const verseEl = createVerseElement(verse);
        versesParagraph.appendChild(verseEl);
    });

    container.appendChild(versesParagraph);
}

function updateSurahPagination() {
    const totalPages = Math.ceil(currentSurahVerses.length / versesPerPage);
    const paginationContainer = document.getElementById('surahPagination');
    const isLastPage = currentSurahPage === totalPages;
    const isLastSurah = currentSurah && currentSurah.number === 114;
    
    // Get current page juz information
    let currentJuz = null;
    if (currentSurahVerses && currentSurahVerses.length > 0) {
        const startIndex = (currentSurahPage - 1) * versesPerPage;
        const endIndex = Math.min(startIndex + versesPerPage, currentSurahVerses.length);
        const versesToShow = currentSurahVerses.slice(startIndex, endIndex);
        
        // Get juz from first verse in current page
        if (versesToShow.length > 0 && versesToShow[0].juz) {
            currentJuz = versesToShow[0].juz;
        }
    }
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    // Determine next button text and behavior
    let nextButtonText = 'التالية →';
    let nextButtonId = 'nextSurahPageBtn';
    
    if (isLastPage) {
        nextButtonText = 'السورة التالية →';
        nextButtonId = 'nextSurahBtn';
    }
    
    paginationContainer.innerHTML = `
        <div class="surah-page-nav">
            <button class="surah-page-btn" id="prevSurahPageBtn" ${currentSurahPage === 1 ? 'disabled' : ''}>← السابقة</button>
            <span class="surah-page-info">صفحة ${currentSurahPage} من ${totalPages}</span>
            <button class="surah-page-btn" id="${nextButtonId}" ${isLastPage && isLastSurah ? 'disabled' : ''}>${nextButtonText}</button>
        </div>
    `;
    
    document.getElementById('prevSurahPageBtn').addEventListener('click', () => {
        if (currentSurahPage > 1) {
            currentSurahPage--;
            displayVersesPage();
            updateJuzInfoInHeader();
            updateSurahPagination();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    const nextButton = document.getElementById(nextButtonId);
    if (nextButton) {
        nextButton.addEventListener('click', () => {
            if (isLastPage) {
                // Go to next surah
                if (currentSurah && currentSurah.number < 114) {
                    loadSurah(currentSurah.number + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else {
                // Go to next page
                currentSurahPage++;
                displayVersesPage();
                updateJuzInfoInHeader();
                updateSurahPagination();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
}

function createVerseElement(verse) {
    const verseSpan = document.createElement('span');
    verseSpan.className = 'verse-inline';
    verseSpan.innerHTML = `<span class="verse-number-inline">${verse.number}</span>${verse.text.ar} `;
    return verseSpan;
}

// Load Audio
async function loadAudio(surahId) {
    const data = await fetchAPI(`/audio/${surahId}`);
    if (data && data.success) {
        displayAudioControls(data.result);
    }
}

function displayAudioControls(audios) {
    const container = document.getElementById('audioControls');
    container.innerHTML = '';

    // Sort reciters alphabetically by Arabic name
    const sortedAudios = [...audios].sort((a, b) => {
        return a.reciter.ar.localeCompare(b.reciter.ar, 'ar');
    });

    // Display all reciters
    sortedAudios.forEach(audio => {
        const card = document.createElement('div');
        card.className = 'reciter-card';
        
        const playBtn = document.createElement('button');
        playBtn.className = 'reciter-btn';
        playBtn.innerHTML = `<span class="audio-icon">▶</span> ${audio.reciter.ar}`;
        playBtn.addEventListener('click', () => playAudio(audio));
        
        card.appendChild(playBtn);
        container.appendChild(card);
    });
}

function setupAudioPlayer() {
    audioPlayer = new Audio();
    
    audioPlayer.addEventListener('loadedmetadata', () => {
        updateAudioTime();
    });
    
    audioPlayer.addEventListener('timeupdate', () => {
        updateAudioProgress();
        updateAudioTime();
    });
    
    audioPlayer.addEventListener('ended', () => {
        stopAudio();
    });
}

function playAudio(audio) {
    if (currentAudio && currentAudio.link === audio.link) {
        toggleAudio();
        return;
    }

    currentAudio = audio;
    audioPlayer.src = audio.link;
    audioPlayer.play();
    
    document.getElementById('audioPlayer').style.display = 'block';
    document.getElementById('audioSurahName').textContent = currentSurah ? currentSurah.name.ar : '';
    document.getElementById('audioReciter').textContent = audio.reciter.ar;
    
    // Update play/pause icon
    const playIcon = document.querySelector('.audio-icon-play');
    const pauseIcon = document.querySelector('.audio-icon-pause');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'inline';
    
    // Setup download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.onclick = () => downloadAudio(audio);
    }
    
    document.body.style.paddingBottom = '100px';
}

function toggleAudio() {
    const playIcon = document.querySelector('.audio-icon-play');
    const pauseIcon = document.querySelector('.audio-icon-pause');
    
    if (audioPlayer.paused) {
        audioPlayer.play();
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'inline';
    } else {
        audioPlayer.pause();
        if (playIcon) playIcon.style.display = 'inline';
        if (pauseIcon) pauseIcon.style.display = 'none';
    }
}

function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    
    // Update play/pause icon
    const playIcon = document.querySelector('.audio-icon-play');
    const pauseIcon = document.querySelector('.audio-icon-pause');
    if (playIcon) playIcon.style.display = 'inline';
    if (pauseIcon) pauseIcon.style.display = 'none';
    
    document.getElementById('audioProgress').value = 0;
    updateAudioTime();
    
    // Clear download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.onclick = null;
    }
}

function updateAudioProgress() {
    if (audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        document.getElementById('audioProgress').value = progress;
    }
}

function updateAudioTime() {
    const current = formatTime(audioPlayer.currentTime || 0);
    const total = formatTime(audioPlayer.duration || 0);
    document.getElementById('audioTime').textContent = `${current} / ${total}`;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Download Audio
function downloadAudio(audio) {
    const link = document.createElement('a');
    link.href = audio.link;
    link.download = `${currentSurah ? currentSurah.name.ar : 'surah'}_${audio.reciter.ar.replace(/\s+/g, '_')}.mp3`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Show notification
    showNotification(`جاري تنزيل: ${audio.reciter.ar}`);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Load Page
async function loadPage(page) {
    const data = await fetchAPI(`/pages?page=${page}`);
    if (data && data.success) {
        // API returns an array, get first result
        const pageData = Array.isArray(data.result) ? data.result[0] : data.result;
        if (pageData) {
            displayPage(pageData);
            document.getElementById('pageNumberInput').value = page;
        }
    }
}

function displayPage(pageData) {
    const container = document.getElementById('pageContainer');
    container.innerHTML = `
        <img src="${pageData.image?.url || `/data/quran_image/${pageData.page}.png`}" alt="Page ${pageData.page}" class="page-image" onerror="this.onerror=null; this.src='/data/quran_image/${pageData.page}.png'">
        <div class="page-info">
            <p><strong>من:</strong> ${pageData.start.name.ar} - الآية ${pageData.start.verse}</p>
            <p><strong>إلى:</strong> ${pageData.end.name.ar} - الآية ${pageData.end.verse}</p>
        </div>
    `;
}

// Load Sajda
async function loadSajda() {
    const data = await fetchAPI('/sajda');
    if (data && data.success) {
        displaySajda(data.result);
    }
}

function displaySajda(verses) {
    const container = document.getElementById('sajdaContainer');
    container.innerHTML = '';

    verses.forEach(verse => {
        const card = document.createElement('div');
        card.className = 'sajda-card';
        const sajdaType = verse.sajda?.recommended ? 'سجدة مستحبة' : 'سجدة واجبة';
        card.innerHTML = `
            <div class="sajda-header">
                <div>
                    <strong>${verse.surahName || 'سورة'} ${verse.surahNumber || ''} - الآية ${verse.number}</strong>
                </div>
                <div class="sajda-badge">${sajdaType}</div>
            </div>
            <div class="verse-text-ar">${verse.text.ar}</div>
            <div class="verse-meta" style="margin-top: 1rem;">
                <span>الجزء ${verse.juz}</span>
                <span>الصفحة ${verse.page}</span>
            </div>
        `;
        card.addEventListener('click', () => {
            if (verse.surahNumber) {
                loadSurah(verse.surahNumber);
            }
        });
        card.style.cursor = 'pointer';
        container.appendChild(card);
    });
}

// Load Prayer Times
async function loadPrayerTimes() {
    try {
        const today = new Date();
        const date = today.toISOString().split('T')[0];
        const dateParts = date.split('-');
        const day = parseInt(dateParts[2]);
        const month = parseInt(dateParts[1]);
        const year = parseInt(dateParts[0]);
        
        // API from aladhan.com for Marib, Yemen
        // Using coordinates or city name: Marib, Yemen
        // API endpoint: https://api.aladhan.com/v1/calendarByCity?city=Marib&country=Yemen&method=2
        const response = await fetch(`https://api.aladhan.com/v1/calendarByCity?city=Marib&country=Yemen&method=2&month=${month}&year=${year}`);
        const data = await response.json();
        
        if (data && data.data && data.data.length > 0) {
            // Find today's prayer times
            const todayData = data.data.find(d => parseInt(d.date.gregorian.day) === day);
            
            if (todayData && todayData.timings) {
                const timings = todayData.timings;
                
                // Format time to 12-hour format
                const formatTime = (timeStr) => {
                    if (!timeStr) return '--:--';
                    const time = timeStr.split(' ')[0].substring(0, 5);
                    const [hours, minutes] = time.split(':');
                    let hour12 = parseInt(hours);
                    const ampm = hour12 >= 12 ? 'م' : 'ص';
                    if (hour12 > 12) hour12 -= 12;
                    if (hour12 === 0) hour12 = 12;
                    return `${hour12}:${minutes} ${ampm}`;
                };
                
                document.getElementById('fajr').textContent = formatTime(timings.Fajr || '--:--');
                document.getElementById('dhuhr').textContent = formatTime(timings.Dhuhr || '--:--');
                document.getElementById('asr').textContent = formatTime(timings.Asr || '--:--');
                document.getElementById('maghrib').textContent = formatTime(timings.Maghrib || '--:--');
                document.getElementById('isha').textContent = formatTime(timings.Isha || '--:--');
                
                // Display date (Hijri)
                const dateInfoEl = document.getElementById('prayerDateInfo');
                if (dateInfoEl && todayData.date && todayData.date.hijri) {
                    const hijriDate = todayData.date.hijri;
                    dateInfoEl.textContent = `${hijriDate.day} ${hijriDate.month.ar} ${hijriDate.year} هـ`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading prayer times:', error);
        // Show error message
        const prayerTimes = document.getElementById('prayerTimes');
        if (prayerTimes) {
            prayerTimes.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">تعذر تحميل مواقيت الصلاة. يرجى المحاولة لاحقاً.</p>';
        }
    }
}

// Search
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        displaySurahs(allSurahs);
        return;
    }

    const filtered = allSurahs.filter(surah => 
        surah.name.ar.includes(query) ||
        surah.name.en.toLowerCase().includes(query) ||
        surah.name.transliteration.toLowerCase().includes(query)
    );

    displaySurahs(filtered);
}

// View Management
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected view
    switch(viewName) {
        case 'surahs':
            document.getElementById('surahsView').style.display = 'block';
            document.querySelector('[data-view="surahs"]').classList.add('active');
            break;
        case 'pages':
            document.getElementById('pagesView').style.display = 'block';
            document.querySelector('[data-view="pages"]').classList.add('active');
            if (currentPage === 1) loadPage(1);
            break;
        case 'surah':
            document.getElementById('surahView').style.display = 'block';
            break;
    }
}

function showSurahsView() {
    switchView('surahs');
}

// Utility Functions
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    alert(message);
}
