# Polymarket XTracker Pace Overlay

给 Polymarket 的“X / tweet count”类市场加一个页面内标注：

- 自动读取当前市场标题
- 去 `xtracker.polymarket.com` 匹配 tracking
- 获取当前已发推数量、结束时间
- 按每个区间计算并直接标注在页面上：
  - 目标区间显示所需日均发帖速度（例如 `3.8 ~ 11.9 条/天`）
  - 当前所在区间显示可继续留在该区间的大致上限速度
  - 已经超过的区间会直接提示已超出

## 安装（Mac Chrome）

1. 打开 `chrome://extensions`
2. 右上角开启 **Developer mode / 开发者模式**
3. 点击 **Load unpacked / 加载已解压的扩展程序**
4. 选择这个目录：
   `/Users/ydybot/.openclaw/workspace/polymarket-xtracker-extension`

## 当前假设

这个 MVP 主要针对类似下面这种市场：

- `Elon Musk # tweets March 20 - March 27, 2026?`
- 页面里有多个区间 outcome，例如 `80-99`、`100-119`、`120-139`

优先用下面两个条件匹配 xtracker tracking：

1. `marketLink` 与当前页面 URL 一致
2. 否则用标题精确匹配

## 备注

- 目前用的是 `xtracker.polymarket.com` 的公开接口：
  - `/api/users`
  - `/api/trackings/:id?includeStats=true`
- 如果 Polymarket 页面 DOM 改了，可能需要微调 outcome 选择器。
