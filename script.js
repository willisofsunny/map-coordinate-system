/**
 * 地圖座標系統轉換工具主程序
 * 支持當前位置獲取、地址查詢和座標轉換
 */

class MapCoordinateSystem {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.setupKeyboardEvents();
        this.checkHTTPS();
        this.debugMode = true; // 啟用調試模式
        this.requestCount = 0; // 請求計數器，避免過於頻繁的請求
    }

    /**
     * 檢查HTTPS狀態
     */
    checkHTTPS() {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            console.warn('建議使用HTTPS協議以獲得最佳地理位置服務體驗');
        }
    }

    /**
     * 調試日誌
     */
    log(message, data = null) {
        if (this.debugMode) {
            console.log(`[MapCoordinateSystem] ${message}`, data || '');
        }
    }

    /**
     * 初始化DOM元素
     */
    initializeElements() {
        this.elements = {
            getCurrentLocationBtn: document.getElementById('getCurrentLocation'),
            searchAddressBtn: document.getElementById('searchAddress'),
            convertCoordinatesBtn: document.getElementById('convertCoordinates'),
            addressInput: document.getElementById('addressInput'),
            latInput: document.getElementById('latInput'),
            lngInput: document.getElementById('lngInput'),
            coordSystem: document.getElementById('coordSystem'),
            currentLocationResult: document.getElementById('currentLocationResult'),
            addressSearchResult: document.getElementById('addressSearchResult'),
            coordinateConvertResult: document.getElementById('coordinateConvertResult'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            errorModal: document.getElementById('errorModal'),
            errorMessage: document.getElementById('errorMessage'),
            closeModal: document.querySelector('.close')
        };
    }

    /**
     * 綁定事件監聽器
     */
    bindEvents() {
        this.elements.getCurrentLocationBtn.addEventListener('click', () => this.getCurrentLocation());
        this.elements.searchAddressBtn.addEventListener('click', () => this.searchAddress());
        this.elements.convertCoordinatesBtn.addEventListener('click', () => this.convertCoordinates());
        this.elements.closeModal.addEventListener('click', () => this.hideError());
        this.elements.errorModal.addEventListener('click', (e) => {
            if (e.target === this.elements.errorModal) {
                this.hideError();
            }
        });
    }

    /**
     * 設置鍵盤事件
     */
    setupKeyboardEvents() {
        // 地址輸入框回車搜索
        this.elements.addressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchAddress();
            }
        });

        // 座標輸入框回車轉換
        [this.elements.latInput, this.elements.lngInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.convertCoordinates();
                }
            });
        });

        // ESC鍵關閉錯誤模態框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideError();
            }
        });
    }

    /**
     * 顯示載入狀態
     */
    showLoading() {
        this.elements.loadingOverlay.classList.add('show');
    }

    /**
     * 隱藏載入狀態
     */
    hideLoading() {
        this.elements.loadingOverlay.classList.remove('show');
    }

    /**
     * 顯示錯誤信息
     * @param {string} message 錯誤信息
     */
    showError(message) {
        this.elements.errorMessage.innerHTML = message.replace(/\n/g, '<br>');
        this.elements.errorModal.classList.add('show');
    }

    /**
     * 隱藏錯誤信息
     */
    hideError() {
        this.elements.errorModal.classList.remove('show');
    }

    /**
     * 獲取當前位置
     */
    async getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showError('您的瀏覽器不支持地理位置服務\n\n請使用支持地理位置的現代瀏覽器（Chrome、Firefox、Safari、Edge）');
            return;
        }

        this.showLoading();
        this.elements.getCurrentLocationBtn.disabled = true;

        try {
            const position = await this.getPosition();
            const { latitude, longitude, accuracy } = position.coords;

            this.log('獲取到位置:', { latitude, longitude, accuracy });

            // 獲取地址信息
            const address = await this.reverseGeocode(latitude, longitude);

            // 進行座標轉換
            const bd09Coord = CoordinateConverter.wgs84ToBd09(longitude, latitude);

            // 顯示結果
            this.displayLocationResult({
                address: address || '無法獲取地址信息',
                wgs84: { lng: longitude, lat: latitude },
                bd09: bd09Coord,
                accuracy: accuracy || 0
            });

        } catch (error) {
            console.error('獲取位置失敗:', error);
            this.showError(this.getLocationErrorMessage(error));
        } finally {
            this.hideLoading();
            this.elements.getCurrentLocationBtn.disabled = false;
        }
    }

    /**
     * 獲取位置Promise封裝
     * @returns {Promise} 位置信息Promise
     */
    getPosition() {
        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 15000, // 增加超時時間
                maximumAge: 60000
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.log('地理位置獲取成功:', position);
                    resolve(position);
                },
                (error) => {
                    console.error('地理位置獲取失敗:', error);
                    reject(error);
                },
                options
            );
        });
    }

    /**
     * 逆地理編碼 - 根據座標獲取地址
     * @param {number} lat 緯度
     * @param {number} lng 經度
     * @returns {Promise<string>} 地址信息
     */
    async reverseGeocode(lat, lng) {
        const apis = [
            // API 1: OpenStreetMap Nominatim
            {
                name: 'OpenStreetMap',
                url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh-TW,zh,en&zoom=18&addressdetails=1`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0'
                }
            },
            // API 2: 備用 Nominatim 鏡像
            {
                name: 'Nominatim Mirror',
                url: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh,en&zoom=16`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0'
                }
            }
        ];

        for (const api of apis) {
            try {
                this.log(`嘗試使用 ${api.name} 進行逆地理編碼...`);
                
                const response = await fetch(api.url, {
                    method: 'GET',
                    headers: api.headers,
                    cache: 'default'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP錯誤: ${response.status}`);
                }

                const data = await response.json();
                this.log(`${api.name} 響應:`, data);
                
                if (data && data.display_name) {
                    return data.display_name;
                } else if (data && data.name) {
                    return data.name;
                }
            } catch (error) {
                console.error(`${api.name} 逆地理編碼失敗:`, error);
                continue;
            }
        }

        return null;
    }

    /**
     * 地址查詢
     */
    async searchAddress() {
        const address = this.elements.addressInput.value.trim();
        if (!address) {
            this.showError('請輸入地址');
            return;
        }

        // 防止過於頻繁的請求
        this.requestCount++;
        if (this.requestCount > 10) {
            this.showError('請求過於頻繁，請稍後再試\n\n建議：\n• 等待1-2分鐘後重試\n• 檢查輸入的地址是否正確\n• 嘗試使用更具體的地址');
            return;
        }

        this.showLoading();
        this.elements.searchAddressBtn.disabled = true;

        try {
            this.log('開始地址查詢:', address);
            
            // 先嘗試簡化版本的查詢
            let coordinates = await this.simpleGeocode(address);
            
            // 如果簡化版本失敗，嘗試完整版本
            if (!coordinates) {
                this.log('簡化版本失敗，嘗試完整版本...');
                coordinates = await this.geocodeAddress(address);
            }
            
            if (!coordinates) {
                this.showError(`無法找到地址"${address}"\n\n🔍 台灣地址建議格式：\n• 台北101\n• 新北市板橋區\n• 台中市西屯區文心路\n• 高雄市前金區中正四路\n• 台南火車站\n\n🌍 國際地址範例：\n• 北京天安門\n• 東京塔\n• New York Times Square\n• London Big Ben\n\n💡 輸入提示：\n• 台灣地址：從縣市開始，逐步縮小範圍\n• 如果詳細地址找不到，嘗試只輸入區域\n• 可以嘗試地標名稱\n• 避免過於詳細的門牌號碼`);
                return;
            }

            this.log('地址查詢成功:', coordinates);

            // 進行座標轉換
            const bd09Coord = CoordinateConverter.wgs84ToBd09(coordinates.lng, coordinates.lat);

            // 顯示結果
            this.displayAddressResult({
                address: coordinates.displayAddress || address,
                inputAddress: address,
                wgs84: coordinates,
                bd09: bd09Coord
            });

        } catch (error) {
            console.error('地址查詢失敗:', error);
            this.showError(`地址查詢失敗\n\n📱 診斷信息：\n• 錯誤類型：${error.name || '未知錯誤'}\n• 錯誤描述：${error.message || '請稍後重試'}\n\n🔧 解決方案：\n• 檢查網絡連接\n• 使用提供的服務器腳本 (python start-server.py)\n• 嘗試不同的地址格式\n• 確保瀏覽器支持現代JavaScript\n\n🆘 如果問題持續，請打開瀏覽器開發者工具查看詳細錯誤信息`);
        } finally {
            this.hideLoading();
            this.elements.searchAddressBtn.disabled = false;
        }
    }

    /**
     * 台灣地址格式化和清理
     * @param {string} address 原始地址
     * @returns {Array<string>} 格式化後的地址變體
     */
    formatTaiwanAddress(address) {
        const variants = [];
        
        // 原始地址
        variants.push(address);
        
        // 台灣地址清理和格式化
        let cleanAddress = address;
        
        // 移除可能影響查詢的字符
        cleanAddress = cleanAddress.replace(/[,，]/g, ' ');
        cleanAddress = cleanAddress.replace(/\s+/g, ' ').trim();
        
        // 台灣地址層級簡化版本
        if (address.includes('台灣') || address.includes('臺灣')) {
            // 移除"台灣"/"臺灣"前綴
            let withoutCountry = address.replace(/^(台灣|臺灣)(省)?/, '').trim();
            if (withoutCountry !== address) {
                variants.push(withoutCountry);
            }
        }
        
        // 台灣地址的逐步簡化
        const taiwanPatterns = [
            // 縣市 + 區 + 路段 + 巷弄 + 號
            /^(.+?[縣市])(.+?[區市鎮鄉])(.+?[路街道])(.+?段)?(.+?巷)?(.+?弄)?(.+?號)/,
            // 縣市 + 區 + 路段
            /^(.+?[縣市])(.+?[區市鎮鄉])(.+?[路街道])(.+?段)?/,
            // 縣市 + 區
            /^(.+?[縣市])(.+?[區市鎮鄉])/
        ];
        
        for (const pattern of taiwanPatterns) {
            const match = address.match(pattern);
            if (match) {
                // 完整匹配
                variants.push(match[0]);
                
                // 縣市 + 區域
                if (match[1] && match[2]) {
                    variants.push(match[1] + match[2]);
                }
                
                // 添加Taiwan前綴
                variants.push('Taiwan ' + match[0]);
                variants.push('台灣 ' + match[0]);
                
                break;
            }
        }
        
        // 如果包含新北市，添加特殊處理
        if (address.includes('新北市')) {
            const newTaipeiVariant = address.replace('新北市', 'New Taipei City');
            variants.push(newTaipeiVariant);
            variants.push('New Taipei, Taiwan ' + address.replace('新北市', ''));
        }
        
        // 添加英文縣市對照
        const cityMapping = {
            '台北市': 'Taipei',
            '臺北市': 'Taipei', 
            '新北市': 'New Taipei',
            '桃園市': 'Taoyuan',
            '台中市': 'Taichung',
            '臺中市': 'Taichung',
            '台南市': 'Tainan',
            '臺南市': 'Tainan',
            '高雄市': 'Kaohsiung',
            '基隆市': 'Keelung',
            '新竹市': 'Hsinchu',
            '嘉義市': 'Chiayi'
        };
        
        for (const [chinese, english] of Object.entries(cityMapping)) {
            if (address.includes(chinese)) {
                variants.push(address.replace(chinese, english + ', Taiwan'));
                variants.push(english + ', Taiwan');
            }
        }
        
        // 去重並返回
        return [...new Set(variants)];
    }

    /**
     * 簡化版地理編碼 - 使用最基本的API調用，針對台灣地址優化
     * @param {string} address 地址
     * @returns {Promise<Object>} 座標信息
     */
    async simpleGeocode(address) {
        try {
            this.log('開始簡化版地理編碼...');
            
            // 生成多個地址變體
            const addressVariants = this.formatTaiwanAddress(address);
            this.log('地址變體:', addressVariants);
            
            // 針對每個變體嘗試查詢
            for (let i = 0; i < addressVariants.length; i++) {
                const variant = addressVariants[i];
                
                try {
                    this.log(`嘗試地址變體 ${i + 1}/${addressVariants.length}: ${variant}`);
                    
                    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(variant)}&limit=3&countrycodes=tw&accept-language=zh-TW,zh,en`;
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'MapCoordinateSystem/1.0'
                        },
                        cache: 'default'
                    });

                    if (!response.ok) {
                        this.log(`變體 ${i + 1} HTTP錯誤: ${response.status}`);
                        continue;
                    }

                    const data = await response.json();
                    this.log(`變體 ${i + 1} 響應:`, data);

                    if (data && Array.isArray(data) && data.length > 0) {
                        const result = data[0];
                        if (result.lat && result.lon) {
                            this.log(`變體 ${i + 1} 查詢成功!`);
                            return {
                                lng: parseFloat(result.lon),
                                lat: parseFloat(result.lat),
                                displayAddress: result.display_name || variant
                            };
                        }
                    }
                    
                    // 添加短暫延遲避免過於頻繁請求
                    if (i < addressVariants.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                } catch (error) {
                    this.log(`變體 ${i + 1} 查詢失敗:`, error.message);
                    continue;
                }
            }

            return null;
        } catch (error) {
            this.log('簡化版地理編碼失敗:', error.message);
            return null;
        }
    }

    /**
     * 地理編碼 - 根據地址獲取座標，針對台灣地址優化
     * @param {string} address 地址
     * @returns {Promise<Object>} 座標信息
     */
    async geocodeAddress(address) {
        // 生成地址變體
        const addressVariants = this.formatTaiwanAddress(address);
        this.log('完整版地理編碼 - 地址變體:', addressVariants);
        
        // 針對台灣地址優化的多個地理編碼API服務
        const createApiConfigs = (searchAddress) => [
            // API 1: 台灣專用 - 限制台灣地區
            {
                name: 'Taiwan Specific',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=5&countrycodes=tw&accept-language=zh-TW,zh&addressdetails=1&extratags=1`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0',
                    'Accept': 'application/json'
                },
                parser: (data) => {
                    if (data && Array.isArray(data) && data.length > 0) {
                        // 優先選擇台灣的結果
                        for (const result of data) {
                            if (result.display_name && result.display_name.includes('台灣')) {
                                return {
                                    lng: parseFloat(result.lon),
                                    lat: parseFloat(result.lat),
                                    displayAddress: result.display_name
                                };
                            }
                        }
                        // 如果沒有明確標示台灣的，選第一個
                        const result = data[0];
                        return {
                            lng: parseFloat(result.lon),
                            lat: parseFloat(result.lat),
                            displayAddress: result.display_name
                        };
                    }
                    return null;
                }
            },
            // API 2: 亞洲地區優先
            {
                name: 'Asia Priority',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=3&countrycodes=tw,cn,hk,mo,jp,kr&accept-language=zh-TW,zh,en&addressdetails=1`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0',
                    'Accept': 'application/json'
                },
                parser: (data) => {
                    if (data && Array.isArray(data) && data.length > 0) {
                        const result = data[0];
                        return {
                            lng: parseFloat(result.lon),
                            lat: parseFloat(result.lat),
                            displayAddress: result.display_name
                        };
                    }
                    return null;
                }
            },
            // API 3: 結構化查詢
            {
                name: 'Structured Search',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&polygon_geojson=0&addressdetails=1&limit=2&accept-language=zh-TW,zh&dedupe=1`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0',
                    'Accept': 'application/json'
                },
                parser: (data) => {
                    if (data && Array.isArray(data) && data.length > 0) {
                        const result = data[0];
                        return {
                            lng: parseFloat(result.lon),
                            lat: parseFloat(result.lat),
                            displayAddress: result.display_name
                        };
                    }
                    return null;
                }
            },
            // API 4: 全球搜索作為最後備案
            {
                name: 'Global Fallback',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=3&accept-language=zh-TW,zh,en&addressdetails=1`,
                headers: {
                    'User-Agent': 'MapCoordinateSystem/1.0',
                    'Accept': 'application/json'
                },
                parser: (data) => {
                    if (data && Array.isArray(data) && data.length > 0) {
                        const result = data[0];
                        return {
                            lng: parseFloat(result.lon),
                            lat: parseFloat(result.lat),
                            displayAddress: result.display_name
                        };
                    }
                    return null;
                }
            }
        ];

        let lastError = null;
        let bestResult = null;

        // 嘗試每個地址變體
        for (let variantIndex = 0; variantIndex < addressVariants.length; variantIndex++) {
            const variant = addressVariants[variantIndex];
            this.log(`\n=== 嘗試地址變體 ${variantIndex + 1}/${addressVariants.length}: "${variant}" ===`);
            
            const apis = createApiConfigs(variant);
            
            // 對於每個變體，嘗試所有API
            for (let i = 0; i < apis.length; i++) {
                const api = apis[i];
                try {
                    this.log(`  ${api.name} (${i + 1}/${apis.length})`);
                    
                    // 添加延遲，避免過於頻繁的請求
                    if (i > 0 || variantIndex > 0) {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    }

                    const requestOptions = {
                        method: 'GET',
                        headers: api.headers,
                        cache: 'default',
                        redirect: 'follow'
                    };

                    this.log(`  請求URL: ${api.url}`);

                    const response = await fetch(api.url, requestOptions);
                    
                    this.log(`  ${api.name} 響應狀態: ${response.status} ${response.statusText}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP錯誤: ${response.status} ${response.statusText}`);
                    }

                    const contentType = response.headers.get('content-type');
                    this.log(`  Content-Type: ${contentType}`);

                    let data;
                    if (contentType && contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        const text = await response.text();
                        this.log(`  非JSON響應內容: ${text.substring(0, 200)}...`);
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            throw new Error('響應不是有效的JSON格式');
                        }
                    }

                    this.log(`  ${api.name} 響應數據:`, data);
                    
                    if (data && data.error) {
                        throw new Error(`API錯誤: ${data.error}`);
                    }

                    const result = api.parser(data);
                    if (result && result.lat && result.lng) {
                        this.log(`  ✅ ${api.name} 解析成功:`, result);
                        
                        // 如果是台灣專用API或結果包含台灣，立即返回
                        if (api.name === 'Taiwan Specific' || 
                            (result.displayAddress && result.displayAddress.includes('台灣'))) {
                            return result;
                        }
                        
                        // 否則保存為備選結果
                        if (!bestResult) {
                            bestResult = result;
                        }
                    }

                    this.log(`  ${api.name} 未找到有效結果`);

                } catch (error) {
                    lastError = error;
                    this.log(`  ❌ ${api.name} 地理編碼失敗:`, error.message);
                    continue;
                }
            }
            
            // 如果找到了最佳結果，可以提前返回
            if (bestResult && variantIndex >= 2) {
                this.log('提前返回最佳結果:', bestResult);
                return bestResult;
            }
        }

        // 如果有備選結果，返回它
        if (bestResult) {
            this.log('返回備選結果:', bestResult);
            return bestResult;
        }

        // 所有API都失敗了，拋出最後一個錯誤
        this.log('所有地理編碼嘗試都失敗了');
        if (lastError) {
            throw lastError;
        }

        return null;
    }

    /**
     * 座標轉換
     */
    convertCoordinates() {
        const lat = parseFloat(this.elements.latInput.value);
        const lng = parseFloat(this.elements.lngInput.value);
        const coordSystem = this.elements.coordSystem.value;

        // 驗證輸入
        if (isNaN(lat) || isNaN(lng)) {
            this.showError('請輸入有效的座標數值\n\n格式說明：\n• 緯度範圍：-90 到 90\n• 經度範圍：-180 到 180\n• 支持小數點');
            return;
        }

        if (!CoordinateConverter.isValidCoordinate(lng, lat)) {
            this.showError('座標範圍無效\n\n有效範圍：\n• 經度範圍：-180 到 180\n• 緯度範圍：-90 到 90\n\n請檢查輸入的數值是否正確');
            return;
        }

        let wgs84Coord, bd09Coord;

        if (coordSystem === 'wgs84') {
            wgs84Coord = { lng, lat };
            bd09Coord = CoordinateConverter.wgs84ToBd09(lng, lat);
        } else if (coordSystem === 'bd09') {
            bd09Coord = { lng, lat };
            wgs84Coord = CoordinateConverter.bd09ToWgs84(lng, lat);
        }

        // 顯示結果
        this.displayConvertResult({
            inputSystem: coordSystem,
            wgs84: wgs84Coord,
            bd09: bd09Coord
        });
    }

    /**
     * 顯示當前位置結果
     * @param {Object} data 位置數據
     */
    displayLocationResult(data) {
        const html = `
            <div class="result-item">
                <h3><i class="fas fa-map-marker-alt"></i> 當前位置信息</h3>
                <p><strong>地址：</strong>${data.address}</p>
                <p><strong>定位精度：</strong>約 ${Math.round(data.accuracy)} 米</p>
                
                <div class="coordinate-info">
                    <div class="coord-item">
                        <h4><i class="fas fa-globe"></i> WGS84座標 (Google座標)</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.wgs84.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.wgs84.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lat, 'lat')}</p>
                    </div>
                    
                    <div class="coord-item">
                        <h4><i class="fas fa-map"></i> BD09座標</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.bd09.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.bd09.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lat, 'lat')}</p>
                    </div>
                </div>
            </div>
        `;

        this.elements.currentLocationResult.innerHTML = html;
        this.elements.currentLocationResult.classList.add('show');
    }

    /**
     * 顯示地址搜索結果
     * @param {Object} data 搜索數據
     */
    displayAddressResult(data) {
        const html = `
            <div class="result-item">
                <h3><i class="fas fa-search-location"></i> 地址查詢結果</h3>
                <p><strong>查詢地址：</strong>${data.inputAddress}</p>
                <p><strong>找到地址：</strong>${data.address}</p>
                
                <div class="coordinate-info">
                    <div class="coord-item">
                        <h4><i class="fas fa-globe"></i> WGS84座標 (Google座標)</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.wgs84.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.wgs84.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lat, 'lat')}</p>
                    </div>
                    
                    <div class="coord-item">
                        <h4><i class="fas fa-map"></i> BD09座標</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.bd09.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.bd09.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lat, 'lat')}</p>
                    </div>
                </div>
            </div>
        `;

        this.elements.addressSearchResult.innerHTML = html;
        this.elements.addressSearchResult.classList.add('show');
    }

    /**
     * 顯示座標轉換結果
     * @param {Object} data 轉換數據
     */
    displayConvertResult(data) {
        const inputSystemName = data.inputSystem === 'wgs84' ? 'WGS84 (Google座標)' : 'BD09座標';
        
        const html = `
            <div class="result-item">
                <h3><i class="fas fa-exchange-alt"></i> 座標轉換結果</h3>
                <p><strong>輸入座標系統：</strong>${inputSystemName}</p>
                
                <div class="coordinate-info">
                    <div class="coord-item">
                        <h4><i class="fas fa-globe"></i> WGS84座標 (Google座標)</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.wgs84.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.wgs84.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.wgs84.lat, 'lat')}</p>
                    </div>
                    
                    <div class="coord-item">
                        <h4><i class="fas fa-map"></i> BD09座標</h4>
                        <p>經度：${CoordinateConverter.formatCoordinate(data.bd09.lng)}</p>
                        <p>緯度：${CoordinateConverter.formatCoordinate(data.bd09.lat)}</p>
                        <p class="small">度分秒：${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lng, 'lng')}, ${CoordinateConverter.toDegreeMinuteSecond(data.bd09.lat, 'lat')}</p>
                    </div>
                </div>
                
                <div class="coord-item" style="margin-top: 15px;">
                    <h4><i class="fas fa-info-circle"></i> 轉換精度信息</h4>
                    <p class="small">座標轉換精度通常在1-10米範圍內，具體精度取決於所在地區。</p>
                </div>
            </div>
        `;

        this.elements.coordinateConvertResult.innerHTML = html;
        this.elements.coordinateConvertResult.classList.add('show');
    }

    /**
     * 獲取位置錯誤信息
     * @param {Object} error 錯誤對象
     * @returns {string} 錯誤信息
     */
    getLocationErrorMessage(error) {
        let baseMessage = '';
        let suggestions = '\n\n解決建議：';
        
        switch (error.code) {
            case error.PERMISSION_DENIED:
                baseMessage = '用戶拒絕了地理位置請求';
                suggestions += '\n• 點擊瀏覽器地址欄的位置圖標允許訪問\n• 檢查瀏覽器設置中的位置權限\n• 嘗試重新加載頁面';
                break;
            case error.POSITION_UNAVAILABLE:
                baseMessage = '無法獲取位置信息';
                suggestions += '\n• 檢查網絡連接是否正常\n• 確保GPS或定位服務已開啟\n• 嘗試在室外或靠近窗戶的位置';
                break;
            case error.TIMEOUT:
                baseMessage = '獲取位置信息超時';
                suggestions += '\n• 檢查網絡連接速度\n• 嘗試重新點擊獲取位置\n• 在信號較好的地方重試';
                break;
            default:
                baseMessage = '獲取位置時發生未知錯誤';
                suggestions += '\n• 嘗試重新加載頁面\n• 使用其他瀏覽器\n• 檢查瀏覽器是否為最新版本';
        }
        
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            suggestions += '\n• 建議使用HTTPS協議訪問此頁面';
        }
        
        return baseMessage + suggestions;
    }
}

