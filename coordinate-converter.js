/**
 * 座標轉換工具類
 * 支持WGS84 (Google座標) 和 BD09座標 之間的轉換
 */
class CoordinateConverter {
    
    // π常數
    static PI = Math.PI;
    
    // 地球半徑
    static EARTH_RADIUS = 6378245.0;
    
    // 偏心率的平方
    static EE = 0.00669342162296594323;
    
    // BD09轉換常數
    static X_PI = this.PI * 3000.0 / 180.0;
    
    /**
     * 判斷坐標是否在中國範圍內
     * @param {number} lng 經度
     * @param {number} lat 緯度
     * @returns {boolean} 是否在中國範圍內
     */
    static isInChina(lng, lat) {
        return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
    }
    
    /**
     * WGS84轉GCJ02
     * @param {number} lng WGS84經度
     * @param {number} lat WGS84緯度
     * @returns {object} {lng, lat} GCJ02座標
     */
    static wgs84ToGcj02(lng, lat) {
        if (!this.isInChina(lng, lat)) {
            return { lng, lat };
        }
        
        let dlat = this.transformLat(lng - 105.0, lat - 35.0);
        let dlng = this.transformLng(lng - 105.0, lat - 35.0);
        
        const radlat = lat / 180.0 * this.PI;
        let magic = Math.sin(radlat);
        magic = 1 - this.EE * magic * magic;
        const sqrtmagic = Math.sqrt(magic);
        
        dlat = (dlat * 180.0) / ((this.EARTH_RADIUS * (1 - this.EE)) / (magic * sqrtmagic) * this.PI);
        dlng = (dlng * 180.0) / (this.EARTH_RADIUS / sqrtmagic * Math.cos(radlat) * this.PI);
        
        const mglat = lat + dlat;
        const mglng = lng + dlng;
        
        return { lng: mglng, lat: mglat };
    }
    
    /**
     * GCJ02轉WGS84
     * @param {number} lng GCJ02經度
     * @param {number} lat GCJ02緯度
     * @returns {object} {lng, lat} WGS84座標
     */
    static gcj02ToWgs84(lng, lat) {
        if (!this.isInChina(lng, lat)) {
            return { lng, lat };
        }
        
        let dlat = this.transformLat(lng - 105.0, lat - 35.0);
        let dlng = this.transformLng(lng - 105.0, lat - 35.0);
        
        const radlat = lat / 180.0 * this.PI;
        let magic = Math.sin(radlat);
        magic = 1 - this.EE * magic * magic;
        const sqrtmagic = Math.sqrt(magic);
        
        dlat = (dlat * 180.0) / ((this.EARTH_RADIUS * (1 - this.EE)) / (magic * sqrtmagic) * this.PI);
        dlng = (dlng * 180.0) / (this.EARTH_RADIUS / sqrtmagic * Math.cos(radlat) * this.PI);
        
        const mglat = lat - dlat;
        const mglng = lng - dlng;
        
        return { lng: mglng, lat: mglat };
    }
    
