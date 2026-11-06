# api-gateway

Internal sync service dashboard.

---

## 设置步骤（约 10 分钟，只需做一次）

### 一、Firebase（存消息 + 实时同步）

1. 打开 https://console.firebase.google.com ，用 Google 账号登录 →「创建项目」，名字随便起（例如 `api-gateway`）。Google Analytics 可以关掉。
2. 项目首页点 **`</>`（Web）** 图标添加网页应用 → 起个名字 → 注册。
   页面会显示一段 `const firebaseConfig = { apiKey: ..., ... }`，**复制大括号里的内容**，替换 `index.html` 顶部的 `firebaseConfig`（6 个 `PASTE_HERE`）。
   > 这段配置本来就是公开给网页用的，不是密码，放进公开仓库没问题；真正的保护靠第 5 步的规则。
3. 左侧菜单 **Build → Authentication** →「开始使用」→ 登录方法里选 **匿名（Anonymous）** → 启用 → 保存。
4. 左侧菜单 **Build → Firestore Database** →「创建数据库」→ 位置选 `asia-northeast1 (Tokyo)` → 选**生产模式**。
5. 进入 Firestore 的 **「规则 / Rules」** 标签，把 `firestore.rules` 文件的全部内容粘贴进去，替换原有内容 → **发布**。

### 二、GitHub Pages（放网页）

1. GitHub 新建一个 **Public** 仓库，名字起得像正经项目（例如 `api-gateway`）。
2. 仓库页面 → **Add file → Upload files**，上传 `index.html`（已填好 config 的那个）、`firestore.rules`、`README.md` → Commit。
3. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，Branch 选 `main` / `(root)` → Save。
4. 等 1–2 分钟，页面上方会出现网址：`https://你的用户名.github.io/api-gateway/`。把这个网址和**房间码**发给朋友。

### 三、使用

- 第一次打开会问两件事：显示名字、房间码（Workspace token）。**房间码相同的人在同一个聊天室**，房间码就是你们的暗号，别用太简单的。
- 在底部终端 `$` 后打字，回车发送。
- **Esc**：老板键，一键隐藏所有聊天行，再按恢复。
- 有新消息时：状态栏 ⚠ 数字增加，标签页标题前出现 ●。
- 指令：`:help` `:nick 名字` `:style comment|log|str` `:room`（换房间）`:clear`（删掉自己在本房间发的所有消息）

### 注意

- 免费额度（Spark 方案）每天约 5 万次读取、2 万次写入，几个人聊天用不完。
- 房间码会做哈希后再存，数据库里看不到明文暗号；但这不是端到端加密，项目管理员（你自己）能在控制台看到消息内容。别聊太敏感的东西。
- 公司网络如果屏蔽 Google 服务（`firestore.googleapis.com`），就连不上。
