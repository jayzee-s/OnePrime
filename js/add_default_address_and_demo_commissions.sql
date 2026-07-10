-- OnePrime · 默认收货地址字段 + 示例佣金数据
-- 在 Supabase Dashboard → SQL Editor 执行
-- 可重复运行：所有语句均为幂等操作

-- ========== 1. users 表加默认收货信息字段 ==========
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_phone TEXT,
  ADD COLUMN IF NOT EXISTS default_city  TEXT,
  ADD COLUMN IF NOT EXISTS default_addr  TEXT;

-- ========== 2. 插入示例佣金数据（用于测试 admin 后台"推荐佣金"页面渲染）==========
-- 自动选取数据库里已存在的两个用户，模拟"用户B的订单为用户A产生佣金"。
-- 如果你的 users 表里用户不足 2 个，这段会跳过、不插入任何数据（不会报错）。
-- 这些示例数据的 order_id 是虚构的（不对应真实订单），只是为了让页面有数据可看，
-- 后续想清理的话，直接删掉 id 以 'COM_DEMO_' 开头的记录即可。

DO $$
DECLARE
  referrer_uuid TEXT;
  referred_uuid TEXT;
BEGIN
  SELECT id INTO referrer_uuid FROM users ORDER BY created_at LIMIT 1;
  SELECT id INTO referred_uuid FROM users ORDER BY created_at OFFSET 1 LIMIT 1;

  IF referrer_uuid IS NOT NULL AND referred_uuid IS NOT NULL AND referrer_uuid <> referred_uuid THEN

    -- 让"下线"用户在数据上真的挂在"推荐人"名下，这样推荐好友页面的
    -- "我的下线"列表也能一并测试出效果（如果这个字段已经有值，不会覆盖）
    UPDATE users
      SET referred_by = referrer_uuid
      WHERE id = referred_uuid AND referred_by IS NULL;

    INSERT INTO commissions
      (id, referrer_id, referred_user_id, order_id, order_total, commission_rate, commission_amount, created_at)
    VALUES
      ('COM_DEMO_001', referrer_uuid, referred_uuid, 'ORD_DEMO_001', 298.00, 0.05, 14.90, NOW() - INTERVAL '12 days'),
      ('COM_DEMO_002', referrer_uuid, referred_uuid, 'ORD_DEMO_002', 688.00, 0.05, 34.40, NOW() - INTERVAL '6 days'),
      ('COM_DEMO_003', referrer_uuid, referred_uuid, 'ORD_DEMO_003', 188.00, 0.03, 5.64,  NOW() - INTERVAL '1 days')
    ON CONFLICT (id) DO NOTHING;

  END IF;
END $$;

-- ========== 3. 确认插入结果（可选，跑完看一眼）==========
SELECT c.id, u1.name AS 推荐人, u2.name AS 下线, c.order_total, c.commission_rate, c.commission_amount, c.created_at
FROM commissions c
LEFT JOIN users u1 ON u1.id = c.referrer_id
LEFT JOIN users u2 ON u2.id = c.referred_user_id
WHERE c.id LIKE 'COM_DEMO_%'
ORDER BY c.created_at;
