-- OnePrime 商品种子数据
-- 在 Supabase SQL Editor 执行，ON CONFLICT DO NOTHING 可重复运行

INSERT INTO public.products (id, name, name_en, cat, price, orig_price, desc_text, stock, active)
VALUES
  (1, '慕易庄园赤霞珠干红2021', 'Moui Estate Cabernet Sauvignon 2021', 'wine', 298, 398, '澳大利亚南澳地区精选赤霞珠葡萄，单宁丰厚，黑浆果与雪松香气交织，陈年12个月于法国橡木桶，适合搭配红肉料理。', 120, true),
  (2, '慕易庄园西拉礼盒装', 'Moui Estate Shiraz Gift Box', 'wine', 688, 888, '双瓶礼盒装，精选2019年份西拉，深紫色泽，黑胡椒与紫罗兰香气层次丰富，余味悠长，馈赠佳品。', 48, true),
  (3, '慕易庄园霞多丽干白', 'Moui Estate Chardonnay', 'wine', 198, 258, '清爽干白，绿苹果与柑橘香气，口感清新，略带矿物质风味，适合搭配海鲜及轻食料理。', 80, true),
  (4, 'Swisse 护肝片 120粒', 'Swisse Liver Detox 120 Tabs', 'health', 188, 248, '澳洲Swisse明星产品，含水飞蓟素+朝鲜蓟提取物，帮助肝脏排毒修复，适合经常饮酒及熬夜人群。', 200, true),
  (5, 'Blackmores 鱼油胶囊 400粒', 'Blackmores Omega-3 Fish Oil 400', 'health', 298, 368, '深海鱼油，富含EPA和DHA，支持心脑血管健康，改善关节灵活性，澳洲药房销量第一品牌。', 150, true),
  (6, 'Swisse 胶原蛋白液 500ml', 'Swisse Beauty Collagen Liquid', 'health', 228, 298, '口服胶原蛋白，含10,000mg水解胶原蛋白+维生素C，助力肌肤弹性与光泽，草莓口味，口感宜人。', 90, true),
  (7, 'Aesop 玫瑰臀部护理霜', 'Aesop Resurrection Aromatique', 'beauty', 368, NULL, '澳洲Aesop经典款，含乳木果油与玫瑰提取物，深度滋润干燥肌肤，香气优雅持久。', 60, true),
  (8, 'Jurlique 玫瑰水面膜套装', 'Jurlique Rose Water Mask Set', 'beauty', 488, 628, '来自澳洲南澳有机玫瑰园，温和补水保湿面膜4片装，适合各种肤质，敏感肌友好配方。', 75, true),
  (9, 'True Natural 美白精华液', 'True Natural Brightening Serum', 'beauty', 288, 358, '含烟酰胺+VC衍生物，提亮肤色，淡化色斑，澳洲有机认证原料，无防腐剂配方。', 110, true),
  (10, '澳洲蜂蜜坚果燕麦棒 10支', 'Aussie Honey Nut Oat Bar 10pcs', 'food', 88, 118, '麦卢卡蜂蜜+澳洲坚果+整粒燕麦，低GI健康零食，无人工色素防腐剂，适合健身人群随身携带。', 300, true),
  (11, '胶原蛋白软糖 60粒', 'Collagen Beauty Gummies 60pcs', 'food', 128, 158, '每粒含500mg胶原蛋白+维E+葡萄籽提取物，草莓风味，边吃边美容，Z世代爆款。', 240, true),
  (12, '益生菌代餐奶昔 15包', 'Probiotic Meal Shake 15 Sachets', 'food', 258, 318, '高蛋白低卡路里，含20亿益生菌+膳食纤维，香草奶昔口味，健康代餐首选。', 160, true),
  (13, '慕易庄园黑皮诺2020', 'Moui Estate Pinot Noir 2020', 'wine', 328, 428, '精选维多利亚州凉爽产区黑皮诺，红色樱桃与玫瑰花香，单宁柔顺，余味带一丝烟熏橡木气息。', 65, true),
  (14, '慕易庄园起泡酒礼盒', 'Moui Estate Sparkling Gift Box', 'wine', 228, 298, '传统法式工艺酿造起泡酒，气泡细腻持久，柑橘与白桃香气，适合庆典及节日聚餐场合。', 90, true),
  (15, '慕易庄园麝香甜白2022', 'Moui Estate Moscato 2022', 'wine', 168, 218, '低酒精度甜白葡萄酒，荔枝与白花香气浓郁，口感甜润清爽，适合搭配甜点或单独饮用。', 100, true),
  (16, 'Blackmores 综合维生素 200粒', 'Blackmores Multivitamin 200 Tabs', 'health', 168, 218, '全面补充日常所需维生素与矿物质，提升免疫力，缓解疲劳，适合工作繁忙人群长期服用。', 180, true),
  (17, 'Swisse 钙片+维生素D 150粒', 'Swisse Calcium + Vitamin D3 150 Tabs', 'health', 148, 188, '高吸收率钙片配方，添加维生素D3促进钙质吸收，强健骨骼，适合中老年及术后恢复人群。', 130, true),
  (18, 'Bioglan 蔓越莓精华胶囊 60粒', 'Bioglan Cranberry Extract 60 Caps', 'health', 138, 178, '浓缩蔓越莓精华，辅助维护泌尿系统健康，天然植物配方，女性日常保养首选。', 140, true),
  (19, 'Jurlique 玫瑰晚安修复精油', 'Jurlique Rose Night Repair Oil', 'beauty', 528, 678, '富含玫瑰果油及维生素E，夜间深层修复肌肤屏障，淡化细纹，唤醒晨间紧致光泽肌肤。', 55, true),
  (20, 'Aesop 洁净舒缓洁面乳', 'Aesop Purifying Facial Cleanser', 'beauty', 298, NULL, '温和洁面配方，含茶树及柳树皮萃取物，深层清洁同时舒缓肌肤，适合油性及混合性肌肤。', 85, true),
  (21, 'True Natural 复合酸去角质精华', 'True Natural AHA/BHA Exfoliating Serum', 'beauty', 258, 328, '果酸+水杨酸温和配方，加速角质代谢，改善肌肤纹理及毛孔粗大问题，新手建议夜间使用。', 95, true),
  (22, '麦卢卡蜂蜜 UMF15+ 500g', 'Manuka Honey UMF15+ 500g', 'food', 368, 458, '新西兰进口麦卢卡蜂蜜，UMF15+高活性认证，天然抗氧化，可直接食用或冲泡蜂蜜水。', 70, true),
  (23, '藜麦即食杯 6杯装', 'Quinoa Ready-to-Eat Cups 6pcs', 'food', 108, 138, '三色藜麦搭配杂蔬，即开即食，高纤低脂，办公室加餐或代餐的便捷健康选择。', 200, true),
  (24, '综合莫林果干坚果包 12袋', 'Mixed Berry & Nut Trail Mix 12 Packs', 'food', 98, 128, '蓝莓干、蔓越莓干与澳洲坚果混合装，无添加蔗糖，独立小包装方便携带，健康解馋零食。', 260, true)
ON CONFLICT (id) DO NOTHING;