// 頁面加載完成後初始化應用
document.addEventListener('DOMContentLoaded', () => {
    new MapCoordinateSystem();

    // 添加版權信息
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    地圖座標系統轉換工具                         ║
║                                                              ║
║ 支持功能：                                                    ║
║ • 獲取當前位置並轉換座標                                      ║
║ • 地址查詢並獲取座標                                          ║
║ • WGS84 (Google座標) 與 BD09座標 互轉                        ║
║                                                              ║
║ 技術特性：                                                    ║
║ • 純前端實現，無需後端服務                                    ║
║ • 響應式設計，支持行動裝置                                    ║
║ • 高精度座標轉換算法                                          ║
║                                                              ║
║ 測試工具：打開 test-geocoding.html 進行地址查詢測試          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// 添加一些實用的工具函數到全局作用域
window.MapUtils = {
    /**
     * 複製座標到剪貼板
     * @param {string} text 要複製的文本
     */
    copyToClipboard: async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            console.log('座標已複製到剪貼板:', text);
        } catch (err) {
            console.error('複製失敗:', err);
        }
    },

    /**
     * 格式化距離顯示
     * @param {number} distance 距離（米）
     * @returns {string} 格式化的距離字符串
     */
    formatDistance: function(distance) {
        if (distance < 1000) {
            return `${Math.round(distance)} 米`;
        } else {
            return `${(distance / 1000).toFixed(2)} 公里`;
        }
    }
}; 