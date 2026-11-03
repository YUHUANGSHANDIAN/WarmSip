# 数据迁移与恢复

设置页支持两类输入：WarmSip ZIP（`manifest.json` + `media/<sha256>.<ext>`）和旧应用导出的 JSON。旧 JSON 需要包含以下存储键中的一个或多个：`lg_warm_profiles_v1`、`lg_warm_recs_v1`、`lg_warm_orders_v1`、`lg_warm_capsules_v1`、`lg_warm_city_v1`。导入前会读取、校验并显示数量，确认后才在单个 IndexedDB 事务中提交。

完全相同的记录会跳过；同 ID 但内容不同的记录生成新 ID，并重映射地图、地点、心意和胶囊的关联。现有数据不会被覆盖。ZIP 会校验路径、解压大小、媒体 MIME、尺寸和 SHA-256；任何校验失败都回滚本次导入。凭证不写入备份。

导入前建议先导出当前完整备份。回收站恢复是可逆操作；永久删除地图会同时永久删除其地点，但业务记录中的地点快照会保留。
