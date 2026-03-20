window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('input-search');
    const refreshButton = document.getElementById('btn-refresh');
    const scheduleShutdownButton = document.getElementById('btn-schedule-shutdown');
    const weatherToggleButton = document.getElementById('btn-weather-toggle');
    const quickToggleButton = document.getElementById('btn-quick-toggle');
    const weatherWidget = document.getElementById('weather-widget');
    const quickWidget = document.getElementById('quick-widget');
    const shutdownScheduler = document.getElementById('shutdown-scheduler');
    const shutdownMinutesInput = document.getElementById('shutdown-minutes');
    const shutdownSchedulerStatus = document.getElementById('shutdown-scheduler-status');
    const shutdownScheduleApplyButton = document.getElementById('btn-shutdown-schedule-apply');
    const shutdownCancelButton = document.getElementById('btn-shutdown-cancel');
    const shutdownSchedulerCloseButton = document.getElementById('btn-shutdown-scheduler-close');
    const shutdownPresetButtons = Array.from(document.querySelectorAll('.shutdown-preset-button'));
    const weatherLocation = document.getElementById('weather-location');
    const weatherUpdated = document.getElementById('weather-updated');
    const weatherPill = document.getElementById('weather-pill');
    const weatherCondition = document.getElementById('weather-condition');
    const weatherDescription = document.getElementById('weather-description');
    const weatherTemperature = document.getElementById('weather-temperature');
    const weatherFeelsLike = document.getElementById('weather-feels-like');
    const weatherWind = document.getElementById('weather-wind');
    const weatherHumidity = document.getElementById('weather-humidity');
    const weatherStatus = document.getElementById('weather-status');
    const searchEngineLink = document.querySelector('#search-area > div:first-child > a');
    const WEATHER_CACHE_DURATION = 10 * 60 * 1000;
    const SEARCH_ENGINES = {
        default: {
            label: 'Google',
            home: 'https://www.google.com',
            buildSearchUrl: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        },
        g: {
            label: 'Google',
            home: 'https://www.google.com',
            buildSearchUrl: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        },
        n: {
            label: 'Naver',
            home: 'https://search.naver.com',
            buildSearchUrl: (keyword) => `https://search.naver.com/search.naver?where=nexearch&sm=top_sug.pre&fbm=0&acr=1&acq=%E3%85%81&qdt=0&ie=utf8&query=${encodeURIComponent(keyword)}&ackey=0tb853ea`
        },
        y: {
            label: 'YouTube',
            home: 'https://www.youtube.com',
            buildSearchUrl: (keyword) => `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&utm_source=opensearch`
        },
        c: {
            label: 'Coupang',
            home: 'https://www.coupang.com',
            buildSearchUrl: (keyword) => `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(keyword)}&traceId=mfxq97q1&channel=user`
        }
    };
    let activeSearchEngine = SEARCH_ENGINES.default;
    let isWeatherWidgetOpen = false;
    let isQuickWidgetOpen = false;
    let isShutdownSchedulerOpen = false;
    let weatherCache = null;
    let weatherFetchPromise = null;
    let widgetSyncFrame = 0;
    const WEATHER_CODE_MAP = {
        0: { title: '맑음', description: '하늘이 깨끗하게 열려 있어요.' },
        1: { title: '대체로 맑음', description: '햇살이 중심이고 구름이 조금 있어요.' },
        2: { title: '부분 흐림', description: '해와 구름이 번갈아 보이는 날씨예요.' },
        3: { title: '흐림', description: '구름층이 두껍게 깔려 있어요.' },
        45: { title: '안개', description: '시야가 뿌옇고 공기가 축축해요.' },
        48: { title: '짙은 안개', description: '짙은 안개로 시야가 제한돼요.' },
        51: { title: '이슬비', description: '가늘고 약한 비가 이어지고 있어요.' },
        53: { title: '가벼운 비', description: '우산이 있으면 편안한 정도의 비예요.' },
        55: { title: '비', description: '비가 비교적 또렷하게 내리고 있어요.' },
        56: { title: '어는 이슬비', description: '노면이 미끄러울 수 있어요.' },
        57: { title: '강한 어는 이슬비', description: '빙판 가능성이 있어 주의가 필요해요.' },
        61: { title: '약한 비', description: '가볍게 젖을 정도의 비예요.' },
        63: { title: '보통 비', description: '우산이 꼭 필요한 비예요.' },
        65: { title: '강한 비', description: '빗줄기가 굵고 선명해요.' },
        66: { title: '약한 진눈깨비', description: '비와 눈이 함께 섞여 내려요.' },
        67: { title: '강한 진눈깨비', description: '차갑고 거센 진눈깨비예요.' },
        71: { title: '약한 눈', description: '눈발이 가볍게 흩날리고 있어요.' },
        73: { title: '눈', description: '눈이 꾸준히 내리고 있어요.' },
        75: { title: '강한 눈', description: '짧은 시간에도 많이 쌓일 수 있어요.' },
        77: { title: '싸락눈', description: '작은 얼음 알갱이 형태의 눈이에요.' },
        80: { title: '소나기', description: '짧고 빠르게 비가 지나가고 있어요.' },
        81: { title: '강한 소나기', description: '순간적으로 비가 세게 쏟아져요.' },
        82: { title: '폭우성 소나기', description: '짧지만 강도가 높은 비예요.' },
        85: { title: '눈 소나기', description: '짧게 눈이 몰아치듯 내려요.' },
        86: { title: '강한 눈 소나기', description: '강한 눈발이 갑자기 지나가고 있어요.' },
        95: { title: '뇌우', description: '천둥 번개를 동반한 날씨예요.' },
        96: { title: '우박 가능 뇌우', description: '천둥과 함께 우박 가능성이 있어요.' },
        99: { title: '강한 우박성 뇌우', description: '매우 거친 날씨라 주의가 필요해요.' }
    };
    const setWeatherStatus = (message, state = 'idle') => {
        if (!weatherStatus) {
            return;
        }

        weatherStatus.dataset.state = state;
        weatherStatus.textContent = message;
    };
    const setShutdownSchedulerStatus = (message, state = 'idle') => {
        if (!shutdownSchedulerStatus) {
            return;
        }

        shutdownSchedulerStatus.dataset.state = state;
        shutdownSchedulerStatus.textContent = message;
    };
    const formatDegrees = (value) => `${Math.round(value)}°`;
    const formatWind = (value) => `${Math.round(value)} km/h`;
    const formatHumidity = (value) => `${Math.round(value)}%`;
    const formatUpdatedTime = (date = new Date()) =>
        new Intl.DateTimeFormat('ko-KR', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    const getWeatherSummary = (weatherCode, isDay) => {
        const fallback = isDay
            ? { title: '오늘 날씨', description: '현재 위치의 날씨 정보를 확인했어요.' }
            : { title: '밤 날씨', description: '현재 위치 기준의 야간 날씨예요.' };
        return WEATHER_CODE_MAP[weatherCode] || fallback;
    };
    const renderWeather = (payload) => {
        const summary = getWeatherSummary(payload.current.weather_code, payload.current.is_day);
        if (weatherLocation) {
            weatherLocation.textContent = payload.locationLabel;
        }
        if (weatherUpdated) {
            weatherUpdated.textContent = `${payload.locationSource} 기준 ${formatUpdatedTime(new Date(payload.fetchedAt))} 업데이트`;
        }
        if (weatherPill) {
            weatherPill.textContent = payload.current.is_day ? 'DAY' : 'NIGHT';
        }
        if (weatherCondition) {
            weatherCondition.textContent = summary.title;
        }
        if (weatherDescription) {
            weatherDescription.textContent = summary.description;
        }
        if (weatherTemperature) {
            weatherTemperature.textContent = formatDegrees(payload.current.temperature_2m);
        }
        if (weatherFeelsLike) {
            weatherFeelsLike.textContent = formatDegrees(payload.current.apparent_temperature);
        }
        if (weatherWind) {
            weatherWind.textContent = formatWind(payload.current.wind_speed_10m);
        }
        if (weatherHumidity) {
            weatherHumidity.textContent = formatHumidity(payload.current.relative_humidity_2m);
        }

        setWeatherStatus('', 'idle');
    };
    const scheduleWidgetPositionSync = () => {
        if (widgetSyncFrame) {
            return;
        }

        widgetSyncFrame = window.requestAnimationFrame(() => {
            widgetSyncFrame = 0;

            if (isWeatherWidgetOpen) {
                syncWeatherWidgetPosition();
            }
            if (isQuickWidgetOpen) {
                syncQuickWidgetPosition();
            }
            if (isShutdownSchedulerOpen) {
                syncShutdownSchedulerPosition();
            }
        });
    };
    const getBrowserCoordinates = async () => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                () => {
                    resolve(null);
                },
                {
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 10 * 60 * 1000
                }
            );
        });
    };
    const reverseGeocode = async (latitude, longitude, fallbackLabel) => {
        try {
            const label = await window.zenLauncher.reverseGeocode(latitude, longitude);
            if (!label) {
                return fallbackLabel;
            }

            return label;
        } catch (_error) {
            return fallbackLabel;
        }
    };
    const loadWeatherData = async ({ force = false } = {}) => {
        const isCacheValid = weatherCache && Date.now() - weatherCache.fetchedAt < WEATHER_CACHE_DURATION;
        if (!force && isCacheValid) {
            renderWeather(weatherCache);
            return weatherCache;
        }

        if (weatherFetchPromise) {
            return weatherFetchPromise;
        }

        setWeatherStatus('현재 위치와 날씨를 불러오는 중입니다.', 'loading');
        weatherFetchPromise = (async () => {
            try {
                const browserCoordinates = await getBrowserCoordinates();
                const location = await window.zenLauncher.resolveLocation(browserCoordinates);
                const locationLabel = await reverseGeocode(
                    location.latitude,
                    location.longitude,
                    location.locationLabel || '현재 위치'
                );
                const currentWeather = await window.zenLauncher.fetchWeather(location.latitude, location.longitude);

                weatherCache = {
                    current: currentWeather,
                    fetchedAt: Date.now(),
                    locationLabel,
                    locationSource: location.locationSource
                };
                renderWeather(weatherCache);
                return weatherCache;
            } catch (error) {
                setWeatherStatus(error.message || '날씨 정보를 불러오지 못했습니다.', 'error');
                return null;
            } finally {
                weatherFetchPromise = null;
            }
        })();

        return weatherFetchPromise;
    };
    const openWeatherWidget = async () => {
        if (!weatherWidget || !weatherToggleButton) {
            return;
        }

        closeShutdownScheduler();
        closeQuickWidget();
        isWeatherWidgetOpen = true;
        weatherWidget.classList.add('open');
        weatherToggleButton.setAttribute('aria-label', '날씨 위젯 닫기');
        weatherToggleButton.setAttribute('aria-expanded', 'true');
        scheduleWidgetPositionSync();
        const weatherData = await loadWeatherData();
        scheduleWidgetPositionSync();
        if (!weatherData) {
            if (weatherLocation) {
                weatherLocation.textContent = '위치를 확인할 수 없음';
            }
            if (weatherUpdated) {
                weatherUpdated.textContent = '네트워크 또는 위치 권한을 확인해주세요.';
            }
            return;
        }
    };
    const closeWeatherWidget = () => {
        if (!weatherWidget || !weatherToggleButton) {
            return;
        }

        isWeatherWidgetOpen = false;
        weatherWidget.classList.remove('open');
        weatherToggleButton.setAttribute('aria-label', '날씨 위젯 열기');
        weatherToggleButton.setAttribute('aria-expanded', 'false');
    };
    const syncWeatherWidgetArrow = () => {
        if (!weatherWidget || !weatherToggleButton) {
            return;
        }

        const widgetRect = weatherWidget.getBoundingClientRect();
        const toggleRect = weatherToggleButton.getBoundingClientRect();
        const arrowCenter = toggleRect.left + (toggleRect.width / 2) - widgetRect.left;
        const clampedArrowLeft = Math.min(
            Math.max(arrowCenter - 10, 28),
            widgetRect.width - 48
        );
        weatherWidget.style.setProperty('--weather-widget-arrow-left', `${Math.round(clampedArrowLeft)}px`);
    };
    const syncWeatherWidgetPosition = () => {
        if (!weatherWidget || !weatherToggleButton) {
            return;
        }

        const widgetRect = weatherWidget.getBoundingClientRect();
        const toggleRect = weatherToggleButton.getBoundingClientRect();
        const toggleCenter = toggleRect.left + (toggleRect.width / 2);
        const desiredLeft = toggleCenter - 54;
        const clampedLeft = Math.min(
            Math.max(desiredLeft, 24),
            window.innerWidth - 330
        );
        const desiredTop = toggleRect.top - widgetRect.height - 10;
        const clampedTop = Math.max(desiredTop, 24);
        weatherWidget.style.setProperty('--weather-widget-left', `${Math.round(clampedLeft)}px`);
        weatherWidget.style.setProperty('--weather-widget-top', `${Math.round(clampedTop)}px`);
        syncWeatherWidgetArrow();
    };
    const syncQuickWidgetPosition = () => {
        if (!quickWidget || !quickToggleButton) {
            return;
        }

        const widgetRect = quickWidget.getBoundingClientRect();
        const toggleRect = quickToggleButton.getBoundingClientRect();
        const desiredTop = toggleRect.top - widgetRect.height - 10;
        const clampedTop = Math.max(desiredTop, 24);
        quickWidget.style.top = `${Math.round(clampedTop)}px`;
        syncQuickWidgetArrow();
    };
    const syncQuickWidgetArrow = () => {
        if (!quickWidget || !quickToggleButton) {
            return;
        }

        const widgetRect = quickWidget.getBoundingClientRect();
        const toggleRect = quickToggleButton.getBoundingClientRect();
        const arrowCenter = toggleRect.left + (toggleRect.width / 2) - widgetRect.left;
        const clampedArrowLeft = Math.min(
            Math.max(arrowCenter - 10, 28),
            widgetRect.width - 48
        );
        quickWidget.style.setProperty('--quick-widget-arrow-left', `${Math.round(clampedArrowLeft)}px`);
    };
    const openQuickWidget = () => {
        if (!quickWidget || !quickToggleButton) {
            return;
        }

        closeShutdownScheduler();
        closeWeatherWidget();
        isQuickWidgetOpen = true;
        quickWidget.classList.add('open');
        quickToggleButton.setAttribute('aria-label', '빠른 도구 위젯 닫기');
        quickToggleButton.setAttribute('aria-expanded', 'true');
        scheduleWidgetPositionSync();
    };
    const closeQuickWidget = () => {
        if (!quickWidget || !quickToggleButton) {
            return;
        }

        isQuickWidgetOpen = false;
        quickWidget.classList.remove('open');
        quickToggleButton.setAttribute('aria-label', '빠른 도구 위젯 열기');
        quickToggleButton.setAttribute('aria-expanded', 'false');
    };
    const toggleWeatherWidget = async () => {
        if (isWeatherWidgetOpen) {
            closeWeatherWidget();
            return;
        }

        await openWeatherWidget();
    };
    const toggleQuickWidget = () => {
        if (isQuickWidgetOpen) {
            closeQuickWidget();
            return;
        }

        openQuickWidget();
    };
    const getScheduledShutdownMinutes = () => {
        if (!shutdownMinutesInput) {
            return 60;
        }

        const minutes = Number.parseInt(shutdownMinutesInput.value, 10);
        return minutes;
    };
    const closeShutdownScheduler = () => {
        if (!shutdownScheduler || !scheduleShutdownButton) {
            return;
        }

        isShutdownSchedulerOpen = false;
        shutdownScheduler.classList.remove('open');
        scheduleShutdownButton.setAttribute('aria-label', '예약 종료 위젯 열기');
        scheduleShutdownButton.setAttribute('aria-expanded', 'false');
    };
    const syncShutdownSchedulerArrow = () => {
        if (!shutdownScheduler || !scheduleShutdownButton) {
            return;
        }

        const widgetRect = shutdownScheduler.getBoundingClientRect();
        const toggleRect = scheduleShutdownButton.getBoundingClientRect();
        const arrowCenter = toggleRect.left + (toggleRect.width / 2) - widgetRect.left;
        const clampedArrowLeft = Math.min(
            Math.max(arrowCenter - 10, 28),
            widgetRect.width - 48
        );
        shutdownScheduler.style.setProperty('--shutdown-widget-arrow-left', `${Math.round(clampedArrowLeft)}px`);
    };
    const syncShutdownSchedulerPosition = () => {
        if (!shutdownScheduler || !scheduleShutdownButton) {
            return;
        }

        const widgetRect = shutdownScheduler.getBoundingClientRect();
        const toggleRect = scheduleShutdownButton.getBoundingClientRect();
        const toggleCenter = toggleRect.left + (toggleRect.width / 2);
        const desiredLeft = toggleCenter - 54;
        const clampedLeft = Math.min(
            Math.max(desiredLeft, 24),
            window.innerWidth - 340
        );
        const desiredTop = toggleRect.top - widgetRect.height - 10;
        const clampedTop = Math.max(desiredTop, 24);
        shutdownScheduler.style.setProperty('--shutdown-widget-left', `${Math.round(clampedLeft)}px`);
        shutdownScheduler.style.setProperty('--shutdown-widget-top', `${Math.round(clampedTop)}px`);
        syncShutdownSchedulerArrow();
    };
    const openShutdownScheduler = () => {
        if (!shutdownScheduler || !scheduleShutdownButton) {
            return;
        }

        closeWeatherWidget();
        closeQuickWidget();
        isShutdownSchedulerOpen = true;
        shutdownScheduler.classList.add('open');
        scheduleShutdownButton.setAttribute('aria-label', '예약 종료 위젯 닫기');
        scheduleShutdownButton.setAttribute('aria-expanded', 'true');
        setShutdownSchedulerStatus('예약 종료 또는 예약 취소를 선택할 수 있습니다.', 'idle');
        scheduleWidgetPositionSync();
        requestAnimationFrame(() => {
            shutdownMinutesInput?.focus({ preventScroll: true });
            shutdownMinutesInput?.select();
        });
    };
    const toggleShutdownScheduler = () => {
        if (isShutdownSchedulerOpen) {
            closeShutdownScheduler();
            return;
        }

        openShutdownScheduler();
    };
    const isPointerInside = (element, event) => {
        if (!element || !event?.relatedTarget) {
            return false;
        }

        return element.contains(event.relatedTarget);
    };
    const updateSearchEngineDisplay = () => {
        if (!searchEngineLink) {
            return;
        }

        searchEngineLink.textContent = activeSearchEngine.label;
        searchEngineLink.href = activeSearchEngine.home;
    };
    const syncSearchEngineFromInput = () => {
        if (!searchInput) {
            return;
        }

        const matchedPrefix = searchInput.value.match(/^([gnyc])\s+(.*)$/is);
        if (!matchedPrefix) {
            return;
        }

        const [, prefix, keyword] = matchedPrefix;
        activeSearchEngine = SEARCH_ENGINES[prefix.toLowerCase()] || SEARCH_ENGINES.default;
        searchInput.value = keyword.replace(/^\s+/u, '');
        updateSearchEngineDisplay();
    };
    const focusSearchInput = () => {
        if (!searchInput) {
            return;
        }

        searchInput.focus({ preventScroll: true });
        searchInput.select();
    };

    const detachFocusListener = window.zenLauncher.onFocusSearch(focusSearchInput);

    document.addEventListener('keydown', async (event) => {
        if (event.ctrlKey && event.code === 'Space' && !event.repeat) {
            event.preventDefault();
            focusSearchInput();
            return;
        }

        if (event.key === 'Escape' && isWeatherWidgetOpen) {
            closeWeatherWidget();
        }
        if (event.key === 'Escape' && isQuickWidgetOpen) {
            closeQuickWidget();
        }
        if (event.key === 'Escape' && isShutdownSchedulerOpen) {
            closeShutdownScheduler();
        }

        if (event.key === 'F5' && isWeatherWidgetOpen) {
            event.preventDefault();
            await loadWeatherData({ force: true });
        }
    });

    window.addEventListener('resize', () => {
        scheduleWidgetPositionSync();
    });

    document.addEventListener('click', async (event) => {
        if (isWeatherWidgetOpen && weatherWidget && weatherToggleButton) {
            const clickedInsideWeatherWidget = weatherWidget.contains(event.target);
            const clickedWeatherToggleButton = weatherToggleButton.contains(event.target);
            if (!clickedInsideWeatherWidget && !clickedWeatherToggleButton) {
                closeWeatherWidget();
            }
        }

        if (isQuickWidgetOpen && quickWidget && quickToggleButton) {
            const clickedInsideQuickWidget = quickWidget.contains(event.target);
            const clickedQuickToggleButton = quickToggleButton.contains(event.target);
            if (!clickedInsideQuickWidget && !clickedQuickToggleButton) {
                closeQuickWidget();
            }
        }

        if (isShutdownSchedulerOpen && shutdownScheduler && scheduleShutdownButton) {
            const clickedInsideScheduler = shutdownScheduler.contains(event.target);
            const clickedSchedulerButton = scheduleShutdownButton.contains(event.target);
            if (!clickedInsideScheduler && !clickedSchedulerButton) {
                closeShutdownScheduler();
            }
        }

        const trigger = event.target.closest('.launcher, .launcher-basic');
        if (!trigger) {
            return;
        }

        try {
            const target = trigger.dataset.link || '';
            await window.zenLauncher.run(target);
        } catch (error) {
            await window.zenLauncher.showMessage({
                type: 'error',
                message: error.message || '??곸쓣 ?ㅽ뻾?섏? 紐삵뻽?듬땲??'
            });
        }
    });

    searchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        const keyword = searchInput.value.trim();
        if (!keyword) {
            return;
        }

        const url = activeSearchEngine.buildSearchUrl(keyword);

        try {
            await window.zenLauncher.openExternal(url);
        } catch (error) {
            await window.zenLauncher.showMessage({
                type: 'error',
                message: error.message || '寃???섏씠吏瑜??댁? 紐삵뻽?듬땲??'
            });
        }
    });

    searchInput?.addEventListener('input', () => {
        syncSearchEngineFromInput();
        updateSearchEngineDisplay();
    });

    weatherToggleButton?.addEventListener('click', async () => {
        await toggleWeatherWidget();
    });
    weatherToggleButton?.addEventListener('mouseenter', async () => {
        if (!isWeatherWidgetOpen) {
            await openWeatherWidget();
        }
    });
    weatherToggleButton?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(weatherWidget, event)) {
            closeWeatherWidget();
        }
    });
    quickToggleButton?.addEventListener('click', () => {
        toggleQuickWidget();
    });
    quickToggleButton?.addEventListener('mouseenter', () => {
        if (!isQuickWidgetOpen) {
            openQuickWidget();
        }
    });
    quickToggleButton?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(quickWidget, event)) {
            closeQuickWidget();
        }
    });
    weatherWidget?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(weatherToggleButton, event)) {
            closeWeatherWidget();
        }
    });
    quickWidget?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(quickToggleButton, event)) {
            closeQuickWidget();
        }
    });
    scheduleShutdownButton?.addEventListener('click', (event) => {
        event.preventDefault();
        toggleShutdownScheduler();
    });
    scheduleShutdownButton?.addEventListener('mouseenter', () => {
        if (!isShutdownSchedulerOpen) {
            openShutdownScheduler();
        }
    });
    scheduleShutdownButton?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(shutdownScheduler, event)) {
            closeShutdownScheduler();
        }
    });
    shutdownScheduler?.addEventListener('mouseleave', (event) => {
        if (!isPointerInside(scheduleShutdownButton, event)) {
            closeShutdownScheduler();
        }
    });
    shutdownPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!shutdownMinutesInput) {
                return;
            }

            shutdownMinutesInput.value = button.dataset.minutes || '60';
            shutdownMinutesInput.focus({ preventScroll: true });
            shutdownMinutesInput.select();
        });
    });
    shutdownScheduleApplyButton?.addEventListener('click', async () => {
        const minutes = getScheduledShutdownMinutes();
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
            setShutdownSchedulerStatus('예약 종료 시간은 1분부터 10080분까지 입력할 수 있습니다.', 'error');
            shutdownMinutesInput?.focus({ preventScroll: true });
            shutdownMinutesInput?.select();
            return;
        }

        try {
            await window.zenLauncher.run(`schedule-shutdown:${minutes}`);
            setShutdownSchedulerStatus(`${minutes}분 후 종료가 예약되었습니다.`, 'success');
        } catch (error) {
            setShutdownSchedulerStatus(error.message || '예약 종료를 설정하지 못했습니다.', 'error');
        }
    });
    shutdownCancelButton?.addEventListener('click', async () => {
        try {
            await window.zenLauncher.run('cancel-schedule-shutdown');
            setShutdownSchedulerStatus('예약 종료를 취소했습니다.', 'success');
        } catch (error) {
            setShutdownSchedulerStatus(error.message || '예약 종료를 취소하지 못했습니다.', 'error');
        }
    });
    shutdownSchedulerCloseButton?.addEventListener('click', () => {
        closeShutdownScheduler();
    });
    scheduleShutdownButton?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        toggleShutdownScheduler();
    });
    shutdownMinutesInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        await shutdownScheduleApplyButton?.click();
    });

    refreshButton?.addEventListener('click', async () => {
        await window.zenLauncher.reloadWindow();
    });

    updateSearchEngineDisplay();

    window.addEventListener('beforeunload', () => {
        if (widgetSyncFrame) {
            window.cancelAnimationFrame(widgetSyncFrame);
        }
        detachFocusListener();
    });
});

