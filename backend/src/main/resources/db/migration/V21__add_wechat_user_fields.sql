-- 微信登录相关字段
ALTER TABLE users ADD COLUMN openid VARCHAR(64);
ALTER TABLE users ADD COLUMN unionid VARCHAR(64);
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
ALTER TABLE users ADD COLUMN nickname VARCHAR(60);
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN school VARCHAR(120);
ALTER TABLE users ADD COLUMN major VARCHAR(120);

-- openid 唯一索引（允许NULL）
CREATE UNIQUE INDEX uk_users_openid ON users(openid);

-- 国内场景种子数据（只插入，不删除，避免外键问题）
-- 插入国内场景组织（如果不存在）
INSERT IGNORE INTO organizations (name, type, summary, created_at) VALUES
('校青协志愿服务部', '校内组织', '长期发布校内外志愿服务、公益活动和社会实践机会。', NOW(6)),
('字节跳动校园招聘', '企业', '提供实习、校招和职业体验机会。', NOW(6)),
('大学生创新创业中心', '校内组织', '发布科研项目、学科竞赛和创新创业活动。', NOW(6)),
('线上内容工作室', '线上组织', '提供线上内容运营、设计和远程协作机会。', NOW(6)),
('校园文化中心', '校内组织', '组织文体活动、艺术展演和社团活动。', NOW(6));

-- 插入国内场景事件（使用现有枚举值：PUBLIC_WELFARE, COMPANY, CAMPUS, ONLINE, RESEARCH, CULTURE）
INSERT INTO events (
    title, organization_name, category, start_time, end_time, location, content,
    benefit_type, skill, money_amount, created_by_user_id, created_at, review_status, expired
) VALUES
('社区敬老院志愿服务', '校青协志愿服务部', 'PUBLIC_WELFARE', '2026-07-10 09:00:00', '2026-07-10 12:00:00', '北京市海淀区',
 '前往社区敬老院陪伴老人，帮助整理环境，组织小型文艺活动。', 'SKILL',
 '沟通表达、活动组织、团队协作', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('字节跳动前端实习', '字节跳动校园招聘', 'COMPANY', '2026-07-15 10:00:00', '2026-07-15 18:00:00', '北京市海淀区',
 '参与抖音Web前端开发，负责组件库建设和性能优化。', 'BOTH',
 'JavaScript、React、前端工程化', 300.00, 'seed-social', NOW(6), 'APPROVED', false),
('数学建模竞赛组队', '大学生创新创业中心', 'RESEARCH', '2026-07-20 14:00:00', '2026-07-20 17:00:00', '线上',
 '数学建模竞赛组队宣讲会，介绍竞赛流程和组队方式。', 'SKILL',
 '数学建模、团队协作、论文写作', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('公众号内容运营实习', '线上内容工作室', 'ONLINE', '2026-07-08 00:00:00', '2026-07-08 23:59:00', '线上',
 '负责公众号内容策划、撰写和排版，每周产出2-3篇原创内容。', 'BOTH',
 '内容运营、文案写作、排版设计', 150.00, 'seed-social', NOW(6), 'APPROVED', false),
('校园歌手大赛志愿者', '校园文化中心', 'CULTURE', '2026-07-25 18:00:00', '2026-07-25 21:00:00', '学校大礼堂',
 '协助校园歌手大赛现场布置、引导和秩序维护。', 'SKILL',
 '活动执行、现场协调、沟通表达', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('Python数据分析实战营', '大学生创新创业中心', 'RESEARCH', '2026-07-12 14:00:00', '2026-07-12 17:00:00', '线上',
 'Python数据分析入门，学习pandas、matplotlib等库的使用。', 'SKILL',
 'Python、数据分析、可视化', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('校园招聘会志愿者', '校青协志愿服务部', 'PUBLIC_WELFARE', '2026-07-18 08:00:00', '2026-07-18 17:00:00', '学校体育馆',
 '协助校园招聘会现场引导、企业对接和秩序维护。', 'SKILL',
 '沟通协调、活动执行、职场认知', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('短视频创作比赛', '校园文化中心', 'CULTURE', '2026-07-22 00:00:00', '2026-07-22 23:59:00', '线上提交',
 '以"我的大学生活"为主题，创作1-3分钟短视频。', 'SKILL',
 '视频剪辑、创意策划、内容创作', NULL, 'seed-social', NOW(6), 'APPROVED', false),
('互联网产品实习', '字节跳动校园招聘', 'COMPANY', '2026-07-28 10:00:00', '2026-07-28 18:00:00', '北京市海淀区',
 '参与产品需求分析、用户调研和产品设计。', 'BOTH',
 '产品设计、用户调研、需求分析', 250.00, 'seed-social', NOW(6), 'APPROVED', false),
('社区环保宣传活动', '校青协志愿服务部', 'PUBLIC_WELFARE', '2026-08-01 09:00:00', '2026-08-01 12:00:00', '社区广场',
 '宣传环保知识，组织垃圾分类互动游戏。', 'SKILL',
 '环保知识、公众演讲、活动策划', NULL, 'seed-social', NOW(6), 'APPROVED', false);
