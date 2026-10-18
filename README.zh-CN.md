# pi-session-title

[English](README.md) | 中文

一个轻量的 Pi 扩展：为会话生成便于检索的标题，同时不偷偷切换到另一个模型。

## 行为约定

- **默认模型：** 执行 `/title` 时，使用当前会话正在使用的模型。
- **不隐藏切换 Provider：** 只有配置了精确的 `provider/model`，才会使用其他模型；如果该模型不可用或没有认证，不会静默切换到其他 Provider，而是保留或生成本地 fallback 标题。
- **默认不调用标题模型：** 默认 `autoGenerate: false`。本地 fallback 标题只根据首条用户消息生成，不需要网络，也不会调用标题模型；只有执行 `/title` 才会发起模型调用。
- **自动生成必须显式开启（仅 TUI）：** 设置 `autoGenerate: true` 后，未命名会话首个回合结束时允许进行一次尽力而为的标题请求。请求不会被生命周期处理器等待，不会拖慢或阻断主任务；本地 fallback 会先设置，模型成功后才替换。
- **始终保留 fallback：** 没有可用模型、调用失败、超时或会话发生切换时，本地标题仍然存在；自动流程不会覆盖用户手动标题；显式执行 `/title` 可以重新生成。
- **隐私边界：** 只会把用户消息文本（最多 1500 字符）发送给配置的标题模型，不发送宿主系统提示、assistant 回复、工具输出、思考内容或图片。用户文本本身可能含凭据或 URL，本扩展不做敏感信息脱敏；请只选择你信任的 Provider。
- **底部状态：** 在宿主支持时，将会话名同步到 `session-title` 状态项。

Pi 运行中的会话不会自动热加载磁盘上的新包。安装或更新后请重启 Pi，或执行 `/reload`；如果旧扩展运行时仍在当前会话中，可能需要重新打开会话。

## 环境要求

- Pi 1.3.0 或更高版本（只使用 Pi 公开扩展 API）。
- Node.js 22.19 或更高版本（Pi 本身的要求）。
- 只有执行 `/title` 或主动开启自动生成时，才需要可用的 Pi 聊天模型。

## 安装

安装固定的 GitHub Release：

```sh
pi install git:github.com/chenhaoxiang/pi-session-title@v0.0.2
```

查看当前选择的包：

```sh
pi list
```

本地开发或离线验证：

```sh
pi install /absolute/path/to/pi-session-title
```

包安装和手动复制到 `~/.pi/agent/extensions/session-title.ts` 二选一，不能同时启用。迁移旧手动脚本时，先把它移出 Pi 的扩展发现目录，再安装本包。

GitHub Release 附可安装压缩包、精确来源清单及 SHA-256 校验。下载后先校验再安装；本次没有发布到 npm。详见[发布维护](docs/releasing.md)及[行为合同](docs/behavior.md)。

## 命令

```text
/title                         使用配置模型或当前会话模型生成标题
/title <名称>                  直接设置标题，不调用模型
/title-config                  查看配置，不调用模型
/title-config auto on|off      开启/关闭主动自动生成
/title-config model current    使用当前会话模型（默认）
/title-config model p/m        使用精确的 provider/model
/title-config reload           重新读取配置，不调用模型
```

`/title-config` 把配置写入 `<agent-dir>/session-title.json`，通常是 `~/.pi/agent/session-title.json`：

```json
{
  "autoGenerate": false,
  "model": null,
  "timeoutMs": 15000
}
```

`model: null` 表示当前会话模型，也可以填 Pi 现有模型注册表里的精确 `provider/model`（如 `openai/gpt-4.1-mini`）。这里不保存凭据。配置命令本身不调用模型；开启自动生成只影响后续未命名会话，不替换已有 fallback 或手动标题。

`timeoutMs` 限制在 1000–120000 毫秒。配置文件用户可以调整它；命令只负责模型选择和自动生成开关。

已从 GitHub 安装的包可这样更新：

```sh
pi update git:github.com/chenhaoxiang/pi-session-title@v0.0.2
```

此命令只校准固定 tag，不会自动升到新版本。升级时请安装未来版本的明确 tag；只有主动跟随开发分支时才用 `@main`。Release 使用不可变版本/tag，不覆盖已经发布的 `v0.0.1` 制品。

## 开发与验证

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run --json
```

测试使用合成模型响应和临时 fake context，不调用真实 Provider，也不修改机器级 Pi 设置。

## 许可证

MIT
