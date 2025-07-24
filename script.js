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
            
            // 預處理地址，獲取類型信息
            const addressPreprocessing = this.preprocessCommonAddressPatterns(address);
            this.log('地址預處理結果:', addressPreprocessing);
            
            // 先嘗試簡化版本的查詢
            let coordinates = await this.simpleGeocode(address);
            
            // 如果簡化版本失敗，嘗試完整版本
            if (!coordinates) {
                this.log('簡化版本失敗，嘗試完整版本...');
                coordinates = await this.geocodeAddress(address);
            }
            
            // 將地址類型信息添加到坐標結果中
            if (coordinates && addressPreprocessing.type !== 'unknown') {
                coordinates.addressType = addressPreprocessing.type;
                coordinates.addressTypeConfidence = addressPreprocessing.confidence;
            }
            
            if (!coordinates) {
                const analysis = this.parseDetailedTaiwanAddress(address);
                let customSuggestions = '';
                
                if (analysis.isDetailed) {
                    customSuggestions = `\n\n🎯 針對您輸入地址的建議：\n`;
                    
                    if (analysis.roadLevel) {
                        customSuggestions += `• 嘗試：${analysis.roadLevel}\n`;
                    }
                    if (analysis.districtLevel) {
                        customSuggestions += `• 嘗試：${analysis.districtLevel}\n`;
                    }
                    if (analysis.cityLevel) {
                        customSuggestions += `• 嘗試：${analysis.cityLevel}\n`;
                    }
                    
                    customSuggestions += `• 或搜索：${analysis.district || analysis.city} + 知名地標\n`;
                    
                    if (analysis.houseNumber) {
                        customSuggestions += `\n💡 詳細門牌號 "${analysis.houseNumber}" 可能未被地圖收錄`;
                    }
                    if (analysis.alley || analysis.lane) {
                        customSuggestions += `\n💡 小巷弄資料可能不完整，建議使用主要道路`;
                    }
                }
                
                this.showError(`無法找到地址"${address}"${customSuggestions}\n\n🎯 **智能地址建議**\n\n🏛️ **地標建築**：\n• 台北101、故宮、中正紀念堂\n• 總統府、國父紀念館、龍山寺\n• 九份、淡水、日月潭\n\n🚊 **交通樞紐**：\n• 台北車站、板橋車站、桃園機場\n• 忠孝復興、市政府站、松山機場\n• 台中高鐵、高雄車站\n\n🏫 **教育機構**：\n• 台大、師大、政大、清大、成大\n• 輔大、淡江、世新、建中、北一女\n\n🏥 **醫療機構**：\n• 台大醫院、榮總、長庚、馬偕\n• 亞東醫院、慈濟醫院\n\n🏢 **商業中心**：\n• 信義商圈、東區、西門町、公館\n• 師大夜市、士林夜市、新光三越\n\n📍 **標準地址格式**：\n• 新北市新店區北宜路二段\n• 台北市信義區信義路五段\n• 台中市西屯區文心路\n• 高雄市前金區中正四路\n\n📝 **簡寫支持**：\n• 忠孝 → 忠孝東路/忠孝西路\n• 中山 → 中山路/中山北路/中山南路\n• 北車 → 台北車站\n• 東區 → 忠孝東路商圈\n\n🌐 **英文地址**：\n• Taipei 101\n• Taiwan University\n• Taichung Station\n\n💡 **搜索策略**：\n• 從完整地址→主要道路→區域→地標\n• 詳細門牌號找不到時嘗試路段級\n• 使用知名建築物或地標名稱\n• 支持中英文混合輸入`);
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
     * 預處理常見地址模式 - 基於用戶常用輸入優化
     * @param {string} address 原始地址
     * @returns {Object} 預處理結果
     */
    preprocessCommonAddressPatterns(address) {
        const result = {
            mainAddress: address,
            variants: [],
            type: 'unknown',
            confidence: 0.5
        };
        
        const lowerAddress = address.toLowerCase();
        const cleanAddress = address.trim();
        
        // 1. 知名地標和建築物識別
        const landmarks = this.identifyLandmarks(cleanAddress);
        if (landmarks.found) {
            result.variants.push(...landmarks.variants);
            result.type = 'landmark';
            result.confidence = 0.9;
            this.log('🏛️ 識別為地標:', landmarks);
        }
        
        // 2. 交通樞紐識別（車站、捷運站）
        const transportation = this.identifyTransportationHubs(cleanAddress);
        if (transportation.found) {
            result.variants.push(...transportation.variants);
            result.type = 'transportation';
            result.confidence = 0.85;
            this.log('🚊 識別為交通樞紐:', transportation);
        }
        
        // 3. 教育機構識別
        const education = this.identifyEducationalInstitutions(cleanAddress);
        if (education.found) {
            result.variants.push(...education.variants);
            result.type = 'education';
            result.confidence = 0.8;
            this.log('🏫 識別為教育機構:', education);
        }
        
        // 4. 醫療機構識別
        const medical = this.identifyMedicalInstitutions(cleanAddress);
        if (medical.found) {
            result.variants.push(...medical.variants);
            result.type = 'medical';
            result.confidence = 0.8;
            this.log('🏥 識別為醫療機構:', medical);
        }
        
        // 5. 商業中心和購物中心識別
        const commercial = this.identifyCommercialCenters(cleanAddress);
        if (commercial.found) {
            result.variants.push(...commercial.variants);
            result.type = 'commercial';
            result.confidence = 0.75;
            this.log('🏢 識別為商業中心:', commercial);
        }
        
        // 6. 夜市和觀光景點識別
        const tourism = this.identifyTourismSpots(cleanAddress);
        if (tourism.found) {
            result.variants.push(...tourism.variants);
            result.type = 'tourism';
            result.confidence = 0.8;
            this.log('🎯 識別為觀光景點:', tourism);
        }
        
        // 7. 政府機關識別
        const government = this.identifyGovernmentOffices(cleanAddress);
        if (government.found) {
            result.variants.push(...government.variants);
            result.type = 'government';
            result.confidence = 0.8;
            this.log('🏛️ 識別為政府機關:', government);
        }
        
        // 8. 地址簡寫和別名處理
        const abbreviations = this.processAddressAbbreviations(cleanAddress);
        if (abbreviations.variants.length > 0) {
            result.variants.push(...abbreviations.variants);
            this.log('📝 處理地址簡寫:', abbreviations);
        }
        
        // 9. 拼音和英文混合地址處理
        const mixed = this.processMixedLanguageAddress(cleanAddress);
        if (mixed.variants.length > 0) {
            result.variants.push(...mixed.variants);
            this.log('🌐 處理混合語言地址:', mixed);
        }
        
        // 去重並限制數量
        result.variants = [...new Set(result.variants)].slice(0, 15);
        
        return result;
    }

    /**
     * 識別知名地標和建築物
     */
    identifyLandmarks(address) {
        const landmarks = {
            // 超知名地標
            '台北101': ['台北101', 'Taipei 101', '台北市信義區信義路五段7號', '信義區台北101'],
            '101': ['台北101', 'Taipei 101', '台北市信義區信義路五段7號'],
            '總統府': ['總統府', '台北市中正區重慶南路一段122號', '中正區總統府'],
            '中正紀念堂': ['中正紀念堂', '台北市中正區中山南路21號', '自由廣場'],
            '國父紀念館': ['國父紀念館', '台北市信義區仁愛路四段505號'],
            '故宮': ['國立故宮博物院', '台北市士林區至善路二段221號', '故宮博物院'],
            '西門町': ['西門町', '台北市萬華區西門町', '西門紅樓', '台北市萬華區'],
            '龍山寺': ['龍山寺', '台北市萬華區廣州街211號', '萬華龍山寺'],
            '九份': ['九份', '新北市瑞芳區九份', '九份老街'],
            '淡水': ['淡水', '新北市淡水區', '淡水老街', '淡水漁人碼頭'],
            '野柳': ['野柳', '新北市萬里區野柳里港東路167-1號', '野柳地質公園'],
            '日月潭': ['日月潭', '南投縣魚池鄉中山路599號'],
            '阿里山': ['阿里山', '嘉義縣阿里山鄉中正村59號'],
            '太魯閣': ['太魯閣國家公園', '花蓮縣秀林鄉富世村富世291號'],
            '墾丁': ['墾丁', '屏東縣恆春鎮墾丁路'],
            
            // 台北知名地點
            '台北車站': ['台北車站', '台北火車站', '台北市中正區北平西路3號', 'Taipei Main Station'],
            '信義區': ['台北市信義區', '信義商圈', '信義計畫區'],
            '東區': ['台北市大安區忠孝東路', '忠孝復興', '忠孝敦化'],
            '公館': ['台北市中正區羅斯福路', '公館商圈', '台大公館'],
            '師大': ['台北市大安區師大路', '師大夜市', '師範大學'],
            '永康街': ['台北市大安區永康街', '永康商圈'],
            '華山': ['華山文創園區', '台北市中正區八德路一段1號'],
            '松菸': ['松山文創園區', '台北市信義區光復南路133號'],
            
            // 新北知名地點
            '板橋': ['新北市板橋區', '板橋車站', '新北市政府'],
            '新莊': ['新北市新莊區', '新莊副都心'],
            '中和': ['新北市中和區', '中和環球購物中心'],
            '永和': ['新北市永和區', '永和豆漿'],
            '土城': ['新北市土城區', '土城工業區'],
            '三重': ['新北市三重區', '三重重新橋'],
            '蘆洲': ['新北市蘆洲區', '蘆洲湧蓮寺'],
            '新店': ['新北市新店區', '新店碧潭'],
            '汐止': ['新北市汐止區', '汐止火車站'],
            '林口': ['新北市林口區', '林口三井outlet'],
            '淡海': ['新北市淡水區淡海新市鎮', '淡海輕軌']
        };
        
        for (const [key, variants] of Object.entries(landmarks)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'landmark'
                };
            }
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別交通樞紐
     */
    identifyTransportationHubs(address) {
        const stations = {
            // 台鐵車站
            '台北車站': ['台北車站', '台北火車站', '台北市中正區北平西路3號'],
            '松山車站': ['松山車站', '台北市信義區松山路11號'],
            '萬華車站': ['萬華車站', '台北市萬華區康定路382號'],
            '板橋車站': ['板橋車站', '新北市板橋區縣民大道二段7號'],
            '樹林車站': ['樹林車站', '新北市樹林區鎮前街112號'],
            '桃園車站': ['桃園車站', '桃園市桃園區中正路1號'],
            '新竹車站': ['新竹車站', '新竹市東區中華路二段445號'],
            '台中車站': ['台中車站', '台中市中區台灣大道一段1號'],
            '台南車站': ['台南車站', '台南市東區北門路二段4號'],
            '高雄車站': ['高雄車站', '高雄市三民區建國二路318號'],
            
            // 捷運站（台北）
            '台北101/世貿': ['台北101/世貿站', '台北市信義區信義路五段'],
            '市政府': ['市政府站', '台北市信義區市府路'],
            '忠孝復興': ['忠孝復興站', '台北市大安區忠孝東路三段'],
            '忠孝敦化': ['忠孝敦化站', '台北市大安區忠孝東路四段'],
            '西門': ['西門站', '台北市萬華區中華路一段'],
            '中山': ['中山站', '台北市中山區南京西路'],
            '雙連': ['雙連站', '台北市大同區民生西路'],
            '劍潭': ['劍潭站', '台北市士林區中山北路五段'],
            '士林': ['士林站', '台北市士林區中正路'],
            '芝山': ['芝山站', '台北市士林區福國路'],
            '明德': ['明德站', '台北市北投區明德路'],
            '石牌': ['石牌站', '台北市北投區石牌路二段'],
            '唭哩岸': ['唭哩岸站', '台北市北投區唭哩岸'],
            '奇岩': ['奇岩站', '台北市北投區奇岩路'],
            '北投': ['北投站', '台北市北投區中和街'],
            '新北投': ['新北投站', '台北市北投區大業路'],
            
            // 高鐵站
            '台北高鐵': ['台北高鐵站', '台北市中正區北平西路3號'],
            '板橋高鐵': ['板橋高鐵站', '新北市板橋區縣民大道二段7號'],
            '桃園高鐵': ['桃園高鐵站', '桃園市中壢區高鐵北路一段6號'],
            '新竹高鐵': ['新竹高鐵站', '新竹縣竹北市高鐵七路6號'],
            '台中高鐵': ['台中高鐵站', '台中市烏日區站區二路8號'],
            '台南高鐵': ['台南高鐵站', '台南市歸仁區歸仁大道100號'],
            '左營高鐵': ['左營高鐵站', '高雄市左營區高鐵路107號'],
            
            // 機場
            '桃園機場': ['桃園國際機場', '桃園市大園區航站南路9號'],
            '松山機場': ['台北松山機場', '台北市松山區敦化北路340-9號'],
            '小港機場': ['高雄小港機場', '高雄市小港區中山四路2號']
        };
        
        // 檢查完全匹配
        for (const [key, variants] of Object.entries(stations)) {
            if (address.includes(key) || 
                address.includes(key.replace('車站', '站')) ||
                address.includes(key.replace('站', ''))) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'transportation'
                };
            }
        }
        
        // 檢查通用模式
        if (address.includes('車站') || address.includes('火車站') || 
            address.includes('捷運') || address.includes('高鐵') || 
            address.includes('機場') || address.includes('站')) {
            return {
                found: true,
                originalKey: address,
                variants: [address, address + ' 台灣', 'Taiwan ' + address],
                type: 'transportation'
            };
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別教育機構
     */
    identifyEducationalInstitutions(address) {
        const institutions = {
            // 知名大學
            '台大': ['國立台灣大學', '台北市大安區羅斯福路四段1號', '台灣大學'],
            '台灣大學': ['國立台灣大學', '台北市大安區羅斯福路四段1號'],
            '政大': ['國立政治大學', '台北市文山區指南路二段64號', '政治大學'],
            '師大': ['國立台灣師範大學', '台北市大安區和平東路一段162號', '師範大學'],
            '清大': ['國立清華大學', '新竹市東區光復路二段101號', '清華大學'],
            '交大': ['國立陽明交通大學', '新竹市東區大學路1001號', '交通大學'],
            '成大': ['國立成功大學', '台南市東區大學路1號', '成功大學'],
            '中山大學': ['國立中山大學', '高雄市鼓山區蓮海路70號'],
            '台科大': ['國立台灣科技大學', '台北市大安區基隆路四段43號'],
            '北科大': ['國立台北科技大學', '台北市大安區忠孝東路三段1號'],
            '世新': ['世新大學', '台北市文山區木柵路一段17巷1號'],
            '文化': ['中國文化大學', '台北市士林區華岡路55號'],
            '東吳': ['東吳大學', '台北市士林區臨溪路70號'],
            '輔大': ['輔仁大學', '新北市新莊區中正路510號'],
            '淡江': ['淡江大學', '新北市淡水區英專路151號'],
            
            // 知名高中
            '建中': ['台北市立建國高級中學', '台北市中正區南海路56號'],
            '北一女': ['台北市立第一女子高級中學', '台北市中正區重慶南路一段165號'],
            '師大附中': ['國立台灣師範大學附屬高級中學', '台北市大安區信義路三段143號'],
            '成功高中': ['台北市立成功高級中學', '台北市中正區濟南路一段71號']
        };
        
        for (const [key, variants] of Object.entries(institutions)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'education'
                };
            }
        }
        
        // 通用教育機構模式
        if (address.includes('大學') || address.includes('學校') || 
            address.includes('高中') || address.includes('國中') || 
            address.includes('小學') || address.includes('幼稚園')) {
            return {
                found: true,
                originalKey: address,
                variants: [address, address + ' 台灣', 'Taiwan ' + address],
                type: 'education'
            };
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別醫療機構
     */
    identifyMedicalInstitutions(address) {
        const hospitals = {
            '台大醫院': ['國立台灣大學醫學院附設醫院', '台北市中正區中山南路7號'],
            '榮總': ['台北榮民總醫院', '台北市北投區石牌路二段201號'],
            '長庚': ['長庚紀念醫院', '台北市松山區敦化北路199號'],
            '馬偕': ['馬偕紀念醫院', '台北市中山區中山北路二段92號'],
            '慈濟': ['佛教慈濟綜合醫院', '台北市信義區松德路289號'],
            '亞東': ['亞東紀念醫院', '新北市板橋區南雅南路二段21號'],
            '新光': ['新光吳火獅紀念醫院', '台北市士林區文昌路95號'],
            '國泰': ['國泰綜合醫院', '台北市大安區仁愛路四段280號']
        };
        
        for (const [key, variants] of Object.entries(hospitals)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'medical'
                };
            }
        }
        
        // 通用醫療機構模式
        if (address.includes('醫院') || address.includes('診所') || 
            address.includes('衛生所') || address.includes('健康中心')) {
            return {
                found: true,
                originalKey: address,
                variants: [address, address + ' 台灣', 'Taiwan ' + address],
                type: 'medical'
            };
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別商業中心
     */
    identifyCommercialCenters(address) {
        const centers = {
            '信義商圈': ['台北市信義區', '信義計畫區', '台北101'],
            '東區': ['台北市大安區忠孝東路', '忠孝復興', '忠孝敦化'],
            '西門町': ['台北市萬華區西門町', '西門紅樓'],
            '公館': ['台北市中正區羅斯福路', '公館商圈'],
            '師大夜市': ['台北市大安區師大路', '師大商圈'],
            '寧夏夜市': ['台北市大同區寧夏路', '寧夏觀光夜市'],
            '士林夜市': ['台北市士林區大東路', '士林觀光夜市'],
            '饒河夜市': ['台北市松山區饒河街', '饒河觀光夜市'],
            '華西街夜市': ['台北市萬華區華西街', '華西街觀光夜市'],
            '臨江街夜市': ['台北市大安區臨江街', '通化夜市'],
            
            // 百貨公司
            '新光三越': ['新光三越百貨', '台北市信義區松高路19號'],
            '遠百': ['遠東百貨', '台北市大安區忠孝東路四段45號'],
            '微風': ['微風廣場', '台北市松山區復興南路一段39號'],
            'SOGO': ['太平洋SOGO百貨', '台北市大安區忠孝東路四段45號'],
            '統一時代': ['統一時代百貨', '台北市信義區忠孝東路五段8號'],
            '京站': ['京站時尚廣場', '台北市大同區承德路一段1號'],
            '美麗華': ['美麗華百樂園', '台北市中山區敬業三路20號'],
            '大遠百': ['大遠百', '台北市中山區南京東路三段251號']
        };
        
        for (const [key, variants] of Object.entries(centers)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'commercial'
                };
            }
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別觀光景點
     */
    identifyTourismSpots(address) {
        const spots = {
            '夜市': [address, address + ' 台灣', 'Taiwan ' + address],
            '老街': [address, address + ' 台灣', 'Taiwan ' + address],
            '風景區': [address, address + ' 台灣', 'Taiwan ' + address],
            '國家公園': [address, address + ' 台灣', 'Taiwan ' + address],
            '博物館': [address, address + ' 台灣', 'Taiwan ' + address],
            '紀念館': [address, address + ' 台灣', 'Taiwan ' + address],
            '文化園區': [address, address + ' 台灣', 'Taiwan ' + address]
        };
        
        for (const key of Object.keys(spots)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: spots[key],
                    type: 'tourism'
                };
            }
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 識別政府機關
     */
    identifyGovernmentOffices(address) {
        const offices = {
            '總統府': ['總統府', '台北市中正區重慶南路一段122號'],
            '行政院': ['行政院', '台北市中正區忠孝東路一段1號'],
            '立法院': ['立法院', '台北市中正區中山南路1號'],
            '監察院': ['監察院', '台北市中正區忠孝東路一段2號'],
            '司法院': ['司法院', '台北市中正區重慶南路一段124號'],
            '台北市政府': ['台北市政府', '台北市信義區市府路1號'],
            '新北市政府': ['新北市政府', '新北市板橋區中山路一段161號']
        };
        
        for (const [key, variants] of Object.entries(offices)) {
            if (address.includes(key)) {
                return {
                    found: true,
                    originalKey: key,
                    variants: variants,
                    type: 'government'
                };
            }
        }
        
        // 通用政府機關模式
        if (address.includes('市政府') || address.includes('縣政府') || 
            address.includes('區公所') || address.includes('戶政事務所') ||
            address.includes('地政事務所') || address.includes('稅務局')) {
            return {
                found: true,
                originalKey: address,
                variants: [address, address + ' 台灣', 'Taiwan ' + address],
                type: 'government'
            };
        }
        
        return { found: false, variants: [] };
    }

    /**
     * 處理地址簡寫和別名
     */
    processAddressAbbreviations(address) {
        const abbreviations = {
            // 路名簡寫
            '中山': ['中山路', '中山北路', '中山南路', '中山東路', '中山西路'],
            '忠孝': ['忠孝路', '忠孝東路', '忠孝西路'],
            '仁愛': ['仁愛路', '仁愛東路', '仁愛西路'],
            '信義': ['信義路', '信義東路', '信義西路'],
            '和平': ['和平路', '和平東路', '和平西路'],
            '民生': ['民生路', '民生東路', '民生西路'],
            '民權': ['民權路', '民權東路', '民權西路'],
            '南京': ['南京路', '南京東路', '南京西路'],
            '復興': ['復興路', '復興北路', '復興南路'],
            '敦化': ['敦化路', '敦化北路', '敦化南路'],
            
            // 區域簡寫
            '北車': ['台北車站', '台北火車站'],
            '東區': ['忠孝東路', '大安區'],
            '西門': ['西門町', '西門站'],
            '公館': ['公館商圈', '台大公館'],
            '師大': ['師大路', '師大夜市'],
            
            // 縣市簡寫
            '北市': ['台北市'],
            '新北': ['新北市'],
            '桃市': ['桃園市'],
            '中市': ['台中市'],
            '南市': ['台南市'],
            '高市': ['高雄市']
        };
        
        const variants = [];
        
        for (const [abbrev, expansions] of Object.entries(abbreviations)) {
            if (address.includes(abbrev)) {
                for (const expansion of expansions) {
                    const newAddress = address.replace(abbrev, expansion);
                    if (newAddress !== address) {
                        variants.push(newAddress);
                    }
                }
            }
        }
        
        return { variants };
    }

    /**
     * 處理混合語言地址
     */
    processMixedLanguageAddress(address) {
        const variants = [];
        
        // 英文地名對照
        const englishMappings = {
            'taipei': '台北',
            'new taipei': '新北',
            'taoyuan': '桃園',
            'taichung': '台中',
            'tainan': '台南',
            'kaohsiung': '高雄',
            'hsinchu': '新竹',
            'keelung': '基隆',
            'taiwan': '台灣',
            'station': '車站',
            'hospital': '醫院',
            'university': '大學',
            'school': '學校',
            'road': '路',
            'street': '街',
            'avenue': '大道'
        };
        
        let processedAddress = address.toLowerCase();
        let hasEnglish = false;
        
        for (const [english, chinese] of Object.entries(englishMappings)) {
            if (processedAddress.includes(english)) {
                hasEnglish = true;
                processedAddress = processedAddress.replace(new RegExp(english, 'gi'), chinese);
            }
        }
        
        if (hasEnglish) {
            variants.push(processedAddress);
            variants.push(processedAddress + ' 台灣');
            variants.push('Taiwan ' + processedAddress);
        }
        
        return { variants };
    }

    /**
     * 台灣地址智能解析和格式化 - 增強版（基於常用地址模式優化）
     * @param {string} address 原始地址
     * @returns {Array<string>} 格式化後的地址變體（按優先級排序）
     */
    formatTaiwanAddress(address) {
        const variants = [];
        this.log('🔍 開始智能分析台灣地址:', address);
        
        // 0. 預處理：常見地址模式識別和優化
        const preprocessed = this.preprocessCommonAddressPatterns(address);
        this.log('📋 預處理結果:', preprocessed);
        
        // 添加預處理的地址變體
        variants.push(...preprocessed.variants);
        
        // 1. 原始地址（如果預處理沒有修改）
        if (!preprocessed.variants.includes(address)) {
            variants.push(address);
        }
        
        // 2. 詳細的台灣地址解析
        const addressAnalysis = this.parseDetailedTaiwanAddress(preprocessed.mainAddress || address);
        this.log('🏗️ 地址結構解析:', addressAnalysis);
        
        // 3. 基於解析結果生成多層級地址變體
        if (addressAnalysis.isDetailed) {
            // 完整地址 (原始)
            variants.push(address);
            
            // 移除門牌號的地址變體
            if (addressAnalysis.withoutHouseNumber) {
                variants.push(addressAnalysis.withoutHouseNumber);
            }
            
            // 移除巷弄的地址變體
            if (addressAnalysis.withoutAlley) {
                variants.push(addressAnalysis.withoutAlley);
            }
            
            // 只到路段的地址變體
            if (addressAnalysis.roadLevel) {
                variants.push(addressAnalysis.roadLevel);
                
                // 路段的英文變體
                if (addressAnalysis.roadLevelEnglish) {
                    variants.push(addressAnalysis.roadLevelEnglish);
                }
            }
            
            // 只到區的地址變體
            if (addressAnalysis.districtLevel) {
                variants.push(addressAnalysis.districtLevel);
                
                // 區的英文變體
                if (addressAnalysis.districtLevelEnglish) {
                    variants.push(addressAnalysis.districtLevelEnglish);
                }
            }
            
            // 只到縣市的地址變體
            if (addressAnalysis.cityLevel) {
                variants.push(addressAnalysis.cityLevel);
                
                // 縣市的英文變體
                if (addressAnalysis.cityLevelEnglish) {
                    variants.push(addressAnalysis.cityLevelEnglish);
                }
            }
        }
        
        // 4. 添加台灣前綴變體
        const taiwanPrefixes = ['Taiwan ', '台灣 ', 'Taiwan, '];
        for (const prefix of taiwanPrefixes) {
            variants.push(prefix + address);
            if (addressAnalysis.roadLevel) {
                variants.push(prefix + addressAnalysis.roadLevel);
            }
            if (addressAnalysis.districtLevel) {
                variants.push(prefix + addressAnalysis.districtLevel);
            }
        }
        
        // 5. 添加鄰近地址查詢（模糊匹配）
        const fuzzyVariants = this.generateFuzzyAddressVariants(addressAnalysis);
        variants.push(...fuzzyVariants);
        
        // 6. 去重並按優先級排序
        const uniqueVariants = [...new Set(variants)].filter(v => v && v.trim());
        
        this.log(`生成了 ${uniqueVariants.length} 個地址變體:`, uniqueVariants);
        return uniqueVariants;
    }

    /**
     * 詳細解析台灣地址結構
     * @param {string} address 地址
     * @returns {Object} 解析結果
     */
    parseDetailedTaiwanAddress(address) {
        const result = {
            isDetailed: false,
            original: address,
            city: null,
            district: null,
            road: null,
            section: null,
            alley: null,
            lane: null,
            houseNumber: null,
            withoutHouseNumber: null,
            withoutAlley: null,
            roadLevel: null,
            districtLevel: null,
            cityLevel: null,
            roadLevelEnglish: null,
            districtLevelEnglish: null,
            cityLevelEnglish: null
        };

        // 台灣地址的超詳細正則表達式
        const patterns = [
            // 完整地址格式：縣市 + 區 + 路 + 段 + 巷 + 弄 + 號
            /^((?:台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄|基隆|新竹|嘉義|苗栗|彰化|南投|雲林|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[縣市])\s*((?:[^縣市]+?)[區市鎮鄉])\s*((?:[^區市鎮鄉]+?)[路街道大道])\s*(?:([一二三四五六七八九十\d]+)段)?\s*(?:(\d+)巷)?\s*(?:(\d+)弄)?\s*(?:(\d+(?:-\d+)?(?:號|之\d+號?)?))?\s*$/,
            
            // 無段號格式：縣市 + 區 + 路 + 巷 + 弄 + 號
            /^((?:台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄|基隆|新竹|嘉義|苗栗|彰化|南投|雲林|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[縣市])\s*((?:[^縣市]+?)[區市鎮鄉])\s*((?:[^區市鎮鄉]+?)[路街道大道])\s*(?:(\d+)巷)?\s*(?:(\d+)弄)?\s*(?:(\d+(?:-\d+)?(?:號|之\d+號?)?))?\s*$/
        ];

        for (const pattern of patterns) {
            const match = address.match(pattern);
            if (match) {
                result.isDetailed = true;
                result.city = match[1];
                result.district = match[2];
                result.road = match[3];
                
                if (pattern.source.includes('段')) {
                    result.section = match[4];
                    result.alley = match[5];
                    result.lane = match[6];
                    result.houseNumber = match[7];
                } else {
                    result.alley = match[4];
                    result.lane = match[5];
                    result.houseNumber = match[6];
                }
                
                // 構建各層級地址
                result.cityLevel = result.city;
                result.districtLevel = result.city + result.district;
                
                let roadPart = result.city + result.district + result.road;
                if (result.section) {
                    roadPart += result.section + '段';
                }
                result.roadLevel = roadPart;
                
                // 構建無門牌號地址
                if (result.alley || result.lane) {
                    let withoutHouse = roadPart;
                    if (result.alley) withoutHouse += result.alley + '巷';
                    if (result.lane) withoutHouse += result.lane + '弄';
                    result.withoutHouseNumber = withoutHouse;
                }
                
                // 構建無巷弄地址
                result.withoutAlley = roadPart;
                
                // 英文變體
                result.cityLevelEnglish = this.translateCityToEnglish(result.city);
                result.districtLevelEnglish = this.translateDistrictToEnglish(result.city, result.district);
                result.roadLevelEnglish = this.translateToEnglish(result.roadLevel);
                
                break;
            }
        }

        return result;
    }

    /**
     * 縣市中英文對照
     */
    translateCityToEnglish(chineseCity) {
        const cityMapping = {
            '台北市': 'Taipei City',
            '臺北市': 'Taipei City',
            '新北市': 'New Taipei City',
            '桃園市': 'Taoyuan City',
            '台中市': 'Taichung City',
            '臺中市': 'Taichung City',
            '台南市': 'Tainan City',
            '臺南市': 'Tainan City',
            '高雄市': 'Kaohsiung City',
            '基隆市': 'Keelung City',
            '新竹市': 'Hsinchu City',
            '新竹縣': 'Hsinchu County',
            '嘉義市': 'Chiayi City',
            '嘉義縣': 'Chiayi County'
        };
        return cityMapping[chineseCity] ? cityMapping[chineseCity] + ', Taiwan' : null;
    }

    /**
     * 區域中英文對照
     */
    translateDistrictToEnglish(city, district) {
        const englishCity = this.translateCityToEnglish(city);
        if (!englishCity) return null;
        
        // 簡化：直接拼音化區名（實際應用中可以建立完整的對照表）
        const districtMapping = {
            '新店區': 'Xindian District',
            '板橋區': 'Banqiao District',
            '中和區': 'Zhonghe District',
            '永和區': 'Yonghe District',
            '信義區': 'Xinyi District',
            '大安區': 'Daan District',
            '中正區': 'Zhongzheng District',
            '西屯區': 'Xitun District',
            '北屯區': 'Beitun District',
            '前金區': 'Qianjin District'
        };
        
        const englishDistrict = districtMapping[district] || district;
        return englishDistrict + ', ' + englishCity;
    }

    /**
     * 簡單的中英文轉換
     */
    translateToEnglish(chineseAddress) {
        // 這裡可以添加更複雜的翻譯邏輯
        return chineseAddress.replace(/[路街道大道]/g, ' Road')
                           .replace(/段/g, ' Section')
                           .replace(/巷/g, ' Lane')
                           .replace(/弄/g, ' Alley') + ', Taiwan';
    }

    /**
     * 生成模糊地址變體（用於鄰近地址查詢）
     */
    generateFuzzyAddressVariants(addressAnalysis) {
        const variants = [];
        
        if (!addressAnalysis.isDetailed) return variants;
        
        // 如果有巷號，嘗試鄰近巷號
        if (addressAnalysis.alley) {
            const alleyNum = parseInt(addressAnalysis.alley);
            if (!isNaN(alleyNum)) {
                for (let offset of [-2, -1, 1, 2]) {
                    const nearbyAlley = alleyNum + offset;
                    if (nearbyAlley > 0) {
                        const nearbyAddress = addressAnalysis.roadLevel + nearbyAlley + '巷';
                        variants.push(nearbyAddress);
                    }
                }
            }
        }
        
        // 添加周邊道路的通用查詢
        if (addressAnalysis.roadLevel) {
            // 移除具體號碼，只保留道路級別
            variants.push(addressAnalysis.roadLevel + ' 附近');
            variants.push(addressAnalysis.roadLevel + ' 周邊');
        }
        
        return variants;
    }

    /**
     * 漸進式精度地理編碼 - 從詳細到粗略逐步查詢
     * @param {string} address 地址
     * @returns {Promise<Object>} 座標信息
     */
    async progressiveGeocode(address) {
        try {
            this.log('🔍 開始漸進式精度地理編碼...');
            
            // 生成地址變體（按精度排序）
            const addressVariants = this.formatTaiwanAddress(address);
            this.log('📍 地址變體（按精度排序）:', addressVariants);
            
            const allResults = [];
            let bestResult = null;
            
            // 針對每個變體進行查詢
            for (let i = 0; i < Math.min(addressVariants.length, 8); i++) {
                const variant = addressVariants[i];
                
                if (!variant || variant.trim() === '') continue;
                
                try {
                    this.log(`🎯 嘗試變體 ${i + 1}/${addressVariants.length}: "${variant}"`);
                    
                    const result = await this.queryAddressVariant(variant, i === 0);
                    
                    if (result) {
                        allResults.push({
                            ...result,
                            variant: variant,
                            precision: i // 精度等級 (0 = 最精確)
                        });
                        
                        this.log(`✅ 變體 ${i + 1} 查詢成功! 精度等級: ${i}`);
                        
                        // 如果是前3個變體（高精度）找到結果，可以立即返回
                        if (i < 3) {
                            return result;
                        }
                        
                        // 否則保存最佳結果繼續查詢
                        if (!bestResult || i < bestResult.precision) {
                            bestResult = result;
                        }
                    }
                    
                    // 漸進延遲策略
                    if (i < addressVariants.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 250 + i * 100));
                    }
                    
                } catch (error) {
                    this.log(`❌ 變體 ${i + 1} 查詢失敗:`, error.message);
                    continue;
                }
            }

            // 如果有找到任何結果，返回最佳結果
            if (bestResult) {
                this.log('📍 返回最佳查詢結果:', bestResult);
                return bestResult;
            }

            // 如果所有變體都失敗，提供建議
            if (allResults.length === 0) {
                this.log('⚠️ 所有地址變體查詢都失敗');
                return await this.provideTaiwanAddressSuggestions(address);
            }

            return null;
        } catch (error) {
            this.log('❌ 漸進式地理編碼失敗:', error.message);
            return null;
        }
    }

    /**
     * 查詢單個地址變體
     * @param {string} variant 地址變體
     * @param {boolean} isOriginal 是否為原始地址
     * @returns {Promise<Object>} 查詢結果
     */
    async queryAddressVariant(variant, isOriginal = false) {
        const apis = [
            // 台灣專用API (高精度)
            {
                name: 'Taiwan High Precision',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(variant)}&limit=5&countrycodes=tw&accept-language=zh-TW,zh&addressdetails=1&extratags=1&namedetails=1`,
                priority: 1
            },
            // 台灣地區API (中精度)
            {
                name: 'Taiwan Medium Precision',
                url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(variant)}&limit=3&countrycodes=tw&accept-language=zh-TW,zh,en&addressdetails=1`,
                priority: 2
            }
        ];

        for (const api of apis) {
            try {
                this.log(`  📡 嘗試 ${api.name}...`);
                
                const response = await fetch(api.url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'MapCoordinateSystem/1.0 (Taiwan Address Geocoder)',
                        'Accept': 'application/json',
                        'Accept-Language': 'zh-TW,zh,en'
                    },
                    cache: 'default'
                });

                if (!response.ok) {
                    this.log(`  ⚠️ ${api.name} HTTP錯誤: ${response.status}`);
                    continue;
                }

                const data = await response.json();
                this.log(`  📊 ${api.name} 響應 (${data.length} 結果):`, data);

                if (data && Array.isArray(data) && data.length > 0) {
                    // 選擇最佳結果
                    const bestMatch = this.selectBestMatch(data, variant);
                    if (bestMatch) {
                        return {
                            lng: parseFloat(bestMatch.lon),
                            lat: parseFloat(bestMatch.lat),
                            displayAddress: bestMatch.display_name || variant,
                            confidence: this.calculateConfidence(bestMatch, variant),
                            source: api.name
                        };
                    }
                }
                
            } catch (error) {
                this.log(`  ❌ ${api.name} 錯誤:`, error.message);
                continue;
            }
        }

        return null;
    }

    /**
     * 選擇最佳匹配結果
     */
    selectBestMatch(results, searchVariant) {
        if (!results || results.length === 0) return null;
        
        // 優先選擇包含台灣的結果
        const taiwanResults = results.filter(r => 
            r.display_name && r.display_name.includes('台灣')
        );
        
        if (taiwanResults.length > 0) {
            return taiwanResults[0];
        }
        
        // 其次選擇class為address或building的結果
        const addressResults = results.filter(r => 
            r.class === 'place' || r.class === 'building' || r.class === 'highway'
        );
        
        if (addressResults.length > 0) {
            return addressResults[0];
        }
        
        // 最後返回第一個結果
        return results[0];
    }

    /**
     * 計算結果置信度
     */
    calculateConfidence(result, searchVariant) {
        let confidence = 0.5; // 基礎置信度
        
        // 如果包含台灣，提高置信度
        if (result.display_name && result.display_name.includes('台灣')) {
            confidence += 0.3;
        }
        
        // 如果是建築物或地址，提高置信度
        if (result.class === 'building' || result.class === 'place') {
            confidence += 0.2;
        }
        
        // 如果有address details，提高置信度
        if (result.address) {
            confidence += 0.1;
        }
        
        return Math.min(confidence, 1.0);
    }

    /**
     * 提供台灣地址建議
     */
    async provideTaiwanAddressSuggestions(originalAddress) {
        this.log('🔧 生成台灣地址建議...');
        
        // 分析原始地址，提供改進建議
        const analysis = this.parseDetailedTaiwanAddress(originalAddress);
        
        if (analysis.isDetailed && analysis.roadLevel) {
            // 嘗試查詢道路級別的地址
            try {
                this.log(`💡 嘗試道路級別查詢: ${analysis.roadLevel}`);
                const roadResult = await this.queryAddressVariant(analysis.roadLevel);
                if (roadResult) {
                    roadResult.suggestion = true;
                    roadResult.originalAddress = originalAddress;
                    roadResult.suggestionLevel = '道路級別';
                    return roadResult;
                }
            } catch (error) {
                this.log('道路級別查詢失敗:', error.message);
            }
        }
        
        if (analysis.isDetailed && analysis.districtLevel) {
            // 嘗試查詢區級別的地址
            try {
                this.log(`💡 嘗試區級別查詢: ${analysis.districtLevel}`);
                const districtResult = await this.queryAddressVariant(analysis.districtLevel);
                if (districtResult) {
                    districtResult.suggestion = true;
                    districtResult.originalAddress = originalAddress;
                    districtResult.suggestionLevel = '區域級別';
                    return districtResult;
                }
            } catch (error) {
                this.log('區級別查詢失敗:', error.message);
            }
        }
        
        return null;
    }

    /**
     * 簡化版地理編碼 - 使用最基本的API調用，針對台灣地址優化
     * @param {string} address 地址
     * @returns {Promise<Object>} 座標信息
     */
    async simpleGeocode(address) {
        // 使用新的漸進式編碼方法
        return await this.progressiveGeocode(address);
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
        let headerIcon = 'fas fa-search-location';
        let headerText = '地址查詢結果';
        let addressInfo = '';
        let qualityInfo = '';
        let suggestionInfo = '';
        let typeInfo = '';
        
        // 處理建議地址的情況
        if (data.wgs84.suggestion) {
            headerIcon = 'fas fa-exclamation-triangle';
            headerText = '相近地址查詢結果';
            
            addressInfo = `
                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 10px; margin: 10px 0;">
                    <div style="color: #856404; font-weight: bold;">⚠️ 精確地址未找到</div>
                    <div style="margin-top: 5px;"><strong>您輸入的地址：</strong>${data.wgs84.originalAddress}</div>
                    <div style="margin-top: 3px;"><strong>建議相近位置：</strong>${data.address}</div>
                    <div style="margin-top: 3px; color: #666;"><strong>定位級別：</strong>${data.wgs84.suggestionLevel}</div>
                </div>
            `;
            
            suggestionInfo = this.generateSuggestionHTML(data.wgs84.originalAddress, data.wgs84.suggestionLevel);
        } else {
            addressInfo = `
                <p><strong>查詢地址：</strong>${data.inputAddress}</p>
                <p><strong>找到地址：</strong>${data.address}</p>
            `;
            
            // 顯示品質信息
            if (data.wgs84.confidence) {
                qualityInfo = this.generateQualityHTML(data.wgs84.confidence, data.wgs84.source);
            }
        }
        
        // 顯示地址類型信息
        if (data.wgs84.addressType) {
            typeInfo = this.generateAddressTypeHTML(data.wgs84.addressType, data.wgs84.addressTypeConfidence);
        }
        
        const html = `
            <div class="result-item">
                <h3><i class="${headerIcon}"></i> ${headerText}</h3>
                ${addressInfo}
                ${typeInfo}
                ${qualityInfo}
                
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
                
                ${suggestionInfo}
            </div>
        `;

        this.elements.addressSearchResult.innerHTML = html;
        this.elements.addressSearchResult.classList.add('show');
    }

    /**
     * 生成地址類型信息HTML
     */
    generateAddressTypeHTML(addressType, confidence) {
        const typeMapping = {
            'landmark': { icon: '🏛️', name: '知名地標', color: '#17a2b8' },
            'transportation': { icon: '🚊', name: '交通樞紐', color: '#28a745' },
            'education': { icon: '🏫', name: '教育機構', color: '#6f42c1' },
            'medical': { icon: '🏥', name: '醫療機構', color: '#dc3545' },
            'commercial': { icon: '🏢', name: '商業中心', color: '#fd7e14' },
            'tourism': { icon: '🎯', name: '觀光景點', color: '#20c997' },
            'government': { icon: '🏛️', name: '政府機關', color: '#6c757d' },
            'unknown': { icon: '📍', name: '一般地址', color: '#495057' }
        };
        
        const typeInfo = typeMapping[addressType] || typeMapping['unknown'];
        
        return `
            <div style="background-color: #f8f9fa; border-left: 4px solid ${typeInfo.color}; padding: 10px; margin: 10px 0;">
                <div style="font-weight: bold; color: ${typeInfo.color};">${typeInfo.icon} 地址類型：${typeInfo.name}</div>
                <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                    <strong>智能識別置信度：</strong>${(confidence * 100).toFixed(0)}%
                </div>
            </div>
        `;
    }

    /**
     * 生成品質信息HTML
     */
    generateQualityHTML(confidence, source) {
        let qualityLevel = '低';
        let qualityColor = '#dc3545';
        let bgColor = '#f8d7da';
        
        if (confidence > 0.8) {
            qualityLevel = '高';
            qualityColor = '#28a745';
            bgColor = '#d4edda';
        } else if (confidence > 0.6) {
            qualityLevel = '中';
            qualityColor = '#ffc107';
            bgColor = '#fff3cd';
        }
        
        return `
            <div style="background-color: ${bgColor}; border: 1px solid ${qualityColor}; border-radius: 5px; padding: 8px; margin: 10px 0; font-size: 14px;">
                <span style="color: ${qualityColor}; font-weight: bold;">
                    📍 定位品質：${qualityLevel} (${Math.round(confidence * 100)}%)
                </span>
                ${source ? ` | 來源：${source}` : ''}
            </div>
        `;
    }

    /**
     * 生成建議信息HTML
     */
    generateSuggestionHTML(originalAddress, suggestionLevel) {
        const suggestions = this.generateAddressImprovementSuggestions(originalAddress, suggestionLevel);
        
        if (suggestions.length === 0) return '';
        
        let suggestionsHTML = suggestions.map(s => `<li style="margin: 3px 0;">${s}</li>`).join('');
        
        return `
            <div style="background-color: #e7f3ff; border: 1px solid #007bff; border-radius: 5px; padding: 10px; margin: 10px 0;">
                <div style="font-weight: bold; color: #007bff; margin-bottom: 8px;">💡 地址輸入建議：</div>
                <ul style="margin: 0; padding-left: 20px; color: #333;">
                    ${suggestionsHTML}
                </ul>
            </div>
        `;
    }

    /**
     * 生成地址改進建議
     */
    generateAddressImprovementSuggestions(originalAddress, suggestionLevel) {
        const suggestions = [];
        
        if (suggestionLevel === '道路級別') {
            suggestions.push('詳細門牌號可能未被地圖收錄，已定位到道路級別');
            suggestions.push('如需精確位置，可嘗試使用鄰近知名地標');
            suggestions.push('確認巷弄號碼是否正確');
        } else if (suggestionLevel === '區域級別') {
            suggestions.push('詳細地址可能不存在，已定位到區域級別');
            suggestions.push('嘗試輸入主要道路名稱，如：中山路、民生路');
            suggestions.push('可以使用區域內的知名地標或機構');
        }
        
        // 通用建議
        if (originalAddress.includes('巷') && originalAddress.includes('弄')) {
            suggestions.push('小巷弄資料可能不完整，建議使用主要道路');
        }
        
        if (originalAddress.includes('號')) {
            suggestions.push('可嘗試移除門牌號，僅保留路段信息');
        }
        
        // 台灣特定建議
        if (originalAddress.includes('段')) {
            suggestions.push('確認路段編號是否正確（如：一段、二段）');
        }
        
        suggestions.push('建議格式：縣市 + 區 + 主要道路 + 段');
        
        return suggestions.slice(0, 4); // 限制建議數量
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