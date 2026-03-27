/**
 * @file scripts/propertyScraper.js
 * @description 统一的房产爬虫脚本 - 支持全爬取、部分爬取和命令行执行
 */

const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const Property = require('../server/models/property.model');

// 爬虫配置
const SCRAPER_CONFIG = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout: 30000, // 增加到30秒
  requestDelay: 2000, // 请求间隔增加到2秒，避免被限流
  maxRetries: 3
};

/**
 * @description 从房产详情页获取详细信息（主图、起始出租日期、坐标、更新时间）
 * @param {string} detailUrl - 详情页URL
 * @param {string} [htmlContent] - 可选的HTML内容，如果提供则不会重新请求
 * @returns {Promise<Object>} 房产详情信息对象
 */
async function getPropertyDetailInfo(detailUrl, htmlContent = null) {
  try {
    let html;
    let $;
    
    if (htmlContent) {
      // 如果提供了HTML内容，直接使用
      html = htmlContent;
      $ = cheerio.load(html);
    } else {
      // 否则请求URL
      const response = await axios.get(detailUrl, {
        headers: {
          'User-Agent': SCRAPER_CONFIG.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: SCRAPER_CONFIG.timeout
      });

      $ = cheerio.load(response.data);
      html = response.data; // 用于正则提取
    }

    const detailInfo = {
      mainImage: '',
      availableDate: null,
      coordinates: { latitude: null, longitude: null },
      lastUpdated: null,
      features: [],
      description: '',
      images: []
    };

    // 1. 查找房产主图
    const mainImageSelectors = [
      'img[alt*="Image 0"]',
      'img[src*="rimh2.domainstatic.com.au"][src*="fit-in"]',
      '[data-testid*="gallery"] img:first',
      '[data-testid*="image"] img:first',
      'img[src*="domainstatic.com.au"]:first',
      '.property-image img:first',
      '.gallery img:first'
    ];

    for (const selector of mainImageSelectors) {
      const imgElement = $(selector).first();
      if (imgElement.length && imgElement.attr('src')) {
        detailInfo.mainImage = imgElement.attr('src');
        break;
      }
    }

    // 2. 查找起始出租日期（从页面文本中提取）
    // 方法1: 从HTML文本中匹配 "Available from Saturday, 01 November 2025"
    const availableTextMatch = html.match(/Available from\s+([^<.]+)/i);
    if (availableTextMatch) {
      try {
        const dateText = availableTextMatch[1].trim();
        // 移除星期几，只保留日期部分 (例如: "Saturday, 01 November 2025" -> "01 November 2025")
        const cleanDateText = dateText.replace(/^[A-Za-z]+,\s*/, '');
        detailInfo.availableDate = new Date(cleanDateText);
      } catch (e) {
        console.warn('⚠️  日期解析失败:', availableTextMatch[1]);
      }
    }
    
    // 方法2: 从页面元素中查找 "Available Now" 或其他日期信息
    if (!detailInfo.availableDate) {
      const availableSelectors = [
        '[data-testid*="available"]',
        '[data-testid*="date-available"]',
        '[data-testid="listing-summary-strip"]',
        '.available-date',
        '.date-available'
      ];
      
      for (const selector of availableSelectors) {
        const element = $(selector).first();
        if (element.length) {
          const text = element.text().trim();
          // 检查是否是 "Available Now"
          if (text.includes('Available Now') || text.includes('Available now')) {
            detailInfo.availableDate = new Date(); // 设置为当前日期
            break;
          }
          // 尝试提取日期格式
          const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+\w+\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
          if (dateMatch) {
            try {
              detailInfo.availableDate = new Date(dateMatch[1]);
              break;
            } catch (e) {
              // 忽略日期解析错误
            }
          }
        }
      }
    }

    // 3. 查找坐标信息
    // 方法1: 从HTML中的JSON数据提取
    const latMatch = html.match(/"latitude":\s*(-?\d+\.\d+)/);
    const lngMatch = html.match(/"longitude":\s*(-?\d+\.\d+)/);
    
    if (latMatch && lngMatch) {
      detailInfo.coordinates = {
        latitude: parseFloat(latMatch[1]),
        longitude: parseFloat(lngMatch[1])
      };
    }
    
    // 方法2: 从地图图片URL中提取坐标
    if (!detailInfo.coordinates.latitude || !detailInfo.coordinates.longitude) {
      const mapImg = $('img[alt*="Static Google Map"], img[alt*="Map"], img[src*="maps.googleapis.com"]').first().attr('src');
      if (mapImg) {
        const coordMatch = mapImg.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (coordMatch) {
          detailInfo.coordinates = {
            latitude: parseFloat(coordMatch[1]),
            longitude: parseFloat(coordMatch[2])
          };
        }
      }
    }

    // 4. 查找最后更新时间
    const updateSelectors = [
      '[data-testid*="updated"]',
      '[data-testid*="modified"]',
      '.last-updated',
      '.property-updated'
    ];

    for (const selector of updateSelectors) {
      const updateElement = $(selector).first();
      if (updateElement.length) {
        const updateText = updateElement.text().trim();
        const updateMatch = updateText.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+\w+\s+\d{4})/);
        if (updateMatch) {
          try {
            detailInfo.lastUpdated = new Date(updateMatch[1]);
            break;
          } catch (e) {
            // 忽略日期解析错误
          }
        }
      }
    }

    // 5. 提取Property Features
    const featuresList = $('[data-testid="listing-details__additional-features"] li[data-testid="listing-details__additional-features-listing"]');
    featuresList.each((i, element) => {
      const featureText = $(element).text().trim();
      if (featureText) {
        detailInfo.features.push(featureText);
      }
    });

    // 6. 提取Property Description
    const descriptionSection = $('[data-testid="listing-details__description"]');
    if (descriptionSection.length) {
      // 提取所有文本内容，包括标题和段落
      const descriptionParts = [];
      
      // 提取标题
      const headline = descriptionSection.find('[data-testid="listing-details__description-headline"]').text().trim();
      if (headline) {
        descriptionParts.push(headline);
      }
      
      // 提取段落
      descriptionSection.find('p').each((i, element) => {
        const paragraphText = $(element).text().trim();
        if (paragraphText) {
          descriptionParts.push(paragraphText);
        }
      });
      
      detailInfo.description = descriptionParts.join('\n\n');
    }

    // 7. 提取所有图片URL（使用method6: script标签正则匹配）
    // 🔥 完全复制 testImageExtraction.js 中已验证的有效方法（逐行复制）
    // 存储所有找到的URL
    const allImageUrls = [];
    
    // URL模式定义（与testImageExtraction.js完全一致）
    const urlPatterns = [
      /https?:\/\/bucket-api\.domain\.com\.au\/v1\/bucket\/image\/[^\s"'<>?&\\]+/g,
      /https?:\/\/rimh2\.domainstatic\.com\.au\/[^\s"'<>?&\\]+/g,
      /https?:\/\/[^/\s"'<>?&\\]*domainstatic\.com\.au\/[^\s"'<>?&\\]+/g
    ];
    
    // 遍历所有script标签（完全复制testImageExtraction.js的逻辑，包括变量命名）
    $('script').each((i, script) => {
      const scriptContent = $(script).html() || '';
      
      // 对每个script标签内容，使用所有正则模式进行匹配
      urlPatterns.forEach((pattern, idx) => {
        // 重置正则表达式的lastIndex（重要：避免全局标志导致的匹配问题）
        pattern.lastIndex = 0;
        const matches = scriptContent.match(pattern);
        if (matches) {
          matches.forEach(url => {
            allImageUrls.push(url);
          });
        }
      });
    });
    
    console.log(`   找到 ${allImageUrls.length} 个URL（包含重复）`);
    
    // 去重（完全复制testImageExtraction.js的逻辑）
    const uniqueUrls = Array.from(new Set(allImageUrls));
    console.log(`   去重后: ${uniqueUrls.length} 个唯一URL`);
    
    // 🔥 只保留bucket-api格式的详情图URL（这是有效的详情图）
    // 完全复制testImageExtraction.js的过滤逻辑（逐行一致）
    const filteredUrls = uniqueUrls
      .filter(url => {
        // 只保留 bucket-api 格式的URL
        if (!url.includes('bucket-api.domain.com.au/v1/bucket/image/')) {
          return false;
        }
        // 排除无效链接（如CSS、JS、字体文件等）
        if (url.includes('.css') || url.includes('.js') || url.includes('.woff') || 
            url.includes('.eot') || url.includes('.ttf') || url.includes('.svg') ||
            url.includes('contact_') || url.includes('logo_') || 
            url.includes('/fe-server-search-listings/') || url.includes('/design-tokens/')) {
          return false;
        }
        return true;
      })
      .map(url => url.trim().replace(/[\\\s]+$/, '')) // 清理URL：去掉结尾的反斜杠和空白字符
      .filter(url => url); // 过滤掉空字符串
    
    // 最终去重（按完整的URL）
    const finalUrls = Array.from(new Set(filteredUrls));
    
    console.log(`\n✅ 筛选后总计: ${finalUrls.length} 个有效详情图URL（bucket-api格式）`);
    
    // 直接赋值给detailInfo.images（完全复制testImageExtraction.js的返回值逻辑）
    detailInfo.images = finalUrls;
    
    if (finalUrls.length > 0) {
      console.log(`✅ 图片提取完成，共${finalUrls.length}张详情图（bucket-api格式，已去重）`);
      // 输出前5个URL用于调试
      console.log(`📸 前5个URL示例:`);
      finalUrls.slice(0, 5).forEach((url, idx) => {
        console.log(`   ${idx + 1}. ${url}`);
      });
    } else {
      console.log('⚠️  未找到任何详情图片');
    }

    return detailInfo;

  } catch (error) {
    console.warn(`⚠️  获取详情页信息失败: ${detailUrl}`, error.message);
    return {
      mainImage: '',
      availableDate: null,
      coordinates: { latitude: null, longitude: null },
      lastUpdated: null,
      features: [],
      description: '',
      images: []
    };
  }
}

/**
 * @description 解析房产列表页，提取房产基本信息
 * @param {Object} $ - Cheerio对象
 * @param {string} targetSuburb - 目标suburb（用于过滤其他suburb的房源）
 * @returns {Object} { properties: Array, foundOtherSuburb: boolean }
 */
function parsePropertyList($, targetSuburb = null) {
  const properties = [];
  let foundOtherSuburb = false; // 标记是否遇到其他suburb
  
  // 过滤统计
  const filterStats = {
    depositTaken: 0,
    lowRent: 0,
    invalidData: 0,
    otherSuburb: 0,
    total: 0
  };

  // 多种选择器策略，适应不同的页面结构
  const selectors = [
    '[data-testid*="listing"]',
    '[data-testid*="Listing"]',
    '.listing-card',
    '.property-card',
    '.search-result',
    '[class*="listing"]',
    '[class*="Listing"]',
    'article[data-testid]',
    'div[data-testid*="listing"]',
    'li[data-testid]'
  ];

  let propertyElements = $();
  let usedSelector = null;
  for (const selector of selectors) {
    propertyElements = $(selector);
    if (propertyElements.length > 0) {
      console.log(`📋 使用选择器: ${selector} - 找到 ${propertyElements.length} 个元素`);
      usedSelector = selector;
      break;
    }
  }

  if (propertyElements.length === 0) {
    console.warn('⚠️  未找到房产列表元素');
    console.warn('🔍 尝试查找其他可能的元素...');
    
    // 尝试查找所有包含data-testid的元素
    const allTestIds = $('[data-testid]');
    console.warn(`📊 页面中所有data-testid元素数量: ${allTestIds.length}`);
    if (allTestIds.length > 0) {
      const uniqueTestIds = new Set();
      allTestIds.each((i, el) => {
        const testId = $(el).attr('data-testid');
        if (testId) uniqueTestIds.add(testId);
      });
      console.warn(`📊 唯一的data-testid值（前20个）: ${Array.from(uniqueTestIds).slice(0, 20).join(', ')}`);
    }
    
    // 尝试查找所有可能的房产容器
    const possibleContainers = $('article, [role="article"], [class*="card"], [class*="result"]');
    console.warn(`📊 可能的容器元素数量: ${possibleContainers.length}`);
    
    return { properties, foundOtherSuburb, filterStats };
  }
  
  console.log(`✅ 成功找到 ${propertyElements.length} 个房产元素（使用选择器: ${usedSelector}）`);

  propertyElements.each((index, element) => {
    try {
      const $element = $(element);
      
      // 🔥 检查是否为 DEPOSIT TAKEN 状态（无效房源，直接跳过）
      const depositTakenTag = $element.find('[data-testid="listing-card-tag"]').text().trim();
      if (depositTakenTag.includes('DEPOSIT TAKEN')) {
        filterStats.depositTaken++;
        filterStats.total++;
        return; // 跳过此房源
      }

      // 提取基本信息
      const address = $element.find('h2, h3, [data-testid*="address"], [class*="address"]').first().text().trim() ||
                     $element.find('a[href*="/property/"]').first().text().trim();

      // 🔥 提取suburb并检查是否匹配目标suburb
      if (targetSuburb && address) {
        // 从地址中提取suburb (格式: "123 Street, SUBURB NSW 2000")
        const addressMatch = address.match(/,\s*([A-Z\s]+)\s+[A-Z]{2,3}\s+\d{4}/i);
        if (addressMatch) {
          const propertySuburb = addressMatch[1].trim().toLowerCase();
          const targetSuburbLower = targetSuburb.toLowerCase();
          
          if (propertySuburb !== targetSuburbLower) {
            filterStats.otherSuburb++;
            filterStats.total++;
            foundOtherSuburb = true;
            return; // 跳过此房源
          }
        }
      }

      const priceText = $element.find('[data-testid*="price"], [class*="price"], [class*="rent"]').first().text().trim() ||
                       $element.find('span:contains("$")').first().text().trim();

      const priceMatch = priceText.match(/\$([\d,]+)/);
      const rent = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null;

      // 提取房间配置
      // 优先从 property-features 中提取 (格式: "2 Beds2 Baths1 Parking")
      const featuresText = $element.find('[data-testid*="property-features"]').first().text().trim();
      
      const bedroomsMatch = featuresText.match(/(\d+)\s*Bed/i);
      const bedrooms = bedroomsMatch ? parseInt(bedroomsMatch[1]) : null;

      const bathroomsMatch = featuresText.match(/(\d+)\s*Bath/i);
      const bathrooms = bathroomsMatch ? parseInt(bathroomsMatch[1]) : null;

      const parkingMatch = featuresText.match(/(\d+)\s*Parking/i);
      const parking = parkingMatch ? parseInt(parkingMatch[1]) : null;

      // 🔍 提前过滤条件 - 在进入详情页之前就过滤掉不符合条件的房源
      // 只过滤租金过低的房源（停车位等）
      if (rent < 100) {
        filterStats.lowRent++;
        filterStats.total++;
        return;
      }
      
      // 基本数据验证（放宽地址长度限制，改为 < 3）
      if (!address || !rent ) {
        filterStats.invalidData++;
        filterStats.total++;
        return;
      }
      
      // bedrooms 为 null 且租金很低，可能是停车位
      if (bedrooms === null && rent < 200) {
        filterStats.lowRent++;
        filterStats.total++;
        return;
      }

      // 提取 propertyId（从 data-testid 属性中提取，格式：listing-17807949）
      // 需要向上查找父元素，因为有些元素的ID在父元素上
      let propertyId = null;
      let externalUrl = '';
      
      let current = $element;
      for (let i = 0; i < 3; i++) {
        const testid = current.attr('data-testid') || '';
        const idMatch = testid.match(/listing-(\d+)/);
        if (idMatch) {
          propertyId = idMatch[1];
          externalUrl = `https://www.domain.com.au/${propertyId}`;
          break;
        }
        current = current.parent();
      }
      
      // 如果没有找到ID，使用备用方案
      if (!propertyId) {
        propertyId = `property_${index}_${Date.now()}`;
      }

      // 返回符合条件的房源数据
      properties.push({
          propertyId,
          address: address.replace(/\s+/g, ' ').trim(),
          rent,
          bedrooms: bedrooms || 0,
          bathrooms: bathrooms || 0,
          parking: parking || 0,
          detailUrl: externalUrl, // 使用构建的 externalUrl
          suburb: '',
          postcode: '',
          state: '',
          externalUrl: externalUrl
        });
    } catch (error) {
      console.warn(`⚠️  解析房产元素失败 (索引 ${index}):`, error.message);
    }
  });

  return { properties, foundOtherSuburb, filterStats };
}

/**
 * @description 爬取指定区域的房产数据（支持逐页存储）
 * @param {string} suburb - 区域名称
 * @param {string} state - 州名
 * @param {string} postcode - 邮编
 * @param {number} maxPages - 最大爬取页数
 * @param {Date} sinceDate - 起始日期（用于部分爬取）
 * @param {Function} onPageComplete - 每页完成后的回调函数（用于逐页存储）
 * @returns {Promise<Object>} 爬取结果
 */
async function scrapeProperties(suburb, state, postcode, maxPages = 10, sinceDate = null, onPageComplete = null) {
  const allProperties = [];
  let totalPages = 0;
  let shouldStop = false;
  let newPropertiesCount = 0;
  let existingPropertiesCount = 0;
  let skippedPropertiesCount = 0;
  let totalSavedCount = 0;
  let totalErrorCount = 0;
  
  // 汇总过滤统计
  const totalFilterStats = {
    depositTaken: 0,
    lowRent: 0,
    invalidData: 0,
    otherSuburb: 0,
    total: 0
  };

  try {
    console.log(`🚀 开始爬取 ${suburb} (${postcode}) 区域...`);
    console.log(`📅 起始日期: ${sinceDate ? sinceDate.toISOString() : '全量爬取'}`);
    console.log(`📄 最大页数: ${maxPages}`);
    console.log(`💾 存储模式: ${onPageComplete ? '✅ 逐页存储（安全）' : '⚠️  批量存储'}`);

    for (let page = 1; page <= maxPages && !shouldStop; page++) {
      try {
        console.log(`📖 爬取第 ${page} 页...`);

        // 构建搜索URL
        const searchUrl = `https://www.domain.com.au/rent/${suburb.toLowerCase()}-${state.toLowerCase()}-${postcode}/?sort=dateupdated-desc&page=${page}`;
        console.log(`🔗 请求URL: ${searchUrl}`);
        
        let response;
        try {
          response = await axios.get(searchUrl, {
            headers: {
              'User-Agent': SCRAPER_CONFIG.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Referer': 'https://www.domain.com.au/',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'same-origin'
            },
            timeout: SCRAPER_CONFIG.timeout,
            maxRedirects: 5,
            validateStatus: function (status) {
              return status >= 200 && status < 400; // 允许2xx和3xx状态码
            }
          });
        } catch (axiosError) {
          if (axiosError.code === 'ECONNABORTED') {
            console.error(`❌ 请求超时 (${SCRAPER_CONFIG.timeout}ms): ${searchUrl}`);
            throw new Error(`请求超时: ${searchUrl}`);
          } else if (axiosError.response) {
            console.error(`❌ HTTP错误 ${axiosError.response.status}: ${searchUrl}`);
            throw new Error(`HTTP错误 ${axiosError.response.status}: ${axiosError.response.statusText}`);
          } else if (axiosError.request) {
            console.error(`❌ 网络错误: 无法连接到服务器`);
            throw new Error(`网络错误: ${axiosError.message}`);
          } else {
            console.error(`❌ 请求配置错误: ${axiosError.message}`);
            throw new Error(`请求错误: ${axiosError.message}`);
          }
        }

        console.log(`📡 HTTP状态码: ${response.status}`);
        console.log(`📄 页面HTML长度: ${response.data.length} 字符`);
        
        // 检查响应内容是否包含预期的内容
        if (response.data.includes('No properties found') || response.data.includes('no results')) {
          console.log(`⚠️  页面显示"未找到房产"`);
        }
        
        // 检查是否被重定向或返回错误页面
        if (response.data.length < 10000) {
          console.log(`⚠️  页面内容异常短，可能是错误页面或重定向`);
          console.log(`📄 页面内容预览（前500字符）: ${response.data.substring(0, 500)}`);
        }

        const $ = cheerio.load(response.data);
        
        // 检查页面标题，确认是否是正确的页面
        const pageTitle = $('title').text();
        console.log(`📋 页面标题: ${pageTitle}`);
        
        const parseResult = parsePropertyList($, suburb); // 传入suburb用于过滤
        const pageProperties = parseResult.properties;
        
        console.log(`📋 解析结果: 找到 ${pageProperties.length} 个有效房源，过滤 ${parseResult.filterStats?.total || 0} 个`);
        console.log(`📋 过滤详情: DEPOSIT TAKEN=${parseResult.filterStats?.depositTaken || 0}, 低租金=${parseResult.filterStats?.lowRent || 0}, 无效数据=${parseResult.filterStats?.invalidData || 0}, 其他区域=${parseResult.filterStats?.otherSuburb || 0}`);
        
        // 汇总过滤统计
        if (parseResult.filterStats) {
          totalFilterStats.depositTaken += parseResult.filterStats.depositTaken || 0;
          totalFilterStats.lowRent += parseResult.filterStats.lowRent || 0;
          totalFilterStats.invalidData += parseResult.filterStats.invalidData || 0;
          totalFilterStats.otherSuburb += parseResult.filterStats.otherSuburb || 0;
          totalFilterStats.total += parseResult.filterStats.total || 0;
        }

        // 🔥 如果遇到其他suburb的房源，说明目标suburb的房源已经展示完毕，停止爬取
        if (parseResult.foundOtherSuburb) {
          console.log(`⏹️  检测到其他suburb房源，${suburb}区域房源已全部爬取完毕，停止爬取`);
          shouldStop = true;
          break;
        }

        if (pageProperties.length === 0) {
          console.log(`⚠️  第 ${page} 页未找到房产数据，停止爬取`);
          break;
        }

        console.log(`📊 第 ${page} 页: 有效 ${pageProperties.length} 个，过滤 ${parseResult.filterStats.total} 个`);

        // 填充区域信息
        pageProperties.forEach(property => {
          property.suburb = suburb;
          property.state = state;
          property.postcode = postcode;
        });

        // 获取详情页信息（包含lastUpdated时间）
        console.log(`🔍 获取本页 ${pageProperties.length} 个房产的详情信息...`);
        for (let i = 0; i < pageProperties.length; i++) {
          const property = pageProperties[i];
          if (property.detailUrl) {
            try {
              const detailInfo = await getPropertyDetailInfo(property.detailUrl);
              property.mainImage = detailInfo.mainImage;
              property.availableDate = detailInfo.availableDate;
              property.coordinates = detailInfo.coordinates;
              property.lastUpdated = detailInfo.lastUpdated;
              property.features = detailInfo.features || [];
              property.description = detailInfo.description || '';
              property.images = detailInfo.images || [];

              // 部分爬取：检查更新时间
              if (sinceDate && property.lastUpdated) {
                const propertyUpdateTime = new Date(property.lastUpdated);
                console.log(`📅 房源更新时间: ${propertyUpdateTime.toISOString()}, 起始时间: ${sinceDate.toISOString()}`);
                
                // 如果房源更新时间早于或等于起始时间，说明这是旧房源，应该停止爬取
                if (propertyUpdateTime <= sinceDate) {
                  console.log(`⏹️  发现旧房源，停止爬取: ${property.address}`);
                  shouldStop = true;
                  break; // 跳出详情获取循环
                }
              }

              // 添加请求间隔
              if (i < pageProperties.length - 1) {
                await new Promise(resolve => setTimeout(resolve, SCRAPER_CONFIG.requestDelay));
              }
            } catch (error) {
              console.warn(`⚠️  获取详情失败: ${property.detailUrl}`, error.message);
            }
          }

          // 显示进度
          if ((i + 1) % 5 === 0 || i === pageProperties.length - 1) {
            console.log(`📊 详情获取进度: ${i + 1}/${pageProperties.length}`);
          }
        }

        // 如果需要停止，不添加当前房源
        if (shouldStop) {
          console.log(`⏹️  达到爬取终止条件，当前页不保存房源`);
          break;
        }

        allProperties.push(...pageProperties);
        totalPages = page;

        // 🔥 逐页存储：如果提供了回调函数，立即保存当前页的数据
        if (onPageComplete && pageProperties.length > 0) {
          try {
            console.log(`💾 [第${page}页] 开始保存 ${pageProperties.length} 个房源...`);
            const saveResult = await onPageComplete(pageProperties, page, parseResult.filterStats);
            totalSavedCount += saveResult.syncedCount || 0;
            totalErrorCount += saveResult.errorCount || 0;
            console.log(`✅ [第${page}页] 保存完成: 新增${saveResult.syncedCount} 更新${saveResult.updatedCount} 错误${saveResult.errorCount}`);
          } catch (saveError) {
            console.error(`❌ [第${page}页] 保存失败:`, saveError.message);
            totalErrorCount += pageProperties.length;
          }
        }

        // 添加请求间隔
        if (page < maxPages) {
          await new Promise(resolve => setTimeout(resolve, SCRAPER_CONFIG.requestDelay));
        }

      } catch (error) {
        console.error(`❌ 爬取第 ${page} 页失败:`, error.message);
        console.error(`❌ 错误类型:`, error.constructor.name);
        console.error(`❌ 错误堆栈:`, error.stack);
        
        // 如果是超时错误，停止爬取
        if (error.message && error.message.includes('请求超时')) {
          console.log('⏹️  请求超时，停止爬取');
          shouldStop = true;
          break;
        }
        
        // 如果是404错误，停止爬取
        if (error.response && error.response.status === 404) {
          console.log('📄 页面不存在，停止爬取');
          break;
        }
        
        // 其他错误，继续尝试下一页（最多重试3次）
        if (page === 1) {
          console.log('⚠️  第1页失败，停止爬取');
          break;
        }
      }
    }

    console.log(`✅ 爬取完成: ${allProperties.length} 个房产，${totalPages} 页`);
    console.log(`🔍 过滤统计: DEPOSIT TAKEN ${totalFilterStats.depositTaken}，低租金 ${totalFilterStats.lowRent}，无效数据 ${totalFilterStats.invalidData}，其他区域 ${totalFilterStats.otherSuburb}，总计过滤 ${totalFilterStats.total}`);
    if (onPageComplete) {
      console.log(`💾 逐页存储统计: 成功${totalSavedCount} 错误${totalErrorCount}`);
    }

    return {
      properties: allProperties,
      totalPages,
      shouldStop,
      newPropertiesCount,
      existingPropertiesCount,
      skippedPropertiesCount,
      totalProcessed: allProperties.length,
      totalSavedCount,
      totalErrorCount,
      filterStats: totalFilterStats
    };

  } catch (error) {
    console.error('❌ 爬取过程发生错误:', error);
    throw error;
  }
}

/**
 * @description 全爬取房产数据
 * @param {string} suburb - 区域名称
 * @param {string} state - 州名
 * @param {string} postcode - 邮编
 * @param {number} maxPages - 最大爬取页数
 * @param {Function} onPageComplete - 每页完成后的回调函数（用于逐页存储）
 * @returns {Promise<Object>} 爬取结果
 */
async function fullScrape(suburb, state, postcode, maxPages = 10, onPageComplete = null) {
  console.log(`🔄 执行全爬取: ${suburb} (${postcode})`);
  return await scrapeProperties(suburb, state, postcode, maxPages, null, onPageComplete);
}

/**
 * @description 部分爬取房产数据（基于时间）
 * @param {string} suburb - 区域名称
 * @param {string} state - 州名
 * @param {string} postcode - 邮编
 * @param {Date} sinceDate - 起始日期
 * @param {number} maxPages - 最大爬取页数
 * @param {Function} onPageComplete - 每页完成后的回调函数（用于逐页存储）
 * @returns {Promise<Object>} 爬取结果
 */
async function partialScrape(suburb, state, postcode, sinceDate, maxPages = 5, onPageComplete = null) {
  console.log(`🔄 执行部分爬取: ${suburb} (${postcode}) - 自 ${sinceDate.toISOString()}`);
  return await scrapeProperties(suburb, state, postcode, maxPages, sinceDate, onPageComplete);
}

/**
 * @description 获取已存在的房产ID集合
 * @param {string} suburb - 区域名称
 * @param {string} state - 州名
 * @param {string} postcode - 邮编
 * @returns {Promise<Set>} 房产ID集合
 */
async function getExistingPropertyIds(suburb, state, postcode) {
  try {
    const properties = await Property.find({
      suburb: new RegExp(suburb, 'i'),
      postcode: postcode
    }).select('propertyId').lean();

    return new Set(properties.map(p => p.propertyId));
  } catch (error) {
    console.error('❌ 获取已存在房产ID失败:', error);
    return new Set();
  }
}

/**
 * @description 获取上次爬取时间
 * @returns {Promise<Date|null>} 上次爬取时间
 */
async function getLastScrapeTime() {
  try {
    const lastProperty = await Property.findOne()
      .sort({ lastUpdated: -1 })
      .select('lastUpdated')
      .lean();

    return lastProperty ? lastProperty.lastUpdated : null;
  } catch (error) {
    console.error('❌ 获取上次爬取时间失败:', error);
    return null;
  }
}

/**
 * @description 保存房产数据到数据库
 * @param {Array} properties - 房产数据数组
 * @returns {Promise<Object>} 保存结果统计
 */
async function savePropertiesToDB(properties) {
  let syncedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  console.log(`💾 开始保存 ${properties.length} 个房产到数据库...`);

  for (const propertyData of properties) {
    try {
      // 检查是否已存在
      const existingProperty = await Property.findOne({
        propertyId: propertyData.propertyId
      });

      if (existingProperty) {
        // 更新现有房产
        await Property.findByIdAndUpdate(existingProperty._id, {
          ...propertyData,
          updatedAt: new Date()
        });
        updatedCount++;
      } else {
        // 创建新房产
        await Property.create(propertyData);
        syncedCount++;
      }
    } catch (error) {
      console.error(`❌ 保存房产失败: ${propertyData.propertyId}`, error.message);
      errorCount++;
    }
  }

  const totalProcessed = syncedCount + updatedCount;
  console.log(`💾 保存完成: 新增 ${syncedCount} 条，更新 ${updatedCount} 条，错误 ${errorCount} 条`);

  return {
    syncedCount,
    updatedCount,
    errorCount,
    totalProcessed
  };
}

/**
 * @description 命令行执行入口
 */
async function runCommandLine() {
  const args = process.argv.slice(2);
  const command = args[0];
  const suburb = args[1] || 'zetland';
  const state = args[2] || 'nsw';
  const postcode = args[3] || '2017';
  const maxPages = parseInt(args[4]) || 10;

  // 连接数据库
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ 请设置 MONGODB_URI 环境变量');
    process.exit(1);
  }

  try {
    console.log('🔌 连接数据库...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ 数据库连接成功');

    const startTime = new Date();
    console.log(`\n🚀 开始执行 - ${startTime.toISOString()}`);

    let result;
    switch (command) {
      case 'full':
        console.log(`📋 执行全爬取: ${suburb} (${postcode})`);
        result = await fullScrape(suburb, state, postcode, maxPages);
        break;
      
      case 'partial':
        console.log(`📋 执行部分爬取: ${suburb} (${postcode})`);
        const lastScrapeTime = await getLastScrapeTime();
        if (!lastScrapeTime) {
          console.log('⚠️  未找到上次爬取时间，建议先执行全爬取');
          return;
        }
        result = await partialScrape(suburb, state, postcode, lastScrapeTime, maxPages);
        break;
      
      default:
        console.log('❌ 无效命令。使用方法:');
        console.log('  node propertyScraper.js full [suburb] [state] [postcode] [maxPages]');
        console.log('  node propertyScraper.js partial [suburb] [state] [postcode] [maxPages]');
        console.log('示例:');
        console.log('  node propertyScraper.js full zetland nsw 2017 25');
        console.log('  node propertyScraper.js partial zetland nsw 2017 10');
        return;
    }

    // 保存到数据库
    const saveResult = await savePropertiesToDB(result.properties);

    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log(`\n🎉 执行完成!`);
    console.log(`⏱️  总耗时: ${duration} 秒`);
    console.log(`📊 爬取统计:`);
    console.log(`   - 爬取页数: ${result.totalPages}`);
    console.log(`   - 房产总数: ${result.properties.length}`);
    console.log(`   - 新增房产: ${result.newPropertiesCount} 条`);
    console.log(`   - 已存在房产: ${result.existingPropertiesCount} 条`);
    console.log(`📊 数据库统计:`);
    console.log(`   - 新增: ${saveResult.syncedCount} 条`);
    console.log(`   - 更新: ${saveResult.updatedCount} 条`);
    console.log(`   - 错误: ${saveResult.errorCount} 条`);

  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 数据库连接已关闭');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runCommandLine();
}

// 导出函数供其他模块使用
module.exports = {
  fullScrape,
  partialScrape,
  getLastScrapeTime,
  getExistingPropertyIds,
  savePropertiesToDB,
  scrapeProperties,
  getPropertyDetailInfo,
  parsePropertyList
};
