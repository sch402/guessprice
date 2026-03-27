/**
 * @file scripts/testSingleProperty.js
 * @description 测试爬取单个房产详情页并存储到数据库
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../server/models/property.model');
const { getPropertyDetailInfo } = require('../server/utils/propertyScraper');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/**
 * @description 从URL提取propertyId
 * @param {string} url - Domain.com.au URL
 * @returns {string} propertyId
 */
function extractPropertyIdFromUrl(url) {
  // URL格式: https://www.domain.com.au/2402-81-harbour-street-haymarket-nsw-2000-17909431
  // propertyId是最后的数字部分
  const match = url.match(/-(\d+)(?:\?|$)/);
  return match ? match[1] : null;
}

/**
 * @description 从详情页URL提取基本信息（地址、租金、房间信息等）
 * @param {Object} $ - Cheerio对象（已加载的页面）
 * @returns {Object} 房产基本信息
 */
function extractBasicInfoFromPage($) {
  // 提取地址
  const address = $('[data-testid="listing-details__summary-title"]').parent().find('h1').text().trim() ||
                 $('h1').first().text().trim();

  // 解析地址为unitNumber和streetAddress
  const parsedAddress = parseAddress(address);

  // 提取租金
  const priceText = $('[data-testid="listing-details__summary-title"]').text().trim() ||
                   $('[data-testid="listing-details__summary-title"] span').text().trim() ||
                   $('[data-testid*="price"]').first().text().trim();
  const priceMatch = priceText.match(/\$([\d,]+)/);
  const rent = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null;

  // 提取房间信息（从summary中的property-features）
  const featuresText = $('[data-testid="property-features"]').first().text().trim();
  const bedroomsMatch = featuresText.match(/(\d+)\s*Bed/i);
  const bedrooms = bedroomsMatch ? parseInt(bedroomsMatch[1]) : 0;
  
  const bathroomsMatch = featuresText.match(/(\d+)\s*Bath/i);
  const bathrooms = bathroomsMatch ? parseInt(bathroomsMatch[1]) : 0;
  
  const parkingMatch = featuresText.match(/(\d+)\s*Parking/i);
  const parking = parkingMatch ? parseInt(parkingMatch[1]) : 0;

  // 从地址提取suburb和postcode（使用完整地址进行匹配）
  let suburb = '';
  let postcode = '';
  const addressMatch = address.match(/,\s*([A-Z\s]+)\s+([A-Z]{2,3})\s+(\d{4})/i);
  if (addressMatch) {
    suburb = addressMatch[1].trim();
    postcode = addressMatch[3].trim();
  }

  return {
    address: address.replace(/\s+/g, ' ').trim(), // 保留完整地址用于兼容性
    unitNumber: parsedAddress.unitNumber,
    streetAddress: parsedAddress.streetAddress,
    rent: rent || 0,
    bedrooms,
    bathrooms,
    parking,
    suburb,
    postcode
  };
}

/**
 * @description 解析地址，拆分为unitNumber和streetAddress
 * @param {string} address - 完整地址字符串
 * @returns {Object} 包含unitNumber和streetAddress的对象
 * @example
 * parseAddress("137/8 Dixon Street, Haymarket NSW 2000")
 * // 返回: { unitNumber: "137", streetAddress: "8 Dixon Street, Haymarket NSW 2000" }
 * 
 * parseAddress("W1313/8 Dixon Street, Haymarket NSW 2000")
 * // 返回: { unitNumber: "W1313", streetAddress: "8 Dixon Street, Haymarket NSW 2000" }
 * 
 * parseAddress("Level 2, W207.2/81 O'Connor Street, Chippendale NSW 2008")
 * // 返回: { unitNumber: "Level 2, W207.2", streetAddress: "81 O'Connor Street, Chippendale NSW 2008" }
 * 
 * parseAddress("1 chippendale way, Chippendale NSW 2008")
 * // 返回: { unitNumber: null, streetAddress: "1 chippendale way, Chippendale NSW 2008" }
 */
