package app

import (
	"fmt"
	"net/http"
)

const publicPageStyle = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6;max-width:760px;margin:0 auto;padding:48px 24px;color:#202124}h1,h2{line-height:1.25}small{color:#666}a{color:#1769aa}`

func writePublicPage(w http.ResponseWriter, title, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title><style>%s</style></head><body>%s</body></html>`, title, publicPageStyle, body)
}

func (h *Handler) privacy(w http.ResponseWriter, _ *http.Request) {
	writePublicPage(w, "Nomi Privacy Policy", `<h1>Nomi Privacy Policy</h1>
<small>Effective: August 23, 2026</small>
<p>Nomi is a private-beta family health record organizer. It stores account details, household membership, files you upload, the health context you enter, and conversations needed to provide the service.</p>
<h2>How data is used</h2>
<p>Data is used only to authenticate household members, preserve the household knowledge base, organize uploaded records, and generate source-linked summaries and answers. Nomi does not sell personal or health data and does not use it for advertising.</p>
<h2>Processing and sharing</h2>
<p>Authorized members of the same household can access household information. Uploaded content may be processed by the private beta's server-side AI provider to produce the requested analysis. Data is not shared with unrelated third parties except infrastructure providers required to operate the service or when required by law.</p>
<h2>Retention and control</h2>
<p>Private-beta data is retained while the household participates in the service. Participants can request access, correction, export, or deletion through the household owner or the TestFlight feedback channel. Some versioned archive deletion capabilities are still being completed for the private beta.</p>
<h2>Health disclaimer</h2>
<p>Nomi organizes information and does not provide medical diagnosis, treatment, prescriptions, or emergency services.</p>
<h2>Contact</h2>
<p>For privacy questions, use the TestFlight feedback channel or contact the person who invited you to the private beta.</p>
<hr><h1>隐私说明</h1>
<p>Nomi 是家庭健康资料整理 private beta。服务仅为账号认证、家庭资料保存、上传资料整理和带来源的分析使用必要数据；不出售数据、不用于广告。家庭内获授权成员可访问家庭资料，服务端 AI provider 会按用户请求处理上传内容。参与者可通过家庭 owner 或 TestFlight 反馈渠道申请访问、更正、导出或删除。Nomi 不提供诊断、处方、治疗或急救服务。</p>`)
}

func (h *Handler) support(w http.ResponseWriter, _ *http.Request) {
	writePublicPage(w, "Nomi Support", `<h1>Nomi Support</h1>
<p>Nomi is currently available to invited family members through TestFlight.</p>
<h2>Getting help</h2>
<p>Send feedback from the TestFlight app, or contact the household owner who invited you. Include the screen you were using and the approximate time of the issue, but do not include passwords, invitation codes, session tokens, or unredacted health records.</p>
<h2>Important</h2>
<p>Nomi is not an emergency or medical-care service. For urgent medical concerns, contact local emergency services or a qualified clinician.</p>
<hr><h1>支持</h1>
<p>Nomi 目前仅通过 TestFlight 向受邀家庭成员开放。遇到问题请使用 TestFlight 反馈，或联系邀请你的家庭 owner。请勿在反馈中发送密码、邀请码、session token 或未脱敏的健康报告。Nomi 不是急救或医疗服务。</p>`)
}
