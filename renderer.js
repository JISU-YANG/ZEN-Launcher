window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('input-search');
    const refreshButton = document.getElementById('btn-refresh');
    const scheduleShutdownButton = document.getElementById('btn-schedule-shutdown');
    const weatherToggleButton = document.getElementById('btn-weather-toggle');
    const quickToggleButton = document.getElementById('btn-quick-toggle');
    const weatherWidget = document.getElementById('weather-widget');
    const quickWidget = document.getElementById('quick-widget');
    const shutdownScheduler = document.getElementById('shutdown-scheduler');
    const editorElement = document.getElementById('editor');
    const editorWidgetTitle = document.getElementById('editor-widget-title');
    const editorWidgetCaption = document.getElementById('editor-widget-caption');
    const editorWidgetBody = document.getElementById('editor-widget-body');
    const shutdownMinutesInput = document.getElementById('shutdown-minutes');
    const shutdownHoursDisplay = document.getElementById('shutdown-hours-display');
    const shutdownMinutesDisplay = document.getElementById('shutdown-minutes-display');
    const shutdownSchedulerStatus = document.getElementById('shutdown-scheduler-status');
    const shutdownScheduleApplyButton = document.getElementById('btn-shutdown-schedule-apply');
    const shutdownCancelButton = document.getElementById('btn-shutdown-cancel');
    const shutdownPresetButtons = Array.from(document.querySelectorAll('.shutdown-preset-button'));
    const shutdownStepButtons = Array.from(document.querySelectorAll('.shutdown-step-button'));
    const weatherLocation = document.getElementById('weather-location');
    const weatherUpdated = document.getElementById('weather-updated');
    const weatherPill = document.getElementById('weather-pill');
    const weatherCondition = document.getElementById('weather-condition');
    const weatherDescription = document.getElementById('weather-description');
    const weatherOutfit = document.getElementById('weather-outfit');
    const weatherTemperature = document.getElementById('weather-temperature');
    const weatherFeelsLike = document.getElementById('weather-feels-like');
    const weatherHumidity = document.getElementById('weather-humidity');
    const weatherPrecipitation = document.getElementById('weather-precipitation');
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
    let activeExpandedPanel = '';
    let weatherCache = null;
    let weatherFetchPromise = null;
    let widgetSyncFrame = 0;
    let expandedPanelCloseTimer = 0;
    const widgetOrigins = new Map([
        [weatherWidget, { parent: weatherWidget?.parentNode || null, nextSibling: weatherWidget?.nextSibling || null }],
        [quickWidget, { parent: quickWidget?.parentNode || null, nextSibling: quickWidget?.nextSibling || null }],
        [shutdownScheduler, { parent: shutdownScheduler?.parentNode || null, nextSibling: shutdownScheduler?.nextSibling || null }]
    ]);
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
        const statusMessage = shutdownSchedulerStatus.querySelector('.shutdown-scheduler-status-message');
        if (statusMessage) {
            statusMessage.textContent = message;
            return;
        }
        shutdownSchedulerStatus.textContent = message;
    };
    const clampShutdownMinutes = (minutes) => {
        if (!Number.isFinite(minutes)) {
            return 60;
        }

        return Math.min(10080, Math.max(1, Math.round(minutes)));
    };
    const syncShutdownDisplays = () => {
        if (!shutdownMinutesInput) {
            return;
        }

        const totalMinutes = clampShutdownMinutes(Number.parseInt(shutdownMinutesInput.value, 10));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        shutdownMinutesInput.value = String(totalMinutes);

        if (shutdownHoursDisplay) {
            shutdownHoursDisplay.value = String(hours).padStart(2, '0');
        }
        if (shutdownMinutesDisplay) {
            shutdownMinutesDisplay.value = String(minutes).padStart(2, '0');
        }

        shutdownPresetButtons.forEach((button) => {
            button.classList.toggle('active', Number.parseInt(button.dataset.minutes || '0', 10) === totalMinutes);
        });
    };
    const syncShutdownMinutesFromDisplays = () => {
        if (!shutdownMinutesInput) {
            return;
        }

        const hours = Math.min(168, Math.max(0, Number.parseInt(shutdownHoursDisplay?.value || '0', 10) || 0));
        const minutes = Math.min(59, Math.max(0, Number.parseInt(shutdownMinutesDisplay?.value || '0', 10) || 0));
        shutdownMinutesInput.value = String(clampShutdownMinutes((hours * 60) + minutes));
        syncShutdownDisplays();
    };
    const formatDegrees = (value) => `${Math.round(value)}°`;
    const formatWind = (value) => `${Math.round(value)} km/h`;
    const formatHumidity = (value) => `${Math.round(value)}%`;
    const formatPrecipitation = (value) => `${Math.round(value || 0)}%`;
    const formatUpdatedTime = (date = new Date()) =>
        new Intl.DateTimeFormat('ko-KR', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    const getWeatherStyleRecommendation = (current) => {
        const apparentTemperature = Number.isFinite(current?.apparent_temperature)
            ? current.apparent_temperature
            : current?.temperature_2m;
        const windSpeed = Number.isFinite(current?.wind_speed_10m) ? current.wind_speed_10m : 0;
        const humidity = Number.isFinite(current?.relative_humidity_2m) ? current.relative_humidity_2m : 0;
        const precipitationProbability = Number.isFinite(current?.precipitation_probability) ? current.precipitation_probability : 0;
        const rainyWeather = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(current?.weather_code);

        let outfitMessage = '가볍게 나가기 좋은 날씨예요.';
        if (apparentTemperature >= 28) {
            outfitMessage = '반소매 하나로도 충분하지만 햇볕이 강하면 얇은 셔츠를 챙기면 좋아요.';
        } else if (apparentTemperature >= 23) {
            outfitMessage = '반소매나 얇은 셔츠 차림이 잘 어울리는 날씨예요.';
        } else if (apparentTemperature >= 20) {
            outfitMessage = '가디건을 가볍게 걸치기 좋은 날씨예요.';
        } else if (apparentTemperature >= 17) {
            outfitMessage = '셔츠나 얇은 니트 위에 가벼운 아우터를 더하면 편안해요.';
        } else if (apparentTemperature >= 12) {
            outfitMessage = '자켓이나 두께감 있는 가디건을 챙기면 잘 맞는 날씨예요.';
        } else if (apparentTemperature >= 8) {
            outfitMessage = '후드 집업이나 코트처럼 보온감 있는 겉옷이 어울려요.';
        } else if (apparentTemperature >= 3) {
            outfitMessage = '두꺼운 아우터와 긴 바지가 필요한 쌀쌀한 날씨예요.';
        } else {
            outfitMessage = '패딩이나 도톰한 코트처럼 보온성이 좋은 옷차림을 추천해요.';
        }

        const extraNotes = [];
        if (windSpeed >= 20) {
            extraNotes.push('바람이 있어 체감은 더 서늘할 수 있어요.');
        }
        if (humidity >= 80 && apparentTemperature >= 24) {
            extraNotes.push('습도가 높아 통풍이 잘 되는 옷이 더 편해요.');
        }
        if (rainyWeather || precipitationProbability >= 55) {
            extraNotes.push('우산을 챙겨두면 안심할 수 있어요.');
        } else if (precipitationProbability >= 30) {
            extraNotes.push('비 예보가 살짝 있어 접이식 우산이 있으면 좋아요.');
        }

        return [outfitMessage, ...extraNotes].join(' ');
    };
    const getWeatherSummary = (weatherCode, isDay) => {
        const fallback = isDay
            ? { title: '오늘 날씨', description: '현재 위치의 날씨 정보를 확인했어요.' }
            : { title: '밤 날씨', description: '현재 위치 기준의 야간 날씨예요.' };
        return WEATHER_CODE_MAP[weatherCode] || fallback;
    };
    const getWeatherVisual = (weatherCode, isDay) => {
        if ([95, 96, 99].includes(weatherCode)) {
            return 'storm';
        }
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
            return 'rain';
        }
        if ([2, 3, 45, 48].includes(weatherCode)) {
            return isDay ? 'cloudy' : 'cloudy-night';
        }
        return isDay ? 'clear-day' : 'clear-night';
    };
    const renderWeather = (payload) => {
        const summary = getWeatherSummary(payload.current.weather_code, payload.current.is_day);
        if (weatherWidget) {
            weatherWidget.dataset.visual = getWeatherVisual(payload.current.weather_code, payload.current.is_day);
        }
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
        if (weatherOutfit) {
            weatherOutfit.textContent = getWeatherStyleRecommendation(payload.current);
        }
        if (weatherTemperature) {
            weatherTemperature.textContent = formatDegrees(payload.current.temperature_2m);
        }
        if (weatherFeelsLike) {
            weatherFeelsLike.textContent = formatDegrees(payload.current.apparent_temperature);
        }
        if (weatherHumidity) {
            weatherHumidity.textContent = formatHumidity(payload.current.relative_humidity_2m);
        }
        if (weatherPrecipitation) {
            weatherPrecipitation.textContent = formatPrecipitation(payload.current.precipitation_probability);
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
    const setExpandedPanel = (panel, { title = '', caption = '' } = {}) => {
        if (!editorElement || !editorWidgetBody) {
            return;
        }

        if (expandedPanelCloseTimer) {
            window.clearTimeout(expandedPanelCloseTimer);
            expandedPanelCloseTimer = 0;
        }

        activeExpandedPanel = panel;
        if (panel) {
            editorElement.classList.remove('closing');
            editorElement.dataset.panel = panel;
            editorElement.classList.add('open');
        } else if (editorElement.dataset.panel !== 'settings') {
            delete editorElement.dataset.panel;
            editorElement.classList.remove('closing');
            editorElement.classList.remove('open');
        }

        if (editorWidgetTitle) {
            editorWidgetTitle.textContent = title;
        }
        if (editorWidgetCaption) {
            editorWidgetCaption.textContent = caption;
        }
    };
    const restoreWidgetToOrigin = (widget) => {
        const origin = widgetOrigins.get(widget);
        if (!widget || !origin?.parent) {
            return;
        }

        widget.classList.remove('embedded-widget');
        if (origin.nextSibling && origin.nextSibling.parentNode === origin.parent) {
            origin.parent.insertBefore(widget, origin.nextSibling);
            return;
        }

        origin.parent.appendChild(widget);
    };
    const mountWidgetInExpandedArea = (widget, panel, title, caption) => {
        if (!widget || !editorWidgetBody) {
            return;
        }

        restoreWidgetToOrigin(weatherWidget);
        restoreWidgetToOrigin(quickWidget);
        restoreWidgetToOrigin(shutdownScheduler);

        editorWidgetBody.replaceChildren(widget);
        widget.classList.add('embedded-widget');
        setExpandedPanel(panel, { title, caption });
    };
    const closeExpandedPanel = () => {
        if (!editorElement) {
            return;
        }

        const closingPanel = activeExpandedPanel;
        if (closingPanel && editorElement.dataset.panel === closingPanel) {
            editorElement.classList.add('closing');
            editorElement.classList.remove('open');
        }

        activeExpandedPanel = '';
        if (expandedPanelCloseTimer) {
            window.clearTimeout(expandedPanelCloseTimer);
        }

        expandedPanelCloseTimer = window.setTimeout(() => {
            if (editorElement.dataset.panel === closingPanel) {
                delete editorElement.dataset.panel;
            }
            editorElement.classList.remove('closing');
            restoreWidgetToOrigin(weatherWidget);
            restoreWidgetToOrigin(quickWidget);
            restoreWidgetToOrigin(shutdownScheduler);
            editorWidgetBody?.replaceChildren();
            expandedPanelCloseTimer = 0;
        }, 420);
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
        mountWidgetInExpandedArea(
            weatherWidget,
            'weather',
            'Weather',
            '현재 위치 기준 날씨와 체감 정보를 확장 영역에서 확인합니다.'
        );
        weatherToggleButton.setAttribute('aria-label', '날씨 위젯 닫기');
        weatherToggleButton.setAttribute('aria-expanded', 'true');
        const weatherData = await loadWeatherData();
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
        if (activeExpandedPanel === 'weather') {
            closeExpandedPanel();
        }
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
        mountWidgetInExpandedArea(
            quickWidget,
            'quick',
            'Quick Tools',
            '자주 쓰는 Windows 기본 도구를 확장 영역 안에서 바로 실행합니다.'
        );
        quickToggleButton.setAttribute('aria-label', '빠른 도구 위젯 닫기');
        quickToggleButton.setAttribute('aria-expanded', 'true');
    };
    const closeQuickWidget = () => {
        if (!quickWidget || !quickToggleButton) {
            return;
        }

        isQuickWidgetOpen = false;
        quickWidget.classList.remove('open');
        if (activeExpandedPanel === 'quick') {
            closeExpandedPanel();
        }
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
        return clampShutdownMinutes(minutes);
    };
    const closeShutdownScheduler = () => {
        if (!shutdownScheduler || !scheduleShutdownButton) {
            return;
        }

        isShutdownSchedulerOpen = false;
        shutdownScheduler.classList.remove('open');
        if (activeExpandedPanel === 'shutdown') {
            closeExpandedPanel();
        }
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
        mountWidgetInExpandedArea(
            shutdownScheduler,
            'shutdown',
            '예약 종료',
            '원하는 시간으로 종료를 예약하거나 예약을 즉시 취소할 수 있습니다.'
        );
        scheduleShutdownButton.setAttribute('aria-label', '예약 종료 위젯 닫기');
        scheduleShutdownButton.setAttribute('aria-expanded', 'true');
        setShutdownSchedulerStatus('예약 종료 또는 예약 취소를 선택할 수 있습니다.', 'idle');
        syncShutdownDisplays();
        requestAnimationFrame(() => {
            shutdownScheduleApplyButton?.focus({ preventScroll: true });
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
            if (trigger.closest('#quick-widget')) {
                closeQuickWidget();
            }
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
    quickToggleButton?.addEventListener('click', () => {
        toggleQuickWidget();
    });
    scheduleShutdownButton?.addEventListener('click', (event) => {
        event.preventDefault();
        toggleShutdownScheduler();
    });
    shutdownPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!shutdownMinutesInput) {
                return;
            }

            shutdownMinutesInput.value = button.dataset.minutes || '60';
            syncShutdownDisplays();
        });
    });
    shutdownStepButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!shutdownMinutesInput) {
                return;
            }

            const delta = Number.parseInt(button.dataset.adjust || '0', 10);
            const nextMinutes = getScheduledShutdownMinutes() + delta;
            shutdownMinutesInput.value = String(clampShutdownMinutes(nextMinutes));
            syncShutdownDisplays();
        });
    });
    [shutdownHoursDisplay, shutdownMinutesDisplay].forEach((input) => {
        input?.addEventListener('input', () => {
            syncShutdownMinutesFromDisplays();
        });
        input?.addEventListener('blur', () => {
            syncShutdownMinutesFromDisplays();
        });
    });
    shutdownScheduleApplyButton?.addEventListener('click', async () => {
        const minutes = getScheduledShutdownMinutes();
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
            setShutdownSchedulerStatus('예약 종료 시간은 1분부터 10080분까지 입력할 수 있습니다.', 'error');
            shutdownScheduleApplyButton?.focus({ preventScroll: true });
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
    syncShutdownDisplays();

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