function parseAddress(address) {
  if (!address) {
    return { unitNumber: null, streetAddress: address || '' };
  }
  
  // 规范化地址：去除多余空格
  const normalizedAddress = address.replace(/\s+/g, ' ').trim();
  
  // 匹配格式：单元号/剩余地址
  // 支持多种单元号格式：
  // - 简单格式：137/8 Dixon Street... 或 W1313/8 Dixon Street...
  // - 复杂格式：Level 2, W207.2/81 O'Connor Street...（包含逗号和空格）
  // 单元号可以是数字、字母、字母数字组合，以及包含逗号和空格的复杂格式
  // 使用非贪婪匹配，找到第一个斜杠之前的所有内容作为单元号
  const match = normalizedAddress.match(/^(.+?)\/(.+)$/);
  if (match) {
    const unitNumber = match[1].trim();
    const streetAddress = match[2].trim();
    
    // 验证：如果单元号后面紧跟的是数字开头的街道地址，则认为是有效的分割
    // 例如："Level 2, W207.2/81 O'Connor Street" -> unitNumber: "Level 2, W207.2", streetAddress: "81 O'Connor Street"
    // 但如果整个地址是 "123/456 Street"，则 unitNumber 应该是 "123"，streetAddress 应该是 "456 Street"
    // 这里我们假设斜杠后的第一个部分如果是数字开头，则前面的都是单元号
    
    return {
      unitNumber: unitNumber,
      streetAddress: streetAddress
    };
  }
  
  // 如果不匹配，返回 null 作为 unitNumber
  return {
    unitNumber: null,
    streetAddress: normalizedAddress
  };
}

/**
 * @description 规范化日期，避免无效日期导致写库失败
 * @param {Date|string|null|undefined} dateInput
 * @returns {Date|null}
 */
function normalizeDate(dateInput) {
  if (!dateInput) return null;
  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return isNaN(parsed) ? null : parsed;
}

/**
 * @description 爬取单个房产并存储到数据库
 */