    /**
     * GCJ02轉BD09
     * @param {number} lng GCJ02經度
     * @param {number} lat GCJ02緯度
     * @returns {object} {lng, lat} BD09座標
     */
    static gcj02ToBd09(lng, lat) {
        const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * this.X_PI);
        const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * this.X_PI);
        const bd_lng = z * Math.cos(theta) + 0.0065;
        const bd_lat = z * Math.sin(theta) + 0.006;
        return { lng: bd_lng, lat: bd_lat };
    }
    
    /**
     * BD09轉GCJ02
     * @param {number} lng BD09經度
     * @param {number} lat BD09緯度
     * @returns {object} {lng, lat} GCJ02座標
     */
    static bd09ToGcj02(lng, lat) {
        const x = lng - 0.0065;
        const y = lat - 0.006;
        const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * this.X_PI);
        const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * this.X_PI);
        const gcj_lng = z * Math.cos(theta);
        const gcj_lat = z * Math.sin(theta);
        return { lng: gcj_lng, lat: gcj_lat };
    }
    
    /**
     * WGS84直接轉BD09
     * @param {number} lng WGS84經度
     * @param {number} lat WGS84緯度
     * @returns {object} {lng, lat} BD09座標
     */
    static wgs84ToBd09(lng, lat) {
        const gcj02 = this.wgs84ToGcj02(lng, lat);
        return this.gcj02ToBd09(gcj02.lng, gcj02.lat);
    }
    
    /**
     * BD09直接轉WGS84
     * @param {number} lng BD09經度
     * @param {number} lat BD09緯度
     * @returns {object} {lng, lat} WGS84座標
     */
    static bd09ToWgs84(lng, lat) {
        const gcj02 = this.bd09ToGcj02(lng, lat);
        return this.gcj02ToWgs84(gcj02.lng, gcj02.lat);
    }
    
    /**
     * 轉換緯度
     * @param {number} lng 經度
     * @param {number} lat 緯度
     * @returns {number} 轉換後的緯度
     */
    static transformLat(lng, lat) {
        let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 
                  0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
        ret += (20.0 * Math.sin(6.0 * lng * this.PI) + 20.0 * Math.sin(2.0 * lng * this.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(lat * this.PI) + 40.0 * Math.sin(lat / 3.0 * this.PI)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(lat / 12.0 * this.PI) + 320 * Math.sin(lat * this.PI / 30.0)) * 2.0 / 3.0;
        return ret;
    }
    
    /**
     * 轉換經度
     * @param {number} lng 經度
     * @param {number} lat 緯度
     * @returns {number} 轉換後的經度
     */
    static transformLng(lng, lat) {
        let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 
                  0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
        ret += (20.0 * Math.sin(6.0 * lng * this.PI) + 20.0 * Math.sin(2.0 * lng * this.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(lng * this.PI) + 40.0 * Math.sin(lng / 3.0 * this.PI)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(lng / 12.0 * this.PI) + 300.0 * Math.sin(lng / 30.0 * this.PI)) * 2.0 / 3.0;
        return ret;
    }
    
    /**
     * 計算兩點間距離（米）
     * @param {number} lng1 點1經度
     * @param {number} lat1 點1緯度
     * @param {number} lng2 點2經度
     * @param {number} lat2 點2緯度
     * @returns {number} 距離（米）
     */
    static getDistance(lng1, lat1, lng2, lat2) {
        const radLat1 = lat1 * this.PI / 180.0;
        const radLat2 = lat2 * this.PI / 180.0;
        const a = radLat1 - radLat2;
        const b = lng1 * this.PI / 180.0 - lng2 * this.PI / 180.0;
        
        let s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) + 
                Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
        s = s * 6378.137; // 地球半徑（公里）
        s = Math.round(s * 10000) / 10000;
        return s * 1000; // 轉換為米
    }
    
    /**
     * 格式化座標顯示
     * @param {number} coordinate 座標值
     * @param {number} precision 精度（小數點位數）
     * @returns {string} 格式化後的座標字符串
     */
    static formatCoordinate(coordinate, precision = 6) {
        return parseFloat(coordinate).toFixed(precision);
    }
    
    /**
     * 驗證座標是否有效
     * @param {number} lng 經度
     * @param {number} lat 緯度
     * @returns {boolean} 座標是否有效
     */
    static isValidCoordinate(lng, lat) {
        return !isNaN(lng) && !isNaN(lat) && 
               lng >= -180 && lng <= 180 && 
               lat >= -90 && lat <= 90;
    }
    
    /**
     * 將座標轉換為度分秒格式
     * @param {number} coordinate 座標值
     * @param {string} type 類型 'lat' 或 'lng'
     * @returns {string} 度分秒格式字符串
     */
    static toDegreeMinuteSecond(coordinate, type) {
        const abs = Math.abs(coordinate);
        const degrees = Math.floor(abs);
        const minutes = Math.floor((abs - degrees) * 60);
        const seconds = ((abs - degrees) * 60 - minutes) * 60;
        
        let direction;
        if (type === 'lat') {
            direction = coordinate >= 0 ? 'N' : 'S';
        } else {
            direction = coordinate >= 0 ? 'E' : 'W';
        }
        
        return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
    }
    
    /**
     * 批量轉換座標
     * @param {Array} coordinates 座標數組 [{lng, lat}, ...]
     * @param {string} fromSystem 源座標系統 'wgs84' 或 'bd09'
     * @param {string} toSystem 目標座標系統 'wgs84' 或 'bd09'
     * @returns {Array} 轉換後的座標數組
     */
    static batchConvert(coordinates, fromSystem, toSystem) {
        return coordinates.map(coord => {
            if (fromSystem === toSystem) {
                return coord;
            }
            
            if (fromSystem === 'wgs84' && toSystem === 'bd09') {
                return this.wgs84ToBd09(coord.lng, coord.lat);
            } else if (fromSystem === 'bd09' && toSystem === 'wgs84') {
                return this.bd09ToWgs84(coord.lng, coord.lat);
            }
            
            return coord;
        });
    }
}

// 如果是在Node.js環境中，導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoordinateConverter;
}

// 如果是在瀏覽器環境中，添加到全局對象
if (typeof window !== 'undefined') {
    window.CoordinateConverter = CoordinateConverter;
} 