async function scrapeSingleProperty() {
  const url = process.argv[2] || 'https://www.domain.com.au/2402-81-harbour-street-haymarket-nsw-2000-17909431?topspot=1';

  if (!url.includes('domain.com.au')) {
    console.error('❌ 无效的URL，请提供domain.com.au的房产详情页URL');
    process.exit(1);
  }

  // 连接数据库
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ 请设置 MONGODB_URI 环境变量');
    process.exit(1);
  }

  try {
    console.log('🔌 连接数据库...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ 数据库连接成功');

    console.log(`\n🚀 开始爬取: ${url}`);

    // 提取propertyId
    const propertyId = extractPropertyIdFromUrl(url);
    if (!propertyId) {
      console.error('❌ 无法从URL提取propertyId');
      process.exit(1);
    }
    console.log(`📋 Property ID: ${propertyId}`);

    // 使用Firecrawl获取HTML内容，如果失败则降级到直接请求
    const cleanUrl = url.split('?')[0]; // 移除查询参数
    let htmlContent = null;
    let useFirecrawl = true;
    
    // 优先使用Firecrawl
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
    if (FIRECRAWL_API_KEY) {
      try {
        console.log('📥 使用Firecrawl获取页面HTML...');
        
        // 使用Firecrawl API获取原始HTML
        const firecrawlResponse = await axios.post(
          'https://api.firecrawl.dev/v0/scrape',
          {
            url: cleanUrl,
            pageOptions: {
              onlyMainContent: false,
              includeHtml: true
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000 // 120秒超时
          }
        );
        
        // Firecrawl API返回格式可能不同，尝试多种方式提取HTML
        if (firecrawlResponse.data && firecrawlResponse.data.data) {
          const responseData = firecrawlResponse.data.data;
          // 尝试多种可能的字段名
          htmlContent = responseData.rawHtml || 
                       responseData.html || 
                       responseData.source || 
                       (responseData.metadata && responseData.metadata.rawHtml);
          
          if (htmlContent) {
            console.log('✅ Firecrawl API获取HTML成功');
            
            // 🔍 诊断：检查Firecrawl返回的HTML是否包含script标签和图片数据
            const $check = require('cheerio').load(htmlContent);
            const scriptCount = $check('script').length;
            console.log(`🔍 [诊断] Firecrawl返回的HTML包含 ${scriptCount} 个script标签`);
            
            // 检查是否包含bucket-api图片URL
            let bucketApiImageCount = 0;
            $check('script').each((i, script) => {
              const scriptContent = $check(script).html() || '';
              if (scriptContent.includes('bucket-api.domain.com.au/v1/bucket/image/')) {
                bucketApiImageCount++;
              }
            });
            console.log(`🔍 [诊断] 包含bucket-api图片URL的script标签数量: ${bucketApiImageCount}`);
            
            // 提取前3个bucket-api图片URL作为示例
            const sampleUrls = [];
            const urlPattern = /https?:\/\/bucket-api\.domain\.com\.au\/v1\/bucket\/image\/[^\s"'<>?&\\]+/g;
            $check('script').each((i, script) => {
              if (sampleUrls.length >= 3) return false; // 停止遍历
              const scriptContent = $check(script).html() || '';
              const matches = scriptContent.match(urlPattern);
              if (matches) {
                matches.slice(0, 3 - sampleUrls.length).forEach(url => {
                  if (!url.includes('.css') && !url.includes('.js') && 
                      !url.includes('contact_') && !url.includes('logo_')) {
                    sampleUrls.push(url);
                  }
                });
              }
            });
            
            if (sampleUrls.length > 0) {
              console.log(`🔍 [诊断] 找到的详情图示例（前${Math.min(3, sampleUrls.length)}个）:`);
              sampleUrls.forEach((url, idx) => {
                console.log(`🔍 [诊断]   示例${idx + 1}: ${url.substring(0, 100)}...`);
              });
            } else {
              console.log(`🔍 [诊断] ⚠️  警告：Firecrawl返回的HTML中未找到有效的详情图URL！`);
            }
            
            console.log(`🔍 [诊断] HTML总长度: ${htmlContent.length} 字符`);
          } else {
            console.log('⚠️  Firecrawl未返回HTML，降级到直接请求...');
            useFirecrawl = false;
          }
        } else {
          console.log('⚠️  Firecrawl返回数据格式不正确，降级到直接请求...');
          useFirecrawl = false;
        }
      } catch (error) {
        // 检查是否是余额不足或配额错误
        const isQuotaError = error.response && (
          error.response.status === 402 || // Payment Required
          error.response.status === 403 || // Forbidden
          error.response.status === 429 || // Too Many Requests
          (error.response.data && (
            typeof error.response.data === 'string' && (
              error.response.data.includes('quota') ||
              error.response.data.includes('credit') ||
              error.response.data.includes('balance') ||
              error.response.data.includes('limit')
            ) ||
            (error.response.data.error && (
              error.response.data.error.includes('quota') ||
              error.response.data.error.includes('credit') ||
              error.response.data.error.includes('balance') ||
              error.response.data.error.includes('limit')
            ))
          ))
        );
        
        if (isQuotaError) {
          console.log('⚠️  Firecrawl余额不足或配额已用完，降级到直接请求...');
          console.log(`   错误信息: ${error.response?.status} - ${JSON.stringify(error.response?.data || error.message)}`);
        } else {
          console.log(`⚠️  Firecrawl获取失败: ${error.message}，降级到直接请求...`);
          if (error.response) {
            console.log(`   HTTP状态: ${error.response.status}`);
            console.log(`   响应数据: ${JSON.stringify(error.response.data).substring(0, 200)}`);
          }
        }
        useFirecrawl = false;
      }
    } else {
      console.log('⚠️  未设置 FIRECRAWL_API_KEY，使用直接请求...');
      useFirecrawl = false;
    }
    
    // 如果Firecrawl失败或未配置，尝试降级方案
    if (!htmlContent) {
      // 方案1: 尝试使用axios直接请求
      console.log('📥 尝试方案1: 使用axios直接请求获取页面HTML...');
      try {
        const directResponse = await axios.get(cleanUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.domain.com.au/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
          },
          timeout: 30000, // 减少超时时间，快速失败
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 400;
          }
        });
        htmlContent = directResponse.data;
        console.log('✅ axios直接请求获取HTML成功');
      } catch (error) {
        console.log(`⚠️  axios直接请求失败: ${error.message}`);
        // 继续尝试方案2
      }
    }
    
    // 方案2: 如果axios也失败，使用Playwright作为最后的降级方案
    if (!htmlContent) {
      console.log('📥 尝试方案2: 使用Playwright获取页面HTML（可能需要更长时间）...');
      try {
        // 直接使用Playwright，不依赖propertyScraper的导出
        const { chromium } = require('playwright');
        let browser = null;
        let context = null;
        
        try {
          browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          
          context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          });
          
          const page = await context.newPage();
          await page.goto(cleanUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });
          
          await page.waitForTimeout(3000);
          
          // 尝试点击"Read more"按钮
          try {
            const descriptionButton = page.locator('[data-testid="listing-details__description-button"]');
            const buttonCount = await descriptionButton.count();
            
            if (buttonCount > 0) {
              const button = descriptionButton.first();
              const isVisible = await button.isVisible().catch(() => false);
              
              if (isVisible) {
                const buttonText = await button.textContent().catch(() => '');
                if (buttonText && /read\s+more/i.test(buttonText.trim())) {
                  console.log('✅ 找到"Read more"按钮，点击展开完整描述内容');
                  await button.click();
                  await page.waitForTimeout(1500);
                }
              }
            }
          } catch (e) {
            // 忽略点击错误
          }
          
          htmlContent = await page.content();
          
          if (context) await context.close();
          if (browser) await browser.close();
          
          console.log('✅ Playwright获取HTML成功');
        } catch (playwrightError) {
          if (context) {
            try { await context.close(); } catch (e) {}
          }
          if (browser) {
            try { await browser.close(); } catch (e) {}
          }
          throw playwrightError;
        }
      } catch (error) {
        console.error('❌ Playwright获取也失败:', error.message);
        throw new Error(`所有获取页面HTML的方法都失败了。最后错误: ${error.message}`);
      }
    }
    
    // 解析HTML并提取基本信息
    const $ = cheerio.load(htmlContent);
    console.log('📥 提取基本信息...');
    const basicInfo = extractBasicInfoFromPage($);

    // 提取详细信息（包括features, description, images）
    // 传入已获取的HTML，避免重复请求
    console.log('📥 提取详细信息...');
    const detailInfo = await getPropertyDetailInfo(cleanUrl, htmlContent);

    // 合并数据
    const propertyData = {
      propertyId,
      address: basicInfo.address, // 保留完整地址用于兼容性
      unitNumber: basicInfo.unitNumber,
      streetAddress: basicInfo.streetAddress,
      rent: basicInfo.rent,
      bedrooms: basicInfo.bedrooms,
      bathrooms: basicInfo.bathrooms,
      parking: basicInfo.parking,
      suburb: basicInfo.suburb,
      postcode: basicInfo.postcode,
      mainImage: detailInfo.mainImage,
      externalUrl: url.split('?')[0], // 移除查询参数
      availableDate: normalizeDate(detailInfo.availableDate),
      coordinates: detailInfo.coordinates,
      features: detailInfo.features || [],
      description: detailInfo.description || '',
      images: detailInfo.images || []
    };

    console.log('\n📊 爬取到的数据:');
    console.log(JSON.stringify(propertyData, null, 2));

    // 检查是否已存在
    const existingProperty = await Property.findOne({ propertyId });
    
    if (existingProperty) {
      // 更新现有房产
      console.log('\n💾 更新现有房产...');
      await Property.findByIdAndUpdate(existingProperty._id, {
        ...propertyData,
        updatedAt: new Date()
      });
      console.log('✅ 房产更新成功');
    } else {
      // 创建新房产
      console.log('\n💾 创建新房产...');
      await Property.create(propertyData);
      console.log('✅ 房产创建成功');
    }

    console.log('\n🎉 完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error);
    console.error('❌ 错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 数据库连接已关闭');
  }
}

// 执行
if (require.main === module) {
  scrapeSingleProperty();
}

